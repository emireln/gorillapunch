import type { CheerioAPI } from 'cheerio';
import { randomUUID } from 'node:crypto';
import type { Category, Confidence, Finding, Severity } from '../../core/types';
import { publicUrl, redactText } from '../../core/redact';
import type { HttpResult, Transport } from '../network';
export interface CheckContext { $: CheerioAPI; response: HttpResult; fetch: Transport; url: string }
export interface PunchCheck { key: string; category: Category; description: string; run(context: CheckContext): Promise<Finding[]> }
export function finding(check: { key: string; category: Category }, context: Pick<CheckContext, 'url'>, options: {
  title: string; severity: Severity; evidence: string; recommendation: string; why?: string; remediation?: string; confidence?: Confidence; element?: string;
}): Finding {
  const url = publicUrl(context.url), evidence = redactText(options.evidence);
  return { id: randomUUID(), check_key: check.key, category: check.category, title: options.title, summary: options.title, severity: options.severity, evidence, affected_url: url,
    why_it_matters: options.why || options.recommendation, recommendation: options.recommendation, remediation: options.remediation || options.recommendation,
    reproduction: `Open ${url} and inspect ${options.element || check.key}. Compare the result with the captured evidence.`, confidence: options.confidence || 'certain',
    element: options.element, status: 'open', created_at: new Date().toISOString(), instances: [{ url, evidence, element: options.element }] };
}
export function rule(key: string, category: Category, description: string, inspect: (c: CheckContext) => { pass: boolean; evidence: string; severity?: Severity; recommendation: string; confidence?: Confidence }): PunchCheck {
  return { key, category, description, async run(c) { const r = inspect(c); return [finding({ key, category }, c, { title: r.pass ? `${description}: passed` : description, severity: r.pass ? 'PASSED' : r.severity || 'MEDIUM', evidence: r.evidence, recommendation: r.recommendation, confidence: r.confidence })]; } };
}
