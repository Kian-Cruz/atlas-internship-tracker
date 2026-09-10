import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { authConfig, authCookieOptions } from './config';
import { createStorage } from '../platform/storage';
import { validatedIdentity, type Identity } from './identity';

export async function authClient() {
  const config = authConfig();
  if (!config) throw new Error('Supabase authentication is not configured');
  const jar = await cookies();
  return createServerClient(config.url, config.key, { cookieOptions: authCookieOptions(), cookies: {
    getAll: () => jar.getAll(),
    setAll: values => {
      try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); }
      catch { /* Server Components cannot write cookies; proxy refreshes them. */ }
    },
  } });
}

export async function getUser(): Promise<Identity | null> {
  if (!authConfig()) return null;
  const client = await authClient();
  // Validate with the Auth server; never trust cookies or identity headers alone.
  return validatedIdentity(client.auth);
}

export function documentStorage() {
  const config = authConfig();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!config || !secret) throw new Error('Private document storage is not configured');
  return createStorage(createClient(config.url, secret, { auth: { persistSession: false, autoRefreshToken: false } }));
}
