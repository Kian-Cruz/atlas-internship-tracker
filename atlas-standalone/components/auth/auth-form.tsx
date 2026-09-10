'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ArrowRight, GraduationCap, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
export type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';
const copy = {
  login: ['Welcome back.', 'Sign in to your private internship workspace.', 'Sign in'],
  signup: ['Your next chapter.', 'Create an account to start tracking opportunities.', 'Create account'],
  forgot: ['Let’s get you back in.', 'Enter your email and we’ll send a password reset link.', 'Send reset link'],
  reset: ['Choose a new password.', 'Use at least 12 characters. A longer passphrase works well.', 'Save new password'],
};
export default function AuthForm({ mode, next = '/', available, notice = '' }: { mode: AuthMode; next?: string; available: boolean; notice?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(notice);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [title, description, label] = copy[mode];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form);
    setError(''); setFields({}); setMessage('');
    if (mode === 'signup' || mode === 'reset') {
      if (body.password !== body.confirm) { setFields({confirm:['Passwords do not match.']}); return; }
      delete body.confirm;
    }
    if (mode === 'login') body.next = next;
    setBusy(true);
    try {
      const result = await fetch('/api/auth/' + mode, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Atlas-Request': '1' }, body: JSON.stringify(body) });
      const data = await result.json();
      if (!result.ok) { setFields(data.fields || {}); throw new Error(data.error || 'Please try again.'); }
      if (data.redirect) { window.location.assign(data.redirect); return; }
      setMessage(data.message);
    } catch (err) { setError(err instanceof Error ? err.message : 'The server could not be reached.'); }
    finally { setBusy(false); }
  }
  const field = (name: string, text: string, type: string, autoComplete: string, minLength?: number) => <div className="field"><Label htmlFor={`auth-${name}`}>{text}</Label><Input id={`auth-${name}`} name={name} type={type} autoComplete={autoComplete} required minLength={minLength} maxLength={name === 'email' ? 254 : name === 'name' ? 100 : 128} aria-invalid={!!fields[name]} aria-describedby={fields[name] ? `error-${name}` : undefined} />{fields[name] && <p className="field-error" id={`error-${name}`}>{fields[name][0]}</p>}</div>;
  return <main className="auth-screen"><Link className="auth-brand" href="/"><span className="atlas-symbol"><GraduationCap /></span>atlas<span className="brand-caption">INTERNSHIP WORKSPACE</span></Link><section className="auth-card account-card"><span className="eyebrow">A LITTLE CLARITY. A LOT OF POSSIBILITY.</span><h1>{title}</h1><p>{description}</p>
    {!available && <div className="error-banner" role="status">Account access is being set up. Please try again later.</div>}
    {message && <div className="auth-success" role="status">{message}</div>}
    {error && <div className="error-banner" role="alert">{error}</div>}
    <form onSubmit={submit} className="auth-form">
      {mode === 'signup' && field('name', 'Your name', 'text', 'name')}
      {mode !== 'reset' && field('email', 'Email address', 'email', 'email')}
      {mode !== 'forgot' && field('password', mode === 'reset' ? 'New password' : 'Password', 'password', mode === 'login' ? 'current-password' : 'new-password', mode === 'login' ? 1 : 12)}
      {(mode === 'signup' || mode === 'reset') && <>{field('confirm', 'Confirm password', 'password', 'new-password', 12)}<small className="password-hint">At least 12 characters. Spaces are welcome.</small></>}
      <Button className="btn primary" type="submit" disabled={busy || !available}>{busy ? 'Please wait…' : label}<ArrowRight /></Button>
    </form>
    <div className="auth-links">{mode === 'login' ? <><Link href="/forgot-password">Forgot password?</Link><Link href="/signup">Create an account</Link></> : <Link href="/login">Back to sign in</Link>}</div>
    <Link className="demo-link" href="/demo">Explore the sample workspace <ArrowRight size={16} /></Link><div className="auth-note"><ShieldCheck size={16} />Your applications and documents stay private.</div>
  </section><div className="auth-footer">atlas <span>Make room for what’s next.</span></div></main>;
}

