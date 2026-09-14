import * as THREE from 'three';
import {buildEye,anchors,explosion} from './geometry.ts';
import {buildOrbit,orbitAnchors,orbitExplosion} from './orbitGeometry.ts';
import {biometricPoint,structureVisible} from './exploration.ts';
import type {Biometry,StructureId,GlobeStructureId,OrbitalStructureId,SceneState} from './types';

export const allAnchors:Record<StructureId,[number,number,number]>={...anchors,...orbitAnchors};
export function explosionOffset(id:StructureId,gap:number){const p=orbitExplosion[id as OrbitalStructureId];return p?new THREE.Vector3(...p).multiplyScalar(gap):new THREE.Vector3(explosion[id as GlobeStructureId]*gap,0,0);}
export function buildMacro(biometry?:Biometry,legacyCut=false){
 const eye=buildEye(legacyCut),orbital=buildOrbit();
 Object.values(orbital).forEach(g=>eye.root.add(g));
 const parts:Record<StructureId,THREE.Group>={...eye.parts,...orbital};
 if(biometry){
  // Bake each mesh's local transform once, then deform from reference geometry.
  // Rebuilding from reference prevents accumulated numerical distortion.
  for(const [id,part] of Object.entries(parts))part.traverse(o=>{
   if(!(o instanceof THREE.Mesh))return;
   o.updateMatrix();o.geometry.applyMatrix4(o.matrix);o.position.set(0,0,0);o.quaternion.identity();o.scale.set(1,1,1);o.updateMatrix();
   const p=o.geometry.getAttribute('position'),q=new THREE.Vector3();
   for(let i=0;i<p.count;i++){q.fromBufferAttribute(p,i);const v=biometricPoint(q,id as StructureId,biometry);p.setXYZ(i,v.x,v.y,v.z);}
   p.needsUpdate=true;o.geometry.computeVertexNormals();o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere();
  });
  eye.root.scale.z=biometry.side==='left'?-1:1;
 }
 return {...eye,parts};
}
export function positionParts(eye:ReturnType<typeof buildMacro>,s:SceneState){
 for(const id of Object.keys(eye.parts) as StructureId[]){const part=eye.parts[id];part.visible=structureVisible(s,id);part.position.copy(s.view==='exploded'?explosionOffset(id,s.explosionGap):new THREE.Vector3());}
 eye.root.updateMatrixWorld(true);
}
export function worldAnchor(id:StructureId,s:SceneState){
 const v=new THREE.Vector3(...allAnchors[id]);
 const p=s.module==='anatomy'?biometricPoint(v,id,s.biometry):v;
 if(s.view==='exploded')p.add(explosionOffset(id,s.explosionGap));
 if(s.module==='anatomy'&&s.biometry.side==='left')p.z*=-1;
 return p;
}
export function buildConnectors(s:SceneState){
 const group=new THREE.Group();
 if(!s.connectors||s.view!=='exploded'||s.explosionGap===0)return group;
 for(const id of Object.keys(allAnchors) as StructureId[]){
  if(!structureVisible(s,id))continue;
  const end=worldAnchor(id,s),start=worldAnchor(id,{...s,view:'intact'});if(start.distanceToSquared(end)<1e-8)continue;
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([start,end]),new THREE.LineDashedMaterial({color:'#82b4b7',transparent:true,opacity:.64,dashSize:.035,gapSize:.025}));line.computeLineDistances();group.add(line);
  const dot=new THREE.Mesh(new THREE.SphereGeometry(.014,8,6),new THREE.MeshBasicMaterial({color:'#8bc8c4'}));dot.position.copy(start);group.add(dot);
 }
 return group;
}
