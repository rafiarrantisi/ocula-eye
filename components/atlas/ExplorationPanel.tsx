'use client';
import {useState} from 'react';
import {ChevronRight,Layers3,Move3D,Scissors,SlidersHorizontal,RotateCcw} from 'lucide-react';
import {Slider} from '@/components/ui/slider';
import {structures} from './content';
import {DEFAULT_BIOMETRY,DEFAULT_SECTION,variationPresets,peelStages,isolationIds,lensThickness} from './exploration';
import {isOrbital} from './orbitContent';
import type {SceneState,Biometry,SectionSettings,StructureId} from './types';

function Range({label,value,min,max,step=1,unit='',onChange}:{label:string;value:number;min:number;max:number;step?:number;unit?:string;onChange:(n:number)=>void}){
 return <div className="range-control"><div><span>{label}</span><output>{Number(value.toFixed(2))}{unit}</output></div><Slider aria-label={label} value={[value]} min={min} max={max} step={step} onValueChange={v=>onChange(v[0])}/></div>;
}
function Fold({title,icon,children}:{title:string;icon:React.ReactNode;children:React.ReactNode}){return <details className="fold exploration-fold"><summary>{icon}<span>{title}</span><ChevronRight size={15}/></summary><div className="fold-body">{children}</div></details>;}
export default function ExplorationPanel({state:s,update}:{state:SceneState;update:(p:Partial<SceneState>)=>void}){
 const [filter,setFilter]=useState('');
 const bio=(p:Partial<Biometry>)=>update({biometry:{...s.biometry,...p,preset:'custom'}});
 const section=(p:Partial<SectionSettings>)=>update({section:{...s.section,...p},view:'cutaway'});
 const isolated=isolationIds(s),preset=variationPresets.find(p=>p.id===s.biometry.preset);
 function toggle(id:StructureId){const next=isolated.includes(id)?isolated.filter(i=>i!==id):[...isolated,id];update({multiIsolated:next,isolated:null,context:next.some(isOrbital)?'orbit':s.context});}
 return <div className="exploration-panel">
  <div className="exploration-heading"><Move3D size={17}/><span>Ruang eksplorasi</span><span className="count-badge">BARU</span></div>
  <div className="context-switch" role="group" aria-label="Konteks anatomi">
   <button aria-pressed={s.context==='globe'} onClick={()=>update({context:'globe',multiIsolated:[],isolated:null,peel:0,selected:isOrbital(s.selected)?'lens':s.selected,reset:s.reset+1})}>Bola mata</button>
   <button aria-pressed={s.context==='orbit'} onClick={()=>update({context:'orbit',multiIsolated:[],isolated:null,peel:0,reset:s.reset+1})}>Mata & orbita</button>
  </div>
  <p className="exploration-caption">{s.context==='orbit'?'32 struktur · selubung, otot, kelopak & lakrimal':'14 struktur globe · ganti konteks untuk anatomi orbita'}</p>
  <Fold title="Variasi anatomi" icon={<SlidersHorizontal size={16}/>}>
   <div className="context-switch" role="group" aria-label="Sisi mata">{(['right','left'] as const).map(side=><button key={side} aria-pressed={s.biometry.side===side} onClick={()=>update({biometry:{...s.biometry,side}})}>{side==='right'?'Kanan · OD':'Kiri · OS'}</button>)}</div>
   <label className="exploration-label" htmlFor="variation-preset">Contoh konfigurasi</label>
   <select id="variation-preset" value={s.biometry.preset} onChange={e=>{const p=variationPresets.find(p=>p.id===e.target.value);if(p)update({biometry:{...s.biometry,...p.values,preset:p.id}});}}>
    {variationPresets.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}<option value="custom" disabled>Parameter manual</option>
   </select>
   <div className={`variation-kind ${s.biometry.preset==='long'||s.biometry.preset==='shallow'?'risk':''}`}>{preset?.kind??'Parameter manual · bukan kategori klinis'}</div>
   <Range label="Panjang aksial" value={s.biometry.axialLength} min={20} max={30} step={.1} unit=" mm" onChange={axialLength=>bio({axialLength})}/>
   <Range label="Kedalaman bilik anterior" value={s.biometry.chamberDepth} min={2} max={4.5} step={.1} unit=" mm" onChange={chamberDepth=>bio({chamberDepth})}/>
   <Range label="Diameter pupil" value={s.biometry.pupilDiameter} min={2} max={8} step={.1} unit=" mm" onChange={pupilDiameter=>bio({pupilDiameter})}/>
   <Range label="Usia ilustratif" value={s.biometry.age} min={18} max={80} unit=" tahun" onChange={age=>bio({age})}/>
   <p className="small-note">Usia mengubah tebal lensa secara ilustratif ({lensThickness(s.biometry.age).toFixed(2)} mm). Kedalaman bilik tetap mengikuti slider; preset usia tua menyesuaikan keduanya. ACD diukur dari endotel kornea ke kutub anterior lensa.</p>
   <p className="small-note">Rentang slider adalah ruang eksperimen, bukan batas normal. Mata memanjang dan bilik dangkal tidak menetapkan diagnosis. Dimensi jaringan tipis dan saluran diperbesar agar terbaca; kombinasi ekstrem tidak mewakili mata pasien.</p>
   <button className="exploration-reset" onClick={()=>update({biometry:{...DEFAULT_BIOMETRY,side:s.biometry.side}})}><RotateCcw size={14}/>Pulihkan ukuran acuan</button>
  </Fold>
  <Fold title="Potongan bebas" icon={<Scissors size={16}/>}>
   <p className="small-note">Geser dan putar bidang untuk membuka volume jaringan. Potongan mengikuti ukuran dan sisi mata yang dipilih.</p>
   <div className="preset-row" role="group" aria-label="Arah bidang potong">
    <button aria-pressed={s.view==='cutaway'&&s.section.azimuth===90&&s.section.elevation===0} onClick={()=>section({azimuth:90,elevation:0})}>Sagital</button>
    <button aria-pressed={s.view==='cutaway'&&s.section.azimuth===0&&s.section.elevation===0} onClick={()=>section({azimuth:0,elevation:0})}>Koronal</button>
    <button aria-pressed={s.view==='cutaway'&&s.section.elevation===90} onClick={()=>section({azimuth:0,elevation:90})}>Aksial</button>
   </div>
   <Range label="Kedalaman bidang" value={s.section.offset} min={-36} max={24} step={.2} unit=" mm" onChange={offset=>section({offset})}/>
   <Range label="Putar bidang (azimut)" value={s.section.azimuth} min={0} max={180} unit="°" onChange={azimuth=>section({azimuth})}/>
   <Range label="Kemiringan bidang" value={s.section.elevation} min={-90} max={90} unit="°" onChange={elevation=>section({elevation})}/>
   <label className="exploration-check"><input type="checkbox" checked={s.section.flipped} onChange={e=>section({flipped:e.target.checked})}/><span>Balik sisi yang dipertahankan</span></label>
   <label className="exploration-check"><input type="checkbox" checked={s.section.showPlane} onChange={e=>section({showPlane:e.target.checked})}/><span>Tampilkan panduan bidang</span></label>
   <p className="small-note">0 mm = pusat koordinat globe acuan. Warna bidang potong mengikuti jaringan. Ruang aqueous dan vitreus tetap transparan. Pada kedalaman di luar model, potongan dapat menyisakan semua atau menghilangkan semua struktur.</p>
   <button className="exploration-reset" onClick={()=>update({section:{...DEFAULT_SECTION},view:'cutaway'})}><RotateCcw size={14}/>Potongan tengah</button>
  </Fold>
  <Fold title="Diseksi & pemisahan" icon={<Layers3 size={16}/>}>
   <label className="exploration-label" htmlFor="peel-stage">Diseksi bertahap · {s.peel}/{peelStages.length-1}</label>
   <select id="peel-stage" value={s.peel} onChange={e=>update({peel:Number(e.target.value),isolated:null,multiIsolated:[]})}>{peelStages.map((p,i)=><option value={i} key={p.title}>{i}. {p.title}</option>)}</select>
   <div className="dissection-step"><button disabled={s.peel===0} onClick={()=>update({peel:s.peel-1,isolated:null,multiIsolated:[]})}>Kembalikan lapisan</button><button disabled={s.peel===peelStages.length-1} onClick={()=>update({peel:s.peel+1,isolated:null,multiIsolated:[]})}>Kupas berikutnya</button></div>
   <Range label="Jarak pemisahan" value={s.explosionGap} min={0} max={2} step={.05} unit="×" onChange={explosionGap=>update({explosionGap,view:'exploded'})}/>
   <label className="exploration-check"><input type="checkbox" checked={s.connectors} onChange={e=>update({connectors:e.target.checked})}/><span>Garis ke posisi asal</span></label>
   <p className="small-note">Titik kecil menandai posisi sebelum dipisahkan. Jarak 0× menyatukan kembali struktur; jarak pemisahan bukan ukuran anatomi.</p>
   <div className="isolation-heading"><strong>Isolasi beberapa struktur</strong><output>{isolated.length} dipilih</output></div>
   <input className="structure-search" aria-label="Cari struktur untuk isolasi" placeholder="Cari nama struktur…" value={filter} onChange={e=>setFilter(e.target.value)}/>
   <div className="multi-structure-list">{structures.filter(item=>(s.context==='orbit'||!isOrbital(item.id))&&(item.name+' '+item.latin).toLowerCase().includes(filter.toLowerCase())).map(item=><label key={item.id} className="exploration-check"><input type="checkbox" checked={isolated.includes(item.id)} onChange={()=>toggle(item.id)}/><i style={{background:item.color}}/><span>{item.name}</span></label>)}</div>
   {isolated.length>0&&<button className="exploration-reset" onClick={()=>update({isolated:null,multiIsolated:[]})}>Keluar isolasi · pulihkan diseksi</button>}
   <p className="small-note">Centang untuk melihat kelompok terpilih bersama-sama. Isolasi sementara mengesampingkan lapisan yang dikupas atau disembunyikan; keluar isolasi memulihkan keadaan sebelumnya.</p>
  </Fold>
 </div>;
}
