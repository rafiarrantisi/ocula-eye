import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type { StructureId } from './types';

// Anatomical coordinate convention: +X anterior, +Y superior, +Z temporal.
// One model unit = approximately 12 mm. Geometry is a teaching schematic,
// not a segmented patient dataset. Tissue thickness and drainage are enlarged.
export const EYE = {lensX:.50,lensRadius:.39,lensHalfThickness:.17,irisX:.695,pupilRadius:.15,limbusX:.77,limbusRadius:.529};
export const anchors: Record<StructureId,[number,number,number]> = {
  sclera:[-.4,.84,-.28],choroid:[-.7,.60,0],retina:[-.82,.40,.04],cornea:[1.02,.12,.1],
  iris:[.698,.35,.16],lens:[.52,.22,.3],ciliary:[.50,-.54,.08],zonules:[.52,-.41,.09],
  vitreous:[-.15,-.30,.06],anterior:[.88,.25,.06],posterior:[.65,-.28,.18],
  trabecular:[.772,-.49,.17],schlemm:[.78,-.54,.1],optic:[-1.30,.12,-.22],
};
export const explosion: Record<StructureId,number>={sclera:-.56,choroid:-.3,retina:0,vitreous:.25,optic:-.56,ciliary:.64,zonules:.88,lens:1.14,posterior:1.36,iris:1.58,anterior:1.82,cornea:2.03,trabecular:1.58,schlemm:1.58};

export function revolve(profile:[number,number][],start=0,arc=Math.PI*2,segments=112){
  const pos:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let i=0;i<profile.length;i++)for(let j=0;j<=segments;j++){
    const a=start+arc*j/segments; const [x,r]=profile[i];
    pos.push(x,r*Math.cos(a),r*Math.sin(a));uv.push(j/segments,i/(profile.length-1));
    if(i<profile.length-1&&j<segments){const k=i*(segments+1)+j;indices.push(k,k+1,k+segments+1,k+1,k+segments+2,k+segments+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

function shell(radius:number,thickness:number,endX:number,cut:boolean){
  const p:[number,number][]=[]; const theta=Math.acos((endX+.07)/radius);
  for(let i=0;i<=88;i++){const a=Math.PI-(Math.PI-theta)*i/88;p.push([-.07+radius*Math.cos(a),radius*.98*Math.sin(a)]);}
  for(let i=88;i>=0;i--){const a=Math.PI-(Math.PI-theta)*i/88;p.push([-.07+(radius-thickness)*Math.cos(a),(radius-thickness)*.98*Math.sin(a)]);}
  p.push(p[0]);return revolve(p,cut?Math.PI:0,cut?Math.PI:Math.PI*2);
}

export function disposeObject(object:THREE.Object3D){object.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line||o instanceof THREE.Points){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{m.dispose();});}});}

