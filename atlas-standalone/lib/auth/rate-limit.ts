import 'server-only';
import { createHash } from 'node:crypto';
import { getDatabase } from '@/lib/platform/postgres';
import { AppError } from '@/lib/atlas/server';
export async function consumeAttempt(action: string, email: string) {
  const key = 'auth:' + action + ':' + createHash('sha256').update(email).digest('hex');
  const now = Date.now();
  const window = action === 'login' ? 15 * 60_000 : 60 * 60_000;
  const limit = action === 'login' ? 20 : 5;
  const row = await getDatabase(key).prepare('INSERT INTO rate_limits (key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.reset_at<=? THEN 1 ELSE rate_limits.count+1 END,reset_at=CASE WHEN rate_limits.reset_at<=? THEN ? ELSE rate_limits.reset_at END RETURNING count').bind(key, now + window, now, now, now + window).first<{count:number}>();
  if (row && row.count > limit) throw new AppError(429, 'Too many attempts. Please wait before trying again.');
}

/**
 * Fixed-window quota for an expensive action (for example AI analysis), counted per user.
 * Uses the same rate_limits table as sign-in attempts. Infrastructure errors fail open so a limiter
 * problem never blocks the feature; only a genuine "too many requests" is raised.
 */
export async function consumeQuota(action: string, userId: string, limit: number, windowMs: number, message: string) {
  const key = 'quota:' + action + ':' + userId;
  const now = Date.now();
  let count = 0;
  try {
    const row = await getDatabase(key).prepare('INSERT INTO rate_limits (key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.reset_at<=? THEN 1 ELSE rate_limits.count+1 END,reset_at=CASE WHEN rate_limits.reset_at<=? THEN ? ELSE rate_limits.reset_at END RETURNING count').bind(key, now + windowMs, now, now, now + windowMs).first<{count:number}>();
    count = row?.count ?? 0;
  } catch (error) {
    console.error('quota check failed', action, error instanceof Error ? error.message : 'unknown');
    return;
  }
  if (count > limit) throw new AppError(429, message);
}