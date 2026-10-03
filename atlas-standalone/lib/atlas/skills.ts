import 'server-only';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AppError, clean } from './server';

/** Turns a raw DB row into the client-facing SkillAnalysis shape (JSON text columns parsed into real arrays/objects). */
export function parseSkillAnalysisRow(row: Record<string, unknown>) {
  const cleaned = clean(row) as Record<string, unknown>;
  for (const key of ['resume_skills', 'matched_skills', 'missing_skills', 'suggestions'] as const) {
    try { cleaned[key] = JSON.parse(String(cleaned[key] ?? '[]')); } catch { cleaned[key] = []; }
  }
  try { cleaned.skill_progress = JSON.parse(String(cleaned.skill_progress ?? '{}')); } catch { cleaned.skill_progress = {}; }
  return cleaned;
}

// --- Resume text extraction -------------------------------------------------

/** Pulls plain text out of an uploaded résumé. Throws AppError(422) for content we can't read. */
export async function extractResumeText(bytes: Uint8Array, contentType: string): Promise<string> {
  try {
    if (contentType === 'text/plain') return new TextDecoder('utf-8').decode(bytes).trim();
    if (contentType === 'application/pdf') {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: bytes });
      try { return (await parser.getText()).text.trim(); } finally { await parser.destroy(); }
    }
    if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      return result.value.trim();
    }
  } catch {
    throw new AppError(422, 'This document could not be read. Try re-uploading it as a PDF, Word document, or plain text file.');
  }
  throw new AppError(422, 'This document type is not supported for analysis.');
}

// --- Job posting URL fetch (SSRF-guarded) -----------------------------------

const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal']);
function isPrivateAddress(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0;
  }
  const low = ip.toLowerCase();
  return low === '::1' || low.startsWith('fe80:') || low.startsWith('fc') || low.startsWith('fd');
}

/** Fetches a job posting page and returns its readable text. Rejects requests aimed at internal/private networks. */
export async function fetchJobPostingText(rawUrl: string): Promise<string> {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new AppError(422, 'That job posting link is not a valid URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new AppError(422, 'Only http:// or https:// links are supported.');
  if (BLOCKED_HOSTS.has(url.hostname.toLowerCase())) throw new AppError(422, 'That link cannot be fetched.');
  try {
    const { address } = await lookup(url.hostname);
    if (isPrivateAddress(address)) throw new AppError(422, 'That link cannot be fetched.');
  } catch (e) { if (e instanceof AppError) throw e; throw new AppError(422, 'That job posting link could not be resolved.'); }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AtlasBot/1.0)' } });
  } catch {
    throw new AppError(422, 'That job posting could not be reached. Paste the description text instead.');
  } finally { clearTimeout(timeout); }
  if (!response.ok || !response.body) throw new AppError(422, 'That job posting could not be reached. Paste the description text instead.');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0; const max = 3 * 1024 * 1024;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length; if (size > max) { await reader.cancel(); break; }
    chunks.push(value);
  }
  const all = new Uint8Array(size); let offset = 0; for (const c of chunks) { all.set(c, offset); offset += c.length; }
  const html = new TextDecoder('utf-8').decode(all);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|p|div|li|h[1-6])[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  if (!text) throw new AppError(422, 'No readable text was found at that link. Paste the description text instead.');
  return text;
}

// --- Free keyword-matching fallback (used when ANTHROPIC_API_KEY isn't set) -

export type SkillGapResult = { resume_skills: string[]; matched_skills: string[]; missing_skills: string[]; suggestions: { skill: string; why: string }[]; match_score: number; summary: string };

const SKILL_KEYWORDS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'C', 'Go', 'Rust', 'PHP', 'Ruby', 'Swift', 'Kotlin', 'Scala', 'R', 'MATLAB', 'Dart',
  'HTML', 'CSS', 'Sass', 'Tailwind', 'Bootstrap', 'React', 'Next.js', 'Vue', 'Angular', 'Svelte', 'jQuery', 'Redux',
  'Node.js', 'Express', 'Django', 'Flask', 'FastAPI', 'Spring', 'Spring Boot', 'Laravel', 'Ruby on Rails', 'ASP.NET', '.NET',
  'SQL', 'MySQL', 'PostgreSQL', 'SQLite', 'Oracle', 'SQL Server', 'MongoDB', 'Redis', 'Firebase', 'Supabase', 'DynamoDB', 'GraphQL', 'REST API', 'API',
  'AWS', 'Azure', 'Google Cloud', 'GCP', 'Docker', 'Kubernetes', 'CI/CD', 'Jenkins', 'GitHub Actions', 'Terraform', 'Linux', 'Bash', 'Nginx',
  'Git', 'GitHub', 'GitLab', 'Jira', 'Agile', 'Scrum', 'Kanban',
  'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Scikit-learn', 'Data Analysis', 'Data Science', 'Excel', 'Power BI', 'Tableau',
  'Figma', 'Adobe XD', 'Photoshop', 'UI/UX', 'Wireframing',
  'Unit Testing', 'Jest', 'Cypress', 'Selenium', 'QA', 'Testing',
  'Android', 'iOS', 'React Native', 'Flutter',
  'Communication', 'Teamwork', 'Leadership', 'Problem Solving', 'Time Management', 'Project Management', 'Customer Service',
];

