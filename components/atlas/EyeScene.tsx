'use client';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {buildEye,anchors,explosion,disposeObject,flowPaths} from './geometry';
import {structures} from './content';
import type {SceneState,StructureId} from './types';

export default function EyeScene({state,onSelect}:{state:SceneState;onSelect:(id:StructureId)=>void}){
  const host=useRef<HTMLDivElement>(null),labels=useRef<HTMLDivElement>(null);
  const current=useRef(state),select=useRef(onSelect);
  const [error,setError]=useState('');
  const [ready,setReady]=useState(false);
  useEffect(()=>{current.current=state;select.current=onSelect;},[state,onSelect]);
  useEffect(()=>{
    if(!host.current)return;const el=host.current;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch{setError('Tampilan 3D memerlukan WebGL. Aktifkan akselerasi grafis browser atau gunakan browser yang mendukung WebGL. Penjelasan dan kontrol materi tetap tersedia.');return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.setClearColor(0x0b1016,0);
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.30;
    el.insertBefore(renderer.domElement,el.firstChild);renderer.domElement.setAttribute('aria-label','Model 3D mata. Seret untuk memutar, gulir untuk zoom, klik struktur untuk memilih. Gunakan tombol arah saat model difokuskan untuk memutar.');renderer.domElement.tabIndex=0;
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(34,1,.05,50);camera.position.set(2.4,1.1,4.05);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;controls.minDistance=1.15;controls.maxDistance=20;controls.enablePan=true;controls.target.set(-.02,0,0);controls.rotateSpeed=.7;
    scene.add(new THREE.AmbientLight('#c0d8e9',1.7));
    const key=new THREE.DirectionalLight('#fff0d4',3.1);key.position.set(2,4,5);scene.add(key);
    const fill=new THREE.DirectionalLight('#8eb9df',1.35);fill.position.set(-4,0,3);scene.add(fill);
    const rim=new THREE.DirectionalLight('#dce8fa',2);rim.position.set(-1,3,-3);scene.add(rim);
    let eye=buildEye(current.current.view==='cutaway');scene.add(eye.root);
    const flows=new THREE.Group();scene.add(flows);
    const pathData=flowPaths();
    const particles:{mesh:THREE.Mesh;path:typeof pathData[number];offset:number}[]=[];
    const tracks:{line:THREE.Line;type:string}[]=[];
    pathData.forEach(path=>{
      const geometry=new THREE.BufferGeometry().setFromPoints(path.curve.getPoints(100));const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:path.color,transparent:true,opacity:.23}));flows.add(line);tracks.push({line,type:path.type});
      for(let i=0;i<(path.type==='shared'?12:7);i++){const mesh=new THREE.Mesh(new THREE.SphereGeometry(.009,8,6),new THREE.MeshBasicMaterial({color:path.color}));flows.add(mesh);particles.push({mesh,path,offset:i/(path.type==='shared'?12:7)});}
    });
    // Optical rays are pedagogic paths; the model does not solve ray tracing.
    const rays=new THREE.Group();scene.add(rays);
    const rayLines:THREE.Line[]=[];
    for(let i=0;i<7;i++){
      const y=(i-3)*.044;const pts=[new THREE.Vector3(1.5,y,.018),new THREE.Vector3(1.01,y,.018),new THREE.Vector3(.67,y*.70,.018),new THREE.Vector3(.34,y*.64,.018),new THREE.Vector3(-.95,0,-.04)];
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#f4cf83',transparent:true,opacity:.4}));rays.add(line);rayLines.push(line);
    }
    let prev:SceneState|null=null,time=0,raf=0,last=performance.now(),disposed=false;
    const vec=new THREE.Vector3();
    const resize=()=>{const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();prev=null;};
    const ro=new ResizeObserver(resize);ro.observe(el);resize();
    const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();let down={x:0,y:0};let activePointers=0,multitouch=false;
    function pointerDown(e:PointerEvent){activePointers++;if(activePointers>1)multitouch=true;down={x:e.clientX,y:e.clientY};}
    function pointerUp(e:PointerEvent){activePointers=Math.max(0,activePointers-1);if(multitouch){if(activePointers===0)multitouch=false;return;}if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)return;const b=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);raycaster.setFromCamera(pointer,camera);
      const hits=raycaster.intersectObject(eye.root,true);const hit=hits.find(h=>{const id=h.object.userData.id as StructureId;const group=eye.parts[id];return group?.visible&&(!['vitreous','anterior','posterior','cornea'].includes(id)||current.current.isolated===id);});if(hit)select.current(hit.object.userData.id);
    }
    function pointerCancel(){activePointers=0;multitouch=false;}
    function keydown(e:KeyboardEvent){if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','='].includes(e.key)){e.preventDefault();const relative=camera.position.clone().sub(controls.target);const spherical=new THREE.Spherical().setFromVector3(relative);if(e.key==='ArrowLeft')spherical.theta-=.12;if(e.key==='ArrowRight')spherical.theta+=.12;if(e.key==='ArrowUp')spherical.phi=Math.max(.1,spherical.phi-.12);if(e.key==='ArrowDown')spherical.phi=Math.min(Math.PI-.1,spherical.phi+.12);if(e.key==='+'||e.key==='=')spherical.radius=Math.max(1.15,spherical.radius*.9);if(e.key==='-')spherical.radius=Math.min(10,spherical.radius/ .9);camera.position.copy(new THREE.Vector3().setFromSpherical(spherical).add(controls.target));controls.update();}}
    function contextLost(e:Event){e.preventDefault();setError('Konteks grafis terputus. Muat ulang halaman untuk memulihkan model 3D.');}
    renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('pointercancel',pointerCancel);renderer.domElement.addEventListener('keydown',keydown);renderer.domElement.addEventListener('webglcontextlost',contextLost);
    function frame(now:number){
      if(disposed)return;const s=current.current;const dt=Math.min((now-last)/1000,.05);last=now;if(s.playing&&!document.hidden)time+=dt*s.speed;
      if(!prev||s!==prev){
        if(prev&&(prev.view!==s.view||prev.isolated!==s.isolated)){scene.remove(eye.root);disposeObject(eye.root);eye=buildEye(s.view==='cutaway'&&!s.isolated);scene.add(eye.root);}
        if(!prev||s.reset!==prev.reset||s.angle!==prev.angle||s.view!==prev.view||s.isolated!==prev.isolated||s.module!==prev.module){
          const target=s.isolated?new THREE.Box3().setFromObject(eye.parts[s.isolated]).getCenter(new THREE.Vector3()):new THREE.Vector3(s.view==='exploded'?.65:0,0,0);
          controls.target.copy(target);
          let d=s.isolated?2.8:s.view==='exploded'?7.0:s.module==='aqueous'?3.5:4.6;
          if(s.module==='aqueous'&&!s.isolated)controls.target.set(.45,0,0);
          const dir=s.angle==='front'?new THREE.Vector3(1,.01,.005):s.angle==='side'?new THREE.Vector3(.02,.01,1):new THREE.Vector3(.52,.24,.87).normalize();
          if(s.isolated){const sphere=new THREE.Box3().setFromObject(eye.parts[s.isolated]).getBoundingSphere(new THREE.Sphere());const limiting=Math.atan(Math.tan(THREE.MathUtils.degToRad(17))*Math.min(camera.aspect,1));d=Math.max(1.25,sphere.radius/Math.sin(limiting)*1.12);}
          if(s.view==='exploded'&&!s.isolated)d=Math.max(d,7/Math.min(camera.aspect,1));
          if(!s.isolated&&s.view!=='exploded'&&camera.aspect<.86)d*=.86/camera.aspect;
          camera.position.copy(controls.target).addScaledVector(dir,d);controls.update();
        }
        if(prev&&s.zoom!==prev.zoom){const delta=camera.position.clone().sub(controls.target);delta.multiplyScalar(Math.pow(.84,s.zoom-prev.zoom));delta.clampLength(controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(delta);}
        for(const id of Object.keys(eye.parts) as StructureId[]){
          const part=eye.parts[id];part.visible=s.isolated?id===s.isolated:!s.hidden.includes(id);part.position.x=s.view==='exploded'&&!s.isolated?explosion[id]:0;
          part.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const m=o.material as THREE.MeshStandardMaterial;if(o.userData.cataract)return;const base=m.userData.baseOpacity??1;
            m.opacity=base*(id===s.selected?s.opacity:1);if(id===s.selected&&['anterior','posterior','vitreous'].includes(id))m.opacity=Math.max(.22,m.opacity);
            m.transparent=m.opacity<1;m.depthWrite=m.opacity>.85;m.emissive.set(id===s.selected?'#375047':'#000000');m.emissiveIntensity=id===s.selected?.19:0;
          });
        }
        const severity=s.module==='cataract'?s.severity/100:0;
        const nm=eye.nucleus.material as THREE.MeshStandardMaterial;nm.color.set(s.cataract==='nuclear'?'#c49744':'#f4e2b7');nm.opacity=.14+(s.cataract==='nuclear'?severity*.83:0);nm.transparent=true;nm.depthWrite=nm.opacity>.85;
        eye.cortical.forEach(m=>{m.visible=s.module==='cataract'&&s.cataract==='cortical';(m.material as THREE.MeshStandardMaterial).opacity=severity*.86;m.scale.setScalar(.55+.45*severity);});
        eye.plaque.visible=s.module==='cataract'&&s.cataract==='psc';(eye.plaque.material as THREE.MeshStandardMaterial).opacity=severity*.95;
        rays.visible=s.module==='cataract'&&!s.isolated&&s.view!=='exploded';
        rayLines.forEach((line,i)=>{const attr=line.geometry.getAttribute('position') as THREE.BufferAttribute;attr.setXYZ(4,-.95,(i-3)*severity*.095,-.04+(i%3-1)*severity*.08);attr.needsUpdate=true;});
        flows.visible=s.module==='aqueous'&&!s.isolated&&s.view!=='exploded';
        tracks.forEach(t=>{t.line.visible=s.pathway==='both'||t.type==='shared'||t.type===s.pathway;});
        if(prev&&s.step!==prev.step&&!s.playing)time=s.step*1.6;
        prev=s;
      }
      particles.forEach(({mesh,path,offset})=>{mesh.visible=s.pathway==='both'||path.type==='shared'||s.pathway===path.type;const t=(time*(path.type==='shared'?.12:.19)+offset)%1;mesh.position.copy(path.curve.getPointAt(t));});
      if(s.module==='cataract')rayLines.forEach((l,i)=>{(l.material as THREE.LineBasicMaterial).opacity=s.playing?.28+.12*Math.sin(time*2+i):.35;});
      controls.update();
      const basic:StructureId[]=s.module==='aqueous'?['ciliary','posterior','anterior','trabecular','schlemm']:s.module==='cataract'?['lens','iris','retina']:['sclera','retina','cornea','lens','optic'];
      if(!basic.includes(s.selected))basic.push(s.selected);
      labels.current?.querySelectorAll<HTMLButtonElement>('[data-structure]').forEach(button=>{
        const id=button.dataset.structure as StructureId;const part=eye.parts[id];const visible=s.labels&&basic.includes(id)&&part.visible;
        button.style.display=visible?'block':'none';if(!visible)return;
        vec.set(...anchors[id]).add(part.position);vec.project(camera);
        const x=(vec.x*.5+.5)*el.clientWidth,y=(-vec.y*.5+.5)*el.clientHeight;
        button.style.left=`${Math.max(12,Math.min(el.clientWidth-145,x+(id==='optic'||id==='retina'||id==='sclera'?-110:25)))}px`;
        button.style.top=`${Math.max(105,Math.min(el.clientHeight-115,y+(id==='cornea'?-32:id==='lens'?15:-15)))}px`;
        button.style.opacity=vec.z>1?'0':'1';
      });
      if(!document.hidden)renderer.render(scene,camera);raf=requestAnimationFrame(frame);
    }
    raf=requestAnimationFrame(frame);setReady(true);
    return()=>{disposed=true;cancelAnimationFrame(raf);ro.disconnect();controls.dispose();disposeObject(eye.root);disposeObject(flows);disposeObject(rays);renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('pointercancel',pointerCancel);renderer.domElement.removeEventListener('keydown',keydown);renderer.domElement.removeEventListener('webglcontextlost',contextLost);renderer.dispose();renderer.domElement.remove();};
  },[]);
  return <div className="eye-scene" ref={host}>
    {!ready&&!error&&<div className="scene-loading"><span className="loader"/>Menyiapkan model 3D…</div>}
    {error&&<div className="scene-error" role="alert">{error}</div>}
    <div className="model-labels" ref={labels}>{structures.map(item=><button key={item.id} data-structure={item.id} className={`model-label ${state.selected===item.id?'selected':''}`} onClick={()=>onSelect(item.id)} style={{display:'none'}}><span style={{background:item.color}}/>{item.name}</button>)}</div>
  </div>;
}
