import { load } from 'cheerio';
import { randomUUID } from 'node:crypto';
import type { Finding, Metric, PageRecord, ScanMode, Score } from '../core/types';
import { scoreFindings, deduplicate } from '../core/score';
import { normalizeUrl } from '../core/url';
import { publicUrl, redactText } from '../core/redact';
import { checks } from './checks';
import { finding } from './checks/types';
import { createSafeTransport, type Transport } from './network';
import { inspectBrowser, type BrowserResult } from './browser';
export interface PunchResult { findings: Finding[]; pages: PageRecord[]; metrics: Metric[]; score: Score; screenshots: { url: string; viewport: string; bytes: Buffer }[]; resources: BrowserResult['resources'] }
export interface ScanOptions {
  mode: ScanMode; maxPages: number; maxDepth: number; maxBytes: number; maxRequests: number; duration: number;
  progress: (stage: string, pages: number, checks: number) => Promise<void>;
  transport?: Transport; signal?: AbortSignal; normalize?: (input: string) => string; allowPrivateNetwork?: boolean;
}
export async function punch(input: string, options: ScanOptions): Promise<PunchResult> {
  const normalize = options.normalize || normalizeUrl;
  const url = normalize(input), origin = new URL(url).origin;
  const signal = AbortSignal.any([AbortSignal.timeout(options.duration), ...[options.signal].filter((v): v is AbortSignal => !!v)]);
  const fetch = options.transport || createSafeTransport({ maxBytes: options.maxBytes, maxRequests: options.maxRequests, timeout: 12000, signal, normalize, allowPrivateNetwork: options.allowPrivateNetwork });
  const findings: Finding[] = [], pages: PageRecord[] = [], metrics: Metric[] = [], screenshots: PunchResult['screenshots'] = [], resources: PunchResult['resources'] = [];
  let completed = 0, planned = 2, essentialCoverage = true;
  await options.progress('Resolving domain', 0, 0);
  let robots = '';
  try { const response = await fetch(`${origin}/robots.txt`); if (response.status === 200 && !response.headers['content-type']?.includes('html')) robots = response.body.toString('utf8'); findings.push(finding({ key: 'seo.robots', category: 'seo' }, { url }, { title: robots ? 'Crawler directives available' : 'robots.txt is unavailable', severity: robots ? 'PASSED' : 'LOW', evidence: `robots.txt returned HTTP ${response.status}.`, recommendation: 'Publish intentional crawler rules in robots.txt. A missing file permits crawling by default.' })); completed++; } catch { essentialCoverage = false; }
  const disallowed = robotsRules(robots);
  try { const sitemap = await fetch(`${origin}/sitemap.xml`); const valid = sitemap.status === 200 && /<(?:urlset|sitemapindex)\b/.test(sitemap.body.toString('utf8')); findings.push(finding({ key: 'seo.sitemap', category: 'seo' }, { url }, { title: valid ? 'Sitemap available' : 'Sitemap is unavailable or invalid', severity: valid ? 'PASSED' : 'LOW', evidence: `sitemap.xml returned HTTP ${sitemap.status}.`, recommendation: 'Publish a sitemap containing canonical, indexable URLs and declare it in robots.txt.' })); completed++; } catch {}
  const queue = [{ url, depth: 0 }], seen = new Set<string>();
  const maxPages = options.mode === 'quick' ? 1 : options.maxPages;
  while (queue.length && pages.length < maxPages && !signal.aborted) {
    const current = queue.shift()!;
    if (seen.has(current.url)) continue; seen.add(current.url);
    if (!allowedByRobots(new URL(current.url).pathname, disallowed)) { essentialCoverage = false; findings.push(finding({ key: 'reliability.robots-blocked', category: 'reliability' }, { url: current.url }, { title: 'Crawler access restricted by robots.txt', severity: 'OPPORTUNITY', evidence: 'GorillaPunch respected the applicable Disallow directive.', recommendation: 'Permit GorillaPunchBot if you intend this page to be inspected.' })); continue; }
    planned += checks.length + 6;
    await options.progress('Opening application', pages.length, completed);
    try {
      const response = await fetch(current.url, { signal });
      if (new URL(response.url).origin !== origin) { essentialCoverage = false; findings.push(finding({ key: 'reliability.origin-redirect', category: 'reliability' }, { url: current.url }, { title: 'Page redirects outside the crawl boundary', severity: 'MEDIUM', evidence: `Final origin: ${new URL(response.url).origin}`, recommendation: 'Punch the final canonical URL directly. GorillaPunch will not crawl unrelated origins.' })); continue; }
      if (!response.headers['content-type']?.includes('html')) { essentialCoverage = false; continue; }
      const $ = load(response.body.toString('utf8'));
      pages.push({ id: randomUUID(), url: publicUrl(response.url), title: redactText($('title').text()), status_code: response.status, canonical: $('link[rel="canonical"]').attr('href') ? publicUrl(new URL($('link[rel="canonical"]').attr('href')!, response.url).href) : null, indexable: !/noindex/.test($('meta[name="robots"]').attr('content') || response.headers['x-robots-tag'] || ''), load_time: response.duration });
      await options.progress('Reading response headers', pages.length, completed);
      for (const check of checks) {
        if (signal.aborted) break;
        try { findings.push(...await check.run({ $, response, fetch, url: response.url })); completed++; } catch { /* Individual failures count as missing coverage. */ }
      }
      await options.progress('Inspecting browser runtime', pages.length, completed);
      try { const inspected = await inspectBrowser(response.url, fetch, signal); findings.push(...inspected.findings); metrics.push(...inspected.metrics); completed += inspected.completed; screenshots.push(...inspected.screenshots.map(s => ({ ...s, url: publicUrl(response.url) }))); resources.push(...inspected.resources); if (inspected.completed < inspected.planned) essentialCoverage = false; } catch { essentialCoverage = false; }
      await options.progress('Walking internal links', pages.length, completed);
      const links: string[] = [];
      $('a[href]').each((_, element) => { try { if ($(element).is('[download]')) return; const link = normalize(new URL($(element).attr('href')!, response.url).href); if (new URL(link).origin === origin && !links.includes(link) && !/\.(pdf|zip|png|jpg|webp|mp4|mp3|exe|dmg|msi|deb|rpm)$/i.test(new URL(link).pathname)) links.push(link); } catch {} });
      const crawlableLinks: string[] = [];
      for (const link of links.slice(0, options.mode === 'quick' ? 5 : 12)) {
        if (signal.aborted || !allowedByRobots(new URL(link).pathname, disallowed)) continue;
        planned++;
        try {
          const linkResponse = await fetch(link, { method: 'HEAD', signal });
          const headUnsupported = linkResponse.status === 405 || linkResponse.status === 501;
          findings.push(finding({ key: 'reliability.internal-links', category: 'reliability' }, { url: current.url }, { title: headUnsupported ? 'Internal link could not be verified with a quick check' : linkResponse.status >= 400 ? 'Internal link returned an error' : 'Internal link responds: passed', severity: headUnsupported ? 'OPPORTUNITY' : linkResponse.status >= 500 ? 'HIGH' : linkResponse.status >= 400 ? 'MEDIUM' : 'PASSED', evidence: `${publicUrl(link)} → HTTP ${linkResponse.status}`, recommendation: headUnsupported ? 'Open this link in a browser to confirm it works. The server rejected the quick link check.' : 'Repair or remove broken internal links.', confidence: headUnsupported ? 'low' : 'high' }));
          completed++;
          const type = linkResponse.headers['content-type']?.toLowerCase() || '';
          const attachment = /\battachment\b/i.test(linkResponse.headers['content-disposition'] || '');
          if (options.mode === 'full' && linkResponse.status < 400 && !attachment && (!type || type.includes('text/html') || type.includes('application/xhtml+xml'))) crawlableLinks.push(link);
        } catch (error) {
          findings.push(finding({ key: 'reliability.internal-link-unverified', category: 'reliability' }, { url: current.url }, { title: 'Internal link check could not complete', severity: 'OPPORTUNITY', evidence: `${publicUrl(link)} → ${redactText(error instanceof Error ? error.message : 'Check failed')}`, recommendation: 'Open the link in a browser to confirm it works.', confidence: 'low' }));
        }
      }
      if (options.mode === 'full' && current.depth < options.maxDepth) for (const link of crawlableLinks) if (!seen.has(link)) queue.push({ url: link, depth: current.depth + 1 });
    } catch (error) {
      essentialCoverage = false;
      const code = error instanceof Error ? error.message : 'Target unavailable';
      findings.push(finding({ key: 'reliability.connection', category: 'reliability' }, { url: current.url }, { title: /CERT|SSL|TLS/.test(code) ? 'TLS connection could not be validated' : 'The page could not be inspected', severity: /CERT|SSL|TLS/.test(code) ? 'BLOCKER' : 'HIGH', evidence: redactText(code), recommendation: 'Check domain resolution, TLS and server availability. Also check whether the site blocks crawlers.' }));
    }
  }
  await options.progress('Calculating the damage', pages.length, completed);
  const unique = deduplicate(findings);
  return { findings: unique, pages, metrics, screenshots, resources, score: scoreFindings(unique, completed, planned, essentialCoverage && pages.length > 0 && !signal.aborted) };
}
interface RobotRule { allow: boolean; path: string }
export function robotsRules(text: string): RobotRule[] {
  const groups: { agents: string[]; rules: RobotRule[] }[] = []; let group = { agents: [] as string[], rules: [] as RobotRule[] };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim(), split = line.indexOf(':'); if (split < 0) continue;
    const key = line.slice(0, split).trim().toLowerCase(), value = line.slice(split + 1).trim();
    if (key === 'user-agent') { if (group.rules.length) { groups.push(group); group = { agents: [], rules: [] }; } group.agents.push(value.toLowerCase()); }
    if (['allow', 'disallow'].includes(key) && value && group.agents.length) group.rules.push({ allow: key === 'allow', path: value });
  }
  groups.push(group);
  const specific = groups.filter(g => g.agents.some(a => a.includes('gorillapunch')));
  return (specific.length ? specific : groups.filter(g => g.agents.includes('*'))).flatMap(g => g.rules);
}
export function allowedByRobots(path: string, rules: RobotRule[]) {
  const matching = rules.filter(r => { const pattern = r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'); return new RegExp(`^${pattern}`).test(path); }).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return matching[0]?.allow ?? true;
}
