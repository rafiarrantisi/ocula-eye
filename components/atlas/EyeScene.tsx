'use client';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {buildEye,anchors,explosion,disposeObject,flowPaths,buildCorneaSection,buildAngleWedge,buildLensSection,buildIrisCiliarySection,buildRetinaSection,buildONHSection,convectionLoops,microAnchors} from './geometry';
import {structures,corneaLayers,angleStructures,lensLayers,irisCiliaryStructures,retinaLayers,onhStructures,aqueousBalance,SCATTER_K} from './content';
import type {SceneState,StructureId} from './types';
import {buildMacro,positionParts,worldAnchor,buildConnectors} from './macroModel';
import {sectionPlane,isolationIds} from './exploration';
import {buildSectionCaps} from './sectionGeometry';

export interface FlowParams {production:number;facility:number;uveoscleral:number;}

const detailLists: Record<string,{id:string;name:string;color:string}[]> = {
  cornea: corneaLayers.map(l=>({id:l.id,name:l.name,color:l.color})),
  angle: angleStructures.map(l=>({id:l.id,name:l.name,color:l.color})),
  lens: lensLayers.map(l=>({id:l.id,name:l.name,color:l.color})),
  'iris-ciliary': irisCiliaryStructures.map(l=>({id:l.id,name:l.name,color:l.color})),
  retina: retinaLayers.map(l=>({id:l.id,name:l.name,color:l.color})),
  onh: onhStructures.map(l=>({id:l.id,name:l.name,color:l.color})),
};

