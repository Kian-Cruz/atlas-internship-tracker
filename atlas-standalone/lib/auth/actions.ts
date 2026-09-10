import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, boundary, jsonBody, response } from '@/lib/atlas/server';
import { safeReturnPath } from './config';
const email = z.string().trim().email('Enter a valid email address.').max(254).transform(s => s.toLowerCase());
const password = z.string().min(12, 'Use at least 12 characters.').max(128, 'Use at most 128 characters.');
const schemas = {
  login: z.object({ email, password: z.string().min(1).max(128), next: z.string().optional() }).strict(),
  signup: z.object({ email, password, name: z.string().trim().min(1, 'Enter your name.').max(100) }).strict(),
  forgot: z.object({ email }).strict(),
  reset: z.object({ password }).strict(),
  logout: z.object({}).strict(),
};
export type AuthDependencies = {
  client: () => Promise<Pick<SupabaseClient, 'auth'>>;
  origin: () => string;
  consumeAttempt: (action: string, email: string) => Promise<void>;
};
export function authAction(deps: AuthDependencies) {
  return (request: Request, action: string) => boundary(async () => {
    if (request.method !== 'POST') throw new AppError(405, 'Use a POST request.');
    const origin = deps.origin();
    if (request.headers.get('origin') !== origin || request.headers.get('x-atlas-request') !== '1' || request.headers.get('sec-fetch-site') === 'cross-site') throw new AppError(403, 'Reload the page and try again.');
    if (!Object.hasOwn(schemas, action)) throw new AppError(404, 'This account action was not found.');
    const body = await jsonBody(request);
    const input = schemas[action as keyof typeof schemas].parse(body);
    if ('email' in input && typeof input.email === 'string') await deps.consumeAttempt(action, input.email);
    const { auth } = await deps.client();
    if (action === 'login') {
      const values = schemas.login.parse(input);
      const { data, error } = await auth.signInWithPassword({ email: values.email, password: values.password });
      if (error || !data.user?.email_confirmed_at) throw new AppError(error?.status === 429 ? 429 : 401, 'Sign-in failed. Check your email, password, and email confirmation.');
      return response({ redirect: safeReturnPath(values.next) });
    }
    if (action === 'signup') {
      const values = schemas.signup.parse(input);
      const { error } = await auth.signUp({ email: values.email, password: values.password, options: { data: { full_name: values.name }, emailRedirectTo: `${origin}/auth/callback` } });
      if (error && !['user_already_exists', 'email_exists'].includes(error.code || '')) throw new AppError(error.status === 429 ? 429 : 400, 'We could not create your account. Please wait a moment and try again.');
      return response({ message: 'Check your email for the confirmation link. If you already have an account, sign in or reset your password.' });
    }
    if (action === 'forgot') {
      const values = schemas.forgot.parse(input);
      const { error } = await auth.resetPasswordForEmail(values.email, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
      if (error) throw new AppError(error.status === 429 ? 429 : 503, 'We could not send a recovery email. Please wait a moment and try again.');
      return response({ message: 'If this email has an account, you will receive a password reset link.' });
    }
    if (action === 'reset') {
      const { data, error } = await auth.getUser();
      if (error || !data.user?.email_confirmed_at) throw new AppError(401, 'Open a fresh password reset link from your email.');
      const { error: updateError } = await auth.updateUser({ password: schemas.reset.parse(input).password });
      if (updateError) throw new AppError(400, 'Your password could not be updated. Use a different password or request a new link.');
      const { error: logoutError } = await auth.signOut({ scope: 'global' });
      if (logoutError) throw new AppError(503, 'Password updated, but sign-out did not finish. Please sign out and sign in again.');
      return response({ redirect: '/login?message=password-updated' });
    }
    const { error } = await auth.signOut({ scope: 'local' });
    if (error) throw new AppError(503, 'Sign-out failed. Please try again.');
    return response({ redirect: '/login' });
  });
}
