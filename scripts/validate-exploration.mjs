import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildMacro,positionParts,worldAnchor,buildConnectors,allAnchors} from '../components/atlas/macroModel.ts';
import {DEFAULT_BIOMETRY,DEFAULT_SECTION,explorationDefaults,variationPresets,biometricPoint,lensThickness,sectionPlane,structureVisible,peeledIds} from '../components/atlas/exploration.ts';
import {sectionGeometry,buildSectionCaps} from '../components/atlas/sectionGeometry.ts';
import {disposeObject,revolve} from '../components/atlas/geometry.ts';
import {structures,sources} from '../components/atlas/content.ts';

const near=(a,b,eps=1e-4)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const state={...explorationDefaults,module:'anatomy',view:'intact',selected:'lens',hidden:[],isolated:null,detail:null,opacity:1};
assert.equal(Object.keys(allAnchors).length,32);
for(const item of structures)for(const source of item.sources)assert.ok(sources.some(s=>s.id===source));
for(const preset of variationPresets){
 const b={...DEFAULT_BIOMETRY,...preset.values},eye=buildMacro(b);
 const sclera=new THREE.Box3().setFromObject(eye.parts.sclera),cornea=new THREE.Box3().setFromObject(eye.parts.cornea),lens=new THREE.Box3().setFromObject(eye.lens);
 near((cornea.max.x-sclera.min.x)*12,b.axialLength,.002);
 near((1-lens.max.x)*12,b.chamberDepth,.002);
 near((lens.max.x-lens.min.x)*12,lensThickness(b.age),.002);
 let minPupil=Infinity;eye.parts.iris.traverse(o=>{if(o instanceof THREE.Mesh){const p=o.geometry.getAttribute('position');for(let i=0;i<p.count;i++)minPupil=Math.min(minPupil,Math.hypot(p.getY(i),p.getZ(i)));}});
 near(minPupil*24,b.pupilDiameter,.002);
 eye.root.traverse(o=>{if(o instanceof THREE.Mesh)for(const n of o.geometry.getAttribute('position').array)assert.ok(Number.isFinite(n));});
 disposeObject(eye.root);
}
console.log('Biometry: all five presets match axial length, internal ACD, pupil diameter, and illustrative lens thickness.');
for(const axialLength of [20,30])for(const chamberDepth of [2,4.5])for(const age of [18,80]){
 const b={...DEFAULT_BIOMETRY,axialLength,chamberDepth,age};
 const vitreous=biometricPoint(new THREE.Vector3(.325,0,0),'vitreous',b);
 const posteriorLens=biometricPoint(new THREE.Vector3(.33,0,0),'lens',b);
 assert.ok(vitreous.x<posteriorLens.x,'Anterior hyaloid must remain behind the lens at extreme slider combinations.');
}

const left={...state,biometry:{...DEFAULT_BIOMETRY,side:'left'}};
for(const id of Object.keys(allAnchors)){const r=worldAnchor(id,state),l=worldAnchor(id,left);near(r.x,l.x);near(r.y,l.y);near(r.z,-l.z);}
assert.ok(worldAnchor('lacrimal-gland',state).z>0&&worldAnchor('lacrimal-sac',state).z<0,'Gland temporal, drainage medial.');
assert.ok(worldAnchor('lacrimal-gland',left).z<0&&worldAnchor('lacrimal-sac',left).z>0);
near(biometricPoint(new THREE.Vector3(.5,.2,0),'lens',DEFAULT_BIOMETRY).x,1-DEFAULT_BIOMETRY.chamberDepth/12-lensThickness(35)/24);
assert.equal(structures.filter(s=>structureVisible(state,s.id)).length,14);
assert.equal(structures.filter(s=>structureVisible({...state,context:'orbit'},s.id)).length,32);
let last=0;for(let i=0;i<7;i++){const n=peeledIds(i).length;assert.ok(n>=last);last=n;}
const multi={...state,context:'orbit',hidden:['lens'],peel:6,multiIsolated:['lens','retina'],view:'exploded'};
assert.deepEqual(structures.filter(s=>structureVisible(multi,s.id)).map(s=>s.id).sort(),['lens','retina']);
assert.equal(structureVisible({...multi,multiIsolated:[]},'retina'),false,'Exiting isolation restores dissection.');
const exploded={...state,view:'exploded',explosionGap:1.5},zero={...state,view:'exploded',explosionGap:0};
for(const id of Object.keys(allAnchors))near(worldAnchor(id,state).distanceTo(worldAnchor(id,zero)),0);
const connectors=buildConnectors(exploded);
const line=connectors.children.find(c=>c instanceof THREE.Line);assert.ok(line);
const lines=connectors.children.filter(c=>c instanceof THREE.Line);assert.equal(lines.length,13); // retina stays at its origin
disposeObject(connectors);
console.log('Laterality, context, multi-isolation, reversible peeling, and zero-gap explosion verified.');

function area(g){const p=g.getAttribute('position');let total=0;for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);total+=b.sub(a).cross(c.sub(a)).length()/2;}return total;}
const sphere=new THREE.Mesh(new THREE.SphereGeometry(1,96,64),new THREE.MeshStandardMaterial());
for(const normal of [new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(.3,.8,.4).normalize()]){
 const plane=new THREE.Plane(normal,-.31),cap=sectionGeometry(sphere,plane);assert.ok(cap);
 near(area(cap),Math.PI*(1-.31**2),.012);
 const p=cap.getAttribute('position');for(let i=0;i<p.count;i++)near(plane.distanceToPoint(new THREE.Vector3().fromBufferAttribute(p,i)),0,1e-6);
 cap.dispose();
}
assert.equal(sectionGeometry(sphere,new THREE.Plane(new THREE.Vector3(1,0,0),-2)),null);
const annulus=new THREE.Mesh(revolve([[.3,.4],[.3,.6],[-.3,.6],[-.3,.4],[.3,.4]]),new THREE.MeshStandardMaterial());
const ring=sectionGeometry(annulus,new THREE.Plane(new THREE.Vector3(1,0,0),.017));assert.ok(ring);assert.equal(ring.userData.holeCount,1);
near(area(ring),Math.PI*(.6**2-.4**2),.001);
const ray=new THREE.Raycaster(new THREE.Vector3(2,0,0),new THREE.Vector3(-1,0,0));
const ringMesh=new THREE.Mesh(ring,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));assert.equal(ray.intersectObject(ringMesh).length,0,'The central hole must not be filled by a cap.');
const eye=buildMacro(DEFAULT_BIOMETRY);positionParts(eye,{...state,context:'orbit'});
for(const settings of [DEFAULT_SECTION,{...DEFAULT_SECTION,azimuth:45,elevation:24,offset:1.2},{...DEFAULT_SECTION,azimuth:0,offset:8.4}]){
 const plane=sectionPlane(settings),start=performance.now(),caps=buildSectionCaps(eye.root,plane);
 assert.ok(caps.children.length>4,'Actual whole-eye cut must cap multiple tissues.');
 for(const m of caps.children){assert.ok(m.userData.id);assert.ok(area(m.geometry)>0);}
 console.log(`Closed section: ${caps.children.length} tissue surfaces (${Math.round(performance.now()-start)} ms), azimuth ${settings.azimuth}, elevation ${settings.elevation}.`);
 disposeObject(caps);
}
disposeObject(eye.root);disposeObject(sphere);disposeObject(annulus);disposeObject(ringMesh);
console.log('Free sections: oblique planes, hollow annuli, central holes, out-of-bounds slices, and real eye tissues verified.');
