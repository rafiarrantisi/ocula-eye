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

## Aqueous simulation (reactive schematic, not CFD)

Particle speed encodes branch flow from the live Goldmann balance: shared FK·(F/2.5),
conventional FK·(Qkonv/2.0), uveoscleral FK·(Quv/0.5), with ±15% pulsatility (~72/min).
Two closed thermal-convection loops (warm iris/lens ≈37 °C rising, cool cornea ≈34 °C
sinking, upright eye, after CFD literature) stir the chamber independently of the
through-flow and keep drifting slowly when paused. Presets teach mechanisms: raised TM
resistance, narrow angle, and prostaglandin-analogue U increase. Night mode scales F×0.65
and U×0.6 (nocturnal direction, illustrative) and shows the balance F = Qkonv + Quv with
the conventional share. Reference anchor: physiological TM velocity ≈10 µm/s (mass
conservation over 300 µm × 36.4 mm at 2.5 µL/min); the animation scales from it and
never claims CFD. U slider extends to 1.5 µL/min for the PG preset.

## Cataract optics (forward-scatter analogy, not a vision simulator)

Severity drives three coupled effects: (a) ray fan widening weighted per type
(cortical 1.0 / nuclear 1.25 / PSC 1.45, from Labuz straylight ratios 1.05 / 1.36 /
1.54 log(s)); (b) nuclear brunescence (clear→brown lerp) plus sepia cast on the
optotype; (c) a straylight veil overlay plus, at night, a headlight source with two
halos. Night mode dims the 3D lights 50% and scales blur ×1.4. The readout shows
illustrative +log(s) vs normal. PSC scatters most per unit (nodal-point plaque),
nuclear dulls color and shifts myopic, cortical spokes glare at night — all qualitative.

## Micro detail views, phase 1 (cornea + angle)

Separate, explicitly scaled schematic views replace the globe when active; they do not
increase the globe's apparent precision. Local convention is +X anterior, +Y radial/external,
+Z circumferential, with an on-screen scale disclaimer. Layers are curved concentric shells
following wall curvature — never boxes. Selecting a sub-structure flies the camera to it
(700 ms ease-in-out, cancellable by manual orbit) while the rest fades to ~18% opacity;
camera presets reframe around the same focus. Clicking the active sub-structure again
releases the focus: everything returns to full brightness and the camera glides back to
the detail overview. The same fly-to framing applies to whole-eye structures on plain
selection (not during autoplay, isolation, or module switches).

Cornea section stacks anterior(+X) to posterior(−X): epithelium ±40–50 µm (5–7 central
cell layers, only basal cells mitotic), Bowman ±8–15 µm (acellular type I/V collagen
condensation), stroma ±470–500 µm (~90%, ~200 lamellae, keratocytes), Descemet ±7–12 µm
(type IV collagen + laminin, secreted by endothelium, thickens with age), endothelium
±4–6 µm (monolayer, non-mitotic pump). Shell order and stroma-thickest ranking are
preserved; radii are not micrometer geometry. The pre-Descemet/Dua cleavage plane (~10 µm above DM)
is noted as a surgical variant, not a sixth consensus layer. Stromal line counts and
epithelial/endothelial cell glyphs are illustrative.

Angle wedge runs apex→base: Schwalbe line (Descemet termination) → uveal TM (1–3 cord-like
beams, pores ±25–75 µm) → corneoscleral TM (8–15 perforated lamellae @ ±5–12 µm) →
JCT/cribriform (±2–20 µm loose ECM, primary conventional resistance with inner-wall
endothelium) → Schlemm canal (circular endothelium, Ø ±190–370 µm, pressure-dependent giant
vacuoles) → collector entrances → deep scleral plexus → radial intrascleral collectors →
aqueous veins → episcleral veins (segmental high/low-flow over 360°). Scleral spur anchors
TM and longitudinal ciliary tendon; its posterior pull opens the meshwork. Gonioscopic order
(posterior→anterior: ciliary body band → spur → pigmented posterior TM → anterior TM →
Schwalbe) is taught in a mirror-corrected schematic anterior preset, disclosed as such.

## Micro detail views, phase 2 (lens + iris-ciliary)

Lens section is equatorially symmetric about the AP (+X) axis, parameterized by
accommodation t ∈ [0,1]: half-thickness .30·(1+.28t), equatorial radius .55·(1−.13t).
At t=0 zonules are taut and the lens flat (distance); at t=1 the ciliary ring is
unchanged while zonular endpoints ride the narrowed equator and the lens rounds
(near). This follows Helmholtz qualitatively; it is not a finite-element,
dioptric, age, or amplitude model. Zonular endpoints are recomputed from the morphed
equator on every rebuild so attachments never visually detach.

