import * as THREE from 'three';
import type {OrbitalStructureId} from './types';
import {revolve} from './geometry.ts';

type Point=[number,number,number];
export const orbitAnchors:Record<OrbitalStructureId,Point>={
 'conjunctiva':[.74,.66,.13],tenon:[-.30,.99,.24],
 'rectus-superior':[-.35,1.04,0],'rectus-inferior':[-.30,-1.04,0],
 'rectus-medial':[-.32,0,-1.04],'rectus-lateral':[-.3,0,1.04],
 'oblique-superior':[.35,1.1,-.85],'oblique-inferior':[.10,-.98,.62],
 levator:[-.30,1.23,0],'orbital-fat':[-1.25,.6,.4],'orbital-bone':[-.6,1.40,.30],
 'upper-lid':[1.01,.62,0],'lower-lid':[1.01,-.52,0],
 'lacrimal-gland':[.50,1.15,1.03],puncta:[.65,.16,-.96],
 canaliculi:[.60,.12,-1.08],'lacrimal-sac':[.51,-.16,-1.25],nasolacrimal:[.36,-1.10,-1.24],
};
export const orbitExplosion:Record<OrbitalStructureId,Point>={
 conjunctiva:[1.0,.1,0],tenon:[-.45,0,0],
 'rectus-superior':[0,.70,0],'rectus-inferior':[0,-.70,0],
 'rectus-medial':[0,0,-.70],'rectus-lateral':[0,0,.70],
 'oblique-superior':[0,.80,-.4],'oblique-inferior':[0,-.80,.4],
 levator:[.4,1.20,0],'orbital-fat':[-.8,0,0],'orbital-bone':[-1.3,0,0],
 'upper-lid':[1.3,.8,0],'lower-lid':[1.3,-.8,0],
 'lacrimal-gland':[.25,.65,.8],puncta:[1,0,-.4],canaliculi:[.65,0,-.7],
 'lacrimal-sac':[.30,0,-.9],nasolacrimal:[0,-.30,-1.0],
};

