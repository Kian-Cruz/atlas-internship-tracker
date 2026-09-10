import { NextResponse } from 'next/server';
import { authClient } from '@/lib/auth/server';
import { appOrigin } from '@/lib/auth/config';
import { completeAuth } from '@/lib/auth/callbacks';
export async function GET(request: Request) {
  let next = '/login?error=invalid-link';
  try { next = await completeAuth(new URL(request.url), (await authClient()).auth, 'callback'); } catch { /* Fail closed. */ }
  const response = NextResponse.redirect(new URL(next, appOrigin()));
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