export default function EyeScene({state,onSelect,onDetailSelect,flow}:{state:SceneState;onSelect:(id:StructureId)=>void;onDetailSelect?:(sub:string)=>void;flow?:FlowParams}){
  const host=useRef<HTMLDivElement>(null),labels=useRef<HTMLDivElement>(null),detailLabels=useRef<HTMLDivElement>(null);
  const current=useRef(state),select=useRef(onSelect),detailSelect=useRef(onDetailSelect),flowRef=useRef(flow);
  const [error,setError]=useState('');
  const [ready,setReady]=useState(false);
  useEffect(()=>{current.current=state;select.current=onSelect;detailSelect.current=onDetailSelect;flowRef.current=flow;},[state,onSelect,onDetailSelect,flow]);
  useEffect(()=>{
    if(!host.current)return;const el=host.current;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch{setError('Tampilan 3D memerlukan WebGL. Aktifkan akselerasi grafis browser atau gunakan browser yang mendukung WebGL. Penjelasan dan kontrol materi tetap tersedia.');return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.setClearColor(0x0b1016,0);
    renderer.localClippingEnabled=true;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.30;
    el.insertBefore(renderer.domElement,el.firstChild);renderer.domElement.setAttribute('aria-label','Model 3D mata. Seret untuk memutar, gulir untuk zoom, klik struktur untuk memilih. Gunakan tombol arah saat model difokuskan untuk memutar.');renderer.domElement.tabIndex=0;
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(34,1,.05,50);camera.position.set(2.4,1.1,4.05);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;controls.minDistance=1.15;controls.maxDistance=20;controls.enablePan=true;controls.target.set(-.02,0,0);controls.rotateSpeed=.7;
    const amb=new THREE.AmbientLight('#c0d8e9',1.7);scene.add(amb);
    const key=new THREE.DirectionalLight('#fff0d4',3.1);key.position.set(2,4,5);scene.add(key);
    const fill=new THREE.DirectionalLight('#8eb9df',1.35);fill.position.set(-4,0,3);scene.add(fill);
    const rim=new THREE.DirectionalLight('#dce8fa',2);rim.position.set(-1,3,-3);scene.add(rim);
    const lightBase={amb:1.7,key:3.1,fill:1.35,rim:2};
    function geometryKey(s:SceneState){return s.module==='anatomy'?'anatomy/'+JSON.stringify(s.biometry):'reference/'+s.view+'/'+s.isolated;}
    function createEye(s:SceneState){return buildMacro(s.module==='anatomy'?s.biometry:undefined,s.module!=='anatomy'&&s.view==='cutaway'&&!s.isolated);}
    let eye=createEye(current.current),modelKey=geometryKey(current.current);scene.add(eye.root);
    let caps=new THREE.Group(),connectors=new THREE.Group();scene.add(caps,connectors);
    const clip=new THREE.Plane();let cutting=false,sectionKey='',capDue=0;const cappedIds=new Set<StructureId>();
    const planeHelper=new THREE.PlaneHelper(clip,4,0x79c8bc);planeHelper.visible=false;scene.add(planeHelper);
    function clearCaps(){scene.remove(caps);disposeObject(caps);caps=new THREE.Group();scene.add(caps);cappedIds.clear();}
    function updateSection(s:SceneState,now:number){
      cutting=!s.detail&&s.module==='anatomy'&&s.view==='cutaway';
      clip.copy(sectionPlane(s.section));
      if(s.module==='anatomy'&&s.biometry.side==='left')clip.normal.z*=-1;
      eye.root.traverse(o=>{if(o instanceof THREE.Mesh){const m=o.material as THREE.MeshStandardMaterial;m.clippingPlanes=cutting?[clip]:[];}});
      planeHelper.visible=cutting&&s.section.showPlane;
      const key=JSON.stringify([cutting,s.section.azimuth,s.section.elevation,s.section.offset,s.section.flipped,modelKey,s.context,s.hidden,s.multiIsolated,s.isolated,s.peel]);
      if(key!==sectionKey){sectionKey=key;clearCaps();capDue=cutting?now+90:0;}
      scene.remove(connectors);disposeObject(connectors);connectors=s.detail?new THREE.Group():buildConnectors(s);scene.add(connectors);
    }
    const corneaDetail=buildCorneaSection();corneaDetail.root.visible=false;scene.add(corneaDetail.root);
    const angleDetail=buildAngleWedge();angleDetail.root.visible=false;scene.add(angleDetail.root);
    let microAcc=(current.current.accommodation??0)/100;
    let lensDetail=buildLensSection(microAcc);lensDetail.root.visible=false;scene.add(lensDetail.root);
    let irisCiliaryDetail=buildIrisCiliarySection(microAcc);irisCiliaryDetail.root.visible=false;scene.add(irisCiliaryDetail.root);
    const retinaDetail=buildRetinaSection();retinaDetail.root.visible=false;scene.add(retinaDetail.root);
    const onhDetail=buildONHSection();onhDetail.root.visible=false;scene.add(onhDetail.root);
    const detailRoots: Record<string,THREE.Group> = {cornea:corneaDetail.root,angle:angleDetail.root,lens:lensDetail.root,'iris-ciliary':irisCiliaryDetail.root,retina:retinaDetail.root,onh:onhDetail.root};
    const detailParts: Record<string,Record<string,THREE.Group>> = {cornea:corneaDetail.parts,angle:angleDetail.parts,lens:lensDetail.parts,'iris-ciliary':irisCiliaryDetail.parts,retina:retinaDetail.parts,onh:onhDetail.parts};
    function refreshLens(a:number){scene.remove(lensDetail.root);disposeObject(lensDetail.root);lensDetail=buildLensSection(a);lensDetail.root.visible=current.current.detail==='lens';scene.add(lensDetail.root);detailRoots.lens=lensDetail.root;detailParts.lens=lensDetail.parts;}
    function refreshIris(a:number){scene.remove(irisCiliaryDetail.root);disposeObject(irisCiliaryDetail.root);irisCiliaryDetail=buildIrisCiliarySection(a);irisCiliaryDetail.root.visible=current.current.detail==='iris-ciliary';scene.add(irisCiliaryDetail.root);detailRoots['iris-ciliary']=irisCiliaryDetail.root;detailParts['iris-ciliary']=irisCiliaryDetail.parts;}
    const flows=new THREE.Group();scene.add(flows);
    const pathData=flowPaths();
    const particles:{mesh:THREE.Mesh;path:typeof pathData[number];phase:number}[]=[];
    const tracks:{line:THREE.Line;type:string}[]=[];
    pathData.forEach(path=>{
      const geometry=new THREE.BufferGeometry().setFromPoints(path.curve.getPoints(100));const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:path.color,transparent:true,opacity:.23}));flows.add(line);tracks.push({line,type:path.type});
      for(let i=0;i<(path.type==='shared'?12:7);i++){const mesh=new THREE.Mesh(new THREE.SphereGeometry(.009,8,6),new THREE.MeshBasicMaterial({color:path.color}));flows.add(mesh);particles.push({mesh,path,phase:i/(path.type==='shared'?12:7)});}
    });
    // Loop konveksi termal bilik anterior (naik di iris hangat, turun di kornea dingin).
    const convGroup=new THREE.Group();scene.add(convGroup);
    const convLoops=convectionLoops();
    const convParticles:{mesh:THREE.Mesh;loop:THREE.CatmullRomCurve3;phase:number}[]=[];
    convLoops.forEach(loop=>{
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(loop.getPoints(80)),new THREE.LineBasicMaterial({color:'#9fd8e8',transparent:true,opacity:.16}));
      convGroup.add(line);
      for(let i=0;i<6;i++){const mesh=new THREE.Mesh(new THREE.SphereGeometry(.007,8,6),new THREE.MeshBasicMaterial({color:'#bfe9f5'}));convGroup.add(mesh);convParticles.push({mesh,loop,phase:i/6});}
    });
    // Optical rays are pedagogic paths; the model does not solve ray tracing.
    // Forward scatter widens them per cataract type (kortikal 1,0 / nuklear
    // 1,25 / PSC 1,45 — dari rasio straylight log(s) Labuz, ilustratif).
    const rays=new THREE.Group();scene.add(rays);
    const rayLines:THREE.Line[]=[];
    for(let i=0;i<7;i++){
      const y=(i-3)*.044;const pts=[new THREE.Vector3(1.5,y,.018),new THREE.Vector3(1.01,y,.018),new THREE.Vector3(.67,y*.70,.018),new THREE.Vector3(.34,y*.64,.018),new THREE.Vector3(-.95,0,-.04)];
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#f4cf83',transparent:true,opacity:.4}));rays.add(line);rayLines.push(line);
    }
    // Sumber silau malam: inti terang + 2 halo di depannya (efek straylight).
    const glare=new THREE.Group();scene.add(glare);
    const glareCore=new THREE.Mesh(new THREE.SphereGeometry(.030,12,8),new THREE.MeshBasicMaterial({color:'#fff6d8'}));glareCore.position.set(1.45,.10,.10);glare.add(glareCore);
    const haloMats:THREE.MeshBasicMaterial[]=[];
    [[.12,'#ffe9a8'],[.22,'#ffd98a']].forEach(([rr,col])=>{
      const m=new THREE.MeshBasicMaterial({color:col as string,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false});
      const ring=new THREE.Mesh(new THREE.RingGeometry((rr as number)*.82,rr as number,48),m);
      ring.position.set(1.44,.10,.10);ring.rotation.y=Math.PI/2;glare.add(ring);haloMats.push(m);
    });
    glare.visible=false;
    let prev:SceneState|null=null,time=0,pulseT=0,raf=0,last=performance.now(),disposed=false;
    let focusAnim:null|{t0:number;dur:number;fromT:THREE.Vector3;toT:THREE.Vector3;fromP:THREE.Vector3;toP:THREE.Vector3}=null;
    let prevFocusKey:string|null=null;
    let prevWholeKey:string|null=null;
    const vec=new THREE.Vector3();
    const resize=()=>{const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();prev=null;};
    const ro=new ResizeObserver(resize);ro.observe(el);resize();
    const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();let down={x:0,y:0};let activePointers=0,multitouch=false;
    function pointerDown(e:PointerEvent){focusAnim=null;activePointers++;if(activePointers>1)multitouch=true;down={x:e.clientX,y:e.clientY};}
    function pointerUp(e:PointerEvent){activePointers=Math.max(0,activePointers-1);if(multitouch){if(activePointers===0)multitouch=false;return;}if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)return;const b=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);raycaster.setFromCamera(pointer,camera);
      const detail=current.current.detail;
      if(detail&&detailRoots[detail]){
        const hits=raycaster.intersectObject(detailRoots[detail],true);
        const hit=hits.find(h=>typeof h.object.userData.detailSub==='string'&&h.object.userData.detailSub);
        if(hit&&detailSelect.current)detailSelect.current(hit.object.userData.detailSub as string);
        return;
      }
      const hits=raycaster.intersectObjects([eye.root,caps],true);const hit=hits.find(h=>{const id=h.object.userData.id as StructureId;const group=eye.parts[id];return group?.visible&&h.object.visible&&(!cutting||clip.distanceToPoint(h.point)>-1e-5)&&(!['vitreous','anterior','posterior','cornea','conjunctiva','tenon','orbital-fat','orbital-bone'].includes(id)||isolationIds(current.current).includes(id)||id===current.current.selected);});if(hit)select.current(hit.object.userData.id);
    }
    function pointerCancel(){activePointers=0;multitouch=false;}
    function keydown(e:KeyboardEvent){if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','='].includes(e.key)){e.preventDefault();const relative=camera.position.clone().sub(controls.target);const spherical=new THREE.Spherical().setFromVector3(relative);if(e.key==='ArrowLeft')spherical.theta-=.12;if(e.key==='ArrowRight')spherical.theta+=.12;if(e.key==='ArrowUp')spherical.phi=Math.max(.1,spherical.phi-.12);if(e.key==='ArrowDown')spherical.phi=Math.min(Math.PI-.1,spherical.phi+.12);if(e.key==='+'||e.key==='=')spherical.radius=Math.max(1.15,spherical.radius*.9);if(e.key==='-')spherical.radius=Math.min(10,spherical.radius/ .9);camera.position.copy(new THREE.Vector3().setFromSpherical(spherical).add(controls.target));controls.update();}}
    function contextLost(e:Event){e.preventDefault();setError('Konteks grafis terputus. Muat ulang halaman untuk memulihkan model 3D.');}
    // Terbang halus ke sub-struktur detail: target = anchor lapis, arah kamera
    // dipertahankan, jarak didekatkan. Dibatalkan saat pengguna memutar manual.
    function startFocusAnim(s:SceneState){
      const d=s.detail;if(!d||!s.detailSub)return;
      const anchor=microAnchors[s.detailSub];if(!anchor)return;
      const toT=new THREE.Vector3(anchor[0],anchor[1],anchor[2]);
      const dir=camera.position.clone().sub(controls.target);
      if(dir.lengthSq()<1e-6)dir.set(.52,.26,.82);dir.normalize();
      let dist=2.4;if(camera.aspect<.86)dist*=.86/camera.aspect;
      focusAnim={t0:performance.now(),dur:700,fromT:controls.target.clone(),toT,fromP:camera.position.clone(),toP:toT.clone().addScaledVector(dir,dist)};
    }
    // Pose overview tiap detail (dipakai snap + animasi kembali dari toggle).
    function detailPose(s:SceneState){
      const target=s.detail==='angle'?new THREE.Vector3(.35,.25,0):s.detail==='lens'?new THREE.Vector3(.05,.02,0):s.detail==='iris-ciliary'?new THREE.Vector3(.22,.32,0):s.detail==='retina'?new THREE.Vector3(.02,-.10,-.20):s.detail==='onh'?new THREE.Vector3(.05,.08,0):new THREE.Vector3(.05,.02,0);
      let d=s.detail==='angle'?3.4:s.detail==='iris-ciliary'?3.5:s.detail==='retina'?3.6:s.detail==='onh'?3.3:3.1;
      let dir:THREE.Vector3;
      if(s.detail==='angle'&&s.angle==='front')dir=new THREE.Vector3(.85,-.35,.4).normalize();
      else if(s.angle==='front')dir=new THREE.Vector3(1,.06,.06);
      else if(s.angle==='side')dir=new THREE.Vector3(.05,.08,1);
      else dir=new THREE.Vector3(.52,.26,.82).normalize();
      if(camera.aspect<.86)d*=.86/camera.aspect;
      return {target,dir,d};
    }
    function startDetailOverviewAnim(s:SceneState){
      const p=detailPose(s);
      focusAnim={t0:performance.now(),dur:700,fromT:controls.target.clone(),toT:p.target,fromP:camera.position.clone(),toP:p.target.clone().addScaledVector(p.dir,p.d)};
    }
    function presetDir(angle:SceneState['angle']){
      return angle==='front'?new THREE.Vector3(1,.01,.005):angle==='side'?new THREE.Vector3(.02,.01,1):new THREE.Vector3(.52,.24,.87).normalize();
    }
    // Fokus struktur utuh: bingkai bounding sphere grup terpilih. Hanya untuk
    // pergantian pilihan murni (bukan ganti modul/view/isolasi, bukan autoplay).
    function startWholeFocusAnim(s:SceneState,dirOv?:THREE.Vector3){
      const part=eye.parts[s.selected];if(!part)return;
      const box=new THREE.Box3().setFromObject(part);
      if(box.isEmpty())return;
      const sphere=box.getBoundingSphere(new THREE.Sphere());
      const toT=box.getCenter(new THREE.Vector3());
      const dir=dirOv??camera.position.clone().sub(controls.target);
      if(dir.lengthSq()<1e-6)dir.set(.52,.24,.87);dir.normalize();
      const limiting=Math.atan(Math.tan(THREE.MathUtils.degToRad(17))*Math.min(camera.aspect,1));
      const dist=Math.min(controls.maxDistance,Math.max(1.3,sphere.radius/Math.sin(limiting)*1.25));
      focusAnim={t0:performance.now(),dur:700,fromT:controls.target.clone(),toT,fromP:camera.position.clone(),toP:toT.clone().addScaledVector(dir,dist)};
    }
    renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('pointercancel',pointerCancel);renderer.domElement.addEventListener('keydown',keydown);renderer.domElement.addEventListener('webglcontextlost',contextLost);
    function frame(now:number){
      if(disposed)return;const s=current.current;const dt=Math.max(0,Math.min((now-last)/1000,.05));last=now;if(s.playing&&!document.hidden)time+=dt*s.speed;
      if(!prev||s!==prev){
        const detailChanged=!prev||prev.detail!==s.detail;
        if(detailChanged){
          eye.root.visible=!s.detail;
          corneaDetail.root.visible=s.detail==='cornea';
          angleDetail.root.visible=s.detail==='angle';
          lensDetail.root.visible=s.detail==='lens';
          irisCiliaryDetail.root.visible=s.detail==='iris-ciliary';
          retinaDetail.root.visible=s.detail==='retina';
          onhDetail.root.visible=s.detail==='onh';
          // Masuk dengan param akomodasi terkini agar cincin/otot sinkron.
          if(s.detail==='lens')refreshLens(microAcc);
          if(s.detail==='iris-ciliary')refreshIris(microAcc);
        }
        // Slider akomodasi membangun ulang lensa + iris-siliaris: ujung zonula
        // dan otot selalu dihitung dari geometri hasil morph (bukan di-scale).
        if((s.accommodation??0)/100!==microAcc){
          microAcc=(s.accommodation??0)/100;
          if(s.detail==='lens')refreshLens(microAcc);
          else if(s.detail==='iris-ciliary')refreshIris(microAcc);
        }
        if(geometryKey(s)!==modelKey){scene.remove(eye.root);disposeObject(eye.root);eye=createEye(s);scene.add(eye.root);modelKey=geometryKey(s);}
        eye.root.visible=!s.detail;positionParts(eye,s);updateSection(s,now);
        const focusKey=s.detail?s.detail+'|'+s.detailSub:null;
        const focusChanged=focusKey!==prevFocusKey;
        if(focusChanged){prevFocusKey=focusKey;focusAnim=null;if(focusKey&&s.detailSub)startFocusAnim(s);else if(s.detail)startDetailOverviewAnim(s);}
        // Pilihan utuh murni (klik struktur/label/daftar, bukan autoplay atau
        // ganti modul) ikut diterbangkan ke strukturnya.
        const wholeKey=(!s.detail&&!isolationIds(s).length)?s.selected:null;
        if(!prev)prevWholeKey=wholeKey;
        else if(wholeKey!==prevWholeKey){
          const pureSel=s.selected!==prev.selected&&s.module===prev.module&&s.view===prev.view&&s.isolated===prev.isolated&&s.reset===prev.reset&&!s.playing;
          prevWholeKey=wholeKey;
          if(pureSel&&wholeKey)startWholeFocusAnim(s);
        }
        if(!prev||s.reset!==prev.reset||(s.angle!==prev.angle&&!s.detail&&!wholeKey)||s.view!==prev.view||s.isolated!==prev.isolated||s.multiIsolated!==prev.multiIsolated||s.context!==prev.context||s.explosionGap!==prev.explosionGap||s.biometry.side!==prev.biometry.side||s.module!==prev.module||(detailChanged&&!s.detail)){
          if(s.detail){
            const p=detailPose(s);
            controls.target.copy(p.target);
            camera.position.copy(p.target).addScaledVector(p.dir,p.d);controls.update();
          } else {
          const isolated=isolationIds(s);
          const bounds=new THREE.Box3();
          for(const part of Object.values(eye.parts))if(part.visible)bounds.union(new THREE.Box3().setFromObject(part));
          const sphere=bounds.getBoundingSphere(new THREE.Sphere());
          const target=bounds.isEmpty()?new THREE.Vector3():bounds.getCenter(new THREE.Vector3());
          if(s.module==='aqueous'&&!isolated.length)target.set(.45,0,0);
          controls.target.copy(target);
          const dir=presetDir(s.angle);if(s.module==='anatomy'&&s.biometry.side==='left')dir.z*=-1;
          const limiting=Math.atan(Math.tan(THREE.MathUtils.degToRad(17))*Math.min(camera.aspect,1));
          let d=Math.max(1.4,sphere.radius/Math.sin(limiting)*1.12);
          if(s.module==='aqueous'&&!isolated.length)d=3.5/Math.min(1,camera.aspect/.86);
          camera.position.copy(controls.target).addScaledVector(dir,Math.min(controls.maxDistance,d));controls.update();focusAnim=null;
          }
        }
        // Ganti preset (Oblik/Anterior/Gonio/Lateral) saat fokus: bingkai ulang
        // di sekitar lapis/struktur yang sama, bukan lompat ke overview.
        if(s.detail&&prev&&!focusChanged&&s.angle!==prev.angle)startFocusAnim(s);
        if(!s.detail&&!s.isolated&&prev&&s.angle!==prev.angle&&wholeKey&&wholeKey===prevWholeKey)startWholeFocusAnim(s,presetDir(s.angle));
        if(prev&&s.zoom!==prev.zoom){focusAnim=null;const delta=camera.position.clone().sub(controls.target);delta.multiplyScalar(Math.pow(.84,s.zoom-prev.zoom));delta.clampLength(controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(delta);}
        for(const id of Object.keys(eye.parts) as StructureId[]){
          const part=eye.parts[id];
          part.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const m=o.material as THREE.MeshStandardMaterial;if(o.userData.cataract)return;const base=m.userData.baseOpacity??1;
            m.opacity=base*(id===s.selected?s.opacity:1);if(id===s.selected&&['anterior','posterior','vitreous'].includes(id))m.opacity=Math.max(.22,m.opacity);
            m.transparent=m.opacity<1;m.depthWrite=m.opacity>.85;m.emissive.set(id===s.selected?'#375047':'#000000');m.emissiveIntensity=id===s.selected?.19:0;
          });
        }
        const severity=s.module==='cataract'?s.severity/100:0;
        // Brunescence nuklear: kuning jernih → cokelat seiring severity.
        const nm=eye.nucleus.material as THREE.MeshStandardMaterial;
        nm.color.set('#f4e2b7');
        if(s.cataract==='nuclear')nm.color.lerp(new THREE.Color('#8a5a1e'),severity);
        nm.opacity=.14+(s.cataract==='nuclear'?severity*.83:0);nm.transparent=true;nm.depthWrite=nm.opacity>.85;
        eye.cortical.forEach(m=>{m.visible=s.module==='cataract'&&s.cataract==='cortical';(m.material as THREE.MeshStandardMaterial).opacity=severity*.86;m.scale.setScalar(.55+.45*severity);});
        eye.plaque.visible=s.module==='cataract'&&s.cataract==='psc';(eye.plaque.material as THREE.MeshStandardMaterial).opacity=severity*.95;
        if(!prev||s.lighting!==prev.lighting){
          const dim=s.lighting==='night'?.5:1;
          amb.intensity=lightBase.amb*dim;key.intensity=lightBase.key*dim;fill.intensity=lightBase.fill*dim;rim.intensity=lightBase.rim*dim;
          rayLines.forEach(l=>{(l.material as THREE.LineBasicMaterial).color.set(s.lighting==='night'?'#ffe9a8':'#f4cf83');});
        }
        rays.visible=!s.detail&&s.module==='cataract'&&!s.isolated&&s.view!=='exploded';
        // Penyebaran forward-scatter per tipe (kortikal acuan 1,0).
        const sk=SCATTER_K[s.cataract]??1;
        rayLines.forEach((line,i)=>{const attr=line.geometry.getAttribute('position') as THREE.BufferAttribute;attr.setXYZ(4,-.95,(i-3)*severity*.095*sk,-.04+(i%3-1)*severity*.08*sk);attr.needsUpdate=true;});
        flows.visible=!s.detail&&s.module==='aqueous'&&!s.isolated&&s.view!=='exploded';
        convGroup.visible=flows.visible;
        tracks.forEach(t=>{t.line.visible=s.pathway==='both'||t.type==='shared'||t.type===s.pathway;});
        if(prev&&s.step!==prev.step&&!s.playing)time=s.step*1.6;
        caps.traverse(o=>{if(o instanceof THREE.Mesh){const m=o.material as THREE.MeshStandardMaterial;m.opacity=o.userData.id===s.selected?s.opacity:1;m.transparent=m.opacity<1;m.depthWrite=m.opacity>.85;}});
        prev=s;
      }
      if(capDue&&now>=capDue){
        capDue=0;scene.remove(caps);disposeObject(caps);caps=buildSectionCaps(eye.root,clip);scene.add(caps);cappedIds.clear();caps.children.forEach(c=>cappedIds.add(c.userData.id));
        caps.traverse(o=>{if(o instanceof THREE.Mesh){const m=o.material as THREE.MeshStandardMaterial;m.opacity=o.userData.id===s.selected?s.opacity:1;m.transparent=m.opacity<1;m.depthWrite=m.opacity>.85;}});
      }
      // Fokus detail setiap frame: opacity + emissive meredup/menyala bertahap
      // (fade), lalu animasi kamera ease-in-out bila ada. Tanpa pilihan
      // (toggle lepas) semuanya kembali terang penuh.
      if(s.detail&&detailRoots[s.detail]){
        const k=1-Math.exp(-7*dt);
        detailRoots[s.detail].traverse(o=>{
          if(!(o instanceof THREE.Mesh))return;
          const m=o.material as THREE.MeshStandardMaterial;
          const sub=o.userData.detailSub as string|undefined;
          const base=(m.userData.baseOpacity as number)??1;
          let tOp:number,tEm:number;
          if(!s.detailSub){tOp=base;tEm=0;}
          else if(!sub){tOp=base*.5;tEm=0;}
          else if(sub===s.detailSub){tOp=base;tEm=.35;}
          else{tOp=Math.max(.04,base*.18);tEm=0;}
          m.opacity+=(tOp-m.opacity)*k;
          m.transparent=m.opacity<.999;m.depthWrite=m.opacity>.85;
          m.emissive.set(sub&&sub===s.detailSub?'#3d5347':'#000000');
          m.emissiveIntensity+=(tEm-m.emissiveIntensity)*k;
        });
      }
      if(focusAnim){
        const t=Math.min(1,(now-focusAnim.t0)/focusAnim.dur);
        const e=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
        controls.target.lerpVectors(focusAnim.fromT,focusAnim.toT,e);
        camera.position.lerpVectors(focusAnim.fromP,focusAnim.toP,e);
        if(t>=1)focusAnim=null;
      }
      // Aliran reaktif: kecepatan partikel ∝ laju tiap cabang dari neraca
      // Goldmann (F/C/U panel), plus denyut ±15% (~72/mnt). Konveksi termal
      // bergerak terus walau animasi dijeda.
      const fl=flowRef.current??{production:2.5,facility:.3,uveoscleral:.5};
      const bal=aqueousBalance(fl.production,fl.facility,fl.uveoscleral,9);
      pulseT+=dt;
      const pulse=1+.15*Math.sin(pulseT*Math.PI*2*1.2);
      const inAq=s.module==='aqueous'&&!s.detail;
      if(s.playing&&!document.hidden&&inAq){
        for(const p of particles){
          const v=p.path.type==='shared'?.12*(fl.production/2.5):p.path.type==='trabecular'?.19*(bal.qconv/2.0):.19*(bal.quv/.5);
          p.phase=(p.phase+dt*s.speed*v*pulse)%1;
        }
        for(const c of convParticles)c.phase=(c.phase+dt*s.speed*.05*pulse)%1;
      }else{
        for(const c of convParticles)c.phase=(c.phase+dt*.015)%1;
      }
      for(const p of particles){p.mesh.visible=inAq&&(s.pathway==='both'||p.path.type==='shared'||s.pathway===p.path.type);p.mesh.position.copy(p.path.curve.getPointAt(p.phase));}
      const convVis=inAq&&!s.isolated&&s.view!=='exploded';
      convGroup.visible=convVis;
      for(const c of convParticles){c.mesh.visible=convVis;c.mesh.position.copy(c.loop.getPointAt(c.phase));}
      // Halo silau malam: intensitas ∝ straylight tipe × severity.
      const night=s.lighting==='night';
      glare.visible=!s.detail&&s.module==='cataract'&&night&&!s.isolated&&s.view!=='exploded';
      if(glare.visible){
        const sev=s.module==='cataract'?s.severity/100:0;
        const kk=(SCATTER_K[s.cataract]??1)*sev;
        haloMats[0].opacity=Math.min(.7,kk*1.1);
        haloMats[1].opacity=Math.min(.55,kk*.8);
        glare.scale.setScalar(1+.04*Math.sin(pulseT*7));
      }
      if(s.module==='cataract')rayLines.forEach((l,i)=>{(l.material as THREE.LineBasicMaterial).opacity=s.playing?.28+.12*Math.sin(time*2+i):.35;});
      controls.update();
      const basic:StructureId[]=s.module==='aqueous'?['ciliary','posterior','anterior','trabecular','schlemm']:s.module==='cataract'?['lens','iris','retina']:['sclera','retina','cornea','lens','optic'];
      if(s.context==='orbit')basic.splice(0,basic.length,'rectus-superior','rectus-lateral','lacrimal-gland','nasolacrimal','optic');if(isolationIds(s).length)basic.splice(0,basic.length,...isolationIds(s));if(!basic.includes(s.selected))basic.push(s.selected);
      labels.current?.querySelectorAll<HTMLButtonElement>('[data-structure]').forEach(button=>{
        const id=button.dataset.structure as StructureId;const part=eye.parts[id];const anchor=worldAnchor(id,s);const clipped=cutting&&clip.distanceToPoint(anchor)<0;if(clipped&&cappedIds.has(id))clip.projectPoint(anchor,anchor);const visible=!s.detail&&s.labels&&basic.includes(id)&&part.visible&&(!clipped||cappedIds.has(id));
        button.style.display=visible?'block':'none';if(!visible)return;
        vec.copy(anchor);vec.project(camera);
        const x=(vec.x*.5+.5)*el.clientWidth,y=(-vec.y*.5+.5)*el.clientHeight;
        button.style.left=`${Math.max(12,Math.min(el.clientWidth-145,x+(id==='optic'||id==='retina'||id==='sclera'?-110:25)))}px`;
        button.style.top=`${Math.max(105,Math.min(el.clientHeight-115,y+(id==='cornea'?-32:id==='lens'?15:-15)))}px`;
        button.style.opacity=vec.z>1?'0':'1';
      });
      detailLabels.current?.querySelectorAll<HTMLButtonElement>('[data-detail-sub]').forEach(button=>{
        const sub=button.dataset.detailSub as string;const anchor=microAnchors[sub];
        const visible=!!s.detail&&s.labels&&!!anchor&&(detailLists[s.detail!]??[]).some(l=>l.id===sub);
        button.style.display=visible?'block':'none';if(!visible||!anchor)return;
        vec.set(...anchor);vec.project(camera);
        const x=(vec.x*.5+.5)*el.clientWidth,y=(-vec.y*.5+.5)*el.clientHeight;
        button.style.left=`${Math.max(12,Math.min(el.clientWidth-150,x+22))}px`;
        button.style.top=`${Math.max(105,Math.min(el.clientHeight-115,y-14))}px`;
        button.style.opacity=vec.z>1?'0':'1';
      });
      if(!document.hidden)renderer.render(scene,camera);raf=requestAnimationFrame(frame);
    }
    raf=requestAnimationFrame(frame);setReady(true);
    return()=>{disposed=true;cancelAnimationFrame(raf);ro.disconnect();controls.dispose();disposeObject(eye.root);disposeObject(caps);disposeObject(connectors);disposeObject(planeHelper);disposeObject(corneaDetail.root);disposeObject(angleDetail.root);disposeObject(lensDetail.root);disposeObject(irisCiliaryDetail.root);disposeObject(retinaDetail.root);disposeObject(onhDetail.root);disposeObject(flows);disposeObject(convGroup);disposeObject(rays);disposeObject(glare);renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('pointercancel',pointerCancel);renderer.domElement.removeEventListener('keydown',keydown);renderer.domElement.removeEventListener('webglcontextlost',contextLost);renderer.dispose();renderer.domElement.remove();};
  },[]);
  return <div className="eye-scene" ref={host}>
    {!ready&&!error&&<div className="scene-loading"><span className="loader"/>Menyiapkan model 3D…</div>}
    {error&&<div className="scene-error" role="alert">{error}</div>}
    <div className="model-labels" ref={labels}>{structures.map(item=><button key={item.id} data-structure={item.id} className={`model-label ${state.selected===item.id?'selected':''}`} onClick={()=>onSelect(item.id)} style={{display:'none'}}><span style={{background:item.color}}/>{item.name}</button>)}</div>
    <div className="model-labels" ref={detailLabels}>{state.detail&&detailLists[state.detail]?.map(item=><button key={item.id} data-detail-sub={item.id} className={`model-label ${state.detailSub===item.id?'selected':''}`} onClick={()=>onDetailSelect?.(item.id)} style={{display:'none'}}><span style={{background:item.color}}/>{item.name}</button>)}</div>
  </div>;
}