function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function extractKeywordSkills(text: string): string[] {
  const found: string[] = [];
  for (const skill of SKILL_KEYWORDS) {
    const pattern = new RegExp(`(?<![a-z0-9])${escapeRegex(skill.toLowerCase()).replace(/\\\./g, '\\.?')}(?![a-z0-9])`, 'i');
    if (pattern.test(text)) found.push(skill);
  }
  return found;
}

/** No-API-key fallback: compares known skill keywords found in each text. Free, but has no real understanding of context. */
function keywordSkillGap(resumeText: string, jobText: string): SkillGapResult {
  const resumeSkills = extractKeywordSkills(resumeText);
  const jobSkills = extractKeywordSkills(jobText);
  const resumeSet = new Set(resumeSkills.map(s => s.toLowerCase()));
  const matched = jobSkills.filter(s => resumeSet.has(s.toLowerCase()));
  const missing = jobSkills.filter(s => !resumeSet.has(s.toLowerCase()));
  const score = jobSkills.length ? Math.round((matched.length / jobSkills.length) * 100) : 0;
  const suggestions = missing.slice(0, 6).map(skill => ({ skill, why: `This job description mentions ${skill}, but it wasn't found in your résumé. A short course or small personal project is a solid way to pick it up.` }));
  const summary = jobSkills.length
    ? `Keyword-based match (no AI key configured): your résumé matched ${matched.length} of the ${jobSkills.length} recognizable skill keywords found in this job description.`
    : `No recognizable skill keywords were found in this job description to compare against your résumé.`;
  return { resume_skills: resumeSkills, matched_skills: matched, missing_skills: missing, suggestions, match_score: score, summary };
}

// --- Claude-powered skill-gap analysis (used when ANTHROPIC_API_KEY is set) -

const SYSTEM_PROMPT = `You compare a student's résumé against an internship job description and report a skills gap analysis. Respond with ONLY a single JSON object, no prose and no markdown fences, matching exactly this shape:
{"resume_skills": string[], "matched_skills": string[], "missing_skills": string[], "suggestions": [{"skill": string, "why": string}], "match_score": number, "summary": string}
Rules:
- resume_skills: concrete skills, tools, languages, and technologies evidenced in the résumé (8-25 items, deduplicated, Title Case short phrases).
- matched_skills: skills/requirements from the job description that the résumé already evidences.
- missing_skills: skills/requirements the job description asks for that the résumé does not evidence (order by importance to the role, most important first).
- suggestions: for up to 6 of the most important missing_skills, a one-sentence, encouraging, concrete note on how a student could pick it up (a course, project type, or certification) and why it matters for this role.
- match_score: an integer 0-100 estimating overall fit based on how much of the job's required skills are covered.
- summary: 2-3 sentences, encouraging and specific, aimed directly at the student.
Base every judgment only on the text given. Do not invent employers, dates, or claims not present in the résumé.`;

/** Calls the Anthropic API to compare a résumé against a job description. Requires ANTHROPIC_API_KEY. */
export async function analyzeSkillGap(resumeText: string, jobText: string): Promise<SkillGapResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return keywordSkillGap(resumeText, jobText);
  const resume = resumeText.slice(0, 12000);
  const job = jobText.slice(0, 12000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-5', max_tokens: 1800, system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `RESUME:\n${resume}\n\nJOB DESCRIPTION:\n${job}` }],
      }),
    });
  } catch { throw new AppError(503, 'Skill analysis is temporarily unavailable. Please try again.'); }
  finally { clearTimeout(timeout); }
  if (!response.ok) throw new AppError(503, 'Skill analysis is temporarily unavailable. Please try again.');
  const data = await response.json() as { content?: { type: string; text?: string }[] };
  const raw = data.content?.find(b => b.type === 'text')?.text || '';
  const cleaned = raw.replace(/^```json\s*|^```\s*|```\s*$/g, '').trim();
  let parsed: SkillGapResult;
  try { parsed = JSON.parse(cleaned); } catch { throw new AppError(503, 'Skill analysis returned an unexpected result. Please try again.'); }
  const strings = (v: unknown) => Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string').slice(0, 40).map(s => s.slice(0, 120)) : [];
  return {
    resume_skills: strings(parsed.resume_skills),
    matched_skills: strings(parsed.matched_skills),
    missing_skills: strings(parsed.missing_skills),
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((s): s is { skill: string; why: string } => !!s && typeof s.skill === 'string' && typeof s.why === 'string').slice(0, 8).map(s => ({ skill: s.skill.slice(0, 120), why: s.why.slice(0, 400) })) : [],
    match_score: Math.max(0, Math.min(100, Math.round(Number(parsed.match_score) || 0))),
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 800) : '',
  };
}