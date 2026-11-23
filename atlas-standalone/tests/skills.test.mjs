import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../lib/atlas/server.ts';
import { analyzeSkillGap, keywordSkillGap, normalizeModelResult } from '../lib/atlas/skill-ai.ts';
import { isBlockedHost, isPrivateAddress } from '../lib/atlas/url-guard.ts';
import { resolveJobInput } from '../lib/atlas/skill-source.ts';

const KEYS = ['OLLAMA_MODEL', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'ANTHROPIC_API_KEY'];
const realFetch = globalThis.fetch;
function reset() { for (const k of KEYS) delete process.env[k]; globalThis.fetch = realFetch; }
const modelJson = (extra = {}) => JSON.stringify({ resume_skills: ['Python'], matched_skills: ['Python'], missing_skills: ['Docker'], suggestions: [{ skill: 'Docker', why: 'Used for deployment.' }], match_score: 60, summary: 'Good start.', ...extra });
const geminiReply = text => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });
const geminiError = (status, message) => ({ ok: false, status, json: async () => ({ error: { message } }) });

await test('Model output normalization', async t => {
  await t.test('Accepts JSON wrapped in markdown fences', () => {
    const result = normalizeModelResult('```json\n' + modelJson() + '\n```');
    assert.deepEqual(result.missing_skills, ['Docker']);
    assert.equal(result.match_score, 60);
  });
  await t.test('Clamps the score and truncates oversized fields', () => {
    assert.equal(normalizeModelResult(modelJson({ match_score: 250 })).match_score, 100);
    assert.equal(normalizeModelResult(modelJson({ match_score: -5 })).match_score, 0);
    assert.equal(normalizeModelResult(modelJson({ summary: 'x'.repeat(5000) })).summary.length, 800);
    assert.equal(normalizeModelResult(modelJson({ missing_skills: Array.from({ length: 100 }, (_, i) => 'Skill ' + i) })).missing_skills.length, 40);
  });
  await t.test('Drops malformed entries instead of storing them', () => {
    const result = normalizeModelResult(modelJson({ missing_skills: ['Docker', 7, null], suggestions: [{ skill: 'Docker' }, { skill: 'Git', why: 'Version control.' }] }));
    assert.deepEqual(result.missing_skills, ['Docker']);
    assert.deepEqual(result.suggestions, [{ skill: 'Git', why: 'Version control.' }]);
  });
  await t.test('Keeps a short action for each skill when the model provides one', () => {
    const result = normalizeModelResult(modelJson({ suggestions: [{ skill: 'Docker', why: 'Used to deploy.', action: '  Build and run one app in a container.  ' }, { skill: 'Git', why: 'Teams use it.', action: 42 }] }));
    assert.deepEqual(result.suggestions, [{ skill: 'Docker', why: 'Used to deploy.', action: 'Build and run one app in a container.' }, { skill: 'Git', why: 'Teams use it.' }]);
  });
  await t.test('Rejects non-JSON replies with a 503', () => {
    assert.throws(() => normalizeModelResult('Sorry, I cannot help'), e => e instanceof AppError && e.status === 503);
  });
});

await test('Keyword fallback', async t => {
  await t.test('Splits matched and missing skills and scores them', () => {
    const result = keywordSkillGap('I know Python and Git.', 'Needs Python, Git and Docker.');
    assert.deepEqual(result.matched_skills.sort(), ['Git', 'Python']);
    assert.deepEqual(result.missing_skills, ['Docker']);
    assert.equal(result.match_score, 67);
  });
  await t.test('Does not treat common words as the Go language', () => {
    assert.ok(!keywordSkillGap('', 'We go beyond expectations and love to go further.').missing_skills.includes('Go'));
    assert.ok(keywordSkillGap('', 'Experience with Go and Rust.').missing_skills.includes('Go'));
  });
  await t.test('Returns a zero score when the job lists no known skills', () => {
    assert.equal(keywordSkillGap('Python', 'A friendly team.').match_score, 0);
  });
});

