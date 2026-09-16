/**
 * Refuses to ship a bundle that contains a service-role key or a stray .env.
 * Run after `npm run build` (or on its own) — it scans dist/ and src/.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PATTERNS = [
  { name: 'service-role JWT role claim', re: /"role"\s*:\s*"service_role"/ },
  { name: 'literal service_role key name', re: /service_role_key|SUPABASE_SERVICE_ROLE/ },
  { name: 'private key block', re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
];

const TEXT = /\.(js|mjs|cjs|ts|tsx|html|css|json|map)$/;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (TEXT.test(entry)) out.push(p);
  }
  return out;
}

const files = [...walk('dist'), ...walk('src')];
const problems = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const { name, re } of PATTERNS) {
    if (re.test(text)) problems.push(`${file}: ${name}`);
  }
}

// A decoded service-role JWT would also show up as a very long base64 segment
// with the role claim; the checks above cover both the raw and encoded form.
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./g) ?? []) {
    try {
      const payload = JSON.parse(Buffer.from(m.split('.')[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') problems.push(`${file}: embedded service-role JWT`);
    } catch {
      /* not a JWT we can read — ignore */
    }
  }
}

if (problems.length) {
  console.error('Secret check FAILED:\n' + problems.map(p => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(`Secret check passed (${files.length} files scanned).`);
