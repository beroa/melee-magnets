# Melee Data Sources (Reviewed Mar 2, 2026)

## Recommendation
For all-character, all-move machine-readable hitbox data, use the extractor
pipeline and hosted dumps from `melee.theshoemaker.de`.

Primary endpoints:
- Root listing: https://melee.theshoemaker.de/
- Full hitbox JSON dumps: https://melee.theshoemaker.de/framedata-json-fullhitboxes/
- Raw DAT dumps: https://melee.theshoemaker.de/dat-dumps/
- Animation DATs: https://melee.theshoemaker.de/animation-files/

Primary upstream project:
- `meleeFrameDataExtractor`: https://github.com/pfirsich/meleeFrameDataExtractor
- `meleeDat2Json`: https://github.com/pfirsich/meleeDat2Json

## Why this source
- Full roster coverage in public JSON files.
- Per-move frame counts and hitbox windows.
- Hitbox metadata includes damage, angle, size, and positional offsets.
- Provenance is extractor-based, not hand-entered spreadsheet data.

## Sources that are useful but not canonical geometry datasets
- `slippilab` is a replay viewer (`.slp`) and frame-state explorer, not a full
  hitbox/hurtbox coordinate dump:
  https://github.com/frankborden/slippilab
- `ikneedata/meleelight` is a custom browser game engine and uses simplified
  collision volumes (for example, static rectangular hurtboxes in code), not
  vanilla Melee runtime capsule data:
  https://github.com/schmooblidon/meleelight

## Caveat on hurtboxes
There is no widely used turnkey dump with complete per-frame hurtbox world
coordinates equivalent to `framedata-json-fullhitboxes`.

For real hurtbox x/y placements, the correct path is:
- base hurt capsule data from fighter data (`meleeDat2Json`/DAT parsing)
- per-frame bone transforms from animation DATs
- runtime transform rules from decomp collision code/structs:
  https://doldecomp.github.io/melee/structHurtCapsule.html
  and
  https://doldecomp.github.io/melee/structHitCapsule.html

This app currently uses:
- real extracted hitboxes
- local ISO-derived world-space hurtbox/hitbox cache when available
- fallback hurtbox capsules only when the local cache is missing

ISO pipeline entrypoints:
- `scripts/setup-melee-tools.sh`
- `scripts/extract-melee-iso.sh`
- `scripts/build-framedata-from-iso.sh`
- `scripts/pipeline-melee-iso.sh`

## This app's implementation choice
- Local cache path: `server/data/datasets/framedata-json-fullhitboxes`
- Sync script: `scripts/sync-melee-data.sh`
- Provider: `server/data/meleeRealDataProvider.js`
