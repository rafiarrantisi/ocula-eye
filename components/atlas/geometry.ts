import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type { GlobeStructureId as StructureId } from './types';

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
  function tube(id:StructureId,pts:THREE.Vector3[],r:number,color:string,opacity=1){
    const segments=Math.max(12,pts.length*7),sides=6,curve=new THREE.CatmullRomCurve3(pts);
    const g=new THREE.TubeGeometry(curve,segments,r,sides,false);
    const pos=Array.from(g.getAttribute('position').array),uv=Array.from(g.getAttribute('uv').array),idx=Array.from(g.getIndex()!.array);
    for(const end of [0,segments]){const center=pos.length/3;pos.push(...curve.getPointAt(end/segments).toArray());uv.push(.5,.5);for(let j=0;j<sides;j++){const a=end*(sides+1)+j,b=a+1;idx.push(...(end===0?[center,b,a]:[center,a,b]));}}
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return add(id,g,color,opacity);
  }
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
  // Closed corneal volume; endothelial apex is x=1.000.
  for(let i=40;i>=0;i--){const a=theta*i/40;cp.push([.35+.650*Math.cos(a),.650*Math.sin(a)]);}cp.push(cp[0]);
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

// ---------------------------------------------------------------------------
// Micro detail views (fase 1: kornea + sudut). Skala skematik yang diperbesar,
// +X anterior, +Y radial/eksternal, +Z sirkumferensial. Bukan mikrometer asli.
// ---------------------------------------------------------------------------

export const microAnchors: Record<string,[number,number,number]> = {
  epithelium:[.59,.30,.10],bowman:[.505,.34,.10],stroma:[.03,.38,.10],
  descemet:[-.46,.30,.10],endothelium:[-.53,.26,.10],
  schwalbe:[.80,.55,.10],'uveal-tm':[.55,.20,.10],'corneoscleral-tm':[.48,.30,.10],
  jct:[.42,.34,.10],'schlemm-detail':[.38,.48,.10],collector:[.30,.72,.10],spur:[.10,.10,.10],
  capsule:[.0,.62,.10],'lens-epithelium':[.42,.25,.10],cortex:[.10,-.60,.10],
  nucleus:[-.02,.05,.30],'lens-fibers':[.05,.50,.25],'lens-suture':[.62,.0,.15],'zonule-attach':[.0,.85,.10],
  sphincter:[.57,.20,.10],dilator:[.53,.42,.10],'ciliary-muscle':[.10,.72,.10],
  'pars-plicata':[.20,.62,.15],'ciliary-process':[.15,.58,.20],'pars-plana':[-.20,.66,.10],
  pe:[.05,.60,.25],npe:[.05,.56,.30],
  ilm:[.60,0,-.45],nfl:[.51,.30,-.45],gcl:[.39,-.30,-.45],ipl:[.28,.30,-.45],
  inl:[.15,-.30,-.45],opl:[.04,.30,-.45],onl:[-.10,-.30,-.45],pr:[-.28,.30,-.45],
  rpe:[-.395,-.30,-.45],bruch:[-.45,.30,-.45],fovea:[.05,0,.62],'ora-serrata':[.05,-1.15,-.45],
  disc:[.10,.42,.10],cup:[.10,.10,.15],rim:[.10,.32,.20],lamina:[-.22,.10,.20],
  rnfl:[.12,.50,.20],vessels:[-.10,.15,.25],bmo:[.05,.38,.15],
};

function microMaterial(color:string,opacity=1,roughness=.55){
  const m=new THREE.MeshStandardMaterial({color,roughness,metalness:.02,transparent:opacity<1,opacity,side:THREE.DoubleSide,depthWrite:opacity>.85});
  m.userData.baseOpacity=opacity;return m;
}

