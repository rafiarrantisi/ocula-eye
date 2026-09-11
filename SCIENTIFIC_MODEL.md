# Scientific model and review notes

## Status

Functional educational first edition, September 2026. Parametric teaching geometry; not an externally reviewed, segmented, histological, diagnostic or surgical model. Scientific source checking does not equal specialist validation. The interface discloses these limits.

## Coordinates and representation

Right eye. +X anterior, +Y superior, +Z temporal. One geometry unit is approximately 12 mm. Scleral globe radius is 1 unit, corneal curvature radius 0.675 units; lens radius 0.39 units, thickness 0.34 units. These are illustrative adult proportions, not a biometric reference population. Variation with age, refraction and accommodation is not modeled.

The sclera, choroid and retina are nested, posterior coats; the retinal shell ends before the ciliary body. The lens is posterior to the iris. The pupil is an aperture, not a solid structure. Anterior and posterior aqueous chambers are separate from the vitreous cavity. Zonules connect ciliary region to lens equator. The optic disc is nasal relative to the illustrated macular landmark.

The cutaway removes the near hemisphere of outer coats and portions of the anterior segment. Residual surfaces and selected transparent compartments do not have clinical section thickness. Exploded view deliberately displaces anatomy and pauses the display of flow routes. Tissue colors, channel caliber, shell thicknesses, fibers and vessels are visually emphasized. Iris striae, ciliary processes and retinal vessel branches are procedural, not recovered from microscopy. The nerve exit is an illustrative overlap with the coats, not a modeled lamina cribrosa or scleral canal.

## Aqueous physiology

Routes follow ciliary processes → posterior chamber → pupil → anterior chamber. The production explanation identifies active secretion at nonpigmented ciliary epithelium, with diffusion/ultrafiltration distinguished. Conventional outflow goes via trabecular meshwork, Schlemm canal and collector channels to episcleral drainage. Uveoscleral outflow is illustrated through ciliary muscle toward suprachoroidal space and sclera. Relative pathway contributions are not fixed; particle counts do not encode fractions or measured velocity.

Convection is described in text for the upright eye but not simulated by the radial transit curves. Blood–aqueous barrier cells, episcleral venous plexus detail, pressure-dependent tissue deformation, pulsatility, circadian rhythm and medication effects are not simulated. The independent pressure sandbox uses steady-state modified Goldmann: P = (F − U)/C + Pv, Pv = 9 mmHg. A smaller C means greater resistance. Numerical values are hypothetical inputs and cannot establish glaucoma.

## Cataract

Nuclear: progressive central yellow/brown opacity. Cortical: radial peripheral opacities. PSC: a plaque in front of the posterior capsule. These represent location and optical scattering qualitatively. The severity slider is not LOCS, age, probability, or measured visual acuity. The optotype panel is a contrast analogy, not a patient vision simulator. All rays are schematic; refraction and accommodation are not solved.

Myopic shift is associated particularly with nuclear sclerosis. Lens intumescence and secondary angle closure (phacomorphic) are distinguished from protein-associated open-angle outflow obstruction (phacolytic). Neither complication is represented as an inevitable endpoint, and hypermaturity is not equated with swelling.

## Primary references in the interface

- [Webvision: Gross Anatomy of the Eye](https://www.ncbi.nlm.nih.gov/books/NBK11534/)
- [Neuroscience: Anatomy of the Eye](https://www.ncbi.nlm.nih.gov/books/NBK11120/)
- [Goel et al.: Aqueous Humor Dynamics](https://pmc.ncbi.nlm.nih.gov/articles/PMC3032230/)
- [Johnson et al.: Unconventional Aqueous Humor Outflow](https://pmc.ncbi.nlm.nih.gov/articles/PMC4970980/)
- [StatPearls: Cataract Surgery](https://www.ncbi.nlm.nih.gov/books/NBK559253/)
- [StatPearls: Lens-induced glaucoma subtype comparison](https://www.ncbi.nlm.nih.gov/books/NBK574524/table/article-140081.table4/)

## Verification and next scientific review

`scripts/validate-eye.mjs` checks finite/indexed geometry, the complete selection inventory, batching, cutaway bounds, lens/iris ordering, particle paths avoiding the lens and crossing through the pupil, corneal containment, source identifiers and expected Goldmann responses. Type checking and a production build are separate checks. These are engineering checks, not validation of anatomical fidelity or biological behavior.

Browser interaction, WebMCP and physical multitouch testing have not been performed in this delivery. Specialist review should precede any claim of a validated curriculum. Priorities are biometric calibration and chamber boundaries, corneal and retinal layer histology, lamina/angle microanatomy, reviewed segmentation-based meshes, and disease-specific models with learning objectives and versioned citations.
