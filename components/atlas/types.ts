import type { DRScenario } from '../../lib/domain/simulation/dr.ts';

export type ModuleId = 'anatomy' | 'aqueous' | 'cataract' | 'mechanism';
export type ViewMode = 'cutaway' | 'intact' | 'exploded';
export type CataractType = 'nuclear' | 'cortical' | 'psc';
export type GlobeStructureId = 'sclera' | 'choroid' | 'retina' | 'cornea' | 'iris' | 'lens' | 'ciliary' | 'zonules' | 'vitreous' | 'anterior' | 'posterior' | 'trabecular' | 'schlemm' | 'optic';
export type OrbitalStructureId = 'conjunctiva' | 'tenon' | 'rectus-superior' | 'rectus-inferior' | 'rectus-medial' | 'rectus-lateral' | 'oblique-superior' | 'oblique-inferior' | 'levator' | 'orbital-fat' | 'orbital-bone' | 'upper-lid' | 'lower-lid' | 'lacrimal-gland' | 'puncta' | 'canaliculi' | 'lacrimal-sac' | 'nasolacrimal';
export type StructureId = GlobeStructureId | OrbitalStructureId;
export interface Biometry { side:'right'|'left'; axialLength:number; chamberDepth:number; pupilDiameter:number; age:number; preset:string; }
export interface SectionSettings { azimuth:number; elevation:number; offset:number; flipped:boolean; showPlane:boolean; }
export interface Structure {
  id: StructureId; name: string; latin: string; group: string; color: string;
  description: string; function: string; relation: string; clinical: string;
  fact: string; sources: string[];
}
export type DetailView = null | 'cornea' | 'angle' | 'lens' | 'iris-ciliary' | 'retina' | 'onh';
export interface SceneState {
  module: ModuleId; view: ViewMode; selected: StructureId; hidden: StructureId[];
  isolated: StructureId | null; labels: boolean; opacity: number; playing: boolean;
  speed: number; step: number; pathway: 'both' | 'trabecular' | 'uveoscleral';
  cataract: CataractType; severity: number; reset: number; zoom: number; angle: 'oblique' | 'front' | 'side';
  detail: DetailView; detailSub: string | null; accommodation: number; lighting: 'day' | 'night';
  context:'globe'|'orbit'; biometry:Biometry; section:SectionSettings;
  multiIsolated:StructureId[]; peel:number; explosionGap:number; connectors:boolean;
  drScenario:DRScenario; drFocus:string[];
}
