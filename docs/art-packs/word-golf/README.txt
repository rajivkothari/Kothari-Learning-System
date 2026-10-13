WORD GOLF OWNER-APPROVED ART PACK
APPROVED BY OWNER

Phase 1 visual direction approved on 2026-10-13 by explicit owner message: approve.
Phase 2: all 25 presented assets approved by owner on 2026-10-13. Approval follows review of the contact sheet and composed mockups, not individual source-file inspection. Production integration is undone.
Source implementation: 51f5105e47bb68fff174f457703f68e905373daf.
Generator: OpenAI built-in image_gen. Prompts and reference roles appear in generation-record.json.
Reference: owner-approved Phase 1 landscape. No third-party reference image was supplied.

Contents
assets: original generated PNG masters.
runtime: reduced WebP exports. Lossless for transparent pieces, quality 88 for opaque materials.
compact: 96-pixel exports for small portrait views.
manifest.json: approval status, hashes, bounds, canvas dimensions, base contacts and rotation pivots.
contact-sheet: review sheet showing each original file. CLAUDE_HANDOFF.txt: integration prompt.
hole04-landscape, hole10-landscape, hole10-portrait: review compositions using the actual modular files.
geometry-source.json: unmodified ten-hole geometry from the source commit.

Placement
Keep all source polygons, tee/pin coordinates and target coordinates unchanged. Fill each polygon with the supplied material. A material fill is not a replacement collision shape.
Use the existing fitCourse and toScreen transforms. Reorient the course and markers together where the existing layout calls for a quarter turn. Do not stretch the course.
Keep horizon layers separate from the overhead gameplay plane. Crop skyline/deck decoration in portrait before hiding any gameplay area. Keep controls and text separate from the artwork.
Outer coping sits outside the play boundary. Bunker and water art clips to the exact source polygon. Decorative shading never changes a landing result.
Place the golfer alongside the ball, with a separate club at the hand grip. The manifest gives contact anchors. View-specific facing transforms remain the integration engineer's work.
Rotor spins about the center hub. Stationary housing remains separate. Flag pivots at the bottom of its pole. Club pivots at the grip endpoint.
Use compact exports where full sprites introduce too much detail in a small map. Those exports preserve the original silhouette, not a new design.

Scope
The current ten-hole data contains no ramps, bumpers or physical mechanical blockers. Ramp and bumper candidates are reusable art library pieces only. Do not add mechanics to accommodate them.
No FX PNGs were added. Keep flight arcs, carry rings, splash rings, ball shadow and feedback procedural.
No production game code, learning evidence, save behavior, manifests or approval records were edited. This branch contains only the art pack and handoff. Production integration is undone.
Review pages are artwork compositions, not a playable game build. Browser rendering checks do not establish Fire/iPad performance. No physical tablet or child test was run.

Integration handoff
Selectively copy approved assets and required metadata. Keep originals outside runtime bundles. Preserve vector fallback and existing accessibility/Reduced Motion behavior. Measure decoded memory and device readability during integration. Do not merge a creative branch wholesale.