// Elliptical swept volume, with disk end caps. The broad axis stays tangent
// to the globe for recti; an explicit up vector also supports lid ribbons.
export function sweptVolume(points:Point[],width:number,thickness:number,segments=48,sides=12,radial=true){
 const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
 const pos:number[]=[],indices:number[]=[];
 for(let i=0;i<=segments;i++){
  const t=i/segments,p=curve.getPointAt(t),tangent=curve.getTangentAt(t);
  let normal=radial?new THREE.Vector3(0,p.y,p.z):new THREE.Vector3(1,0,0);
  normal.addScaledVector(tangent,-normal.dot(tangent));
  if(normal.lengthSq()<1e-5)normal.set(0,1,0).addScaledVector(tangent,-tangent.y);
  normal.normalize();const wide=new THREE.Vector3().crossVectors(tangent,normal).normalize();
  const taper=.68+.32*Math.sin(Math.PI*t);
  for(let j=0;j<sides;j++){
   const a=2*Math.PI*j/sides;
   pos.push(...p.clone().addScaledVector(wide,width*Math.cos(a)*taper).addScaledVector(normal,thickness*Math.sin(a)).toArray());
   if(i<segments){const k=i*sides+j,n=i*sides+(j+1)%sides;indices.push(k,n,k+sides,n,n+sides,k+sides);}
  }
 }
 for(const end of [0,segments]){
  const center=pos.length/3;pos.push(...curve.getPointAt(end/segments).toArray());
  for(let j=0;j<sides;j++){const a=end*sides+j,b=end*sides+(j+1)%sides;indices.push(...(end===0?[center,b,a]:[center,a,b]));}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

export function buildOrbit(){
 const parts={} as Record<OrbitalStructureId,THREE.Group>;
 for(const id of Object.keys(orbitAnchors) as OrbitalStructureId[]){parts[id]=new THREE.Group();parts[id].userData.id=id;}
 function add(id:OrbitalStructureId,g:THREE.BufferGeometry,color:string,opacity=1){
  const m=new THREE.MeshStandardMaterial({color,roughness:.6,side:THREE.DoubleSide,transparent:opacity<1,opacity,depthWrite:opacity>.85});m.userData.baseOpacity=opacity;
  const mesh=new THREE.Mesh(g,m);mesh.userData.id=id;mesh.userData.sectionSolid=true;parts[id].add(mesh);return mesh;
 }
 function ellipsoid(id:OrbitalStructureId,p:Point,scale:Point,color:string,opacity=1){const g=new THREE.SphereGeometry(1,24,16);g.scale(...scale);g.translate(...p);return add(id,g,color,opacity);}
 function cord(id:OrbitalStructureId,p:Point[],w:number,h:number,color:string,opacity=1,radial=true){return add(id,sweptVolume(p,w,h,48,12,radial),color,opacity);}
 // Tenon is a sheath outside sclera, ending near the limbus; not a solid globe.
 const tenon:[number,number][]=[];
 for(const r of [1.035,1.020]){const row:[number,number][]=[];for(let i=0;i<=54;i++){const a=Math.PI-(Math.PI-.68)*i/54;row.push([-.07+r*Math.cos(a),r*.98*Math.sin(a)]);}tenon.push(...(r===1.035?row:row.reverse()));}tenon.push(tenon[0]);
 add('tenon',revolve(tenon,0,Math.PI*2,80),'#c6beb3',.18);
 // Bulbar surface -> fornix -> short palpebral reflection. Cornea remains bare.
 add('conjunctiva',revolve([[.778,.55],[.65,.72],[.34,.94],[.29,1.03],[.40,1.10],[.64,1.12],[.75,1.09],[.75,1.08],[.64,1.10],[.40,1.08],[.31,1.025],[.35,.95],[.66,.73],[.785,.56],[.778,.55]],0,Math.PI*2,80),'#eca8ab',.16);
 // Four recti arise at the orbital apex, with staggered scleral insertions.
 const recti:[OrbitalStructureId,number,number][]=[['rectus-superior',0,.25],['rectus-inferior',Math.PI,.36],['rectus-medial',-Math.PI/2,.43],['rectus-lateral',Math.PI/2,.32]];
 for(const [id,a,x] of recti){
  const yz=(r:number):[number,number]=>[r*Math.cos(a),r*Math.sin(a)];
  const p:Point[]=[[-2.30,.08,-.36],[-1.7,...yz(.40)],[-.85,...yz(.94)],[-.25,...yz(1.025)],[x,...yz(Math.sqrt(1-(x+.07)**2)*.98+.035)]];
  cord(id,p.slice(0,4),.15,.058,'#aa666b');
  cord(id,[p[3],p[4]],.14,.021,'#e3c5b9');
 }
 // Superior oblique changes direction through the superomedial trochlea.
 cord('oblique-superior',[[-2.3,.14,-.39],[-1.3,.64,-.73],[.08,1.02,-.91],[.56,1.09,-.94]],.095,.043,'#b87981');
 cord('oblique-superior',[[.56,1.09,-.94],[.49,1.02,-.67],[.04,.91,-.12],[-.29,.67,.63]],.07,.023,'#e5c8ba');
 const trochlea=new THREE.TorusGeometry(.065,.025,10,24);trochlea.rotateY(Math.PI/2);trochlea.translate(.56,1.09,-.94);add('oblique-superior',trochlea,'#d4d7ca');
 // Inferior oblique originates anteriorly on the medial orbital floor.
 cord('oblique-inferior',[[.62,-.98,-.76],[.35,-1.07,-.36],[.04,-1.025,.17],[-.23,-.67,.74]],.13,.047,'#c68a85');
 cord('levator',[[-2.25,.20,-.37],[-1.25,.91,-.19],[-.35,1.23,0],[.48,1.20,0],[.87,.83,0]],.18,.047,'#b98989');
 // Four closed walls form an open orbital funnel, not a sealed front box.
 const back:Point[]=[[-2.55,.30,-.62],[-2.55,.30,-.12],[-2.55,-.25,-.12],[-2.55,-.25,-.62]];
 const front:Point[]=[[.76,1.57,-1.54],[.76,1.57,1.57],[.76,-1.52,1.57],[.76,-1.52,-1.54]];
 for(let i=0;i<4;i++){
  const j=(i+1)%4,v=[back[i],back[j],front[j],front[i]];
  const normal=new THREE.Vector3().subVectors(new THREE.Vector3(...v[1]),new THREE.Vector3(...v[0])).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...v[3]),new THREE.Vector3(...v[0]))).normalize().multiplyScalar(.055);
  const pp=v.flatMap(p=>p).concat(v.flatMap(p=>new THREE.Vector3(...p).add(normal).toArray()));
  const idx=[0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0];
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pp,3));g.setIndex(idx);g.computeVertexNormals();add('orbital-bone',g,'#c9c3ab',.12);
 }
 for(let i=0;i<12;i++){const a=2*Math.PI*i/12;ellipsoid('orbital-fat',[-1.08-.28*(i%2),.64*Math.cos(a),.67*Math.sin(a)-.12],[.48,.26,.26],'#d5b968',.20);}
 // Closed upper/lower lid ribbons curve around the globe. Free margins and
 // a central palpebral aperture remain distinct even when lids are selected.
 for(const [id,sign] of [['upper-lid',1],['lower-lid',-1]] as const){
  const profile:Point[]=[];for(let i=0;i<=22;i++){const a=Math.PI*i/22;const z=1.10*Math.cos(a);profile.push([1.035-.48*(z/1.10)**2,sign*(id==='upper-lid'?.63:.53)*Math.sin(a),z]);}
  cord(id,profile,.20,.065,'#ca9690',1,false);
  const margin=profile.map(([x,y,z])=>[x+.065,y-sign*.13*Math.sqrt(Math.max(0,1-(z/1.1)**2)),z] as Point);cord(id,margin,.018,.012,'#e5b0ac',1,false);
 }
 for(let i=0;i<5;i++)ellipsoid('lacrimal-gland',[.42+.13*(i%2),1.15+.09*Math.sin(i*1.7),.92+i*.062],[.23,.115,.14],'#cea0c2');
 for(let i=0;i<3;i++)cord('lacrimal-gland',[[.56,1.15,.95+i*.08],[.66,.99,.88+i*.055],[.69,.84,.80+i*.04]],.009,.009,'#edc2e2');
 for(const sign of [-1,1]){
  const ring=new THREE.TorusGeometry(.023,.008,8,24);ring.rotateY(Math.PI/2);ring.translate(.66,sign*.16,-.96);add('puncta',ring,'#f5bc91');
  cord('canaliculi',[[.64,sign*.16,-.965],[.62,sign*.21,-.98],[.58,sign*.14,-1.09],[.53,.035,-1.22]],.017,.017,'#edbd73');
 }
 ellipsoid('lacrimal-sac',[.51,-.17,-1.25],[.070,.25,.070],'#dba95f');
 cord('nasolacrimal',[[.51,-.39,-1.25],[.45,-.72,-1.27],[.35,-1.14,-1.25],[.30,-1.55,-1.20]],.046,.046,'#d5a567');
 return parts;
}
