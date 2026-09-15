import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDrPack } from '../../content/packs/dr-mechanism-0.1.0/load.ts';
import { DEMO_BRIDGE_RULES, DEMO_RULE_QUESTION } from '../../content/bridges/demo-bridges.ts';
import { selectScenario } from '../../lib/domain/simulation/dr.ts';

const DEMO_MANIFEST = path.join(process.cwd(), 'public', 'lab-demo', 'public-manifest.json');

describe('demo bridge link resolution (synthetic only)', () => {
  const pack = loadDrPack();
  const mechanismIds = new Set(pack.mechanisms.map((m) => m.id));
  const scenarioIds = new Set(['normal_barrier', 'leakage', 'capillary_nonperfusion', 'ischemia_neovascularization', 'combined']);
  const questionIds = new Set(pack.questions.map((q) => q.id));
  const demoCases: { caseId: string }[] = JSON.parse(readFileSync(DEMO_MANIFEST, 'utf8')).cases;
  const demoIds = new Set(demoCases.map((c) => c.caseId));

  it('every rule mechanism/scenario/question resolves', () => {
    expect(DEMO_BRIDGE_RULES.length).toBe(4);
    for (const rule of DEMO_BRIDGE_RULES) {
      for (const mid of rule.mechanismIds) {
        expect(mechanismIds.has(mid), `rule ${rule.id} mechanism ${mid}`).toBe(true);
      }
      expect(scenarioIds.has(rule.scenarioId as never), `rule ${rule.id} scenario`).toBe(true);
      const qid = DEMO_RULE_QUESTION[rule.id];
      expect(qid, `rule ${rule.id} question map`).toBeTruthy();
      expect(questionIds.has(qid), `rule ${rule.id} question ${qid}`).toBe(true);
      for (const pid of rule.followupPoolIds) {
        expect(demoIds.has(pid), `rule ${rule.id} pool ${pid}`).toBe(true);
      }
      const st = selectScenario(rule.scenarioId);
      expect(st.ok, `scenario ${rule.scenarioId} selectable`).toBe(true);
    }
  });
});
