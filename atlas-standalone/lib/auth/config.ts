export function authConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || /YOUR_|REPLACE_/.test(url + key)) return null;
  try { if (!['https:', 'http:'].includes(new URL(url).protocol)) return null; } catch { return null; }
  return { url, key };
}
export function authCookieOptions() {
  return { path: '/', sameSite: 'lax' as const, httpOnly: true, secure: process.env.NODE_ENV === 'production' };
}
export function appOrigin() {
  const value = process.env.APP_URL;
  if (!value) {
    if (process.env.NODE_ENV === 'production') throw new Error('APP_URL is not configured');
    return 'http://localhost:3000';
  }
  return new URL(value).origin;
}
export function safeReturnPath(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  try {
    const url = new URL(value, 'https://atlas.invalid');
    if (url.origin !== 'https://atlas.invalid' || /^\/(auth|api|login|signup|forgot-password|reset-password)(\/|$)/.test(url.pathname)) return '/';
    return url.pathname + url.search;
  } catch { return '/'; }
}
