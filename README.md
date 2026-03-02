# Melee Overlay Lab

Node + React app for overlaying **real Super Smash Bros. Melee move data** and resolving who wins when hitboxes overlap the opposing hurt model.

## What it does
- Loads full roster + move lists from local extractor dumps (`framedata-json-fullhitboxes`).
- Lets you select any two characters and any two moves.
- Draws both move hitboxes per frame on one canvas.
- Lets you **drag fighters over each other** to force interactions.
- Computes collisions and reports per-frame outcome:
  - Fighter A wins
  - Fighter B wins
  - Trade

## Data source
Primary source (cached locally in this repo):
- https://melee.theshoemaker.de/framedata-json-fullhitboxes/

Research notes:
- [docs/data-sources.md](./docs/data-sources.md)

Important caveat:
- Public `framedata-json-fullhitboxes` covers move scripts and hitbox data, but not
  ready-to-use per-frame world-space hurtboxes.
- This repo now includes a local ISO extraction pipeline that builds
  `server/data/datasets/hurtboxes-real/*.realboxes.json` (real transformed
  hurtboxes + hitboxes). If that cache is missing, fallback capsules are used.

## Setup
```bash
npm install
npm run sync:data
npm run dev
```

- Frontend: `http://localhost:5173` (or next available port)
- API: `http://localhost:3001`

## ISO Pipeline (Local Extraction)
This repo now includes scripts to build data from your own Melee ISO:

1. Bootstrap toolchain (`gciso`, `meleedat2json`, frame extractor, `HSDLib` source):
```bash
npm run setup:melee-tools
```

2. Extract fighter DAT/AJ/model files from ISO:
```bash
npm run extract:iso -- --iso /absolute/path/to/GALE01.iso
```

3. Build local framedata JSON from extracted DATs:
```bash
npm run build:framedata:iso
```

4. Build local world-space hurtbox/hitbox cache:
```bash
npm run build:hurtboxes:iso
```

5. Run everything end-to-end:
```bash
npm run pipeline:iso -- --iso /absolute/path/to/GALE01.iso
```

Optional custom extractor project override:
```bash
npm run pipeline:iso -- \
  --iso /absolute/path/to/GALE01.iso \
  --hurtbox-project /absolute/path/to/YourHurtboxExtractor.csproj
```

More details:
- [docs/iso-pipeline.md](./docs/iso-pipeline.md)

## API
- `GET /api/health`
- `GET /api/metadata`
- `GET /api/characters`
- `GET /api/animation/:characterId/:moveId`

## Configuration
- `MELEE_DATA_PROVIDER=real` (default and only provider)

## Project layout
- `server/data/meleeRealDataProvider.js`: loads and normalizes extracted framedata JSON.
- `server/data/datasets/framedata-json-fullhitboxes/`: local cached source files.
- `scripts/sync-melee-data.sh`: refreshes local dataset from source mirror.
- `scripts/setup-melee-tools.sh`: local toolchain bootstrap for ISO extraction.
- `scripts/extract-melee-iso.sh`: extracts clean DAT/AJ/model files from ISO.
- `scripts/build-framedata-from-iso.sh`: builds framedata JSON from extracted DAT/AJ.
- `scripts/build-hurtbox-cache.sh`: builds per-frame transformed hurtbox/hitbox cache.
- `scripts/pipeline-melee-iso.sh`: end-to-end ISO pipeline entrypoint.
- `tools/hurtbox-cache-extractor/`: dotnet extractor used to generate real box cache.
- `src/components/FighterMenu.jsx`: selected-fighter control panel.
- `src/lib/stage*.js`: stage constants and canvas rendering helpers.
