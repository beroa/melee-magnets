# ISO Pipeline

This project supports building Melee datasets from a local ISO using a local
toolchain.

## What It Produces
- Extracted game files:
  - `server/data/datasets/iso/clean-dats/Pl??.dat`
  - `server/data/datasets/iso/clean-dats/Pl??AJ.dat`
  - `server/data/datasets/iso/model-dats/Pl??*.dat` (preferred `Nr` if present)
- Intermediate dumps:
  - `server/data/datasets/dat-dumps/<Character>.json`
- Framedata:
  - `server/data/datasets/framedata-json-fullhitboxes/<Character>.framedata.json`
- Real world-space box cache:
  - `server/data/datasets/hurtboxes-real/<Character>.realboxes.json`

## Tool Bootstrap
```bash
npm run setup:melee-tools
```

This creates `.tools/melee/` with:
- Python virtualenv
- `gciso`
- `meleedat2json`
- source checkout of `meleeFrameDataExtractor`
- source checkout of `HSDLib` (required by the built-in dotnet extractor)

## ISO Extraction
```bash
npm run extract:iso -- --iso /absolute/path/to/GALE01.iso
```

Notes:
- This step writes `server/data/datasets/iso/extraction-manifest.json`.
- Character DAT/AJ extraction expects NTSC 1.02 layout (`Pl??.dat`, `Pl??AJ.dat`).

## Framedata Build
```bash
npm run build:framedata:iso
```

## Real Box Cache Build
```bash
npm run build:hurtboxes:iso
```

This runs the built-in extractor:
- `tools/hurtbox-cache-extractor/hurtbox-cache-extractor.csproj`
- Reads:
  - `<datasets>/iso/clean-dats`
  - `<datasets>/iso/model-dats`
  - `<datasets>/framedata-json-fullhitboxes`
- Writes:
  - `<datasets>/hurtboxes-real`

If you want extraction + framedata + real box cache in one command:
```bash
npm run pipeline:iso -- --iso /absolute/path/to/GALE01.iso
```

## Custom Extractor Override
To override the built-in extractor with your own project:

```bash
npm run pipeline:iso -- \
  --iso /absolute/path/to/GALE01.iso \
  --hurtbox-project /absolute/path/to/YourHurtboxExtractor.csproj
```

Your project should accept these CLI flags:

```bash
dotnet run --project <csproj> -- \
  --clean-dats <datasets>/iso/clean-dats \
  --model-dats <datasets>/iso/model-dats \
  --framedata-dir <datasets>/framedata-json-fullhitboxes \
  --out-dir <datasets>/hurtboxes-real
```
