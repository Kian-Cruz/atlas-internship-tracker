import type { SupabaseClient } from '@supabase/supabase-js';
export type Identity = { userId: string; email: string; fullName: string | null };
export async function validatedIdentity(auth: SupabaseClient['auth']): Promise<Identity | null> {
  const { data: { user }, error } = await auth.getUser();
  if (error || !user || !user.email || !user.email_confirmed_at) return null;
  return { userId: user.id, email: user.email, fullName: typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null };
}
