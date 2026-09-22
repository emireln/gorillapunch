export const severities = ['BLOCKER', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'OPPORTUNITY', 'PASSED'] as const;
export type Severity = typeof severities[number];
export const categories = ['performance', 'security', 'seo', 'accessibility', 'reliability', 'ux', 'production'] as const;
export type Category = typeof categories[number];
export type Confidence = 'certain' | 'high' | 'medium' | 'low';
export type ScanMode = 'quick' | 'full' | 'deep';
export type ScanStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export const categoryLabels: Record<Category, string> = { performance: 'Performance', security: 'Security', seo: 'SEO', accessibility: 'Accessibility', reliability: 'Reliability', ux: 'User experience', production: 'Production readiness' };
export interface Finding {
  id: string; scan_id?: string; check_key: string; category: Category; severity: Severity;
  title: string; summary: string; evidence: string; affected_url: string; element?: string;
  why_it_matters: string; reproduction: string; recommendation: string; remediation: string;
  confidence: Confidence; status: 'open' | 'resolved' | 'ignored'; created_at: string;
  instances: { url: string; element?: string; evidence: string }[];
}
export interface Score {
  overall: number | null; categories: Partial<Record<Category, number>>;
  verdict: 'READY TO LAUNCH' | 'ALMOST READY' | 'NOT READY' | 'DO NOT LAUNCH' | 'INSUFFICIENT COVERAGE';
  blockers: number; critical: number; warnings: number; passed: number;
  coverage: number; completed: number; planned: number; version: string; launch: boolean;
}
export interface Scan {
  id: string; owner_id: string | null; anonymous_session_id: string | null; project_id: string | null;
  target_url: string; mode: ScanMode; status: ScanStatus; stage: string;
  score: Score | null; pages_scanned: number; checks_completed: number;
  created_at: string; started_at: string | null; finished_at: string | null;
  error_code: string | null; attempts: number; heartbeat_at: string | null;
}
export interface Project {
  id: string; owner_id: string; name: string; root_url: string; hostname: string;
  verification_status: 'unverified' | 'verified'; created_at: string; updated_at: string;
}
export interface PageRecord {
  id: string; scan_id?: string; url: string; title: string; status_code: number;
  canonical: string | null; indexable: boolean; load_time: number;
}
export interface Metric { key: string; value: number; unit: string; url: string }
export interface Report { scan: Scan; findings: Finding[]; pages: PageRecord[]; metrics: Metric[]; total: number; gateFindings: Finding[] }
export type Principal = { userId: string; anonymousId?: never } | { anonymousId: string; userId?: never };
