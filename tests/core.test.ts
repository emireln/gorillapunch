import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { load } from 'cheerio';
import { normalizeDesktopUrl, normalizeUrl, isDesktopReachableIP, isPublicIP } from '@/core/url';
import { scoreFindings, deduplicate, compareFindings } from '@/core/score';
import { encrypt, decrypt, sign } from '@/server/crypto';
import { redactText, scrub } from '@/server/redact';
import { owns } from '@/server/scans';
import { checks } from '@/worker/checks';
import { finding, type CheckContext } from '@/worker/checks/types';
import { allowedByRobots, robotsRules } from '@/worker/crawler';
import { internalPath } from '@/server/request';
const base = finding({ key: 'test', category: 'security' }, { url: 'https://example.com/' }, { title: 'Evidence', evidence: 'Header absent', severity: 'MEDIUM', recommendation: 'Set the header' });
describe('hostile URL handling', () => {
  it('normalizes a public URL without its fragment', () => expect(normalizeUrl(' Example.COM/a#section ')).toBe('https://example.com/a'));
  it.each(['http://localhost', 'http://127.0.0.1', 'http://127.1', 'http://2130706433', 'http://0x7f000001', 'http://10.0.0.1', 'http://172.16.1.2', 'http://192.168.1.2', 'http://169.254.169.254', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://[fc00::1]', 'http://[fe80::1]', 'http://app.local', 'http://internal', 'http://example.com:22', 'file:///etc/passwd', 'ftp://example.com', 'gopher://example.com', 'javascript:alert(1)', 'data:text/html,test', 'https://a:b@example.com', 'https://example.com/?token=abc', 'https://example.com\\@127.0.0.1', 'http://metadata.google.internal'])('blocks %s', url => expect(() => normalizeUrl(url)).toThrow());
  it.each(['0.0.0.0', '100.64.0.1', '192.0.2.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255', '2001:db8::1', '::ffff:10.0.0.1'])('rejects reserved IP %s', ip => expect(isPublicIP(ip)).toBe(false));
  it('permits globally routable addresses', () => { expect(isPublicIP('1.1.1.1')).toBe(true); expect(isPublicIP('2606:4700:4700::1111')).toBe(true); });
  it('permits local desktop targets without weakening the hosted normalizer', () => {
    expect(normalizeDesktopUrl('localhost:3000/dashboard#panel')).toBe('http://localhost:3000/dashboard');
    expect(normalizeDesktopUrl('192.168.1.20:8080')).toBe('https://192.168.1.20:8080/');
    expect(() => normalizeDesktopUrl('localhost:3000/?token=secret')).toThrow();
    expect(() => normalizeUrl('localhost:3000')).toThrow();
  });
  it('keeps metadata and special-use networks blocked in desktop mode', () => {
    expect(isDesktopReachableIP('127.0.0.1')).toBe(true);
    expect(isDesktopReachableIP('192.168.1.20')).toBe(true);
    expect(isDesktopReachableIP('169.254.169.254')).toBe(false);
    expect(isDesktopReachableIP('224.0.0.1')).toBe(false);
    expect(isDesktopReachableIP('2001:db8::1')).toBe(false);
  });
  it('prevents open redirects', () => { for (const value of ['//evil.com', '/\\evil.com', 'https://evil.com', '/\r\nevil']) expect(internalPath(value)).toBe('/app'); expect(internalPath('/app/projects')).toBe('/app/projects'); });
});
describe('explainable scores', () => {
  it('never allows a blocker to launch', () => { const score = scoreFindings([{ ...base, severity: 'BLOCKER' }], 100, 100); expect(score.launch).toBe(false); expect(score.overall).toBeLessThan(50); expect(score.verdict).toBe('DO NOT LAUNCH'); });
  it('does not let minor duplicates destroy a score', () => { const score = scoreFindings(Array.from({ length: 100 }, () => ({ ...base, severity: 'LOW' as const })), 100, 100); expect(score.overall).toBe(98); });
  it('caps total minor deductions per category', () => expect(scoreFindings(Array.from({ length: 100 }, (_, i) => ({ ...base, check_key: `minor-${i}`, severity: 'LOW' as const })), 100, 100).overall).toBe(76));
  it('never interprets failed coverage as a full pass', () => { expect(scoreFindings([{ ...base, severity: 'PASSED' }], 5, 10).launch).toBe(false); expect(scoreFindings([], 0, 10).overall).toBeNull(); expect(scoreFindings([{ ...base, severity: 'PASSED' }], 100, 100, false).verdict).toBe('INSUFFICIENT COVERAGE'); });
  it('does not declare launch ready while a high severity finding remains', () => {
    const findings = [
      { ...base, category: 'accessibility' as const, severity: 'HIGH' as const },
      { ...base, check_key: 'performance.passed', category: 'performance' as const, severity: 'PASSED' as const },
    ];
    const score = scoreFindings(findings, 100, 100);
    expect(score.overall).toBeGreaterThanOrEqual(90);
    expect(score.verdict).toBe('ALMOST READY');
    expect(score.launch).toBe(false);
  });
  it('aggregates repeated instances', () => expect(deduplicate([base, { ...base, id: 'second' }])[0].instances).toHaveLength(2));
  it('detects fixed, new and regressed issues', () => { const changes = compareFindings([base, { ...base, check_key: 'fixed' }], [{ ...base, severity: 'HIGH' }, { ...base, check_key: 'new' }]); expect(changes.map(c => c.change)).toEqual(['REGRESSION', 'NEW ISSUE', 'FIXED']); });
});
describe('key security and ownership', () => {
  const key = randomBytes(32).toString('base64');
  it('authenticates ciphertext and credential scope', () => { const value = encrypt('sensitive-provider-key', 'user:provider', key); expect(decrypt(value, 'user:provider', key)).toBe('sensitive-provider-key'); expect(() => decrypt(value, 'other:provider', key)).toThrow(); expect(() => decrypt({ ...value, tag: randomBytes(16).toString('base64') }, 'user:provider', key)).toThrow(); expect(JSON.stringify(value)).not.toContain('sensitive-provider-key'); });
  it('uses different ciphertext on each write', () => expect(encrypt('same', 'scope', key).ciphertext).not.toBe(encrypt('same', 'scope', key).ciphertext));
  it('signatures depend on the secret', () => expect(sign('id', 'one')).not.toBe(sign('id', 'two')));
  it('does not allow another user or anonymous browser', () => { const row = { owner_id: 'alice', anonymous_session_id: null }; expect(owns(row, { userId: 'alice' })).toBe(true); expect(owns(row, { userId: 'bob' })).toBe(false); expect(owns(row, { anonymousId: 'alice' })).toBe(false); expect(owns({ owner_id: null, anonymous_session_id: 'guest-a' }, { anonymousId: 'guest-b' })).toBe(false); });
  it('scrubs tokens, personal query strings and sensitive fields', () => { const output = redactText('key sk_live_123456789012345 password=abc https://example.com/?secret=veryprivate&name=Emir hello@example.com'); expect(output).not.toContain('123456789012345'); expect(output).not.toContain('veryprivate'); expect(output).not.toContain('Emir'); expect(output).not.toContain('hello@example'); expect(scrub({ headers: { Authorization: 'Bearer secret', Cookie: 'value' }, nested: { api_key: 'secret' } })).toEqual({ headers: { Authorization: '[REDACTED]', Cookie: '[REDACTED]' }, nested: { api_key: '[REDACTED]' } }); });
});
describe('check catalog and crawling rules', () => {
  it('assigns a stable unique identifier to every check', () => expect(new Set(checks.map(c => c.key)).size).toBe(checks.length));
  it('every check produces evidence and remediation on empty and valid HTML', async () => {
    for (const html of ['', '<html lang="en"><head><title>A useful title for a launch</title></head><body><main><h1>Hello</h1></main></body></html>']) {
      const context: CheckContext = { $: load(html), url: 'https://example.com/', response: { url: 'https://example.com/', status: 200, headers: {}, body: Buffer.from(html), duration: 50, redirects: [] }, fetch: async () => { throw new Error('Checks should not make unrelated requests'); } };
      for (const check of checks) for (const result of await check.run(context)) { expect(result.check_key).toBe(check.key); expect(result.evidence.length).toBeGreaterThan(0); expect(result.remediation.length).toBeGreaterThan(0); expect(result.created_at).toBeTruthy(); }
    }
  });
  it('ranks noindex as a blocker and missing Twitter Card as an opportunity', async () => {
    const context = { $: load('<meta name="robots" content="noindex">'), url: 'https://example.com/', response: { headers: {} } } as CheckContext;
    expect((await checks.find(c => c.key === 'seo.indexability')!.run(context))[0].severity).toBe('BLOCKER'); expect((await checks.find(c => c.key === 'seo.twitter')!.run(context))[0].severity).toBe('OPPORTUNITY');
  });
  it('uses most-specific robots rules including allow exceptions', () => { const rules = robotsRules('User-agent: *\nDisallow: /\nUser-agent: GorillaPunchBot\nDisallow: /private\nAllow: /private/public'); expect(allowedByRobots('/', rules)).toBe(true); expect(allowedByRobots('/private/secret', rules)).toBe(false); expect(allowedByRobots('/private/public/page', rules)).toBe(true); });
});