// Penampang kornea: 5 cangkang silindris konsentris anterior(+X) → posterior(−X),
// melengkung seperti kubah kornea. Stroma paling tebal; ketebalan relatif
// diperjelas (bukan µm asli). Busur di bidang X-Y, diekstrusi sepanjang Z.
export function buildCorneaSection(){
  const root=new THREE.Group();
  const parts={} as Record<string,THREE.Group>;
  const ids=['epithelium','bowman','stroma','descemet','endothelium'];
  ids.forEach(id=>{const g=new THREE.Group();g.userData.detailSub=id;parts[id]=g;root.add(g);});
  const H=.42,DEPTH=1.3,CX=.65-3.0;
  function shell(r:number,depth=DEPTH,half=H,seg=56){
    const g=new THREE.CylinderGeometry(r,r,depth,seg,1,true,Math.PI/2-half,half*2);
    g.rotateX(Math.PI/2);return g;
  }
  const at=(rr:number,u:number,z=0)=>new THREE.Vector3(CX+rr*Math.cos(u),rr*Math.sin(u),z);
  const outward=(u:number)=>new THREE.Vector3(Math.cos(u),Math.sin(u),0);
  // [id, thickness, color]
  const layers:[string,number,string][]=[
    ['epithelium',.10,'#f2c9a0'],['bowman',.045,'#e8b4a0'],['stroma',.70,'#a9cfe0'],
    ['descemet',.07,'#9db8e8'],['endothelium',.05,'#8fd0c2'],
  ];
  const GAP=.02;let r=3.0;const slabX:Record<string,number>={},slabT:Record<string,number>={};
  for(const [id,t,col] of layers){
    const mesh=new THREE.Mesh(shell(r),microMaterial(col,.96));
    mesh.position.set(CX,0,0);mesh.userData.detailSub=id;parts[id].add(mesh);
    slabX[id]=CX+r;slabT[id]=t;r-=t+GAP;
  }
  // Lamela stromal: 4 cangkang dalam samar.
  const rStromaOut=slabX.stroma-CX;
  for(let k=1;k<=4;k++){
    const lam=new THREE.Mesh(shell(rStromaOut-.13*k,DEPTH-.1),microMaterial('#cfe4f2',.30));
    lam.position.set(CX,0,0);lam.userData.detailSub='stroma';parts.stroma.add(lam);
  }
  // Sel epitel: 3×3 di permukaan luar, menghadap radial.
  const rEpi=slabX.epithelium-CX-.015;
  for(const u of [.14,.22,.30])for(const z of [-.35,0,.35]){
    const cell=new THREE.Mesh(new THREE.BoxGeometry(.028,.05,.05),microMaterial('#c98d5e'));
    cell.position.copy(at(rEpi,u,z));cell.lookAt(at(rEpi+.5,u,z));
    cell.userData.detailSub='epithelium';parts.epithelium.add(cell);
  }
  // Sel endotel heksagonal di permukaan dalam.
  const rEnd=slabX.endothelium-CX-.025;
  for(let i=0;i<7;i++){
    const z=-.45+i*.15;
    const cell=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.02,6),microMaterial('#5aa894'));
    cell.position.copy(at(rEnd,.22,z));
    cell.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),outward(.22));
    cell.userData.detailSub='endothelium';parts.endothelium.add(cell);
  }
  return {root,parts,slabX,slabT};
}

