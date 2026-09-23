import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { isIP } from 'node:net';
import { isDesktopReachableIP, isPublicIP, normalizeUrl } from '../core/url';
import { publicUrl } from '../core/redact';
import { botUserAgent } from './identity';
export interface HttpResult { url: string; status: number; headers: Record<string, string>; body: Buffer; duration: number; redirects: string[]; tls?: { issuer: string; validTo: string; validFrom: string; subject: string; san: string; protocol: string } }
export type Transport = (url: string, options?: { method?: 'GET' | 'HEAD'; signal?: AbortSignal }) => Promise<HttpResult>;
export interface NetworkLimits {
  maxBytes: number; maxRequests: number; timeout: number; signal?: AbortSignal;
  /** Desktop-only escape hatch. Hosted workers must keep the default false. */
  allowPrivateNetwork?: boolean;
  normalize?: (input: string) => string;
}
export function createSafeTransport(limits: NetworkLimits): Transport {
  const pinned = new Map<string, { address: string; family: number }>();
  const counts = new Map<string, number>(); let total = 0;
  const active = new Map<string, number>(), waiters = new Map<string, (() => void)[]>();
  async function acquire(host: string) {
    if ((active.get(host) || 0) >= 2) await new Promise<void>(resolve => { const queue = waiters.get(host) || []; queue.push(resolve); waiters.set(host, queue); });
    else active.set(host, (active.get(host) || 0) + 1);
    return () => { const next = waiters.get(host)?.shift(); if (next) next(); else active.set(host, (active.get(host) || 1) - 1); };
  }
  return async function fetchSafe(input, options = {}) {
    const normalize = limits.normalize || normalizeUrl;
    let url = normalize(input); const redirects: string[] = [], started = Date.now();
    for (let hop = 0; hop <= 5; hop++) {
      if (options.signal?.aborted || limits.signal?.aborted) throw new Error('SCAN_TIMEOUT');
      const target = new URL(url), host = target.hostname.replace(/^\[|\]$/g, '');
      const count = (counts.get(host) || 0) + 1; counts.set(host, count);
      if (count > limits.maxRequests || ++total > limits.maxRequests * 3) throw new Error('REQUEST_BUDGET');
      let pin = pinned.get(host);
      if (!pin) {
        const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await Promise.race([
          dns.lookup(host, { all: true, verbatim: true }),
          new Promise<never>((_, reject) => { const t = setTimeout(() => reject(new Error('DNS_TIMEOUT')), 5000); t.unref(); }),
        ]);
        const addressAllowed = limits.allowPrivateNetwork ? isDesktopReachableIP : isPublicIP;
        if (!addresses.length || addresses.some(a => !addressAllowed(a.address))) throw new Error('PRIVATE_NETWORK_BLOCKED');
        // Windows commonly returns ::1 first for localhost even when a dev
        // server is explicitly bound to 127.0.0.1. Prefer that exact loopback
        // in desktop mode so the common `next dev --hostname 127.0.0.1` case works.
        pin = limits.allowPrivateNetwork && host === 'localhost'
          ? addresses.find(address => address.address === '127.0.0.1') || addresses[0]
          : addresses[0];
        pinned.set(host, pin);
      }
      const address = pin;
      const release = await acquire(host);
      const response = await new Promise<HttpResult>((resolve, reject) => {
        const signal = AbortSignal.any([AbortSignal.timeout(limits.timeout), ...[limits.signal, options.signal].filter((v): v is AbortSignal => !!v)]);
        const request = (target.protocol === 'https:' ? https : http).request(target, {
          method: options.method || 'GET', signal,
          headers: { 'User-Agent': botUserAgent(), Accept: '*/*', 'Accept-Encoding': 'gzip, deflate, br' },
          agent: false,
          lookup: (_hostname, opts, callback) => {
            if (opts.all) callback(null, [address]); else callback(null, address.address, address.family);
          },
        }, res => {
          const headers = Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join('\n') : v || '']));
          // HEAD has no response body. A large downloadable file is still a valid link.
          if (options.method !== 'HEAD' && Number(headers['content-length']) > limits.maxBytes) { res.destroy(); reject(new Error('RESPONSE_TOO_LARGE')); return; }
          let wire = 0; res.on('data', (chunk: Buffer) => { wire += chunk.length; if (wire > limits.maxBytes) res.destroy(new Error('RESPONSE_TOO_LARGE')); });
          const encoding = headers['content-encoding'];
          const stream = encoding === 'br' ? res.pipe(createBrotliDecompress()) : encoding === 'gzip' ? res.pipe(createGunzip()) : encoding === 'deflate' ? res.pipe(createInflate()) : res;
          const chunks: Buffer[] = []; let size = 0;
          stream.on('data', (chunk: Buffer) => { size += chunk.length; if (size > limits.maxBytes) { stream.destroy(new Error('RESPONSE_TOO_LARGE')); res.destroy(); } else chunks.push(chunk); });
          stream.on('error', reject); res.on('error', reject);
          stream.on('end', () => {
            let tls: HttpResult['tls'];
            if (target.protocol === 'https:') {
              const socket = res.socket as import('node:tls').TLSSocket;
              const cert = socket.getPeerCertificate();
              if (cert?.valid_to) tls = { issuer: String(cert.issuer?.O || cert.issuer?.CN || ''), validTo: cert.valid_to, validFrom: cert.valid_from, subject: String(cert.subject?.CN || ''), san: cert.subjectaltname || '', protocol: socket.getProtocol() || '' };
            }
            resolve({ url: publicUrl(url), status: res.statusCode || 0, headers, body: Buffer.concat(chunks), duration: Date.now() - started, redirects: [...redirects], tls });
          });
        });
        request.on('error', reject); request.end();
      }).finally(release);
      if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) {
        if (hop === 5) throw new Error('REDIRECT_LIMIT');
        const next = normalize(new URL(response.headers.location, url).href);
        if (redirects.includes(next) || next === url) throw new Error('REDIRECT_LOOP');
        redirects.push(url); url = next; continue;
      }
      return response;
    }
    throw new Error('REDIRECT_LIMIT');
  };
}
