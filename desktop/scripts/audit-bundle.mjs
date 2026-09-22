import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const forbidden = /SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|APP_ENCRYPTION_KEY|IP_HASH_SECRET|ANONYMOUS_TOKEN_SECRET/g;
const root = resolve(import.meta.dirname, '..', 'out');
const matches = [];

async function visit(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) await visit(child);
    else if (/\.(?:js|mjs|cjs|html|css|json|map)$/i.test(entry.name)) {
      const body = await readFile(child, 'utf8');
      if (forbidden.test(body)) matches.push(child);
      forbidden.lastIndex = 0;
    }
  }
}

await visit(root);
if (matches.length) {
  process.stderr.write(`Forbidden server-secret identifiers found in desktop output:\n${matches.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('Desktop bundle contains no forbidden server-secret identifiers.\n');