// Irisan sudut meridional: apeks Schwalbe (anterior) → basis spur (posterior).
// TM di antara keduanya, Schlemm di luar JCT, kolektor radial ke sklera.
export function buildAngleWedge(){
  const root=new THREE.Group();
  const parts={} as Record<string,THREE.Group>;
  const ids=['schwalbe','uveal-tm','corneoscleral-tm','jct','schlemm-detail','collector','spur'];
  ids.forEach(id=>{const g=new THREE.Group();g.userData.detailSub=id;parts[id]=g;root.add(g);});
  function add(id:string,g:THREE.BufferGeometry,color:string,opacity=1){
    const mesh=new THREE.Mesh(g,microMaterial(color,opacity));
    mesh.userData.detailSub=id;parts[id].add(mesh);return mesh;
  }
  function tube(id:string,pts:THREE.Vector3[],r:number,color:string,opacity=1){
    const mesh=new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),Math.max(12,pts.length*7),r,6,false),
      microMaterial(color,opacity),
    );
    mesh.userData.detailSub=id;parts[id].add(mesh);return mesh;
  }
  // Konteks skematik (non-selektif): tepi kornea, akar iris, otot siliaris, sklera luar.
  const ctx=new THREE.Group();ctx.userData.detailSub='';root.add(ctx);
  function context(g:THREE.BufferGeometry,color:string,pos:[number,number,number],opacity=1){
    const m=new THREE.Mesh(g,microMaterial(color,opacity));m.position.set(...pos);ctx.add(m);return m;
  }
  context(new THREE.BoxGeometry(.30,.10,.9),'#a6e5ea',[.95,.52,0],.5);          // tepi kornea
  context(new THREE.BoxGeometry(.34,.16,.9),'#d9d2bd',[.22,.86,0]);            // dinding sklera luar
  context(new THREE.BoxGeometry(.30,.10,.9),'#537f72',[.02,-.30,0]);           // akar iris
  tube('spur',[new THREE.Vector3(.10,-.02,0),new THREE.Vector3(-.15,-.10,0),new THREE.Vector3(-.38,-.16,0)],.045,'#8a7a5a');
  // Schwalbe: penanda apeks.
  add('schwalbe',new THREE.SphereGeometry(.045,16,12),'#eef2f7').position.set(.80,.42,0);
  // TM uveal: 3 tali sejajar (pori besar → tali kasar).
  for(const dz of [-.10,0,.10]){
    tube('uveal-tm',[new THREE.Vector3(.72,.36,dz),new THREE.Vector3(.52,.24,dz),new THREE.Vector3(.30,.12,dz)],.022,'#7fd6ae');
  }
  // TM korneoskleral: 4 lamela pipih sejajar.
  for(let i=0;i<4;i++){
    const m=add('corneoscleral-tm',new THREE.BoxGeometry(.52,.018,.80),'#5ecfa4');
    m.position.set(.50,.27+i*.028,0);m.rotation.z=-.42;
  }
  // JCT: slab tipis tepat di dalam Schlemm.
  const jct=add('jct',new THREE.BoxGeometry(.46,.05,.80),'#4fc39a');
  jct.position.set(.44,.335,0);jct.rotation.z=-.42;
  // Schlemm: silinder sepanjang Z (sirkumferensial) di luar JCT.
  const sc=add('schlemm-detail',new THREE.CylinderGeometry(.085,.085,.80,20),'#5ab6cf');
  sc.rotation.x=Math.PI/2;sc.position.set(.36,.44,0);
  // Kolektor: 3 saluran radial Schlemm → sklera.
  for(const dz of [-.22,0,.22]){
    tube('collector',[new THREE.Vector3(.36,.52,dz),new THREE.Vector3(.30,.66,dz),new THREE.Vector3(.26,.80,dz)],.028,'#669ca6');
  }
  // Spur: blok jangkar di basis.
  add('spur',new THREE.BoxGeometry(.24,.12,.90),'#d9d2bd').position.set(.10,-.02,0);
  return {root,parts};
}

// ---------------------------------------------------------------------------
// Fase 2: lensa + iris-siliaris. Konvensi lokal sama (+X anterior).
// buildLensSection(acc01): 0 = jauh (zonula tegang, pipih), 1 = dekat
// (zonula kendor, membulat). Ujung zonula selalu dihitung dari ekuator hasil
// morph sehingga perlekatan tidak pernah lepas secara visual.
// ---------------------------------------------------------------------------

