// content:preview-dr — markdown reviewer table for the DR mechanism pack.
// No clinical truth is asserted here; all pack content is draft.
// NOTE: lib/domain/simulation/dr.ts is owned by a parallel agent and may not
// exist yet, so this script does NOT import it. The 5-row scenario/state
// mapping below is a local duplicate that mirrors the CONTRACTS DRScenario
// order (normal_barrier, leakage, capillary_nonperfusion,
// ischemia_neovascularization, combined); integration tests must verify it
// against dr.ts once that file lands. Bindings per scenario are derived from
// the pack itself (by stateSelector), so the table cannot drift from the pack.
import { loadDrPack } from '../../content/packs/dr-mechanism-0.1.0/load.ts';

const pack = loadDrPack();

// Local mirror of the dr.ts SCENARIOS table (see NOTE above), copied verbatim
// as of 2026-09-15. `combined` illustrates coexistence of findings, not
// deterministic progression.
const scenarios = [
  {
    scenario: 'normal_barrier',
    barrier: 'intact',
    perfusion: 'preserved',
    nv: 'absent',
    mechanisms: ['inner-endothelium', 'outer-rpe'],
    concepts: ['barrier-id'],
  },
  {
    scenario: 'leakage',
    barrier: 'compromised',
    perfusion: 'preserved',
    nv: 'absent',
    mechanisms: ['inner-endothelium', 'plasma-leakage', 'lipid-deposit'],
    concepts: ['exudate-vs-bleed'],
  },
  {
    scenario: 'capillary_nonperfusion',
    barrier: 'intact',
    perfusion: 'reduced',
    nv: 'absent',
    mechanisms: ['nfl-ischemia'],
    concepts: ['deposit-vs-ischemia'],
  },
  {
    scenario: 'ischemia_neovascularization',
    barrier: 'compromised',
    perfusion: 'reduced',
    nv: 'present',
    mechanisms: ['nfl-ischemia', 'nv-drive'],
    concepts: ['deposit-vs-ischemia'],
  },
  {
    scenario: 'combined',
    barrier: 'compromised',
    perfusion: 'reduced',
    nv: 'present',
    mechanisms: ['plasma-leakage', 'lipid-deposit', 'nfl-ischemia', 'nv-drive'],
    concepts: ['barrier-id', 'exudate-vs-bleed', 'deposit-vs-ischemia'],
  },
];

function bindingIdsFor(scenario) {
  if (scenario === 'combined') return pack.bindings.map((b) => b.id);
  return pack.bindings.filter((b) => b.stateSelector === scenario).map((b) => b.id);
}

console.log(`# DR mechanism pack reviewer preview (${pack.manifest.packId} ${pack.manifest.version}, all draft)`);
console.log('');
console.log('| scenario | barrier/perfusion/nv | mechanisms | bindings | question concept |');
console.log('|---|---|---|---|---|');
for (const s of scenarios) {
  console.log(`| ${s.scenario} | ${s.barrier}/${s.perfusion}/${s.nv} | ${s.mechanisms.join(', ')} | ${bindingIdsFor(s.scenario).join(', ')} | ${s.concepts.join(', ')} |`);
}
console.log('');
console.log('Note: pack mechanism rbc-escape (bleeding distinction) has claim/question coverage but no default scenario row activates it in dr.ts; flagged for integration review.');