await test('Provider selection and resilience', async t => {
  await t.test('Uses the keyword fallback when no AI is configured', async () => {
    reset();
    globalThis.fetch = async () => { throw new Error('network must not be used'); };
    const result = await analyzeSkillGap('Python developer', 'Python and Docker required');
    assert.match(result.summary, /Keyword-based/);
    reset();
  });
  await t.test('Calls Gemini with the key in a header, not in the URL', async () => {
    reset(); process.env.GEMINI_API_KEY = 'test-key';
    let seen;
    globalThis.fetch = async (url, init) => { seen = { url: String(url), headers: init.headers, body: JSON.parse(init.body) }; return geminiReply(modelJson()); };
    const result = await analyzeSkillGap('Python developer', 'Python and Docker required');
    assert.equal(result.match_score, 60);
    assert.ok(!seen.url.includes('test-key'));
    assert.equal(seen.headers['x-goog-api-key'], 'test-key');
    assert.equal(seen.body.generationConfig.responseMimeType, 'application/json');
    reset();
  });
  await t.test('Retries once, then falls back to a second model when Google is busy', async () => {
    reset(); process.env.GEMINI_API_KEY = 'test-key';
    const models = [];
    globalThis.fetch = async url => { models.push(String(url).split('models/')[1].split(':')[0]); return models.length < 3 ? geminiError(503, 'high demand') : geminiReply(modelJson()); };
    const result = await analyzeSkillGap('a', 'b');
    assert.equal(result.match_score, 60);
    assert.equal(models.length, 3);
    assert.equal(models[0], models[1]);
    assert.notEqual(models[2], models[0]);
    reset();
  });
  await t.test('Reports a quota error after trying both models', async () => {
    reset(); process.env.GEMINI_API_KEY = 'test-key';
    let calls = 0;
    globalThis.fetch = async () => { calls++; return geminiError(429, 'quota'); };
    await assert.rejects(analyzeSkillGap('a', 'b'), e => e instanceof AppError && e.status === 429);
    assert.equal(calls, 3);
    reset();
  });
  await t.test('Never leaks the API key in error messages', async () => {
    reset(); process.env.GEMINI_API_KEY = 'AIzaSyFakeKeyForTestingOnly1234567';
    globalThis.fetch = async () => geminiError(400, 'API key not valid: AIzaSyFakeKeyForTestingOnly1234567');
    await assert.rejects(analyzeSkillGap('a', 'b'), e => e instanceof AppError && !e.message.includes('AIzaSyFake'));
    reset();
  });
  await t.test('Uses local Ollama when OLLAMA_MODEL is set', async () => {
    reset(); process.env.OLLAMA_MODEL = 'llama3.2';
    let seenUrl = '';
    globalThis.fetch = async url => { seenUrl = String(url); return { ok: true, status: 200, json: async () => ({ message: { content: modelJson() } }) }; };
    assert.equal((await analyzeSkillGap('a', 'b')).match_score, 60);
    assert.equal(seenUrl, 'http://localhost:11434/api/chat');
    reset();
  });
});

await test('Job link safety (SSRF guard)', async t => {
  await t.test('Blocks private, loopback and link-local IPv4 and IPv6 addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.5', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1']) assert.equal(isPrivateAddress(ip), true, ip);
  });
  await t.test('Allows public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip);
  });
  await t.test('Blocks internal host names', () => {
    for (const host of ['localhost', 'LOCALHOST', 'app.localhost', 'metadata.google.internal', 'db.internal.']) assert.equal(isBlockedHost(host), true, host);
    assert.equal(isBlockedHost('example.com'), false);
  });
});

await test('Application auto-fill for skills analysis', async t => {
  const application = { role: 'Software Engineer Intern', company_id: 'c1', job_url: 'https://jobs.example.com/123' };
  const base = { job_title: '', company_name: '', job_description: '', source_url: '' };
  const deps = (over = {}) => ({
    input: base, application, companyName: async () => 'Northstar',
    fetchPosting: async url => 'Posting text from ' + url,
    previousDescription: async () => null, ...over,
  });
  await t.test('Uses the application role, company and job link when nothing is entered', async () => {
    const job = await resolveJobInput(deps());
    assert.deepEqual(job, { jobTitle: 'Software Engineer Intern', companyName: 'Northstar', jobText: 'Posting text from https://jobs.example.com/123', sourceUrl: 'https://jobs.example.com/123', origin: 'application_link' });
  });
  await t.test('Manual role, company and pasted text override the application', async () => {
    let fetched = false;
    const job = await resolveJobInput(deps({ input: { job_title: 'Data Intern', company_name: 'Acme', job_description: 'Needs Python.', source_url: '' }, fetchPosting: async () => { fetched = true; return 'x'; } }));
    assert.equal(job.jobTitle, 'Data Intern');
    assert.equal(job.companyName, 'Acme');
    assert.equal(job.jobText, 'Needs Python.');
    assert.equal(job.origin, 'pasted_text');
    assert.equal(fetched, false);
  });
  await t.test('A pasted link overrides the application link', async () => {
    const job = await resolveJobInput(deps({ input: { ...base, source_url: 'https://other.example.com/job' } }));
    assert.equal(job.origin, 'pasted_link');
    assert.equal(job.sourceUrl, 'https://other.example.com/job');
  });
  await t.test('Falls back to the last saved description when the job link cannot be read', async () => {
    const job = await resolveJobInput(deps({ fetchPosting: async () => { throw new AppError(422, 'blocked'); }, previousDescription: async () => 'Earlier saved description' }));
    assert.equal(job.origin, 'previous_analysis');
    assert.equal(job.jobText, 'Earlier saved description');
    assert.equal(job.sourceUrl, '');
  });
  await t.test('Uses the saved description when the application has no link', async () => {
    const job = await resolveJobInput(deps({ application: { ...application, job_url: '' }, previousDescription: async () => 'Saved text' }));
    assert.equal(job.origin, 'previous_analysis');
  });
  await t.test('Asks the user to paste a description when nothing is available', async () => {
    await assert.rejects(resolveJobInput(deps({ application: { ...application, job_url: '' } })), e => e instanceof AppError && e.status === 422 && /Paste the description/.test(e.message));
  });
  await t.test('Still fails clearly with no application and no input', async () => {
    await assert.rejects(resolveJobInput(deps({ application: null })), e => e instanceof AppError && e.status === 422);
  });
  await t.test('Unexpected errors are not hidden by the fallback', async () => {
    await assert.rejects(resolveJobInput(deps({ fetchPosting: async () => { throw new Error('boom'); } })), /boom/);
  });
  await t.test('A missing company does not block the analysis', async () => {
    const job = await resolveJobInput(deps({ companyName: async () => { throw new AppError(404, 'not found'); } }));
    assert.equal(job.companyName, '');
  });
});