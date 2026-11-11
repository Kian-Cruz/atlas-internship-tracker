// Skill-gap analysis: provider calls (Ollama / Gemini / Claude) and the free keyword fallback.
// Server-side only: it reads API keys from process.env and must never be imported by client components.
// Kept free of framework-only imports so it can be unit tested with `npm test`.
import { AppError } from './server';

// --- Shared types ------------------------------------------------------------

export type SkillGapResult = { resume_skills: string[]; matched_skills: string[]; missing_skills: string[]; suggestions: { skill: string; why: string }[]; match_score: number; summary: string };

// --- Free keyword-matching fallback (used when no AI key is set) ------------

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
    // Short names that are also common words ("go", "r", "c") only match with their exact capitalisation.
    const exactCase = skill === 'C' || skill === 'R' || skill === 'Go';
    const body = escapeRegex(exactCase ? skill : skill.toLowerCase()).replace(/\\\./g, '\\.?');
    const pattern = new RegExp(`(?<![A-Za-z0-9])${body}(?![A-Za-z0-9])`, exactCase ? '' : 'i');
    if (pattern.test(text)) found.push(skill);
  }
  return found;
}

/** No-API-key fallback: compares known skill keywords found in each text. Free, but has no real understanding of context. */
export function keywordSkillGap(resumeText: string, jobText: string): SkillGapResult {
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

// --- Generative AI skill-gap analysis ---------------------------------------

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

/** Parses the model's JSON reply and clamps every field to safe sizes/types before it is stored. */
export function normalizeModelResult(raw: string): SkillGapResult {
  const cleaned = raw.replace(/^```json\s*|^```\s*|```\s*$/g, '').trim();
  let parsed: Partial<SkillGapResult>;
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

const userPrompt = (resume: string, job: string) => `RESUME:\n${resume}\n\nJOB DESCRIPTION:\n${job}`;

/** Ollama (local models, free). Enabled when OLLAMA_MODEL is set; OLLAMA_URL defaults to http://localhost:11434. Only works where the app can reach Ollama (e.g. running locally). */
async function analyzeWithOllama(model: string, resume: string, job: string): Promise<SkillGapResult> {
  const base = (process.env.OLLAMA_URL?.trim() || 'http://localhost:11434').replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  let response: Response;
  try {
    response = await fetch(`${base}/api/chat`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, stream: false, format: 'json', options: { temperature: 0.2 },
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt(resume, job) }],
      }),
    });
  } catch { throw new AppError(503, 'Could not reach Ollama. Make sure it is running and the model is downloaded.'); }
  finally { clearTimeout(timeout); }
  if (!response.ok) throw new AppError(503, 'Ollama returned an error. Check that the model name is correct and downloaded.');
  const data = await response.json() as { message?: { content?: string } };
  return normalizeModelResult(data.message?.content || '');
}

/** Google Gemini (free tier available). Needs GEMINI_API_KEY; GEMINI_MODEL overrides the default model. */
class GeminiError extends AppError {
  constructor(status: number, message: string, public retryable: boolean) { super(status, message); }
}

async function callGemini(apiKey: string, model: string, resume: string, job: string): Promise<SkillGapResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt(resume, job) }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 2048 },
      }),
    });
  } catch (e) {
    console.error('Gemini fetch failed', model, e);
    throw new GeminiError(503, 'Could not reach Gemini (network error or timeout). Please try again.', true);
  } finally { clearTimeout(timeout); }
  if (response.status === 429) throw new GeminiError(429, 'The free AI quota is used up for now. Please wait a minute and try again.', false);
  if (!response.ok) {
    let detail = '';
    try { detail = ((await response.json()) as { error?: { message?: string } }).error?.message || ''; } catch { /* no body */ }
    detail = detail.replace(/AIza[\w-]+|AQ\.[\w.-]+/g, '[key]').slice(0, 200);
    console.error('Gemini error', response.status, model, detail);
    throw new GeminiError(503, `Gemini error ${response.status} (${model}): ${detail || 'no details'}`, response.status >= 500);
  }
  const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const raw = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
  return normalizeModelResult(raw);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Tries the main model, retries once if Google is overloaded, then falls back to a second free model. */
async function analyzeWithGemini(apiKey: string, resume: string, job: string): Promise<SkillGapResult> {
  const primary = process.env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite';
  const fallback = primary === 'gemini-3.5-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-3.5-flash-lite';
  const attempts = [primary, primary, fallback];
  let lastError: unknown;
  for (let i = 0; i < attempts.length; i++) {
    if (i === 1) await sleep(1500);
    try { return await callGemini(apiKey, attempts[i], resume, job); }
    catch (e) {
      lastError = e;
      if (i === 1 && attempts[0] === attempts[1] && !(e instanceof GeminiError && e.retryable)) { /* try the fallback model next */ }
    }
  }
  throw lastError;
}

/** Anthropic Claude (paid API). Needs ANTHROPIC_API_KEY. */
async function analyzeWithClaude(apiKey: string, resume: string, job: string): Promise<SkillGapResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-5', max_tokens: 1800, system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt(resume, job) }],
      }),
    });
  } catch { throw new AppError(503, 'Skill analysis is temporarily unavailable. Please try again.'); }
  finally { clearTimeout(timeout); }
  if (!response.ok) throw new AppError(503, 'Skill analysis is temporarily unavailable. Please try again.');
  const data = await response.json() as { content?: { type: string; text?: string }[] };
  return normalizeModelResult(data.content?.find(b => b.type === 'text')?.text || '');
}

/**
 * Compares a résumé against a job description.
 * Provider order: Ollama (OLLAMA_MODEL, local) -> Gemini (GEMINI_API_KEY, free tier) -> Claude (ANTHROPIC_API_KEY) -> built-in keyword matching.
 */
export async function analyzeSkillGap(resumeText: string, jobText: string): Promise<SkillGapResult> {
  const resume = resumeText.slice(0, 12000);
  const job = jobText.slice(0, 12000);
  const ollamaModel = process.env.OLLAMA_MODEL?.trim();
  if (ollamaModel) return analyzeWithOllama(ollamaModel, resume, job);
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) return analyzeWithGemini(geminiKey, resume, job);
  const claudeKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (claudeKey) return analyzeWithClaude(claudeKey, resume, job);
  return keywordSkillGap(resume, job);
}