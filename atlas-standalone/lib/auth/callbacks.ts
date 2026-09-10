import type { SupabaseClient } from '@supabase/supabase-js';
import { safeReturnPath } from './config';
export async function completeAuth(url: URL, auth: SupabaseClient['auth'], mode: 'confirm' | 'callback') {
  const failed = '/login?error=invalid-link';
  if (mode === 'confirm') {
    const type = url.searchParams.get('type');
    const token = url.searchParams.get('token_hash');
    if (!token || !['signup', 'recovery', 'email'].includes(type || '')) return failed;
    const { error } = await auth.verifyOtp({ token_hash: token, type: type as 'signup' | 'recovery' | 'email' });
    if (error) return failed;
    return type === 'recovery' ? '/reset-password' : '/';
  }
  const code = url.searchParams.get('code');
  if (!code) return failed;
  const { error } = await auth.exchangeCodeForSession(code);
  if (error) return failed;
  return url.searchParams.get('next') === '/reset-password' ? '/reset-password' : safeReturnPath(url.searchParams.get('next'));
}

