import * as THREE from 'three';

// Magnified schematic patch of the retinal capillary bed (teaching scale).
// Local convention matches the atlas: +X anterior (vitreal), patch centered
// near the origin, ~2 units tall. Schematic only, not to scale.

export interface OverlayParts {
  [key: string]: THREE.Group;
}

export interface RetinaOverlaySystems {
  leak: THREE.Points;
  nv: THREE.Points;
}

export interface RetinaOverlayBuild {
  root: THREE.Group;
  parts: OverlayParts;
  systems: RetinaOverlaySystems;
}

function microMaterial(color: string, opacity = 1, roughness = 0.55): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: opacity > 0.85 });
  m.userData.baseOpacity = opacity;
  return m;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PART_IDS = ['capillaryPlexus', 'endotheliumLining', 'leakageField', 'perfusionShade', 'cwsPatches', 'nvFronds', 'lipidWash'] as const;

export function buildRetinaOverlay(): RetinaOverlayBuild {
  const root = new THREE.Group();
  const parts = {} as OverlayParts;
  for (const id of PART_IDS) {
    const g = new THREE.Group();
    g.userData.detailSub = id;
    parts[id] = g;
    root.add(g);
  }
  function add(id: string, g: THREE.BufferGeometry, color: string, opacity = 1): THREE.Mesh {
    const mesh = new THREE.Mesh(g, microMaterial(color, opacity));
    mesh.userData.detailSub = id;
    mesh.userData.sectionSolid = false;
    parts[id].add(mesh);
    return mesh;
  }
  function tube(id: string, pts: THREE.Vector3[], r: number, color: string, opacity = 1, closed = false): THREE.Mesh {
    const curve = new THREE.CatmullRomCurve3(pts, closed);
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.max(16, pts.length * 7), r, 6, closed),
      microMaterial(color, opacity),
    );
    mesh.userData.detailSub = id;
    mesh.userData.sectionSolid = false;
    parts[id].add(mesh);
    return mesh;
  }
  function points(id: string, positions: Float32Array, color: string): THREE.Points {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const m = new THREE.PointsMaterial({ color, size: 0.02, transparent: true, opacity: 0.9, depthWrite: false });
    const p = new THREE.Points(g, m);
    p.userData.detailSub = id;
    p.userData.rate = 0;
    parts[id].add(p);
    return p;
  }

  // Capillary loops: 3 reddish loops stacked along Y, slight X undulation.
  function loopPoints(cy: number, cz: number, ry: number, rz: number, xAmp: number, phase: number): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 10; i++) {
      const t = (i / 10) * Math.PI * 2;
      pts.push(new THREE.Vector3(xAmp * Math.sin(2 * t + phase), cy + ry * Math.cos(t), cz + rz * Math.sin(t)));
    }
    return pts;
  }
  const loops = [
    { pts: loopPoints(0.48, 0.0, 0.26, 0.30, 0.09, 0.0), color: '#b03a30' },
    { pts: loopPoints(-0.04, 0.06, 0.30, 0.34, 0.10, 1.3), color: '#a64239' },
    { pts: loopPoints(-0.56, -0.04, 0.22, 0.27, 0.08, 2.6), color: '#913b32' },
  ];
  for (const loop of loops) {
    tube('capillaryPlexus', loop.pts, 0.030, loop.color, 1, true);
    tube('endotheliumLining', loop.pts, 0.044, '#e9c8b8', 0.30, true);
  }

  // Leakage field: ~120 pts scattered outside the loops (|x| biased outward).
  const rand = mulberry32(1337);
  const N_LEAK = 120;
  const leakPos = new Float32Array(N_LEAK * 3);
  for (let i = 0; i < N_LEAK; i++) {
    const sx = rand() < 0.5 ? -1 : 1;
    leakPos[i * 3] = sx * (0.12 + rand() * 0.23);
    leakPos[i * 3 + 1] = -0.95 + rand() * 1.9;
    leakPos[i * 3 + 2] = -0.65 + rand() * 1.3;
  }
  const leak = points('leakageField', leakPos, '#f2d060');
  parts['leakageField'].visible = false;
  parts['leakageField'].userData.rate = 0;

  // Perfusion shade: translucent gray wash over the patch (opacity driven).
  add('perfusionShade', new THREE.BoxGeometry(0.34, 1.9, 1.3), '#9aa0a6', 0.28).position.set(-0.05, 0, 0);
  parts['perfusionShade'].visible = false;

  // Cotton-wool spots: 3 pale fluffy flattened blobs.
  const cwsSpots: Array<[number, number, number]> = [[0.06, 0.52, 0.28], [0.0, -0.08, -0.32], [0.06, -0.62, 0.22]];
  for (const [x, y, z] of cwsSpots) {
    const blob = add('cwsPatches', new THREE.IcosahedronGeometry(0.13, 1), '#f2ede2', 0.95);
    blob.position.set(x, y, z);
    blob.scale.set(0.45, 1, 0.75);
    blob.rotation.set(0.4, 0.7, 0.2);
  }
  parts['cwsPatches'].visible = false;

  // Neovascular fronds: 3 branching sea-fan tube clusters growing +X/anterior.
  const fanTips: THREE.Vector3[] = [];
  function seaFan(base: THREE.Vector3, dir: THREE.Vector3, spread: number): void {
    const tip = base.clone().addScaledVector(dir, 0.32);
    const mid = base.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.03, 0));
    tube('nvFronds', [base, mid, tip], 0.014, '#c0392b');
    const branches = 4;
    for (let b = 0; b < branches; b++) {
      const ang = (b / (branches - 1) - 0.5) * spread;
      const end = tip.clone().add(new THREE.Vector3(0.10 * Math.cos(ang), 0.20 * Math.sin(ang), 0.11 * Math.sin(ang * 1.7)));
      const bend = tip.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.02, 0.015 * Math.sin(b * 2.1)));
      tube('nvFronds', [tip, bend, end], 0.008, b % 2 === 0 ? '#d65446' : '#a93226');
      fanTips.push(end);
    }
  }
  seaFan(new THREE.Vector3(0.10, 0.62, 0.05), new THREE.Vector3(0.55, 0.45, 0.10).normalize(), 1.5);
  seaFan(new THREE.Vector3(0.08, -0.10, -0.10), new THREE.Vector3(0.60, 0.10, -0.25).normalize(), 1.7);
  seaFan(new THREE.Vector3(0.10, -0.58, 0.10), new THREE.Vector3(0.55, -0.35, 0.20).normalize(), 1.4);
  const N_NV = 60;
  const nvPos = new Float32Array(N_NV * 3);
  for (let i = 0; i < N_NV; i++) {
    const tip = fanTips[i % fanTips.length];
    nvPos[i * 3] = tip.x + (rand() - 0.5) * 0.10;
    nvPos[i * 3 + 1] = tip.y + (rand() - 0.5) * 0.12;
    nvPos[i * 3 + 2] = tip.z + (rand() - 0.5) * 0.10;
  }
  const nv = points('nvFronds', nvPos, '#e86a5a');
  parts['nvFronds'].visible = false;
  parts['nvFronds'].userData.rate = 0;

  // Lipid wash: translucent yellow exudate tint over the patch.
  add('lipidWash', new THREE.BoxGeometry(0.30, 1.5, 1.05), '#e8c84a', 0.35).position.set(0.12, -0.05, 0.05);
  parts['lipidWash'].visible = false;

  return { root, parts, systems: { leak, nv } };
}
