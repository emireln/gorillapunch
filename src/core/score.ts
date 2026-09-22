import { categories, type Category, type Finding, type Score, severities } from './types';
export const SCORE_VERSION = '1.0.0';
const weights: Record<Category, number> = { performance: 16, security: 20, seo: 10, accessibility: 14, reliability: 18, ux: 8, production: 14 };
const penalty = { BLOCKER: 60, CRITICAL: 35, HIGH: 16, MEDIUM: 6, LOW: 2, OPPORTUNITY: 0, PASSED: 0 };
export function scoreFindings(findings: Finding[], completed: number, planned: number, essentialCoverage = true): Score {
  const active = findings.filter(f => f.status !== 'ignored' && f.status !== 'resolved');
  const scores: Partial<Record<Category, number>> = {};
  for (const category of categories) {
    const relevant = active.filter(f => f.category === category);
    if (!relevant.length) continue;
    // Repeated instances of a rule incur one penalty. Minor issues are capped per category.
    const unique = new Map<string, Finding>();
    for (const finding of relevant) {
      const previous = unique.get(finding.check_key);
      if (!previous || penalty[finding.severity] > penalty[previous.severity]) unique.set(finding.check_key, finding);
    }
    let major = 0, minor = 0;
    for (const f of unique.values()) { if (penalty[f.severity] >= 16) major += penalty[f.severity]; else minor += penalty[f.severity]; }
    scores[category] = Math.max(0, 100 - major - Math.min(24, minor));
  }
  const blockers = active.filter(f => f.severity === 'BLOCKER').length;
  const critical = active.filter(f => f.severity === 'CRITICAL').length;
  const coverage = planned > 0 ? Math.min(100, Math.round(completed / planned * 1000) / 10) : 0;
  const measured = categories.filter(c => scores[c] !== undefined);
  let overall: number | null = measured.length ? Math.round(measured.reduce((sum, c) => sum + scores[c]! * weights[c], 0) / measured.reduce((sum, c) => sum + weights[c], 0)) : null;
  if (overall !== null) overall = Math.min(overall, blockers ? 49 : critical ? 69 : 100);
  const insufficient = !essentialCoverage || coverage < 90 || overall === null;
  const verdict = blockers ? 'DO NOT LAUNCH' : insufficient ? 'INSUFFICIENT COVERAGE' : critical || overall! < 70 ? 'NOT READY' : overall! < 90 ? 'ALMOST READY' : 'READY TO LAUNCH';
  return { overall, categories: scores, verdict, blockers, critical, warnings: active.filter(f => ['HIGH', 'MEDIUM', 'LOW'].includes(f.severity)).length, passed: active.filter(f => f.severity === 'PASSED').length, coverage, completed, planned, version: SCORE_VERSION, launch: verdict === 'READY TO LAUNCH' };
}
export function deduplicate(findings: Finding[]): Finding[] {
  const grouped = new Map<string, Finding>();
  for (const f of findings) {
    const key = `${f.check_key}:${f.severity}`;
    const previous = grouped.get(key);
    if (previous) previous.instances.push(...f.instances);
    else grouped.set(key, { ...f, instances: [...f.instances] });
  }
  return [...grouped.values()].sort((a, b) => severities.indexOf(a.severity) - severities.indexOf(b.severity));
}
export function compareFindings(before: Finding[], after: Finding[]) {
  const identity = (f: Finding) => `${f.check_key}:${f.affected_url}`;
  const old = new Map(before.filter(f => f.severity !== 'PASSED').map(f => [identity(f), f]));
  const current = new Map(after.filter(f => f.severity !== 'PASSED').map(f => [identity(f), f]));
  return [...current].map(([key, finding]) => ({ finding, change: !old.has(key) ? 'NEW ISSUE' : severities.indexOf(finding.severity) < severities.indexOf(old.get(key)!.severity) ? 'REGRESSION' : 'UNCHANGED' })).concat([...old].filter(([key]) => !current.has(key)).map(([, finding]) => ({ finding, change: 'FIXED' })));
}
