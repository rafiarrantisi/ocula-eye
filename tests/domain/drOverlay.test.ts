import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildRetinaOverlay } from '../../components/atlas/retinaVascularOverlay.ts';
import { DR_SCENARIOS, advanceOverlay, applyDrOverlay, type DRState } from '../../components/atlas/retinaMechanismAdapter.ts';

function stateFor(scenario: DRState['scenario']): DRState {
  return {
    scenario,
    activeMechanismIds: [],
    barrier: scenario === 'normal_barrier' ? 'intact' : 'compromised',
    perfusion: scenario === 'normal_barrier' || scenario === 'leakage' ? 'preserved' : 'reduced',
    neovascularization: scenario === 'ischemia_neovascularization' || scenario === 'combined' ? 'present' : 'absent',
  };
}

function firstOpacity(group: THREE.Group): number {
  let opacity = NaN;
  group.traverse((o) => {
    if (Number.isNaN(opacity) && o instanceof THREE.Mesh) {
      opacity = (o.material as THREE.MeshStandardMaterial).opacity;
    }
  });
  return opacity;
}

function firstEmissiveHex(group: THREE.Group): number {
  let hex = NaN;
  group.traverse((o) => {
    if (Number.isNaN(hex) && o instanceof THREE.Mesh) {
      hex = (o.material as THREE.MeshStandardMaterial).emissive.getHex();
    }
  });
  return hex;
}

function triangleCount(root: THREE.Object3D): number {
  let tris = 0;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const g = o.geometry as THREE.BufferGeometry;
      const idx = g.getIndex();
      if (idx) tris += idx.count / 3;
      else tris += (g.getAttribute('position') as THREE.BufferAttribute).count / 3;
    }
  });
  return Math.round(tris);
}

describe('DR_SCENARIOS', () => {
  it('lists the 5 scenario ids', () => {
    expect(DR_SCENARIOS.map((s) => s.id)).toEqual([
      'normal_barrier',
      'leakage',
      'capillary_nonperfusion',
      'ischemia_neovascularization',
      'combined',
    ]);
  });
});

describe('applyDrOverlay per-scenario visibility', () => {
  it('normal_barrier: plexus full, endothelium on, everything pathological hidden', () => {
    const b = buildRetinaOverlay();
    const out = applyDrOverlay(b.parts, b.systems, stateFor('normal_barrier'));
    expect(out).toBeUndefined();
    expect(b.parts['capillaryPlexus'].visible).toBe(true);
    expect(firstOpacity(b.parts['capillaryPlexus'])).toBeCloseTo(1, 5);
    expect(b.parts['endotheliumLining'].visible).toBe(true);
    expect(b.parts['leakageField'].visible).toBe(false);
    expect(b.systems.leak.userData.rate).toBe(0);
    expect(b.parts['perfusionShade'].visible).toBe(false);
    expect(b.parts['cwsPatches'].visible).toBe(false);
    expect(b.parts['nvFronds'].visible).toBe(false);
    expect(b.systems.nv.userData.rate).toBe(0);
    expect(b.parts['lipidWash'].visible).toBe(false);
  });
  it('leakage: leak rate 1, lipid .35, endothelium highlighted, no cws/nv', () => {
    const b = buildRetinaOverlay();
    applyDrOverlay(b.parts, b.systems, stateFor('leakage'));
    expect(b.parts['capillaryPlexus'].visible).toBe(true);
    expect(firstOpacity(b.parts['capillaryPlexus'])).toBeCloseTo(1, 5);
    expect(b.parts['leakageField'].visible).toBe(true);
    expect(b.systems.leak.userData.rate).toBe(1);
    expect(b.parts['lipidWash'].visible).toBe(true);
    expect(firstOpacity(b.parts['lipidWash'])).toBeCloseTo(0.35, 5);
    expect(firstEmissiveHex(b.parts['endotheliumLining'])).not.toBe(0);
    expect(b.parts['cwsPatches'].visible).toBe(false);
    expect(b.parts['nvFronds'].visible).toBe(false);
    expect(b.systems.nv.userData.rate).toBe(0);
  });
  it('capillary_nonperfusion: plexus dimmed .35, cws on, leak/nv/lipid off', () => {
    const b = buildRetinaOverlay();
    applyDrOverlay(b.parts, b.systems, stateFor('capillary_nonperfusion'));
    expect(firstOpacity(b.parts['capillaryPlexus'])).toBeCloseTo(0.35, 5);
    expect(b.parts['cwsPatches'].visible).toBe(true);
    expect(b.parts['leakageField'].visible).toBe(false);
    expect(b.systems.leak.userData.rate).toBe(0);
    expect(b.parts['nvFronds'].visible).toBe(false);
    expect(b.parts['lipidWash'].visible).toBe(false);
  });
  it('ischemia_neovascularization: plexus dimmed, cws + nv on, low leak, no lipid', () => {
    const b = buildRetinaOverlay();
    applyDrOverlay(b.parts, b.systems, stateFor('ischemia_neovascularization'));
    expect(firstOpacity(b.parts['capillaryPlexus'])).toBeCloseTo(0.35, 5);
    expect(b.parts['cwsPatches'].visible).toBe(true);
    expect(b.parts['nvFronds'].visible).toBe(true);
    expect(b.systems.nv.userData.rate).toBe(1);
    expect(b.parts['leakageField'].visible).toBe(true);
    expect(b.systems.leak.userData.rate).toBeCloseTo(0.3, 5);
    expect(b.parts['lipidWash'].visible).toBe(false);
  });
  it('combined: plexus .5, leak .6, lipid .3, cws + nv on', () => {
    const b = buildRetinaOverlay();
    applyDrOverlay(b.parts, b.systems, stateFor('combined'));
    expect(firstOpacity(b.parts['capillaryPlexus'])).toBeCloseTo(0.5, 5);
    expect(b.parts['leakageField'].visible).toBe(true);
    expect(b.systems.leak.userData.rate).toBeCloseTo(0.6, 5);
    expect(b.parts['lipidWash'].visible).toBe(true);
    expect(firstOpacity(b.parts['lipidWash'])).toBeCloseTo(0.3, 5);
    expect(b.parts['cwsPatches'].visible).toBe(true);
    expect(b.parts['nvFronds'].visible).toBe(true);
    expect(b.systems.nv.userData.rate).toBe(1);
  });
  it('unknown scenario id hides everything and does not throw', () => {
    const b = buildRetinaOverlay();
    const bogus = { scenario: 'bogus', activeMechanismIds: [], barrier: 'intact', perfusion: 'preserved', neovascularization: 'absent' } as unknown as DRState;
    expect(() => applyDrOverlay(b.parts, b.systems, bogus)).not.toThrow();
    for (const key of Object.keys(b.parts)) expect(b.parts[key].visible).toBe(false);
    expect(b.systems.leak.userData.rate).toBe(0);
    expect(b.systems.nv.userData.rate).toBe(0);
  });
});

