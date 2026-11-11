import { isIP } from 'node:net';

const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal']);

/** True for host names that must never be fetched on a user's behalf. */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return BLOCKED_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.internal');
}

/** True for loopback, private, link-local and otherwise non-public IP addresses (IPv4 and IPv6). */
export function isPrivateAddress(ip: string): boolean {
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const low = ip.toLowerCase();
  return low === '::1' || low === '::' || low.startsWith('fe80:') || low.startsWith('fc') || low.startsWith('fd');
}