export function buildLensSection(acc01=0){
  const a=Math.min(1,Math.max(0,acc01));
  const halfT=.30*(1+.28*a);
  const eqR=.55*(1-.13*a);
  const root=new THREE.Group();
  const parts={} as Record<string,THREE.Group>;
  const ids=['capsule','lens-epithelium','cortex','nucleus','lens-fibers','lens-suture','zonule-attach'];
  ids.forEach(id=>{const g=new THREE.Group();g.userData.detailSub=id;parts[id]=g;root.add(g);});
  function add(id:string,g:THREE.BufferGeometry,color:string,opacity=1){
    const mesh=new THREE.Mesh(g,microMaterial(color,opacity));
    mesh.userData.detailSub=id;parts[id].add(mesh);return mesh;
  }
  function tube(id:string,pts:THREE.Vector3[],r:number,color:string,opacity=1){
    const mesh=new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),Math.max(12,pts.length*7),r,6,false),
      microMaterial(color,opacity),
    );
    mesh.userData.detailSub=id;parts[id].add(mesh);return mesh;
  }
  // Profil bikonveks: kutub anterior → ekuator → kutub posterior.
  function lensProfile(scaleR:number,scaleX:number):[number,number][]{
    const p:[number,number][]=[];
    for(let i=0;i<=48;i++){const t=Math.PI*i/48;p.push([scaleX*halfT*Math.cos(t),Math.max(.0001,scaleR*eqR*Math.sin(t))]);}
    return p;
  }
  add('capsule',revolve(lensProfile(1.05,1.05)),'#f4e6c2',.30);
  add('cortex',revolve(lensProfile(.93,.93)),'#f0dcae',.55);
  // Epitel: tudung anterior saja (di dalam kapsul, di luar korteks).
  const cap:[number,number][]=[];
  for(let i=0;i<=20;i++){const t=1.05*i/20;cap.push([halfT*.96*Math.cos(t),Math.max(.0001,eqR*.96*Math.sin(t))]);}
  add('lens-epithelium',revolve(cap),'#e8b06a',.85);
  for(let i=0;i<6;i++){
    const t=.25+.6*i/5;const cell=add('lens-epithelium',new THREE.BoxGeometry(.03,.05,.05),'#c07f3e');
    cell.position.set(halfT*.90*Math.cos(t),eqR*.90*Math.sin(t),.30);
  }
  const nucleus=add('nucleus',new THREE.SphereGeometry(1,40,28),'#d9a84e',.92);
  nucleus.scale.set(halfT*.55,eqR*.55,eqR*.55);nucleus.position.x=-.02;
  // Serabut meridional: kutub → ekuator → kutub, 8 azimut.
  for(let k=0;k<8;k++){
    const az=k/8*Math.PI*2;const c=Math.cos(az),s=Math.sin(az);
    const pts=[.8,.35,0,-.35,-.8].map(f=>new THREE.Vector3(
      f*halfT*.85,
      Math.sqrt(Math.max(0,1-f*f))*.80*eqR*c+(f===0?0:0),
      Math.sqrt(Math.max(0,1-f*f))*.80*eqR*s,
    ));
    tube('lens-fibers',pts,.012,'#e5cf9e');
  }
  // Sutura Y anterior + Y offset posterior di kutub.
  for(const [px,rot] of [[halfT*.86,0],[-halfT*.86,Math.PI/3]] as const){
    for(let b=0;b<3;b++){
      const ang=rot+b*2*Math.PI/3;
      tube('lens-suture',[new THREE.Vector3(px,0,0),new THREE.Vector3(px+(px>0?.06:-.06),.11*Math.cos(ang),.11*Math.sin(ang))],.010,'#c9a24e');
    }
  }
  // Zonula 3 tine × 4 azimut: kapsul ekuator → cincin siliaris (konteks).
  // Cincin ikut bergerak anterior (+X) dan sentripetal (radius −) bersama otot.
  const ringR=eqR+.35-.05*a,ringFwd=.08*a;
  for(const az of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
    const c=Math.cos(az),s=Math.sin(az);
    const eq=(fx:number,fr:number)=>new THREE.Vector3(fx*halfT,fr*eqR*c,fr*eqR*s);
    const ring=(fx:number)=>new THREE.Vector3(fx*halfT+ringFwd,ringR*c,ringR*s);
    tube('zonule-attach',[eq(.15,1.0),ring(.10)],.008,'#dfd3ad',.9);
    tube('zonule-attach',[eq(-.15,1.0),ring(-.05)],.008,'#cfc09a',.9);
    tube('zonule-attach',[eq(0,1.0),ring(.02)],.008,'#e8dcbc',.9);
  }
  // Konteks: cincin siliaris tempat zonula bermuara (non-selektif).
  const ctx=new THREE.Group();root.add(ctx);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(ringR,.045,10,64),microMaterial('#b07278'));
  ring.rotation.y=Math.PI/2;ring.position.x=ringFwd;ctx.add(ring);
  return {root,parts,halfT,eqR};
}

