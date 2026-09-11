export type ModuleId = 'anatomy' | 'aqueous' | 'cataract';
export type ViewMode = 'cutaway' | 'intact' | 'exploded';
export type CataractType = 'nuclear' | 'cortical' | 'psc';
export type StructureId = 'sclera' | 'choroid' | 'retina' | 'cornea' | 'iris' | 'lens' | 'ciliary' | 'zonules' | 'vitreous' | 'anterior' | 'posterior' | 'trabecular' | 'schlemm' | 'optic';
export interface Structure {
  id: StructureId; name: string; latin: string; group: string; color: string;
  description: string; function: string; relation: string; clinical: string;
  fact: string; sources: string[];
}
export interface SceneState {
  module: ModuleId; view: ViewMode; selected: StructureId; hidden: StructureId[];
  isolated: StructureId | null; labels: boolean; opacity: number; playing: boolean;
  speed: number; step: number; pathway: 'both' | 'trabecular' | 'uveoscleral';
  cataract: CataractType; severity: number; reset: number; zoom: number; angle: 'oblique' | 'front' | 'side';
}
