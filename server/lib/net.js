// Network helpers: client-address classification, LAN interfaces, Host-header allowlist. Pure where possible.
import os from 'node:os';

/** Strip IPv6 brackets / zone and the ::ffff: IPv4-mapped prefix. */
export function normalizeIp(ip) {
  let s = String(ip || '').trim().toLowerCase();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  s = s.replace(/%.*$/, '');
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  return m ? m[1] : s;
}

const v4 = (ip) => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every((n) => n <= 255) ? p : null;
};

export function isLoopback(ip) {
  const s = normalizeIp(ip);
  const p = v4(s);
  return s === '::1' || (p !== null && p[0] === 127);
}

/** RFC1918, link-local, fc00::/7, fe80::/10 (and loopback). Everything else is "public" and refused. */
export function isPrivateIp(ip) {
  const s = normalizeIp(ip);
  if (isLoopback(s)) return true;
  const p = v4(s);
  if (p) {
    return p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254);
  }
  if (s.includes(':')) {
    const first = parseInt(s.split(':')[0] || '0', 16);
    if (Number.isNaN(first)) return false;
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
  }
  return false;
}

/** IPv4 addresses of this machine's non-internal interfaces. */
/**
 * True when `ip` sits on a subnet this Mac is directly connected to (by interface netmask, /16 or narrower).
 * Some shop networks use public-looking ranges (e.g. 123.123.1.0/24) as their LAN; those clients are local too.
 */
export function onLocalSubnet(ip, ifaces = os.networkInterfaces()) {
  const p = v4(normalizeIp(ip));
  if (!p) return false;
  const n = ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
  for (const list of Object.values(ifaces)) {
    for (const i of list || []) {
      if (i.family !== 'IPv4' || i.internal || !i.netmask) continue;
      const a = v4(i.address), m = v4(i.netmask);
      if (!a || !m) continue;
      const mask = ((m[0] << 24) | (m[1] << 16) | (m[2] << 8) | m[3]) >>> 0;
      if (Math.clz32(~mask) < 16) continue; // prefix shorter than /16: too broad to trust
      const addr = ((a[0] << 24) | (a[1] << 16) | (a[2] << 8) | a[3]) >>> 0;
      if (((n & mask) >>> 0) === ((addr & mask) >>> 0)) return true;
    }
  }
  return false;
}
export function lanAddresses(ifaces = os.networkInterfaces()) {
  const out = [];
  for (const list of Object.values(ifaces)) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')) out.push(i.address);
  }
  return out;
}

/** DNS-rebinding guard: only these Host values are served. */
export function hostAllowed(hostHeader, lan = lanAddresses()) {
  if (!hostHeader) return false;
  const m = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(String(hostHeader).trim());
  if (!m) return false;
  const name = m[1].toLowerCase().replace(/^\[|\]$/g, '');
  if (name === 'localhost' || name === '127.0.0.1' || name === '::1') return true;
  if (lan.includes(name)) return true;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.local$/.test(name);
}

export function localHostname() {
  const h = os.hostname();
  return h.endsWith('.local') ? h : h.replace(/\.(lan|home|local)$/, '') + '.local';
}