// Irisan meridional iris–siliaris: diafragma iris (x≈.55) + kompleks siliaris
// posterior. Sfingter di margin pupil sedikit anterior dari lembar dilator.
// acc01 menggeser massa otot anterior (+X) dan sentripetal (−Y atas) mengikuti
// data UBM/OCT: anterior menebal, cincin menyempit; zonula konteks mengendur.
export function buildIrisCiliarySection(acc01=0){
  const a=Math.min(1,Math.max(0,acc01));
  const fX=.10*a,iY=.05*a;
  const root=new THREE.Group();
  const parts={} as Record<string,THREE.Group>;
  const ids=['sphincter','dilator','ciliary-muscle','pars-plicata','ciliary-process','pars-plana','pe','npe'];
  ids.forEach(id=>{const g=new THREE.Group();g.userData.detailSub=id;parts[id]=g;root.add(g);});
  function add(id:string,g:THREE.BufferGeometry,color:string,opacity=1){
    const mesh=new THREE.Mesh(g,microMaterial(color,opacity));
    mesh.userData.detailSub=id;parts[id].add(mesh);return mesh;
  }
  function tube(id:string,pts:THREE.Vector3[],r:number,color:string,opacity=1){
    const mesh=new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),Math.max(12,pts.length*7),r,6,false),
      microMaterial(color,opacity),
    );
    mesh.userData.detailSub=id;parts[id].add(mesh);return mesh;
  }
  const ctx=new THREE.Group();root.add(ctx);
  function context(g:THREE.BufferGeometry,color:string,pos:[number,number,number],opacity=1){
    const m=new THREE.Mesh(g,microMaterial(color,opacity));m.position.set(...pos);ctx.add(m);return m;
  }
  // Stroma iris: diafragma berlubang pupil (konteks).
  const sph=add('sphincter',new THREE.TorusGeometry(.17,.032,12,64),'#7fb894');
  sph.rotation.y=Math.PI/2;sph.position.x=.57;
  // Dilator: 10 jeruji radial pada permukaan posterior iris.
  for(let k=0;k<10;k++){
    const az=k/10*Math.PI*2;
    const m=add('dilator',new THREE.BoxGeometry(.012,.36,.05),'#a8c69a');
    m.position.set(.53,.37*Math.cos(az),.37*Math.sin(az));m.rotation.x=az;
  }
  context(revolve([[.58,.16],[.56,.35],[.55,.60],[.52,.60],[.53,.35],[.55,.16],[.58,.16]]),'#537f72',[0,0,0]);
  // Otot siliaris: pita longitudinal + berkas sirkular di akar iris.
  tube('ciliary-muscle',[new THREE.Vector3(.35+fX,.62-iY,0),new THREE.Vector3(.10+fX,.68-iY,0),new THREE.Vector3(-.20+fX,.70-iY,0)],.060*(1+.15*a),'#b07278');
  const circ=add('ciliary-muscle',new THREE.TorusGeometry(.60-.04*a,.045,10,72),'#a5666e');
  circ.rotation.y=Math.PI/2;circ.position.x=.48+fX;
  // Pars plicata: zona + 6 rigi prosesus di wajah dalamnya.
  const plicata=add('pars-plicata',new THREE.BoxGeometry(.30,.04,.80),'#c89190');
  plicata.position.set(.15+fX,.60-iY,0);
  for(let i=0;i<6;i++){
    const fold=add('ciliary-process',new THREE.BoxGeometry(.12,.05,.06),'#d8a0a4');
    fold.position.set(.28-i*.05+fX,.555-iY,-.30+i*.12);
  }
  // Pars plana: pita halus posterior (menetap: berjangkar ke sklera/khoroid).
  const plana=add('pars-plana',new THREE.BoxGeometry(.40,.03,.80),'#b99a90');
  plana.position.set(-.18,.63,0);
  // Bilayer: PE luar (stromal) + NPE dalam (sekretorik).
  const peLayer=add('pe',new THREE.BoxGeometry(.62,.012,.80),'#5a3a34');
  peLayer.position.set(.02+fX,.585-iY,0);
  const npeLayer=add('npe',new THREE.BoxGeometry(.62,.012,.80),'#e0bc9e');
  npeLayer.position.set(.02+fX,.572-iY,0);
  // Konteks: tepi lensa + zonula + dinding sklera luar.
  const lensEdge=context(new THREE.SphereGeometry(1,32,20),'#e9d7aa',[.35,0,0],.4);
  lensEdge.scale.set(.25,.40,.40);
  for(const dz of [-.15,0,.15]){
    const z=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(.10+fX,.55-iY,dz),new THREE.Vector3(.25,.47-.05*a,dz),new THREE.Vector3(.35,.40,dz),
    ]),12,.008,6,false),microMaterial('#dfd3ad',.9));
    ctx.add(z);
  }
  context(new THREE.BoxGeometry(.9,.10,.9),'#d9d2bd',[-.02,.88,0]);
  return {root,parts};
}

// ---------------------------------------------------------------------------
// Fase 3: retina + kepala saraf optik. +X = vitreal/anterior.
// ---------------------------------------------------------------------------

