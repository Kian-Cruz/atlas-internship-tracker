import { AppError, createServices, boundary, response, jsonBody } from '@/lib/atlas/server';
import { skillAnalysisRequestSchema } from '@/lib/atlas/contracts';
import { extractResumeText, fetchJobPostingText, analyzeSkillGap, parseSkillAnalysisRow } from '@/lib/atlas/skills';
import { getDatabase } from '@/lib/platform/postgres';
import { getUser, documentStorage } from '@/lib/auth/server';
import { appOrigin } from '@/lib/auth/config';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const { database, bucket, identity, owned } = createServices({ database: getDatabase, authenticate: getUser, storage: documentStorage, origin: appOrigin });
const LIMIT = 50;

export async function GET(req: Request) {
  return boundary(async () => {
    const user = await identity(req);
    const rows = await database(user.userId).prepare('SELECT * FROM skill_analyses WHERE user_id=? ORDER BY updated_at DESC LIMIT ?').bind(user.userId, LIMIT + 1).run();
    return response(rows.results.slice(0, LIMIT).map(r => parseSkillAnalysisRow(r as Record<string, unknown>)));
  });
}

export async function POST(req: Request) {
  return boundary(async () => {
    const user = await identity(req);
    const count = await database(user.userId).prepare('SELECT count(*) AS n FROM skill_analyses WHERE user_id=?').bind(user.userId).first<{ n: number }>();
    if ((count?.n || 0) >= LIMIT) throw new AppError(409, `Your workspace has reached its skill analysis limit (${LIMIT}). Delete an old analysis to continue.`);

    const input = skillAnalysisRequestSchema.parse(await jsonBody(req));
    const document = await owned('documents', input.document_id, user.userId);
    if (document.deleting) throw new AppError(409, 'This document is being deleted. Choose another résumé.');
    if (input.application_id) await owned('applications', input.application_id, user.userId);

    const file = await bucket().get(String(document.object_key));
    if (!file) throw new AppError(404, 'This document’s file is unavailable. Please re-upload it.');
    const resumeText = await extractResumeText(file.body, String(document.content_type));
    if (resumeText.length < 40) throw new AppError(422, 'This document does not contain enough readable text to analyze.');

    const jobText = input.job_description.trim() || await fetchJobPostingText(input.source_url);
    const result = await analyzeSkillGap(resumeText, jobText);

    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(), user_id: user.userId, version: 1, created_at: now, updated_at: now,
      document_id: input.document_id, application_id: input.application_id || null,
      job_title: input.job_title, company_name: input.company_name, source_url: input.source_url,
      job_description: jobText.slice(0, 20000),
      resume_skills: JSON.stringify(result.resume_skills), matched_skills: JSON.stringify(result.matched_skills),
      missing_skills: JSON.stringify(result.missing_skills), suggestions: JSON.stringify(result.suggestions),
      match_score: result.match_score, summary: result.summary, skill_progress: '{}',
    };
    await database(user.userId).prepare(`INSERT INTO skill_analyses (${Object.keys(record).join(',')}) VALUES (${Object.keys(record).map(() => '?').join(',')})`).bind(...Object.values(record)).run();
    return response(parseSkillAnalysisRow(record), 201);
  });
}