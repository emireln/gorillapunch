import { BrowserWindow, dialog, type BrowserWindowConstructorOptions } from 'electron';
import { writeFile } from 'node:fs/promises';
import type { DesktopReport, ExportFormat } from '../shared/types';

export async function exportReport(parent: BrowserWindow, report: DesktopReport, format: ExportFormat) {
  const hostname = safeFilename(new URL(report.scan.target_url).hostname || 'report');
  const extension = format === 'markdown' ? 'md' : format;
  const selection = await dialog.showSaveDialog(parent, {
    title: `Export ${hostname} punch`,
    defaultPath: `gorillapunch-${hostname}-${report.scan.created_at.slice(0, 10)}.${extension}`,
    filters: [{ name: format.toUpperCase(), extensions: [extension] }],
  });
  if (selection.canceled || !selection.filePath) return null;
  if (format === 'pdf') await writePdf(report, selection.filePath);
  else await writeFile(selection.filePath, serialize(report, format), 'utf8');
  return selection.filePath;
}

function serialize(report: DesktopReport, format: Exclude<ExportFormat, 'pdf'>) {
  if (format === 'json') {
    return JSON.stringify({
      ...report,
      screenshots: report.screenshots.map(shot => ({ id: shot.id, scan_id: shot.scan_id, url: shot.url, viewport: shot.viewport })),
    }, null, 2);
  }
  if (format === 'csv') {
    const rows = [['severity', 'category', 'check', 'title', 'url', 'evidence', 'recommendation'], ...report.findings.map(finding => [finding.severity, finding.category, finding.check_key, finding.title, finding.affected_url, finding.evidence, finding.recommendation])];
    return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  }
  const score = report.scan.score;
  return [
    '# GorillaPunch report', '',
    `- Target: ${report.scan.target_url}`,
    `- Created: ${report.scan.created_at}`,
    `- Score: ${score?.overall ?? 'Unavailable'}`,
    `- Launch gate: ${score?.verdict ?? 'Unavailable'}`,
    `- Coverage: ${score?.coverage ?? 0}%`, '',
    '## Findings', '',
    ...report.findings.map(finding => `### [${finding.severity}] ${finding.title}\n\n${finding.evidence}\n\n**Recommendation:** ${finding.recommendation}\n`),
  ].join('\n');
}

async function writePdf(report: DesktopReport, destination: string) {
  const options: BrowserWindowConstructorOptions = { show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } };
  const window = new BrowserWindow(options);
  try {
    await window.loadURL(`data:text/html;base64,${Buffer.from(pdfHtml(report)).toString('base64')}`);
    const bytes = await window.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } });
    await writeFile(destination, bytes);
  } finally { window.destroy(); }
}

function pdfHtml(report: DesktopReport) {
  const score = report.scan.score;
  const findings = report.findings.map(finding => `<article><div class="tag ${escapeHtml(finding.severity)}">${escapeHtml(finding.severity)}</div><h3>${escapeHtml(finding.title)}</h3><p>${escapeHtml(finding.evidence)}</p><strong>Recommendation</strong><p>${escapeHtml(finding.recommendation)}</p></article>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;color:#241f2c;font:13px/1.5 "Segoe UI",sans-serif}header{padding:18px 0;border-bottom:3px solid #7553ff}h1{margin:0;font-size:26px}h2{margin:24px 0 8px}.meta{display:grid;grid-template-columns:1fr auto;gap:8px;margin:18px 0;padding:18px;background:#f4f1ff;border-radius:10px}.score{font-size:42px;font-weight:700;color:#653de9}.verdict{font-weight:700}.url{word-break:break-all;color:#6a6772}article{break-inside:avoid;padding:14px 0;border-top:1px solid #ddd}article h3{margin:6px 0;font-size:16px}article p{white-space:pre-wrap}.tag{display:inline-block;padding:2px 7px;border-radius:4px;background:#eee;font-size:10px;font-weight:700}.BLOCKER,.CRITICAL{color:#b00020;background:#ffe8ec}.HIGH,.MEDIUM{color:#7a4f00;background:#fff2c7}footer{margin-top:24px;color:#777;font-size:11px}
  </style></head><body><header><h1>GORILLAPUNCH</h1><div>Launch-readiness report</div></header><div class="meta"><div><div class="url">${escapeHtml(report.scan.target_url)}</div><div>${escapeHtml(new Date(report.scan.created_at).toLocaleString())}</div><div class="verdict">${escapeHtml(score?.verdict || 'INSUFFICIENT COVERAGE')}</div></div><div class="score">${score?.overall ?? '—'}</div></div><h2>Findings (${report.findings.length})</h2>${findings}<footer>Generated locally by GorillaPunch Desktop. Automated checks are evidence, not a certification.</footer></body></html>`;
}

function csvCell(value: string) {
  const protectedValue = /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function safeFilename(value: string) { return value.replace(/[^a-z0-9.-]+/gi, '-').slice(0, 80); }
