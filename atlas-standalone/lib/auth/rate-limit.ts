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

