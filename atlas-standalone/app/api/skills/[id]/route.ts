import { z } from 'zod';
import { AppError, createServices, boundary, response, jsonBody } from '@/lib/atlas/server';
import { versionSchema, skillProgressUpdateSchema } from '@/lib/atlas/contracts';
import { parseSkillAnalysisRow } from '@/lib/atlas/skills';
import { getDatabase } from '@/lib/platform/postgres';
import { getUser, documentStorage } from '@/lib/auth/server';
import { appOrigin } from '@/lib/auth/config';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const { database, identity } = createServices({ database: getDatabase, authenticate: getUser, storage: documentStorage, origin: appOrigin });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return boundary(async () => {
    const user = await identity(req);
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) throw new AppError(404, 'This record was not found.');
    const input = skillProgressUpdateSchema.parse(await jsonBody(req));
    const row = await database(user.userId).prepare('SELECT * FROM skill_analyses WHERE id=? AND user_id=?').bind(id, user.userId).first<Record<string, unknown>>();
    if (!row) throw new AppError(404, 'This record was not found.');
    if (Number(row.version) !== input.version) throw new AppError(409, 'This record changed in another tab. Refresh before editing again.');
    let progress: Record<string, string> = {};
    try { progress = JSON.parse(String(row.skill_progress ?? '{}')); } catch { /* start fresh */ }
    progress[input.skill] = input.status;
    const now = new Date().toISOString();
    const result = await database(user.userId).prepare('UPDATE skill_analyses SET skill_progress=?, updated_at=?, version=version+1 WHERE id=? AND user_id=? AND version=?').bind(JSON.stringify(progress), now, id, user.userId, input.version).run();
    if (!result.meta.changes) throw new AppError(409, 'This record changed in another tab. Refresh before editing again.');
    return response(parseSkillAnalysisRow({ ...row, skill_progress: JSON.stringify(progress), updated_at: now, version: input.version + 1 }));
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return boundary(async () => {
    const user = await identity(req);
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) throw new AppError(404, 'This record was not found.');
    const expected = versionSchema.parse(Number(new URL(req.url).searchParams.get('version')));
    const r = await database(user.userId).prepare('DELETE FROM skill_analyses WHERE id=? AND user_id=? AND version=?').bind(id, user.userId, expected).run();
    if (!r.meta.changes) throw new AppError(409, 'This record changed. Refresh before deleting.');
    return response({ ok: true });
  });
}