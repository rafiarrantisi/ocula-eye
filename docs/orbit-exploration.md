# Orbital exploration

The main Anatomy module now supports 32 selectable structures: the original 14
globe structures plus conjunctiva, Tenon, orbital walls/fat, six extraocular
muscles, levator, two lids, lacrimal gland, puncta, canaliculi, lacrimal sac, and
nasolacrimal duct. Existing microscopic views and physiology modules remain
independent reference models.

## Controls

Use **Ruang eksplorasi** at the top of the inspector. Its three disclosures
contain biometric variation, free sectioning, and dissection/explosion. The
globe/orbit switch changes the available structural context. Existing selection,
visibility, labels, camera controls, and light/dark themes still apply.

- Variation presets explicitly describe normal examples, age examples, risk
  morphology, or teaching exaggeration. Manual values have no clinical category.
- Multi-isolation temporarily overrides hidden and peeled structures. Leaving
  isolation restores the prior dissection. Changing a checkbox does not overwrite
  the inspector's independently selected structure.
- Peeling is cumulative and reversible. Selecting a peeled structure from the
  main list restores the layers so the selection can be seen.
- Explosion preserves multiple isolated structures. A zero gap exactly restores
  their resting positions; dashed connectors and origin dots show displacement.
- Sections work in the macro Anatomy module, including isolated groups. Sagittal,
  coronal, and axial presets can be rotated, tilted, translated, and flipped.

## Geometry and scope

The model uses +X anterior, +Y superior, and +Z temporal for the right eye, with
12 mm per model unit. The left model mirrors Z, including anatomy, anchors,
connectors, and section orientation. The nasolacrimal system remains medial;
the lacrimal gland remains superotemporal. Superior oblique turns through the
trochlea; inferior oblique originates anteriorly rather than at the rectus apex.

Axial length is the anterior corneal pole to posterior scleral pole. Internal
anterior chamber depth is central endothelium to the anterior lens pole. Pupil
diameter changes the iris aperture. Age changes lens thickness using an explicit
illustrative coefficient; the age preset also adjusts chamber depth. This is
not a population regression, patient-specific reconstruction, or diagnostic
classification. Slider bounds are experimental bounds, not reference intervals.
The anterior vitreous boundary stays behind the lens at extreme combinations.

The walls, connective tissue, lid ribbons, and lacrimal ducts are schematic.
Wall sutures/foramina, orbital soft-tissue pulleys, lacrimal valves, lid histology,
and force-based eye movements are not modeled. Thin tissues and ducts are
enlarged for legibility. Structures remain in primary gaze. Academic references
and their scope are listed in the app's **Sumber & model** dialog.

Section caps come from triangle/plane intersections of closed tissue meshes.
Welded contours are nested and triangulated with holes. Hollow coats and iris
apertures therefore remain hollow; caps are not generic disks. Transparent
aqueous/vitreous spaces do not receive opaque solid caps. Clipping updates
immediately; cap regeneration is briefly deferred while the plane is moving.

## Implementation and validation

- `orbitContent.ts`: typed orbital inventory and descriptions.
- `orbitGeometry.ts`: closed orbital surfaces, landmark anchors, displacement.
- `exploration.ts`: biometric transforms and independent visibility rules.
- `macroModel.ts`: reference-based construction and world-space anchors.
- `sectionGeometry.ts`: contour extraction, containment, and triangulation.
- `ExplorationPanel.tsx`: accessible disclosures and controls.

Run `node scripts/validate-eye.mjs`, `node scripts/validate-exploration.mjs`, and
`node node_modules/typescript/bin/tsc --noEmit`. Geometry checks cover biometric
measurements, left/right symmetry, extreme lens/vitreous separation, reversible
visibility, explosion origins, section area, holes, oblique/outside planes, and
the existing six micro views and physiology models. Browser checks cover the
actual controls, mobile/desktop layouts, both themes, and module transitions.
