import {orbitAnchors} from '../components/atlas/orbitGeometry.ts';
import {isOrbital} from '../components/atlas/orbitContent.ts';
import assert from 'node:assert/strict';
import {buildEye,disposeObject,anchors,flowPaths,EYE,buildCorneaSection,buildAngleWedge,buildLensSection,buildIrisCiliarySection,buildRetinaSection,buildONHSection,convectionLoops,microAnchors} from '../components/atlas/geometry.ts';
import {structures,sources,illustrativeIOP,corneaLayers,angleStructures,lensLayers,irisCiliaryStructures,retinaLayers,onhStructures,aqueousBalance,applyLighting,straylightGain} from '../components/atlas/content.ts';
import * as THREE from 'three';

assert.equal(new Set(structures.map(s=>s.id)).size,32);
for(const s of structures){assert.ok(anchors[s.id]||orbitAnchors[s.id]);s.sources.forEach(id=>assert.ok(sources.some(r=>r.id===id)));}
assert.ok(EYE.lensX+EYE.lensHalfThickness<EYE.irisX,'Lens anterior pole stays posterior to iris plane.');
assert.ok(EYE.pupilRadius<EYE.lensRadius&&EYE.lensRadius<EYE.limbusRadius);
assert.equal(illustrativeIOP(2.5,.25,.5,9),17);
assert.ok(illustrativeIOP(2.5,.1,.5)>illustrativeIOP(2.5,.3,.5),'Lower facility must increase pressure.');
assert.ok(illustrativeIOP(2.5,.3,.8)<illustrativeIOP(2.5,.3,.5),'Greater unconventional outflow must lower pressure.');
for(const cut of [false,true]){
  const eye=buildEye(cut);let count=0,triangles=0;
  assert.deepEqual(Object.keys(eye.parts).sort(),structures.filter(s=>!isOrbital(s.id)).map(s=>s.id).sort());
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
// Fase 1: tampilan detail kornea + sudut. Skala skematik, jadi yang dicek adalah
// urutan anterior→posterior / apeks→basis, kelengkapan inventory, dan buffer valid.
assert.deepEqual(corneaLayers.map(l=>l.id),['epithelium','bowman','stroma','descemet','endothelium']);
assert.deepEqual(angleStructures.map(l=>l.id),['schwalbe','uveal-tm','corneoscleral-tm','jct','schlemm-detail','collector','spur']);
// Fase 2: lensa + iris-siliaris. Builder lensa diparametri akomodasi 0 (jauh) → 1 (dekat).
assert.deepEqual(lensLayers.map(l=>l.id),['capsule','lens-epithelium','cortex','nucleus','lens-fibers','lens-suture','zonule-attach']);
assert.deepEqual(irisCiliaryStructures.map(l=>l.id),['sphincter','dilator','ciliary-muscle','pars-plicata','ciliary-process','pars-plana','pe','npe']);
// Fase 3: retina + kepala saraf optik; iris-siliaris kini diparametri akomodasi.
assert.deepEqual(retinaLayers.map(l=>l.id),['ilm','nfl','gcl','ipl','inl','opl','onl','pr','rpe','bruch','fovea','ora-serrata']);
assert.deepEqual(onhStructures.map(l=>l.id),['disc','cup','rim','lamina','rnfl','vessels','bmo']);
for(const l of [...corneaLayers,...angleStructures,...lensLayers,...irisCiliaryStructures,...retinaLayers,...onhStructures]){
  assert.ok(microAnchors[l.id],`Missing micro anchor for ${l.id}.`);
  l.sources.forEach(id=>assert.ok(sources.some(r=>r.id===id),`Unknown source ${id} for ${l.id}.`));
}
function checkDetail(detail,label){
  let count=0;
  detail.root.traverse(o=>{if(o instanceof THREE.Mesh){
    if(!o.userData.detailSub) return; // konteks skematik non-selektif
    count++;const p=o.geometry.getAttribute('position');assert.ok(p.count>0);
    for(const n of p.array)assert.ok(Number.isFinite(n),`Nonfinite vertex in ${label}.`);
  }});
  assert.ok(count>0&&count<100,`Expected compact detail geometry for ${label}, got ${count}.`);
  return count;
}
const cor=buildCorneaSection();
const corneaCount=checkDetail(cor,'cornea');
const coIds=['epithelium','bowman','stroma','descemet','endothelium'];
assert.deepEqual(Object.keys(cor.slabX),coIds);
for(let i=0;i<coIds.length-1;i++)assert.ok(cor.slabX[coIds[i]]>cor.slabX[coIds[i+1]],`Cornea must order ${coIds[i]} anterior to ${coIds[i+1]}.`);
assert.equal(cor.slabT.stroma,Math.max(...coIds.map(id=>cor.slabT[id])),'Stroma must remain the thickest layer.');
disposeObject(cor.root);
const angleCount=checkDetail(buildAngleWedge(),'angle');
const anglePos={};
buildAngleWedge().root.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.detailSub){o.geometry.computeBoundingBox();anglePos[o.userData.detailSub]=new THREE.Box3().setFromObject(o);}});
assert.ok(anglePos.schwalbe.getCenter(new THREE.Vector3()).x>anglePos.spur.getCenter(new THREE.Vector3()).x,'Schwalbe (apex) must sit anterior to spur (base).');
assert.ok(anglePos['schlemm-detail'].getCenter(new THREE.Vector3()).y>anglePos.jct.getCenter(new THREE.Vector3()).y,'Schlemm must sit external to JCT.');
console.log(`Detail views: cornea ${corneaCount} meshes ordered anterior→posterior; angle ${angleCount} meshes apex→base.`);
const lensFar=buildLensSection(0),lensNear=buildLensSection(1);
const lensCount=checkDetail(lensFar,'lens');checkDetail(lensNear,'lens-rebuild');
assert.ok(lensNear.halfT>lensFar.halfT,'Accommodation must thicken the lens (AP).');
assert.ok(lensNear.eqR<lensFar.eqR,'Accommodation must narrow the equator.');
function nested(outer,inner,label){
  const a=new THREE.Box3().setFromObject(outer),b=new THREE.Box3().setFromObject(inner);
  assert.ok(a.containsBox(b),`${label} must nest inside its outer shell.`);
}
nested(lensFar.parts.capsule,lensFar.parts.cortex,'Cortex');
nested(lensFar.parts.cortex,lensFar.parts.nucleus,'Nucleus');
assert.ok(lensFar.parts['zonule-attach'].children.length>=9,'Zonule must expose 3 tines × 4 azimuths.');
const irisCount=checkDetail(buildIrisCiliarySection(),'iris-ciliary');
const irisPos={};
buildIrisCiliarySection().root.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.detailSub){irisPos[o.userData.detailSub]=new THREE.Box3().setFromObject(o);}});
const mid=id=>irisPos[id].getCenter(new THREE.Vector3());
assert.ok(mid('sphincter').x>mid('dilator').x,'Sphincter must sit slightly anterior to dilator.');
assert.ok(mid('pars-plana').x<mid('pars-plicata').x,'Pars plana must sit posterior to pars plicata.');
assert.ok(mid('pe').y>mid('npe').y,'Pigmented epithelium must sit external to nonpigmented.');
for(const d of [lensFar,lensNear])disposeObject(d.root);
console.log(`Detail views: lens ${lensCount} meshes nested capsule→cortex→nucleus with working accommodation morph; iris-ciliary ${irisCount} meshes ordered.`);
// Otot siliaris harus bergeser anterior (+X) dan sentripetal (−Y atas) saat akomodasi.
const cilRest=buildIrisCiliarySection(0),cilAcc=buildIrisCiliarySection(1);
const cilCount=checkDetail(cilRest,'iris-ciliary');
const centerOf=obj=>new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
const restM=centerOf(cilRest.parts['ciliary-muscle']),accM=centerOf(cilAcc.parts['ciliary-muscle']);
assert.ok(accM.x>restM.x,'Ciliary muscle must shift anterior with accommodation.');
assert.ok(accM.y<restM.y,'Ciliary muscle must shift centripetal with accommodation.');
disposeObject(cilRest.root);disposeObject(cilAcc.root);
// Retina: urutan vitreal(+X)→skleral(−X) mengikuti koordinat slab builder.
const retina=buildRetinaSection();
const retinaCount=checkDetail(retina,'retina');
const order=['ilm','nfl','gcl','ipl','inl','opl','onl','pr','rpe','bruch'];
for(let i=0;i<order.length-1;i++)assert.ok(retina.slabX[order[i]]>retina.slabX[order[i+1]],`Retina must order ${order[i]} anterior to ${order[i+1]}.`);
disposeObject(retina.root);
// ONH: lamina posterior dari cup; cup di dalam radius diskus; trunk menembus cup.
const onh=buildONHSection();
const onhCount=checkDetail(onh,'onh');
const boxOf=id=>new THREE.Box3().setFromObject(onh.parts[id]);
const cupC=boxOf('cup').getCenter(new THREE.Vector3()),discB=boxOf('disc'),lamC=boxOf('lamina').getCenter(new THREE.Vector3());
assert.ok(lamC.x<cupC.x,'Lamina must sit posterior to the cup.');
assert.ok(boxOf('cup').max.y-boxOf('cup').min.y<discB.max.y-discB.min.y,'Cup must fit inside disc diameter.');
assert.ok(boxOf('vessels').intersectsBox(boxOf('cup')),'Central vessels must pass through the cup.');
assert.ok(onh.parts.rnfl.children.length>=18,'RNFL must show spokes plus diving bundles.');
disposeObject(onh.root);
console.log(`Detail views: retina ${retinaCount} meshes ordered vitreal→scleral with fovea + ora; onh ${onhCount} meshes with posterior lamina; ciliary muscle animates anterior-centripetal (${cilCount} meshes).`);
// Fisiologi: neraca Goldmann, faktor malam, straylight per tipe, loop konveksi.
const balN=aqueousBalance(2.5,.25,.5,9);
assert.equal(balN.iop,17);assert.equal(balN.qconv,2.0);assert.equal(balN.quv,.5);assert.equal(balN.shareConv,2/2.5);
assert.ok(aqueousBalance(2.5,.1,.5).iop>aqueousBalance(2.5,.3,.5).iop,'Lower facility must raise IOP.');
assert.ok(aqueousBalance(2.5,.3,.8).iop<aqueousBalance(2.5,.3,.5).iop,'Greater U must lower IOP.');
const nightLit=applyLighting(2.5,.5,'night');
assert.ok(nightLit.production<2.5&&nightLit.uveoscleral<.5,'Night must lower production and uveoscleral.');
assert.deepEqual(applyLighting(2.5,.5,'day'),{production:2.5,uveoscleral:.5});
assert.equal(straylightGain('nuclear',0),0);
assert.ok(straylightGain('psc',100)>straylightGain('nuclear',100)&&straylightGain('nuclear',100)>straylightGain('cortical',100),'PSC > nuclear > cortical straylight.');
assert.ok(straylightGain('cortical',50)<straylightGain('cortical',100),'Straylight must grow with severity.');
for(const loop of convectionLoops()){
  assert.ok(loop.closed,'Convection loop must close.');
  assert.ok(loop.getLength()>.5,'Convection loop must span the chamber.');
  for(const v of loop.getPoints(60)){
    assert.ok(v.x>.65&&v.x<1.0&&Math.hypot(v.y,v.z)<.55,'Convection must stay inside the anterior chamber.');
  }
}
console.log('Physiology: Goldmann balance, nocturnal factors, type-wise straylight, convection loops.');
console.log('Content links, anatomical ordering and pressure response checks passed.');
