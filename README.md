# Ocula — Interactive Ophthalmology Atlas

A browser based, Indonesian language educational eye explorer for medical students. This is a functional first edition with a procedural right-eye model, not a clinically validated anatomical reconstruction.

## Run

Requires Node 22.13+.

    npm ci
    npm run dev

The portable preview starts at http://localhost:5173. Build with `npm run build`. Run the numerical anatomy checks with `node scripts/validate-eye.mjs` (Node 24 or newer) and type checking with `npx tsc --noEmit`.

## Implemented

- 14 independently selectable structures; orbit, touch, keyboard rotation, zoom, visibility, opacity, isolation, intact, cutaway, exploded, and camera presets.
- Guided layer exploration and contextual anatomy, spatial relations, clinical notes, source links, and knowledge checks.
- Aqueous production, posterior chamber, pupil, anterior chamber, conventional and uveoscleral routes. Pausable particles and step selection.
- Modified Goldmann steady state calculation with adjustable production, outflow facility, and uveoscleral outflow. This calculation does not drive a CFD simulation.
- Nuclear, cortical, and posterior subcapsular cataract patterns with animated opacity and qualitative optical scattering.
- Responsive work surface; no external model or texture downloads, no external AI calls, no account or storage requirements in the app. Sites may enforce private access at the hosting layer.

## Architecture

- `components/atlas/types.ts`: typed module, structure and scene contracts.
- `components/atlas/content.ts`: independently editable educational content and bibliography.
- `components/atlas/geometry.ts`: parameterized anatomy, spatial anchors, exploded offsets, material batches, and flow curves. Coordinates: +X anterior, +Y superior, +Z temporal; one unit approximately 12 mm.
- `components/atlas/EyeScene.tsx`: Three.js lifecycle, picking, camera, animation and label projection. All GPU resources are disposed on rebuild/unmount; repeated details are batched by structure/material.
- `components/atlas/Explorer.tsx`: shared interaction state and educational module UI. Optional feature-detected WebMCP tools read current state and select a structure.
- `components/atlas/atlas.css`: responsive layout and design tokens.

To extend the library, add a typed module ID and content, then its process renderer and lesson controls. To introduce externally reviewed GLB geometry, keep the existing `StructureId` and anchor contract and replace `buildEye`; preserve source/license metadata for each imported mesh. Histology and disease models should be separate, explicitly scaled views instead of increasing this globe's apparent anatomical precision.

## Scientific scope and validation

Read [SCIENTIFIC_MODEL.md](SCIENTIFIC_MODEL.md) for modeled relationships, simplifications, references, and review requirements. The app explicitly identifies enlarged structures and schematic animations. It is not a diagnostic, surgical-planning, patient-specific fluid, or refraction simulator.

Human Atlas inspired the interaction pattern. No source code or BodyParts3D data was copied. Uploaded Calgary Guide diagrams informed topic selection; diagrams are not redistributed. Referenced YouTube shorts could not be inspected because online access was throttled.