export function buildEye(cut:boolean){
  const root=new THREE.Group();
  const parts={} as Record<StructureId,THREE.Group>;
  (Object.keys(anchors) as StructureId[]).forEach(id=>{const group=new THREE.Group();group.userData.id=id;parts[id]=group;root.add(group);});
  function material(color:string,opacity=1,roughness=.52){const m=new THREE.MeshStandardMaterial({color,roughness,metalness:.025,transparent:opacity<1,opacity,side:THREE.DoubleSide,depthWrite:opacity>.85});m.userData.baseOpacity=opacity;return m;}
  function add(id:StructureId,g:THREE.BufferGeometry,color:string,opacity=1,roughness=.52){const mesh=new THREE.Mesh(g,material(color,opacity,roughness));mesh.userData.id=id;parts[id].add(mesh);return mesh;}
  function tube(id:StructureId,pts:THREE.Vector3[],r:number,color:string,opacity=1){return add(id,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),Math.max(12,pts.length*7),r,6,false),color,opacity);}
  const sclera=add('sclera',shell(1,.029,.77,cut),'#d9d8cd',1,.74);
  add('choroid',shell(.968,.023,.56,cut),'#915043',1,.7);
  add('retina',shell(.941,.014,.41,cut),'#e5916e',1,.63);
  // Thin cut-edge outlines preserve the order of the three coats.
  if(cut){for(const [id,r,col] of [['sclera',1,'#ebe7da'],['choroid',.968,'#c36f54'],['retina',.941,'#ffb28a']] as const){
    const end=id==='sclera'?.77:id==='choroid'?.56:.41;
    for(const sign of [-1,1]){const pts=[];for(let i=0;i<=80;i++){const a=Math.PI-(Math.PI-Math.acos((end+.07)/r))*i/80;pts.push(new THREE.Vector3(-.07+r*Math.cos(a),sign*r*.98*Math.sin(a),.002));}tube(id,pts,.0045,col);}
  }}
  const cp:[number,number][]=[];
  const theta=Math.acos((.77-.35)/.675);
  for(let i=0;i<=40;i++){const a=theta*i/40;cp.push([.35+.675*Math.cos(a),.675*Math.sin(a)]);}
  // Keep a clear corneal window, with an edge ring at the limbus.
  add('cornea',revolve(cp,cut?Math.PI:0,cut?Math.PI:2*Math.PI),'#a6e5ea',.23,.12);
  const rimGeometry=new THREE.TorusGeometry(.529,.0055,8,128,cut?Math.PI:Math.PI*2);if(cut)rimGeometry.rotateZ(-Math.PI/2);
  const rim=add('cornea',rimGeometry,'#badfe0',.8,.25);rim.rotation.y=Math.PI/2;rim.position.x=.77;
  const irisProfile:[number,number][]=[[.704,.15],[.700,.24],[.69,.36],[.685,.50],[.676,.50],[.684,.15],[.704,.15]];
  add('iris',revolve(irisProfile,cut?Math.PI*.18:0,cut?Math.PI*1.82:Math.PI*2),'#537f72',1,.68);
  for(let i=0;i<224;i++){
    const a=i/224*Math.PI*2;if(cut&&a<Math.PI*.18)continue;
    const inner=.153+.018*(.5+.5*Math.sin(i*2.34));const outer=.49-.023*(.5+.5*Math.sin(i*5.72));
    const pts=[];for(let j=0;j<=7;j++){const r=inner+(outer-inner)*j/7;const aa=a+.013*Math.sin(j*2+i);pts.push(new THREE.Vector3(.706-.025*(r/.50),r*Math.cos(aa),r*Math.sin(aa)));}
    tube('iris',pts,.0016,i%3===0?'#9eae87':i%3===1?'#354e48':'#729782');
  }
  for(const r of [.16,.26,.48]){const ring=add('iris',new THREE.TorusGeometry(r,.003,6,100),'#b6a577',.64);ring.rotation.y=Math.PI/2;ring.position.x=.703-.02*r;}
  // Profile runs anterior pole → equator → posterior pole; no negative radii.
  const lp:[number,number][]=[];for(let i=0;i<=64;i++){const a=Math.PI*i/64;lp.push([.50+.17*Math.cos(a),.39*Math.sin(a)]);}
  const lens=add('lens',revolve(lp),'#e9d7aa',.42,.16);
  const nucleus=add('lens',new THREE.SphereGeometry(1,56,32),'#f4e2b7',.18,.22);nucleus.scale.set(.105,.245,.245);nucleus.position.x=.505;nucleus.userData.cataract='nuclear';
  for(let i=0;i<12;i++){const a=.18+Math.PI*.83*i/11;const r=.39*Math.sin(a);const ring=add('lens',new THREE.TorusGeometry(r,.001,4,96),'#f2dba4',.23);ring.rotation.y=Math.PI/2;ring.position.x=.50+.17*Math.cos(a);}
  const cortical:THREE.Mesh[]=[];
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;const g=new THREE.ConeGeometry(.027,.20,7);g.rotateZ(Math.PI);const m=add('lens',g,'#f5efdd',0);m.position.set(.55,.285*Math.cos(a),.285*Math.sin(a));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(0,Math.cos(a),Math.sin(a)));m.userData.cataract='cortical';cortical.push(m);}
  const plaque=add('lens',new THREE.SphereGeometry(1,40,24),'#e8decb',0);plaque.position.x=.346;plaque.scale.set(.009,.095,.095);plaque.userData.cataract='psc';
  // Pars plicata ridges and ciliary muscle, enlarged only for legibility.
  add('ciliary',revolve([[.30,.857],[.40,.817],[.60,.683],[.70,.566],[.672,.493],[.61,.45],[.48,.53],[.37,.74],[.30,.857]],cut?Math.PI:0,cut?Math.PI:Math.PI*2),'#b07278');
  for(let i=0;i<72;i++){const a=i/72*Math.PI*2;if(cut&&a<Math.PI)continue;const m=add('ciliary',new THREE.SphereGeometry(1,12,8),i%2?'#c89190':'#ab6b72');m.scale.set(.115,.020,.035);m.position.set(.51,.535*Math.cos(a),.535*Math.sin(a));m.rotation.x=a;}
  for(let i=0;i<72;i++){const a=i/72*Math.PI*2;if(cut&&a<Math.PI*.22)continue;for(const d of [-.042,.035]){tube('zonules',[new THREE.Vector3(.51,.49*Math.cos(a),.49*Math.sin(a)),new THREE.Vector3(.5+d,.385*Math.cos(a+.01),.385*Math.sin(a+.01))],.0015,'#dfd3ad',.86);}}
  const vp:[number,number][]=[];for(let i=0;i<=60;i++){const a=Math.PI-(Math.PI-1.02)*i/60;vp.push([-.07+.919*Math.cos(a),.9*Math.sin(a)]);}vp.push([.34,.45],[.32,.24],[.325,0]);
  add('vitreous',revolve(vp,cut?Math.PI:0,cut?Math.PI:Math.PI*2),'#a6b9ce',.075,.08);
  const ap:[number,number][]=[[.707,.15],[.701,.35],[.695,.49],[.77,.50]];for(let i=0;i<=36;i++){const a=.86*(1-i/36);ap.push([.35+.65*Math.cos(a),.65*Math.sin(a)]);}ap.push([.711,0],[.707,.15]);
  add('anterior',revolve(ap,cut?Math.PI:0,cut?Math.PI:Math.PI*2),'#74d6df',.065,.25);
  add('posterior',revolve([[.683,.16],[.678,.49],[.60,.47],[.55,.385],[.638,.26],[.662,.16],[.683,.16]],cut?Math.PI:0,cut?Math.PI:Math.PI*2),'#b7a5f4',.14);
  for(const [id,r,x,th,col] of [['trabecular',.511,.759,.010,'#69cfa8'],['schlemm',.548,.772,.011,'#64afc1']] as const){
    const torusGeometry=new THREE.TorusGeometry(r,th,10,128,cut?Math.PI:2*Math.PI);if(cut)torusGeometry.rotateZ(-Math.PI/2);
    const torus=add(id,torusGeometry,col);torus.rotation.y=Math.PI/2;torus.position.x=x;
  }
  for(let i=0;i<14;i++){const a=Math.PI+i/13*Math.PI;tube('schlemm',[new THREE.Vector3(.772,.55*Math.cos(a),.55*Math.sin(a)),new THREE.Vector3(.71,.60*Math.cos(a),.60*Math.sin(a)),new THREE.Vector3(.60,.66*Math.cos(a+.05),.66*Math.sin(a+.05))],.004,'#669ca6');}
  tube('optic',[new THREE.Vector3(-.94,.10,-.22),new THREE.Vector3(-1.12,.13,-.26),new THREE.Vector3(-1.48,.15,-.30),new THREE.Vector3(-1.60,.12,-.34)],.105,'#ddbd99');
  tube('optic',[new THREE.Vector3(-1.1,.14,-.26),new THREE.Vector3(-1.50,.16,-.3)],.066,'#f3d5b0');
  // Retinal vessels lie on the retinal inner surface. Branches are illustrative.
  function retinalPoint(x:number,a:number){const r=.922*.98*Math.sqrt(Math.max(0,1-((x+.07)/.922)**2));return new THREE.Vector3(x,r*Math.cos(a),r*Math.sin(a));}
  for(let k=0;k<9;k++){
    const a=Math.PI+(k+.5)/9*Math.PI;const pts=[];for(let j=0;j<=18;j++){const x=-.945+j/18*(1.19);pts.push(retinalPoint(x,a+.075*Math.sin(j*.32+k)));}tube('retina',pts,k%2?.004:.0055,k%2?'#a64239':'#913b32');
    for(let b=0;b<3;b++){const pts2=[];for(let j=0;j<=9;j++){const x=-.7+b*.24+j/9*.28;pts2.push(retinalPoint(x,a+(b%2?1:-1)*j/9*.14));}tube('retina',pts2,.0022,'#ae4a3e');}
  }
  // Small physiological landmarks: disk and macula, offset from one another.
  const disc=add('retina',new THREE.SphereGeometry(1,24,16),'#f6c99d');disc.scale.set(.01,.072,.063);disc.position.set(-.946,.10,-.23);
  const macula=add('retina',new THREE.SphereGeometry(1,24,16),'#a95435');macula.scale.set(.011,.048,.048);macula.position.set(-.952,-.06,-.13);
  // Batch compatible meshes within each selectable structure. Fine iris,
  // zonular, and retinal detail should not require hundreds of draw calls.
  for(const id of Object.keys(parts) as StructureId[]){
    if(id==='lens')continue;
    const batches=new Map<string,THREE.Mesh[]>();
    for(const child of parts[id].children){if(!(child instanceof THREE.Mesh))continue;const m=child.material as THREE.MeshStandardMaterial;const key=[m.color.getHex(),m.opacity,m.roughness].join('/');const items=batches.get(key)??[];items.push(child);batches.set(key,items);}
    for(const meshes of batches.values()){
      if(meshes.length<2)continue;
      const geometries=meshes.map(m=>{m.updateMatrix();return m.geometry.clone().applyMatrix4(m.matrix);});
      const merged=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());if(!merged)continue;
      const batch=new THREE.Mesh(merged,meshes[0].material);batch.userData.id=id;
      meshes.forEach((m,i)=>{parts[id].remove(m);m.geometry.dispose();if(i>0)(m.material as THREE.Material).dispose();});parts[id].add(batch);
    }
  }
  return {root,parts,lens,nucleus,cortical,plaque,sclera};
}

export type FlowPath = {curve:THREE.CatmullRomCurve3;type:'shared'|'trabecular'|'uveoscleral';color:string};
export function flowPaths():FlowPath[]{
  const paths:FlowPath[]=[];
  for(const a of [.55,2.58,1.60]){
    const p=(x:number,r:number)=>new THREE.Vector3(x,r*Math.cos(a),r*Math.sin(a));
    const shared=[p(.615,.454),p(.657,.35),p(.672,.23),p(.675,.126),p(.715,.12),p(.79,.13),p(.895,.255),p(.833,.406),p(.756,.499)];
    paths.push({curve:new THREE.CatmullRomCurve3(shared),type:'shared',color:'#84d6ef'});
    paths.push({curve:new THREE.CatmullRomCurve3([p(.756,.499),p(.769,.519),p(.778,.550),p(.719,.60),p(.60,.674)]),type:'trabecular',color:'#79edbd'});
    paths.push({curve:new THREE.CatmullRomCurve3([p(.756,.499),p(.64,.53),p(.46,.64),p(.23,.902),p(-.02,1.00)]),type:'uveoscleral',color:'#d7aff8'});
  }
  return paths;
}

