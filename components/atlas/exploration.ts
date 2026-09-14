import * as THREE from 'three';
import type {Biometry,SceneState,StructureId,SectionSettings} from './types';
import {isOrbital} from './orbitContent.ts';
export const DEFAULT_BIOMETRY:Biometry={side:'right',axialLength:24,chamberDepth:3.2,pupilDiameter:3.6,age:35,preset:'reference'};
export const DEFAULT_SECTION:SectionSettings={azimuth:90,elevation:0,offset:0,flipped:false,showPlane:false};
export const explorationDefaults={context:'globe' as const,biometry:DEFAULT_BIOMETRY,section:DEFAULT_SECTION,multiIsolated:[] as StructureId[],peel:0,explosionGap:1,connectors:true};
export const variationPresets=[
 {id:'reference',name:'Dewasa acuan',kind:'Contoh variasi normal',values:{axialLength:24,chamberDepth:3.2,pupilDiameter:3.6,age:35}},
 {id:'older',name:'Usia lebih tua',kind:'Contoh terkait usia',values:{axialLength:24,chamberDepth:2.8,pupilDiameter:3,age:70}},
 {id:'long',name:'Aksial memanjang',kind:'Contoh morfologi patologis',values:{axialLength:28,chamberDepth:3.4,pupilDiameter:3.6,age:35}},
 {id:'shallow',name:'Bilik dangkal',kind:'Contoh morfologi berisiko',values:{axialLength:22,chamberDepth:2.2,pupilDiameter:3.6,age:65}},
 {id:'teaching',name:'Peragaan pupil',kind:'Pembesaran untuk pengajaran',values:{axialLength:24,chamberDepth:3.2,pupilDiameter:7,age:35}},
];
export const peelStages:{title:string;remove:StructureId[]}[]=[
 {title:'Semua lapisan',remove:[]},
 {title:'Buka kelopak',remove:['upper-lid','lower-lid','levator']},
 {title:'Buka selubung orbita',remove:['conjunctiva','tenon','orbital-fat','orbital-bone']},
 {title:'Lepaskan otot & lakrimal',remove:['rectus-superior','rectus-inferior','rectus-medial','rectus-lateral','oblique-superior','oblique-inferior','lacrimal-gland','puncta','canaliculi','lacrimal-sac','nasolacrimal']},
 {title:'Angkat sklera & kornea',remove:['sclera','cornea']},
 {title:'Angkat koroid',remove:['choroid']},
 {title:'Angkat retina',remove:['retina']},
];
export function peeledIds(step:number){return peelStages.slice(0,Math.min(step,peelStages.length-1)+1).flatMap(s=>s.remove);}
export function isolationIds(s:SceneState):StructureId[]{return s.multiIsolated.length?s.multiIsolated:s.isolated?[s.isolated]:[];}
export function structureVisible(s:SceneState,id:StructureId){
 const isolated=isolationIds(s);if(isolated.length)return isolated.includes(id);
 return !(s.context==='globe'&&isOrbital(id))&&!s.hidden.includes(id)&&!peeledIds(s.peel).includes(id);
}
export function sectionPlane(s:SectionSettings){
 const a=THREE.MathUtils.degToRad(s.azimuth),e=THREE.MathUtils.degToRad(s.elevation);
 const n=new THREE.Vector3(Math.cos(e)*Math.cos(a),Math.sin(e),Math.cos(e)*Math.sin(a));
 // Three clips the negative half-space; keep the far side by default.
 n.multiplyScalar(s.flipped?1:-1);
 return new THREE.Plane(n,(s.flipped?-1:1)*s.offset/12+1e-7);
}
export function lensThickness(age:number){return 4.08+(Math.max(18,Math.min(80,age))-35)*.012;}
export function biometricPoint(v:THREE.Vector3,id:StructureId,b:Biometry){
 const p=v.clone(),r=Math.hypot(p.y,p.z),half=lensThickness(b.age)/24;
 const lensFront=1-b.chamberDepth/12,center=lensFront-half,dx=center-.5;
 if(id==='lens')p.x=center+(p.x-.5)*half/.17;
 if(id==='iris'){
   const rr=b.pupilDiameter/24+Math.max(0,(r-.15)/(.5-.15))*(.5-b.pupilDiameter/24);
   if(r>1e-7){p.y*=rr/r;p.z*=rr/r;}
   p.x+= (lensFront-.67)*Math.max(0,1-(r-.15)/.35);
 }
 if(id==='zonules')p.x+=dx*Math.max(0,Math.min(1,(.49-r)/.10));
 if(id==='vitreous'&&p.x>0&&r<.45){
   // The anterior hyaloid follows the posterior lens boundary in deep chambers.
   const posteriorPole=lensFront-2*half;
   p.x+=Math.min(0,posteriorPole-.34)*Math.max(0,1-r/.45)*Math.min(1,p.x/.30);
 }
 if(id==='anterior'||id==='posterior'){
   const irisWeight=Math.max(0,1-r/.53);
   const depthWeight=id==='posterior'?1:Math.max(0,Math.min(1,(1-p.x)/.29));
   p.x+=(lensFront-.67)*irisWeight*depthWeight;
 }
 // Length changes the posterior segment while the cornea and lens stay fixed.
 if((!isOrbital(id)&&id!=='lens')||id==='tenon'){
   if(p.x<.30){const posterior=1.025-b.axialLength/12;p.x=.30+(p.x-.30)*(.30-posterior)/1.37;}
 }
 if(id==='vitreous'&&v.x>0&&r<.39){
   const lensBack=center-half*Math.sqrt(1-(r/.39)**2);
   p.x=Math.min(p.x,lensBack-.008);
 }
 return p;
}