Micro inventory outside→in: capsule (anterior ±9–14 µm, equatorial ±17–28 µm,
posterior ±2–3 µm) → anterior epithelium (cuboidal monolayer, lifelong fiber source at
the equatorial bow) → cortex (young fibers, water 73–80%, RI ~1.386) → nucleus
(condensed embryonic/fetal/adult fibers, water ~68%, RI ~1.406–1.41, GRIN core) →
meridional fibers (hexagonal, ~1 cm suture-to-suture) meeting in an anterior Y and an
offset posterior Y suture. Zonules are fibrillin 10–12 nm extracellular fibers from
pars-plana nonpigmented epithelium to the zonular lamella, in anterior/posterior/
equatorial tines plus vitreous-related shock-absorber bundles. Fiber counts, suture arm
lengths, and cell glyphs are illustrative.

Iris–ciliary wedge is meridional: sphincter (peripupillary ring ±0.75–1 mm, slightly
anterior, parasympathetic CN III/Edinger-Westphal) → radial dilator sheet on the
posterior face (sympathetic) → iris root → ciliary muscle with longitudinal fibers
(spur→processes, opens TM) and circular fibers (accommodation) → pars plicata
(±2 mm folded zone) bearing 70–100 vascular ciliary processes (aqueous secretion at
nonpigmented apices) → pars plana (±4 mm smooth, relatively avascular vitrectomy
corridor) → ora serrata direction. The bilayer is shown as pigmented-outer plus
nonpigmented-inner slabs (gap-junction coupled; NPE is the secretory, blood–aqueous
barrier layer and drug target). Phase 3 animates the muscle itself (see below).

## Micro detail views, phase 3 (retina + optic nerve head + ciliary animation)

Retina stack runs vitreal(+X) to scleral(−X): ILM (±2.5 µm, Müller footplates) →
NFL (RGC axons + arcades) → GCL (multilayered only in macula) → IPL → INL
(vascular limit ~mid-layer) → OPL (Henle fibers in macula) → ONL (~10 cone rows in
foveola) → photoreceptors + ELM → RPE monolayer (4–6M cells) → Bruch (BMO landmark).
Regional thickness (0.56 near disc, 0.35 macula, 0.18 equator, 0.10 ora, 0.09 fovea)
is taught in text; slab thickness only preserves ordering. Dual circulation is
disclosed: choroid feeds outer-to-mid-INL, central retinal vessels feed inner-to-INL.
The fovea inset shows only ILM+ONL+PR+RPE with dense cones and parted inner walls
(macula 5.5 mm/15°, fovea 1.5 mm/5°/0.25 mm, foveola 0.35 mm/1°/0.13 mm, avascular
FAZ on choriocapillaris). The ora wedge tapers to the NPE line toward pars plana
(2.1 mm temporal / 0.7–0.8 nasal; 6 mm nasal / 7 mm temporal from limbus; vitreous
base 3–4 mm). Glyph counts (12 PR, 6 RPE, 8 foveal cones) are illustrative.

ONH runs disc face(+X) to nerve(−X): disc (oval ±2×1.5 mm, no photoreceptors,
4–5 mm nasal-superior of fovea) → BMO ring (OCT margin) → neuroretinal rim
(ISNT) → recessed cup (c/d metric) → diving RNFL bundles (90° turn, serpentine
periphery) → 3 fenestrated lamina plates (astrocytes/capillaries, scleral-anchored)
→ myelinated posterior axons. Central trunk pierces the lamina in the nasal-upper
quadrant. Cup-within-disc, posterior lamina, and trans-laminar gradient mechanics
are qualitative; focal defects/pore enlargement are described, not simulated.

Ciliary animation follows in-vivo UBM/OCT: on 0→100% the muscle mass shifts
anterior + centripetal toward the lens equator (ring −0.08 mm/D, CM25 ≈ +8 µm/D),
anterior muscle thickens while the ring narrows, anterior zonules slacken (sagging
mid-curve) and the lens rounds per phase 2. Posterior zonules reciprocally stretch
(CAMA model); the choroid is pulled forward at the ora serrata (~1 mm in monkey)
while the anterior hyaloid bows back — described in text, with only muscle, zonule,
and lens moving on screen. Presbyopia is taught as stiffness (lens + BMCC/choroid +
vitreous), not force loss: muscle force is preserved and even rises (~1e−2 N young
max, +50% by ~50 yr) while centripetal mobility and lens compliance fall.

## Primary references in the interface