// Tumpukan 10 lapis melengkung (vitreal→skleral) + inset fovea + baji ora.
// Busur di bidang X-Y seperti segmen dinding bola mata, diekstrusi sepanjang Z.
// Ketebalan relatif diperjelas; ONL dibuat paling tebal, ILM/Bruch paling tipis.
export function buildRetinaSection(){
  const root=new THREE.Group();
  const parts={} as Record<string,THREE.Group>;
  const ids=['ilm','nfl','gcl','ipl','inl','opl','onl','pr','rpe','bruch','fovea','ora-serrata'];
  ids.forEach(id=>{const g=new THREE.Group();g.userData.detailSub=id;parts[id]=g;root.add(g);});
  function add(id:string,g:THREE.BufferGeometry,color:string,opacity=1){
    const mesh=new THREE.Mesh(g,microMaterial(color,opacity));
    mesh.userData.detailSub=id;parts[id].add(mesh);return mesh;
  }
  const H=.5,R0=2.6,CX=.62-R0,ZC=-.5,DEPTH=.9;
  function shell(r:number,half=H,depth=DEPTH,ts=Math.PI/2-half,seg=56){
    const g=new THREE.CylinderGeometry(r,r,depth,seg,1,true,ts,half*2);
    g.rotateX(Math.PI/2);return g;
  }
  const at=(rr:number,u:number,z=ZC)=>new THREE.Vector3(CX+rr*Math.cos(u),rr*Math.sin(u),z);
  const outward=(u:number)=>new THREE.Vector3(Math.cos(u),Math.sin(u),0);
  // [id, thickness, color] — tumpukan utama.
  const slabs:[string,number,string][]=[
    ['ilm',.035,'#cfe3ee'],['nfl',.12,'#e8c88a'],['gcl',.09,'#e8a87e'],
    ['ipl',.10,'#dfc39a'],['inl',.12,'#d9b48f'],['opl',.07,'#d4a982'],
    ['onl',.17,'#c99a72'],['pr',.14,'#f0d060'],['rpe',.06,'#6b4a3a'],
    ['bruch',.035,'#8a7a5e'],
  ];
  const GAP=.015;let r=R0;const slabX:Record<string,number>={};
  for(const [id,t,col] of slabs){
    const m=add(id,shell(r),col);
    m.position.set(CX,0,ZC);slabX[id]=CX+r;r-=t+GAP;
  }
  const slabR=(id:string)=>slabX[id]-CX;
  // Arkade pembuluh superior/inferior di NFL (lurus sepanjang Z).
  for(const [u,col] of [[.28,'#c0392b'],[-.28,'#7a2a22']] as const){
    const v=add('nfl',new THREE.CylinderGeometry(.022,.022,DEPTH,10),col);
    v.rotation.x=Math.PI/2;
    v.position.set(CX+slabR('nfl')*Math.cos(u),slabR('nfl')*Math.sin(u),ZC);
  }
  // Glif batang (langsing) / kerucut (meruncing), sumbu radial.
  const up=new THREE.Vector3(0,1,0),fwd=new THREE.Vector3(1,0,0);
  for(let i=0;i<12;i++){
    const u=-.33+i*.06;
    const dir=outward(u);
    if(i%2===0){
      const rod=add('pr',new THREE.BoxGeometry(.13,.028,.028),'#b8862e');
      rod.position.copy(at(slabR('pr'),u,ZC));
      rod.quaternion.setFromUnitVectors(fwd,dir);
    }else{
      const cone=add('pr',new THREE.CylinderGeometry(.014,.030,.13,6),'#f5d76e');
      cone.position.copy(at(slabR('pr'),u,ZC));
      cone.quaternion.setFromUnitVectors(up,dir);
    }
  }
  // Garis ELM di batas ONL–PR.
  add('pr',shell((slabR('onl')+slabR('pr'))/2,DEPTH-.04),'#8a6a3a',.85).position.set(CX,0,ZC);
  // Sel RPE heksagonal, sumbu radial.
  for(let i=0;i<6;i++){
    const u=-.30+i*.12;
    const cell=add('rpe',new THREE.CylinderGeometry(.07,.07,.05,6),'#7d5744');
    cell.position.copy(at(slabR('rpe'),u,ZC));
    cell.quaternion.setFromUnitVectors(up,outward(u));
  }
  // Inset fovea (z=+.5): hanya ILM+ONL+PR+RPE, kerucut padat di lantai pit,
  // dinding corong = lapis dalam yang tersibak.
  const FZ=.5,RF=1.1,C2X=.30-RF;
  const fShell=(r:number)=>{const g=new THREE.CylinderGeometry(r,r,.5,40,1,true,Math.PI/2-.38,.76);g.rotateX(Math.PI/2);return g;};
  let rf=RF;
  for(const [t,col] of [[.03,'#cfe3ee'],[.12,'#c99a72'],[.14,'#f5d76e'],[.06,'#6b4a3a']] as const){
    const m=add('fovea',fShell(rf),col);
    m.position.set(C2X,0,FZ);rf-=t+.015;
  }
  for(let i=0;i<8;i++){
    const cone=add('fovea',new THREE.CylinderGeometry(.012,.026,.12,6),'#f7dd70');
    cone.rotation.z=Math.PI/2;cone.position.set(.05,-.21+i*.06,FZ);
  }
  const funnel=add('fovea',new THREE.CylinderGeometry(.32,.12,.30,24,1,true),'#e8a87e',.85);
  funnel.rotation.z=-Math.PI/2;funnel.position.set(.22,0,FZ);
  // Baji ora serrata: pita meruncing di bawah tumpukan → garis NPE → plana.
  const oraCols=['#9ab87e','#8aa870','#7a9863'] as const;
  [.30,.24,.18].forEach((len,i)=>{
    const band=add('ora-serrata',shell(R0-.35-.20*i,len,DEPTH,Math.PI/2-.85),oraCols[i],.9-i*.1);
    band.position.set(CX,0,ZC);
  });
  const npePts:THREE.Vector3[]=[];
  for(let i=0;i<=8;i++){const u=-.85+.30*i/8;npePts.push(at(R0-.95,u,ZC));}
  const npeTube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(npePts),24,.012,6,false),microMaterial('#e0bc9e'));
  npeTube.userData.detailSub='ora-serrata';parts['ora-serrata'].add(npeTube);
  // Konteks: gel vitreus (luar) + khoroid (dalam) + pita plana.
  const ctx=new THREE.Group();root.add(ctx);
  function context(g:THREE.BufferGeometry,color:string,pos:[number,number,number],opacity=1){
    const m=new THREE.Mesh(g,microMaterial(color,opacity));m.position.set(...pos);ctx.add(m);return m;
  }
  context(shell(R0+.18), '#a6b9ce',[CX,0,ZC],.15);
  context(shell(R0-1.20),'#915043',[CX,0,ZC]);
  context(shell(R0-1.06,.20,DEPTH,Math.PI/2-.95),'#b99a90',[CX,0,ZC]);
  return {root,parts,slabX};
}

