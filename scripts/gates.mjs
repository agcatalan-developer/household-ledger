// Structural gates from the build plan. Run inside `npm run check`.
// Each gate is a grep-style assertion over the source tree; a hit is a build failure.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function walk(dir, exts = ['.ts', '.tsx']) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

let failures = 0;
function stripComments(line) {
  const t = line.trim();
  if (t.startsWith('*') || t.startsWith('/*') || t.startsWith('//')) return '';
  return line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
}
function gate(name, files, re, { allow = [] } = {}) {
  const hits = [];
  for (const f of files) {
    const rel = relative(root, f).replace(/\\/g, '/');
    if (rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) continue;
    if (allow.some((a) => rel.endsWith(a))) continue;
    const text = readFileSync(f, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      const code = stripComments(line);
      if (re.test(code)) hits.push(`  ${rel}:${i + 1}  ${line.trim()}`);
    });
  }
  if (hits.length) {
    failures++;
    console.error(`✗ GATE FAILED: ${name}`);
    hits.forEach((h) => console.error(h));
  } else {
    console.log(`✓ ${name}`);
  }
}

const serverSrc = walk(join(root, 'server/src'));
const serverSrcNoDb = serverSrc.filter((f) => !relative(root, f).replace(/\\/g, '/').includes('server/src/db/'));
const moneySrc = walk(join(root, 'server/src/money'));
const clientSrc = walk(join(root, 'client/src'));

gate('no pool.query/execute outside server/src/db/', serverSrcNoDb, /pool\.(query|execute)/);
gate('money module imports nothing from db/', moneySrc, /from ['"][^'"]*\/db/);
gate('process.env read only in config.ts', serverSrc, /process\.env/, { allow: ['server/src/config.ts'] });
gate('no toISOString in client', clientSrc, /toISOString/);
gate('no parseFloat on money in client', clientSrc, /parseFloat\s*\(/);
gate('no "* 100" on money in client', clientSrc, /\*\s*100\b/, {
  allow: ['client/src/lib/bar.ts'], // pixel ratios for progress bars — not money
});
gate('division by 100 only in the formatter', clientSrc, /\/\s?100\b/, {
  allow: ['client/src/lib/money.ts', 'client/src/lib/bar.ts'],
});
gate('no service worker in client', clientSrc, /serviceWorker/);

if (failures) {
  console.error(`\n${failures} gate(s) failed.`);
  process.exit(1);
}
console.log('\nAll gates passed.');
