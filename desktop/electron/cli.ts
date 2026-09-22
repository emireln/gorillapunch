#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { normalizeDesktopUrl } from '../../src/core/url';
import { punch } from '../../src/worker/crawler';

interface Options {
  target: string;
  mode: 'quick' | 'full';
  failUnder: number;
  maxPages: number;
  timeoutSeconds: number;
  json: boolean;
  output?: string;
}

async function main() {
  const options = parse(process.argv.slice(2));
  const target = normalizeDesktopUrl(options.target);
  const result = await punch(target, {
    mode: options.mode,
    maxPages: options.maxPages,
    maxDepth: options.mode === 'quick' ? 0 : 2,
    maxBytes: 8 * 1024 * 1024,
    maxRequests: 180,
    duration: options.timeoutSeconds * 1000,
    normalize: normalizeDesktopUrl,
    allowPrivateNetwork: true,
    progress: async (stage, pages, checks) => {
      if (!options.json) process.stderr.write(`\r${stage} · ${pages} page${pages === 1 ? '' : 's'} · ${checks} checks`);
    },
  });
  if (!options.json) process.stderr.write('\n');
  const serializable = {
    target,
    score: result.score,
    findings: result.findings,
    pages: result.pages,
    metrics: result.metrics,
    resources: result.resources,
    screenshots: result.screenshots.map(({ url, viewport }) => ({ url, viewport })),
  };
  const body = JSON.stringify(serializable, null, 2);
  if (options.output) {
    const destination = resolve(options.output);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, `${body}\n`, { encoding: 'utf8' });
  }
  if (options.json) process.stdout.write(`${body}\n`);
  else {
    const blockers = result.findings.filter(item => item.severity === 'BLOCKER').length;
    const high = result.findings.filter(item => ['CRITICAL', 'HIGH'].includes(item.severity)).length;
    process.stdout.write(`GorillaPunch: ${result.score.overall ?? '—'}/100 · ${result.score.verdict}\n`);
    process.stdout.write(`${result.pages.length} page(s), ${blockers} blocker(s), ${high} high-risk finding(s)\n`);
    if (options.output) process.stdout.write(`Report written to ${resolve(options.output)}\n`);
  }
  if (result.score.overall === null || result.score.overall < options.failUnder) process.exitCode = 1;
}

function parse(input: string[]): Options {
  const args = [...input];
  if (args[0] === 'audit') args.shift();
  if (!args.length || args.includes('--help') || args.includes('-h')) usage();
  const target = args.shift();
  if (!target || target.startsWith('-')) usage('A target URL is required.');
  const options: Options = { target, mode: 'quick', failUnder: 0, maxPages: 8, timeoutSeconds: 120, json: false };
  while (args.length) {
    const flag = args.shift()!;
    if (flag === '--json') { options.json = true; continue; }
    const value = args.shift();
    if (!value) usage(`Missing value for ${flag}.`);
    if (flag === '--mode' && (value === 'quick' || value === 'full')) options.mode = value;
    else if (flag === '--fail-under') options.failUnder = integer(value, 0, 100, flag);
    else if (flag === '--max-pages') options.maxPages = integer(value, 1, 30, flag);
    else if (flag === '--timeout') options.timeoutSeconds = integer(value, 30, 600, flag);
    else if (flag === '--output') options.output = value;
    else usage(`Unknown or invalid option: ${flag}.`);
  }
  return options;
}

function integer(value: string, minimum: number, maximum: number, flag: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) usage(`${flag} must be an integer from ${minimum} to ${maximum}.`);
  return number;
}

function usage(error?: string): never {
  if (error) process.stderr.write(`${error}\n\n`);
  process.stderr.write('Usage: npm run desktop:audit -- audit <url> [--mode quick|full] [--fail-under 0-100] [--json] [--output report.json]\n');
  process.exit(error ? 2 : 0);
}

main().catch(error => {
  process.stderr.write(`GorillaPunch audit failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
  process.exitCode = 2;
});
