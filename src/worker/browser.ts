import { chromium, type Browser, type Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import type { Finding, Metric } from '../core/types';
import { finding } from './checks/types';
import { publicUrl, redactText } from '../core/redact';
import type { Transport } from './network';
import { botUserAgent } from './identity';
interface Resource { url: string; status: number; bytes: number; duration: number; type: string }
export interface BrowserResult { findings: Finding[]; metrics: Metric[]; resources: Resource[]; screenshots: { viewport: string; bytes: Buffer }[]; completed: number; planned: number }
export async function inspectBrowser(url: string, fetch: Transport, signal: AbortSignal): Promise<BrowserResult> {
  let browser: Browser | undefined;
  const result: BrowserResult = { findings: [], metrics: [], resources: [], screenshots: [], completed: 0, planned: 6 };
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: process.platform === 'linux', env: { PATH: process.env.PATH || '', ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot || '', TEMP: process.env.TEMP || '' } : {}) }, args: ['--disable-background-networking', '--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--host-resolver-rules=MAP * ~NOTFOUND'] });
    const active = browser;
    const abort = () => { void active.close(); }; signal.addEventListener('abort', abort, { once: true });
    try {
      const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, viewport: { width: 1440, height: 1000 }, userAgent: botUserAgent() });
      await context.routeWebSocket('**/*', route => route.close());
      await context.route('**/*', async route => {
        const request = route.request();
        if (!['GET', 'HEAD'].includes(request.method()) || !/^https?:/.test(request.url()) || signal.aborted) { await route.abort().catch(() => {}); return; }
        try {
          const response = await fetch(request.url(), { method: request.method() as 'GET' | 'HEAD', signal });
          result.resources.push({ url: publicUrl(request.url()), status: response.status, bytes: response.body.length, duration: response.duration, type: request.resourceType() });
          // Browser never gets response cookies or transport/proxy headers. All network bytes pass through the DNS-pinned broker.
          const headers = Object.fromEntries(Object.entries(response.headers).filter(([key]) => !['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding', 'connection', 'location'].includes(key)));
          await route.fulfill({ status: response.status, headers, body: response.body });
        } catch { await route.abort('blockedbyclient').catch(() => {}); }
      });
      const page = await context.newPage(); page.setDefaultTimeout(5000);
      const errors: string[] = [], consoleErrors: string[] = [];
      page.on('pageerror', error => { if (errors.length < 30) errors.push(redactText(error.message)); });
      page.on('console', message => { if (message.type() === 'error' && consoleErrors.length < 30) consoleErrors.push(redactText(message.text())); });
      page.on('dialog', dialog => { void dialog.dismiss(); });
      await installObservers(page);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1200);
      const runtime = { key: 'runtime.exceptions', category: 'reliability' as const };
      result.findings.push(finding(runtime, { url }, { title: errors.length ? 'Uncaught browser exceptions' : 'Browser runtime: passed', severity: errors.length ? 'HIGH' : 'PASSED', evidence: errors.join('\n') || 'No uncaught JavaScript exceptions observed during navigation.', recommendation: 'Reproduce the error in the browser console and trace it to the application source. A navigation inspection does not verify authenticated journeys.' })); result.completed++;
      result.findings.push(finding({ key: 'runtime.console', category: 'reliability' }, { url }, { title: consoleErrors.length ? 'Browser console errors' : 'Browser console: passed', severity: consoleErrors.length ? 'MEDIUM' : 'PASSED', evidence: consoleErrors.join('\n') || 'No console errors observed.', recommendation: 'Inspect these messages. Check whether third-party resources or application code caused them.', confidence: 'high' })); result.completed++;
      const bad = result.resources.filter(r => r.status >= 400);
      result.findings.push(finding({ key: 'runtime.resources', category: 'reliability' }, { url }, { title: bad.length ? 'Resources returned HTTP errors' : 'Loaded resource responses: passed', severity: bad.some(r => r.type === 'script') ? 'HIGH' : bad.length ? 'MEDIUM' : 'PASSED', evidence: bad.map(r => `${r.status} ${r.url}`).join('\n') || `${result.resources.length} responses inspected. Requests blocked by the safety broker may reduce coverage.`, recommendation: 'Fix failed scripts, styles and images; remove obsolete resource references.' })); result.completed++;
      try {
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        if (!axe.violations.length) result.findings.push(finding({ key: 'accessibility.axe', category: 'accessibility' }, { url }, { title: 'Automated accessibility inspection: passed', severity: 'PASSED', evidence: `${axe.passes.length} Axe rules passed; ${axe.incomplete.length} rules need manual review. This is not a WCAG compliance certification.`, recommendation: 'Also test keyboard navigation and assistive technology with real users.' }));
        for (const violation of axe.violations) {
          const f = finding({ key: `accessibility.axe.${violation.id}`, category: 'accessibility' }, { url }, { title: violation.help, severity: violation.impact === 'critical' || violation.impact === 'serious' ? 'HIGH' : 'MEDIUM', evidence: violation.nodes.slice(0, 15).map(n => `${n.target.join(', ')}: ${n.failureSummary || violation.description}`).join('\n'), recommendation: `${violation.description} Reference: ${violation.helpUrl}` });
          f.instances = violation.nodes.slice(0, 100).map(n => ({ url: publicUrl(url), element: n.target.join(', '), evidence: redactText(n.failureSummary || violation.description) })); result.findings.push(f);
        }
        result.completed++;
      } catch { /* Preserve other coverage when Axe cannot execute. */ }
      const metrics = await page.evaluate(() => {
        const measured = (window as unknown as { __gp: { lcp: number; cls: number; tbt: number } }).__gp;
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        const fcp = performance.getEntriesByName('first-contentful-paint')[0];
        return { ...measured, ttfb: nav ? nav.responseStart - nav.requestStart : 0, fcp: fcp?.startTime || 0, domContentLoaded: nav?.domContentLoadedEventEnd || 0, load: nav?.loadEventEnd || 0 };
      });
      for (const [key, value] of Object.entries(metrics)) if (Number.isFinite(value)) result.metrics.push({ key, value: Math.round(value * 1000) / 1000, unit: key === 'cls' ? 'ratio' : 'ms', url: publicUrl(url) });
      result.findings.push(finding({ key: 'performance.lab-vitals', category: 'performance' }, { url }, { title: metrics.lcp > 2500 || metrics.cls > .1 || metrics.tbt > 200 ? 'Lab performance needs attention' : 'Observed lab performance: passed', severity: metrics.lcp > 4000 || metrics.cls > .25 ? 'HIGH' : metrics.lcp > 2500 || metrics.cls > .1 || metrics.tbt > 200 ? 'MEDIUM' : 'PASSED', evidence: `LCP ${Math.round(metrics.lcp)} ms; CLS ${metrics.cls.toFixed(3)}; observed long-task blocking ${Math.round(metrics.tbt)} ms. INP is unavailable without representative interactions. Network broker and this short observation window affect timings.`, recommendation: 'Use these lab signals to investigate regressions. Confirm with repeatable Lighthouse runs and field Web Vitals.', confidence: 'medium' })); result.completed++;
      for (const width of [1440, 390, 360]) {
        await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(150);
        const overflow = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth, small: [...document.querySelectorAll('button,a,input,select')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24); }).length }));
        result.findings.push(finding({ key: `ux.viewport-${width}`, category: 'ux' }, { url }, { title: overflow.scroll > width + 2 ? `Horizontal overflow at ${width}px` : `Layout bounds at ${width}px: passed`, severity: overflow.scroll > width + 2 ? 'HIGH' : 'PASSED', evidence: `Viewport ${width}px; content ${overflow.scroll}px; ${overflow.small} controls smaller than 24px (manual review may be needed).`, recommendation: 'Inspect fixed widths, long unbroken text and off-screen navigation. Verify controls remain reachable.', confidence: 'high' }));
        if (width !== 360) result.screenshots.push({ viewport: `${width}x900`, bytes: await page.screenshot({ type: 'jpeg', quality: 65, fullPage: false, timeout: 5000 }) });
      }
      result.completed++;
    } finally { signal.removeEventListener('abort', abort); }
  } finally { await browser?.close().catch(() => {}); }
  return result;
}
async function installObservers(page: Page) {
  await page.addInitScript(() => {
    const stats = { lcp: 0, cls: 0, tbt: 0 }; (window as unknown as { __gp: typeof stats }).__gp = stats;
    for (const type of ['largest-contentful-paint', 'layout-shift', 'longtask']) {
      try { new PerformanceObserver(list => { for (const entry of list.getEntries()) {
        if (type === 'largest-contentful-paint') stats.lcp = entry.startTime;
        if (type === 'layout-shift') { const shift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number }; if (!shift.hadRecentInput) stats.cls += shift.value; }
        if (type === 'longtask') stats.tbt += Math.max(0, entry.duration - 50);
      } }).observe({ type, buffered: true }); } catch {}
    }
  });
}
