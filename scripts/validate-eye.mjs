import assert from 'node:assert/strict';
import {buildEye,disposeObject,anchors,flowPaths,EYE} from '../components/atlas/geometry.ts';
import {structures,sources,illustrativeIOP} from '../components/atlas/content.ts';
import * as THREE from 'three';

assert.equal(new Set(structures.map(s=>s.id)).size,14);
for(const s of structures){assert.ok(anchors[s.id]);s.sources.forEach(id=>assert.ok(sources.some(r=>r.id===id)));}
assert.ok(EYE.lensX+EYE.lensHalfThickness<EYE.irisX,'Lens anterior pole stays posterior to iris plane.');
assert.ok(EYE.pupilRadius<EYE.lensRadius&&EYE.lensRadius<EYE.limbusRadius);
assert.equal(illustrativeIOP(2.5,.25,.5,9),17);
assert.ok(illustrativeIOP(2.5,.1,.5)>illustrativeIOP(2.5,.3,.5),'Lower facility must increase pressure.');
assert.ok(illustrativeIOP(2.5,.3,.8)<illustrativeIOP(2.5,.3,.5),'Greater unconventional outflow must lower pressure.');
for(const cut of [false,true]){
  const eye=buildEye(cut);let count=0,triangles=0;
  assert.deepEqual(Object.keys(eye.parts).sort(),structures.map(s=>s.id).sort());
  eye.root.traverse(o=>{if(o instanceof THREE.Mesh){count++;const p=o.geometry.getAttribute('position');assert.ok(p.count>0);for(const n of p.array)assert.ok(Number.isFinite(n),'Nonfinite vertex');o.geometry.computeBoundingBox();assert.ok(o.geometry.boundingBox);const idx=o.geometry.getIndex();if(idx){for(const i of idx.array)assert.ok(i>=0&&i<p.count);triangles+=idx.count/3;}assert.ok(o.userData.id);}});
  assert.ok(count<100,`Expected batched geometry, got ${count} draw calls.`);
  if(cut){const bounds=new THREE.Box3().setFromObject(eye.parts.sclera);assert.ok(bounds.max.z<.012,'Cutaway must remove the near hemisphere.');}
  const lensBounds=new THREE.Box3().setFromObject(eye.lens);assert.ok(Math.abs(lensBounds.min.x-.33)<.001);assert.ok(Math.abs(lensBounds.max.x-.67)<.001);
  console.log(`${cut?'Cutaway':'Intact'}: ${count} meshes, ${Math.round(triangles).toLocaleString()} triangles; buffers and bounds valid.`);
  disposeObject(eye.root);
}
for(const path of flowPaths()){
  assert.ok(path.curve.getLength()>0);
  for(const v of path.curve.getPoints(700)){
    assert.ok([v.x,v.y,v.z].every(Number.isFinite));
    if(path.type!=='shared')continue;
    const r=Math.hypot(v.y,v.z);
    const lensInterior=((v.x-EYE.lensX)/EYE.lensHalfThickness)**2+(r/EYE.lensRadius)**2;
    assert.ok(lensInterior>1,`Aqueous path intersects lens at ${v.toArray()}.`);
    if(v.x>=.685&&v.x<=.704)assert.ok(r<EYE.pupilRadius,`Aqueous must cross iris through pupil, r=${r}.`);
    if(v.x>.77)assert.ok((v.x-.35)**2+r*r<.675**2,'Aqueous stays behind cornea.');
    assert.ok(v.x>.60,'Aqueous does not enter vitreous.');
  }
}
console.log('Aqueous routes: do not cross lens; pass through pupil; remain within cornea.');
console.log('Content links, anatomical ordering and pressure response checks passed.');
