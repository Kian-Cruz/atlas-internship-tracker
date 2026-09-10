import { notFound, redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';
import { authConfig, safeReturnPath } from '@/lib/auth/config';
import Workspace from '@/components/atlas/workspace';
import AuthForm, { type AuthMode } from '@/components/auth/auth-form';
export const dynamic = 'force-dynamic';
export default async function Page({ params, searchParams }: { params: Promise<{view:string}>; searchParams:Promise<Record<string,string|string[]|undefined>> }) {
 const {view} = await params;
 const modes:Record<string,AuthMode> = {login:'login',signup:'signup','forgot-password':'forgot','reset-password':'reset'};
 const user = await getUser();
 if (Object.hasOwn(modes, view)) {
  const query = await searchParams;
  const next = safeReturnPath(query.next);
  if (user && ['login','signup'].includes(view)) redirect(next);
  if (view === 'reset-password' && !user) redirect('/forgot-password?error=recovery-required');
  const notice = query.error === 'invalid-link' ? 'That link is invalid or has expired. Request a fresh password reset link, or try signing in.' : query.error === 'recovery-required' ? 'Open the password reset link in your email to choose a new password.' : query.message === 'password-updated' ? 'Password updated. Sign in with your new password.' : '';
  return <AuthForm mode={modes[view]} next={next} available={!!authConfig()} notice={notice} />;
 }
 if (!['applications','companies','interviews','documents','analytics','demo'].includes(view)) notFound();
 return <Workspace user={user ? {name:user.fullName || user.email.split('@')[0],email:user.email} : null} initialView={view==='demo'?'dashboard':view} demo={view==='demo'} signInPath={'/login?next='+encodeURIComponent(view==='demo'?'/':'/'+view)} signOutPath="/api/auth/logout" />;
}