- [Webvision: Gross Anatomy of the Eye](https://www.ncbi.nlm.nih.gov/books/NBK11534/)
- [Neuroscience: Anatomy of the Eye](https://www.ncbi.nlm.nih.gov/books/NBK11120/)
- [Goel et al.: Aqueous Humor Dynamics](https://pmc.ncbi.nlm.nih.gov/articles/PMC3032230/)
- [Johnson et al.: Unconventional Aqueous Humor Outflow](https://pmc.ncbi.nlm.nih.gov/articles/PMC4970980/)
- [StatPearls: Cataract Surgery](https://www.ncbi.nlm.nih.gov/books/NBK559253/)
- [StatPearls: Lens-induced glaucoma subtype comparison](https://www.ncbi.nlm.nih.gov/books/NBK574524/table/article-140081.table4/)
- [StatPearls: Cornea Transplantation](https://www.ncbi.nlm.nih.gov/books/NBK539690/)
- [AAO: Five layers of the cornea](https://www.aao.org/education/image/five-layers-of-cornea-1)
- [Aqueous outflow continuum: TM to episcleral veins](https://pmc.ncbi.nlm.nih.gov/articles/PMC5350024/)
- [Gonioscopy and angle closure handout](https://ce-optometry.westernu.edu/bin/pdf/regular-course/handout_gonioscopy.pdf)
- [Structure of the lens and visual quality](https://pmc.ncbi.nlm.nih.gov/articles/PMC7511618/)
- [Bassnett: Zinn's Zonule](https://pmc.ncbi.nlm.nih.gov/articles/PMC8139560/)
- [Ciliary Body and Ciliary Epithelium](https://pmc.ncbi.nlm.nih.gov/articles/PMC3018825/)
- [StatPearls: Eye Iris Sphincter Muscle](https://www.ncbi.nlm.nih.gov/books/NBK532252/)
- [Webvision: Organization of the Retina](https://www.webvision.pitt.edu/)
- [Review: human retina, NFL and macula](https://avehjournal.org/index.php/aveh/article/view/330/495)
- [Lamina Cribrosa in Glaucoma](https://pmc.ncbi.nlm.nih.gov/articles/PMC4455897/)
- [StatPearls: Neuroanatomy, CN2 (Optic)](https://www.ncbi.nlm.nih.gov/books/NBK507907/)
- [IOVS: Ciliary muscle morphology in accommodation](https://iovs.arvojournals.org/article.aspx?articleid=2127601)
- [Age, accommodation and refractive error (OCT biometry)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4692191/)
- [Croft: accommodative movements of vitreous/choroid/sclera](https://pmc.ncbi.nlm.nih.gov/articles/PMC3726242/)
- [AAO: Consolidated accommodation theory (CAMA)](https://www.aao.org/education/current-insight/new-consolidated-accommodation-theory-may-change-f)
- [Goel: Aqueous Humor Dynamics](https://pmc.ncbi.nlm.nih.gov/articles/PMC3032230/)
- [IOVS: TM/JCT flow velocity constraints](https://iovs.arvojournals.org/article.aspx?articleid=2811185)
- [IOVS: Pupil size and retinal straylight](https://iovs.arvojournals.org/article.aspx?articleid=2164132)
- [Labuz thesis: straylight by cataract type (Ch.2)](https://repub.eur.nl/pub/102424/102424_Chapter_2-Introduction_to_straylight.pdf)
- [StatPearls: Cataract (NBK539699)](https://www.ncbi.nlm.nih.gov/books/NBK539699)
- [Glare/photophobia after cataract surgery (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC9477362)

## Verification and next scientific review

`scripts/validate-eye.mjs` checks finite/indexed geometry, the complete selection inventory, batching, cutaway bounds, lens/iris ordering, particle paths avoiding the lens and crossing through the pupil, corneal containment, source identifiers and expected Goldmann responses. Phase 1 adds micro checks: cornea/angle inventory, micro anchors, source links, anterior→posterior slab ordering with stroma thickest, and Schwalbe-anterior-to-spur plus Schlemm-external-to-JCT ordering. Phase 2 adds lens/iris-ciliary inventory, capsule→cortex→nucleus bbox nesting, zonule tine counts, accommodation morph direction (thicker AP, narrower equator), and sphincter-anterior-to-dilator, plana-posterior-to-plicata, PE-external-to-NPE ordering. Phase 3 adds retina/ONH inventory, vitreal→scleral slab ordering, cup-in-disc plus posterior lamina plus vessel-through-cup checks, RNFL bundle counts, and ciliary anterior-centripetal motion with accommodation. Type checking and a production build are separate checks. These are engineering checks, not validation of anatomical fidelity or biological behavior.

Browser interaction, WebMCP and physical multitouch testing have not been performed in this delivery. Specialist review should precede any claim of a validated curriculum. Priorities are biometric calibration and chamber boundaries, corneal and retinal layer histology, lamina/angle microanatomy, reviewed segmentation-based meshes, and disease-specific models with learning objectives and versioned citations.
