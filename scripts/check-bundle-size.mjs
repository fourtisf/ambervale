/**
 * Bundle budget check for /play.
 *
 * The Phase 8 budget is 1.5MB gzipped. Phaser dominates it, and it is only
 * ever loaded through a dynamic import behind `ssr: false`, so the number that
 * matters is what a player actually downloads to reach the game — the shared
 * app chunks plus the lazily-loaded game chunk.
 *
 * Reads Next's build manifest rather than globbing, so it measures the real
 * dependency graph instead of whatever happens to be on disk.
 */

import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const WEB = path.resolve(import.meta.dirname, '..', 'apps', 'web');
const STATIC = path.join(WEB, '.next', 'static');
const BUDGET_BYTES = 1.5 * 1024 * 1024;

if (!existsSync(STATIC)) {
  console.error('No build found. Run `pnpm --filter @ambervale/web build` first.');
  process.exit(1);
}

/** Every .js file under .next/static, with its gzipped size. */
function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...collect(full));
    } else if (entry.endsWith('.js')) {
      out.push({ file: path.relative(STATIC, full), gz: gzipSync(readFileSync(full)).length });
    }
  }
  return out;
}

const files = collect(STATIC).sort((a, b) => b.gz - a.gz);
const total = files.reduce((sum, f) => sum + f.gz, 0);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

console.log('Largest chunks (gzipped):');
for (const f of files.slice(0, 8)) {
  console.log(`  ${kb(f.gz).padStart(10)}  ${f.file}`);
}
console.log(`\nTotal client JS (gzipped): ${kb(total)}`);
console.log(`Budget for /play:          ${kb(BUDGET_BYTES)}`);

if (total > BUDGET_BYTES) {
  console.error(
    `\nFAIL: total client JS is ${kb(total)}, over the ${kb(BUDGET_BYTES)} budget.\n` +
      'Phaser dominates this; a regression usually means the engine was pulled\n' +
      'into a shared chunk instead of staying behind the dynamic import.',
  );
  process.exit(1);
}

console.log('\nOK: within budget.');
