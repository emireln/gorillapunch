import ipaddr from 'ipaddr.js';
export function normalizeUrl(input: string): string {
  const url = parseWebUrl(input, 'https');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Only standard website ports are supported.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (!hostname.includes('.') && !ipaddr.isValid(hostname) || /(^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(hostname) || hostname === 'metadata.google.internal') throw new Error('Private and local addresses cannot take a punch.');
  if (ipaddr.isValid(hostname) && !isPublicIP(hostname)) throw new Error('Private and reserved network addresses are blocked.');
  url.hostname = hostname.includes(':') ? `[${hostname}]` : hostname;
  url.hash = '';
  // URLs containing tokens are rejected so secrets never enter scan history.
  if ([...url.searchParams.keys()].some(key => /token|password|secret|api.?key|session|code|auth/i.test(key))) throw new Error('Remove credentials or session parameters from the URL.');
  return url.href;
}

/**
 * Desktop scans execute on the user's own machine and intentionally support
 * loopback, private networks and development ports. Protocol, credential and
 * secret-in-query protections still apply. Never use this normalizer in the
 * hosted worker.
 */
export function normalizeDesktopUrl(input: string): string {
  const trimmed = input.trim();
  const local = /^(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)(?::\d+)?(?:[/?#]|$)/i.test(trimmed);
  const url = parseWebUrl(input, local ? 'http' : 'https');
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (!hostname) throw new Error('Enter a valid HTTP or HTTPS URL.');
  url.hostname = hostname.includes(':') ? `[${hostname}]` : hostname;
  url.hash = '';
  return url.href;
}

/**
 * Desktop punches may reach ordinary public, RFC1918, carrier-grade NAT,
 * loopback and IPv6 unique-local addresses. Special-use ranges such as cloud
 * metadata/link-local, multicast, documentation and unspecified addresses
 * remain blocked even on a developer workstation.
 */
export function isDesktopReachableIP(address: string): boolean {
  try {
    const range = ipaddr.process(address).range();
    return ['unicast', 'private', 'loopback', 'uniqueLocal', 'carrierGradeNat'].includes(range);
  } catch { return false; }
}

function parseWebUrl(input: string, defaultProtocol: 'http' | 'https') {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048 || /[\u0000-\u0020\\]/.test(trimmed)) throw new Error('Enter a valid website URL.');
  const hostWithPort = /^(?:localhost|[a-z\d.-]+):\d+(?:[/?#]|$)/i.test(trimmed);
  const explicitScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed) && !hostWithPort;
  let url: URL;
  try { url = new URL(explicitScheme ? trimmed : `${defaultProtocol}://${trimmed}`); }
  catch { throw new Error('Enter a valid website URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only HTTP and HTTPS URLs without credentials are supported.');
  if ([...url.searchParams.keys()].some(key => /token|password|secret|api.?key|session|code|auth/i.test(key))) throw new Error('Remove credentials or session parameters from the URL.');
  return url;
}
export function isPublicIP(address: string): boolean {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === 'unicast';
  } catch { return false; }
}
