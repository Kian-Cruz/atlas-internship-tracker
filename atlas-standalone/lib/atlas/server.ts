import type { Database } from '@/lib/platform/database';
import type { PrivateStorage } from '@/lib/platform/storage';
export type UserIdentity = { userId: string; email: string; fullName?: string | null };
export type Dependencies = { database: (userId?: string) => Database; storage: () => PrivateStorage; authenticate: (request: Request) => Promise<UserIdentity | null>; origin: () => string };
import { z } from 'zod';
export class AppError extends Error { constructor(public status: number, message: string) { super(message); } }
export function createServices(deps: Dependencies) {
const database = deps.database;
const bucket = deps.storage;
async function identity(request: Request) {
  const user = await deps.authenticate(request); if (!user || !z.string().uuid().safeParse(user.userId).success || !user.email) throw new AppError(401, 'Sign in to access your workspace.');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (!origin || origin !== deps.origin() || request.headers.get('x-atlas-request') !== '1' || request.headers.get('sec-fetch-site') === 'cross-site') throw new AppError(403, 'This request could not be verified. Reload the page and try again.');
    const now = Date.now();
    const row = await database(user.userId).prepare('INSERT INTO rate_limits (key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.reset_at<=? THEN 1 ELSE rate_limits.count+1 END,reset_at=CASE WHEN rate_limits.reset_at<=? THEN ? ELSE rate_limits.reset_at END RETURNING count,reset_at').bind(user.userId, now + 60000, now, now, now + 60000).first<{ count: number; reset_at: number }>();
    if (row && row.count > 90) throw new AppError(429, 'Too many changes at once. Please wait a minute and try again.');
  }
  return user;
}
return { database, bucket, identity, owned, quota };

async function owned(table: Table, id: string, userId: string) {
  if (!z.string().uuid().safeParse(id).success) throw new AppError(404, 'This record was not found.');
  const row = await database(userId).prepare(`SELECT * FROM ${table} WHERE id=? AND user_id=?`).bind(id, userId).first<Record<string, unknown>>();
  if (!row) throw new AppError(404, 'This record was not found.'); return row;
}
async function quota(table: Table, userId: string) {
  const r = await database(userId).prepare(`SELECT count(*) AS n FROM ${table} WHERE user_id=?`).bind(userId).first<{ n: number }>();
  if ((r?.n || 0) >= limits[table]) throw new AppError(409, `Your workspace has reached its ${table} limit (${limits[table]}). Remove an unused record to continue.`);
}
}

export async function boundedBody(request: Request, max: number) {
  const declared = Number(request.headers.get('content-length') || 0); if (declared > max) throw new AppError(413, 'This upload is too large.');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > max) { await reader.cancel(); throw new AppError(413, 'This request is too large.'); } chunks.push(value); }
  const all = new Uint8Array(size); let offset = 0; for (const c of chunks) { all.set(c, offset); offset += c.length; } return all;
}
export async function jsonBody(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new AppError(415, 'Use a JSON request.');
  try { return JSON.parse(new TextDecoder().decode(await boundedBody(request, 32 * 1024))); } catch (e) { if (e instanceof AppError) throw e; throw new AppError(400, 'The request could not be read.'); }
}
export function response(value: unknown, status = 200) { return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' } }); }
export async function boundary(fn: () => Promise<Response>) {
  const requestId = crypto.randomUUID(); try { return await fn(); } catch (e) {
    if (e instanceof z.ZodError) return response({ error: 'Please check the highlighted fields.', fields: e.flatten().fieldErrors, requestId }, 422);
    if (e instanceof AppError) return response({ error: e.message, requestId }, e.status);
    const code = typeof e === 'object' && e && 'code' in e ? String(e.code) : '';
    if (code === '23505') return response({ error: 'A company with this name already exists.', requestId }, 409);
    if (['23503', '23514'].includes(code)) return response({ error: 'This record is linked to other records or was changed. Refresh and try again.', requestId }, 409);
    console.error(JSON.stringify({ requestId, code: code || 'UNEXPECTED_ERROR' }));
    return response({ error: 'We could not complete that request. Your changes have not been confirmed. Please try again.', requestId }, 503);
  }
}
export const TABLES = ['companies', 'applications', 'interviews', 'notes', 'documents'] as const;
export type Table = typeof TABLES[number];
export const limits = { companies: 300, applications: 500, interviews: 1000, notes: 1000, documents: 100 };
export function clean(row: Record<string, unknown>) { const { user_id, object_key, name_key, change_token, ...publicRow } = row; void user_id; void object_key; void name_key; void change_token; if ('application_id' in publicRow) publicRow.application_id ??= ''; return publicRow; }
