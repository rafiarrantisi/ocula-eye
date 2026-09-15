// content:validate — validates the aqueous teaching pack (schema, references,
// hashes). Fails non-zero with issue list. No clinical truth is asserted here.
import { validateAqueousPack } from '../../lib/domain/content/schema.ts';
import { hashOf } from '../../lib/domain/content/release.ts';
import { loadAqueousPack } from '../../content/packs/aqueous-0.1.0/load.ts';

const pack = loadAqueousPack();
const files = {
  sources: pack.sources,
  claims: pack.claims,
  models: pack.models,
  examples: pack.examples,
  manifest: pack.manifest,
};
const issues = validateAqueousPack(files);
if (issues.length > 0) {
  for (const i of issues) console.error(`${i.file}/${i.code}: ${i.detail}`);
  process.exit(1);
}
// Hash stability: same canonical bytes must hash identically across runs.
for (const [name, data] of Object.entries(files)) {
  const a = hashOf(data);
  const b = hashOf(JSON.parse(canonicalRoundTrip(data)));
  if (a !== b || a !== pack.fileHashes[name]) {
    console.error(`${name}: unstable hash`);
    process.exit(1);
  }
  console.log(`${name}: ok (${a.slice(0, 12)}…)`);
}
function canonicalRoundTrip(data) {
  return JSON.stringify(JSON.parse(JSON.stringify(data)));
}
console.log('content:validate passed (aqueous-0.1.0, all draft).');
