'use client';
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';
export default function SignOut() {
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      const result = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Atlas-Request': '1' }, body: '{}' });
      if (!result.ok) throw new Error('Sign-out failed. Please try again.');
      // A full navigation discards all in-memory private workspace data.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/login');
    } catch (error) { toast.error((error as Error).message); setBusy(false); }
  }
  return <button className="icon-btn" disabled={busy} onClick={() => void logout()} aria-label="Sign out"><LogOut /></button>;
}