// Kepala saraf: wajah diskus (+X) → kanal sklera → lamina → saraf (−X).
// Trunk vaskular di kuadran nasal-atas (−Z, +Y).
export function buildONHSection(){
  const root=new THREE.Group();
  const parts={} as Record<string,THREE.Group>;
  const ids=['disc','cup','rim','lamina','rnfl','vessels','bmo'];
  ids.forEach(id=>{const g=new THREE.Group();g.userData.detailSub=id;parts[id]=g;root.add(g);});
  function add(id:string,g:THREE.BufferGeometry,color:string,opacity=1){
    const mesh=new THREE.Mesh(g,microMaterial(color,opacity));
    mesh.userData.detailSub=id;parts[id].add(mesh);return mesh;
  }
  function tube(id:string,pts:THREE.Vector3[],r:number,color:string,opacity=1){
    const mesh=new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),Math.max(16,pts.length*8),r,6,false),
      microMaterial(color,opacity),
    );
    mesh.userData.detailSub=id;parts[id].add(mesh);return mesh;
  }
  // Cakram: anulus wajah + dinding samping + dinding belakang (bukan solid,
  // agar mangkuk cup yang tersembam terlihat). Cup: mangkuk dangkal bermuara
  // di wajah diskus (r≈.19) dan mendasar di x≈.05.
  const face=add('disc',new THREE.RingGeometry(.19,.34,48),'#f0bd93');
  face.rotation.y=Math.PI/2;face.position.x=.12;
  const wall=add('disc',new THREE.CylinderGeometry(.34,.34,.08,48,1,true),'#e8ae85');
  wall.rotation.z=Math.PI/2;wall.position.x=.08;
  const back=add('disc',new THREE.CircleGeometry(.34,48),'#df9f78');
  back.rotation.y=Math.PI/2;back.position.x=.04;
  const bmo=add('bmo',new THREE.TorusGeometry(.34,.015,8,64),'#8a7a5e');
  bmo.rotation.y=Math.PI/2;bmo.position.x=.045;
  const rim=add('rim',new THREE.TorusGeometry(.27,.075,12,56),'#e8a06a');
  rim.rotation.y=Math.PI/2;rim.position.x=.10;
  // Cup: mangkuk dangkal tersembam di wajah diskus.
  const cup=add('cup',new THREE.SphereGeometry(.30,28,14,0,Math.PI*2,0,.68),'#f2e3c8',.95);
  cup.rotation.z=Math.PI/2;cup.position.x=.353;
  // Serabut prapapiler: 12 jari-jari perifer → rim + 6 berkas menukik ke lamina.
  for(let k=0;k<12;k++){
    const az=k/12*Math.PI*2;const c=Math.cos(az),s=Math.sin(az);
    tube('rnfl',[new THREE.Vector3(.13,.58*c,.58*s),new THREE.Vector3(.13,.44*c,.44*s),new THREE.Vector3(.12,.30*c,.30*s)],.020,'#e8c88a');
  }
  for(let k=0;k<6;k++){
    const az=k/6*Math.PI*2+.26;const c=Math.cos(az),s=Math.sin(az);
    tube('rnfl',[new THREE.Vector3(.10,.27*c,.27*s),new THREE.Vector3(-.10,.24*c,.24*s),new THREE.Vector3(-.35,.22*c,.22*s),new THREE.Vector3(-.55,.20*c,.20*s)],.018,'#dfb878');
  }
  // Lamina: 3 lempeng kisi posterior.
  for(const px of [-.12,-.19,-.26]){
    for(const oz of [-.15,0,.15]){
      const beamY=add('lamina',new THREE.BoxGeometry(.025,.56,.06),'#cbb89a');
      beamY.position.set(px,0,oz);
    }
    for(const oy of [-.15,0,.15]){
      const beamZ=add('lamina',new THREE.BoxGeometry(.025,.06,.50),'#c2ad8a');
      beamZ.position.set(px,oy,0);
    }
  }
  // Trunk sentral nasal-atas: arteri + vena menembus lamina → berarkade.
  tube('vessels',[new THREE.Vector3(-.55,.04,-.06),new THREE.Vector3(-.20,.04,-.06),new THREE.Vector3(.02,.06,-.04),new THREE.Vector3(.12,.16,-.02),new THREE.Vector3(.12,.30,.06)],.026,'#c0392b');
  tube('vessels',[new THREE.Vector3(-.55,.02,-.10),new THREE.Vector3(-.20,.02,-.09),new THREE.Vector3(.02,.03,-.07),new THREE.Vector3(.12,-.06,-.02),new THREE.Vector3(.12,-.22,.08)],.030,'#7a2a22');
  // Konteks: dinding sklera + mielin pasca-lamina + jaringan tepi.
  const ctx=new THREE.Group();root.add(ctx);
  function context(g:THREE.BufferGeometry,color:string,opacity=1){
    const m=new THREE.Mesh(g,microMaterial(color,opacity));ctx.add(m);return m;
  }
  const scl=context(new THREE.TorusGeometry(.52,.14,12,56),'#d9d8cd');scl.rotation.y=Math.PI/2;scl.position.x=-.15;
  const border=context(new THREE.TorusGeometry(.42,.03,8,56),'#c9bda6');border.rotation.y=Math.PI/2;border.position.x=.02;
  for(let k=0;k<3;k++){
    const az=k/3*Math.PI*2+.5;
    const my=context(new THREE.CylinderGeometry(.05,.05,.12,10),'#f3d5b0',.85);
    my.rotation.z=Math.PI/2;my.position.set(-.45,.20*Math.cos(az),.20*Math.sin(az));
  }
  return {root,parts};
}

// ---------------------------------------------------------------------------
// Fisiologi: loop konveksi termal bilik anterior (mata tegak). Naik di sisi
// hangat iris/lensa (±37 °C), turun di sisi dingin kornea (±34 °C). Kurva
// tertutup di dua bidang meridional (atas + bawah).
// ---------------------------------------------------------------------------

export function convectionLoops():THREE.CatmullRomCurve3[]{
  const loops:THREE.CatmullRomCurve3[]=[];
  for(const a of [Math.PI/2,-Math.PI/2]){
    const p=(x:number,r:number)=>new THREE.Vector3(x,r*Math.cos(a),r*Math.sin(a));
    loops.push(new THREE.CatmullRomCurve3([
      p(.715,.13),p(.72,.25),p(.75,.40),p(.80,.47),p(.88,.40),p(.93,.25),p(.93,.12),p(.82,.10),
    ],true));
  }
  return loops;
}

