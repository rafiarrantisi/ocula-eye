import * as THREE from 'three';
import type { OverlayParts } from './retinaVascularOverlay.ts';

// Minimal local structural copy of the diabetic-retinopathy state shape.
// A parallel agent owns the canonical dr.ts; keep these fields identical.
export interface DRState {
  scenario: 'normal_barrier' | 'leakage' | 'capillary_nonperfusion' | 'ischemia_neovascularization' | 'combined';
  activeMechanismIds: string[];
  barrier: 'intact' | 'compromised';
  perfusion: 'preserved' | 'reduced';
  neovascularization: 'absent' | 'present';
}

export interface DROverlaySystems {
  leak: THREE.Points;
  nv: THREE.Points;
}

export const DR_SCENARIOS: ReadonlyArray<{ id: DRState['scenario']; name: string }> = [
  { id: 'normal_barrier', name: 'Normal barrier' },
  { id: 'leakage', name: 'Leakage / macular edema' },
  { id: 'capillary_nonperfusion', name: 'Capillary nonperfusion' },
  { id: 'ischemia_neovascularization', name: 'Ischemia with neovascularization' },
  { id: 'combined', name: 'Combined leakage, nonperfusion and neovascularization' },
];

function groupMeshes(group: THREE.Group | undefined): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  if (!group) return out;
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
}

function setGroupOpacity(group: THREE.Group | undefined, opacity: number): void {
  for (const m of groupMeshes(group)) {
    const mat = m.material as THREE.MeshStandardMaterial;
    mat.transparent = opacity < 1;
    mat.opacity = opacity;
    mat.depthWrite = opacity > 0.85;
  }
}

function setGroupEmissive(group: THREE.Group | undefined, hex: string): void {
  for (const m of groupMeshes(group)) {
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat.emissive) mat.emissive.set(hex);
  }
}

function setPointsRate(points: THREE.Points | undefined, group: THREE.Group | undefined, rate: number): void {
  if (points) points.userData.rate = rate;
  if (group) group.userData.rate = rate;
}

function hideAll(parts: OverlayParts, systems: DROverlaySystems): void {
  for (const key of Object.keys(parts)) parts[key].visible = false;
  setPointsRate(systems ? systems.leak : undefined, parts['leakageField'], 0);
  setPointsRate(systems ? systems.nv : undefined, parts['nvFronds'], 0);
  setGroupEmissive(parts['endotheliumLining'], '#000000');
}

// Pure visibility + opacity/emissive mapping. No camera directives; the
// return value carries no camera info (void).
export function applyDrOverlay(parts: OverlayParts, systems: DROverlaySystems, state: DRState): void {
  if (!parts || !systems || !state) {
    if (parts && systems) hideAll(parts, systems);
    return;
  }
  const plexus = parts['capillaryPlexus'];
  const endothelium = parts['endotheliumLining'];
  const leakage = parts['leakageField'];
  const shade = parts['perfusionShade'];
  const cws = parts['cwsPatches'];
  const nvGroup = parts['nvFronds'];
  const lipid = parts['lipidWash'];
  const show = (g: THREE.Group | undefined, v: boolean): void => {
    if (g) g.visible = v;
  };
  switch (state.scenario) {
    case 'normal_barrier': {
      show(plexus, true); setGroupOpacity(plexus, 1);
      show(endothelium, true); setGroupEmissive(endothelium, '#000000');
      show(leakage, false); setPointsRate(systems.leak, leakage, 0);
      show(shade, false);
      show(cws, false);
      show(nvGroup, false); setPointsRate(systems.nv, nvGroup, 0);
      show(lipid, false);
      break;
    }
    case 'leakage': {
      show(plexus, true); setGroupOpacity(plexus, 1);
      show(endothelium, true); setGroupEmissive(endothelium, '#6b5a1e');
      show(leakage, true); setPointsRate(systems.leak, leakage, 1);
      show(shade, false);
      show(cws, false);
      show(nvGroup, false); setPointsRate(systems.nv, nvGroup, 0);
      show(lipid, true); setGroupOpacity(lipid, 0.35);
      break;
    }
    case 'capillary_nonperfusion': {
      show(plexus, true); setGroupOpacity(plexus, 0.35);
      show(endothelium, true); setGroupEmissive(endothelium, '#000000');
      show(leakage, false); setPointsRate(systems.leak, leakage, 0);
      show(shade, true); setGroupOpacity(shade, 0.28);
      show(cws, true);
      show(nvGroup, false); setPointsRate(systems.nv, nvGroup, 0);
      show(lipid, false);
      break;
    }
    case 'ischemia_neovascularization': {
      show(plexus, true); setGroupOpacity(plexus, 0.35);
      show(endothelium, true); setGroupEmissive(endothelium, '#000000');
      show(leakage, true); setPointsRate(systems.leak, leakage, 0.3);
      show(shade, true); setGroupOpacity(shade, 0.28);
      show(cws, true);
      show(nvGroup, true); setPointsRate(systems.nv, nvGroup, 1);
      show(lipid, false);
      break;
    }
    case 'combined': {
      show(plexus, true); setGroupOpacity(plexus, 0.5);
      show(endothelium, true); setGroupEmissive(endothelium, '#6b5a1e');
      show(leakage, true); setPointsRate(systems.leak, leakage, 0.6);
      show(shade, true); setGroupOpacity(shade, 0.28);
      show(cws, true);
      show(nvGroup, true); setPointsRate(systems.nv, nvGroup, 1);
      show(lipid, true); setGroupOpacity(lipid, 0.3);
      break;
    }
    default: {
      hideAll(parts, systems);
      break;
    }
  }
}

// Rendering-only interpolation: slow rotation of the schematic Points clouds
// carries no physiological meaning. Reduced-motion handling stays in the
// caller (EyeScene); this adapter takes no clock.
export function advanceOverlay(systems: DROverlaySystems, dt: number): void {
  if (!systems || !Number.isFinite(dt) || dt <= 0) return;
  const leak = systems.leak;
  const nv = systems.nv;
  const lr = leak && typeof leak.userData.rate === 'number' ? (leak.userData.rate as number) : 0;
  if (leak && lr > 0) {
    leak.rotation.x += dt * lr * 0.2;
    leak.rotation.y += dt * lr * 0.13;
  }
  const nr = nv && typeof nv.userData.rate === 'number' ? (nv.userData.rate as number) : 0;
  if (nv && nr > 0) {
    nv.rotation.x += dt * nr * 0.16;
    nv.rotation.y -= dt * nr * 0.11;
  }
}