describe('overlay build budget and systems', () => {
  it('fresh build triangle count is well under 100k', () => {
    const b = buildRetinaOverlay();
    const tris = triangleCount(b.root);
    expect(tris).toBeLessThanOrEqual(100000);
    expect(tris).toBeGreaterThan(0);
  });
  it('every Mesh is excluded from section caps', () => {
    const b = buildRetinaOverlay();
    const bad: string[] = [];
    b.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.sectionSolid !== false) bad.push(o.uuid);
    });
    expect(bad).toEqual([]);
  });
  it('Points systems exist with rate field and overlay-style materials', () => {
    const b = buildRetinaOverlay();
    for (const p of [b.systems.leak, b.systems.nv]) {
      expect(p).toBeInstanceOf(THREE.Points);
      expect('rate' in p.userData).toBe(true);
      const m = p.material as THREE.PointsMaterial;
      expect(m.size).toBeCloseTo(0.02, 5);
      expect(m.transparent).toBe(true);
      expect(m.depthWrite).toBe(false);
    }
    expect((b.systems.leak.geometry.getAttribute('position') as THREE.BufferAttribute).count).toBe(120);
  });
});

describe('advanceOverlay', () => {
  it('does not throw for any scenario (including unknown)', () => {
    const ids = [...DR_SCENARIOS.map((s) => s.id), 'bogus'] as Array<DRState['scenario']>;
    for (const id of ids) {
      const b = buildRetinaOverlay();
      applyDrOverlay(b.parts, b.systems, { scenario: id, activeMechanismIds: [], barrier: 'intact', perfusion: 'preserved', neovascularization: 'absent' } as unknown as DRState);
      expect(() => advanceOverlay(b.systems, 0.016)).not.toThrow();
    }
  });
  it('is deterministic for the same dt sequence', () => {
    const a = buildRetinaOverlay();
    const c = buildRetinaOverlay();
    applyDrOverlay(a.parts, a.systems, stateFor('leakage'));
    applyDrOverlay(c.parts, c.systems, stateFor('leakage'));
    const seq = [0.016, 0.016, 0.033, 0.05];
    for (const dt of seq) {
      advanceOverlay(a.systems, dt);
      advanceOverlay(c.systems, dt);
    }
    expect(a.systems.leak.rotation.x).toBe(c.systems.leak.rotation.x);
    expect(a.systems.leak.rotation.y).toBe(c.systems.leak.rotation.y);
    expect(a.systems.leak.rotation.x).toBeGreaterThan(0);
  });
  it('skips rotation when rate is 0', () => {
    const b = buildRetinaOverlay();
    applyDrOverlay(b.parts, b.systems, stateFor('normal_barrier'));
    advanceOverlay(b.systems, 1.0);
    expect(b.systems.leak.rotation.x).toBe(0);
    expect(b.systems.nv.rotation.x).toBe(0);
  });
});
