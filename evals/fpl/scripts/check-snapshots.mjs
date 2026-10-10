// Fails if any frozen snapshot file has changed since it was captured.
// --write records the current hashes (only when adding a NEW snapshot).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../providers/_common.mjs';

const dir = join(ROOT, 'fixtures', 'snapshots');
const manifestPath = join(dir, 'MANIFEST.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const sha = (f) => createHash('sha256').update(readFileSync(join(dir, f))).digest('hex');
const md5Rows = (f) => createHash('md5').update(readFileSync(join(dir, f), 'utf8').replace(/\n$/, '')).digest('hex');

let bad = 0;
for (const s of manifest.snapshots) {
  if (s.db_md5_of_rows) {
    const m = md5Rows(s.file);
    if (m !== s.db_md5_of_rows) { bad++; console.log(`CHANGED ${s.file}: rows md5 ${m}, database gave ${s.db_md5_of_rows}`); }
  }
  if (process.argv.includes('--write')) manifest.file_sha256[s.file] = sha(s.file);
  else if (manifest.file_sha256[s.file] !== sha(s.file)) { bad++; console.log(`CHANGED ${s.file}: sha256 differs from MANIFEST.json`); }
}
if (process.argv.includes('--write')) { writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n'); console.log('hashes written'); }
console.log(bad ? `${bad} snapshot problem(s)` : `${manifest.snapshots.length} snapshots unchanged`);
process.exit(bad ? 1 : 0);
