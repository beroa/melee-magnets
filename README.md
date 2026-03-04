# Melee Overlay Lab

Local React + Node app for visualizing Melee move hit/hurtbox interactions.

## Requirements
- Node.js 18+ and npm
- Optional (ISO pipeline only): `python3`, `git`, `dotnet` 6+, and a legal NTSC 1.02 Melee ISO (`GALE01`)

## Run
Install and start dev mode (client + API):

```bash
npm install
npm run dev
```

`npm run dev` only starts the web client and API server. It does **not** run `sync:data` or any ISO extraction/build pipeline steps.

- Client: `http://localhost:5173`
- API: `http://localhost:3001`

Production build and run:

```bash
npm run build
npm run start
```

## Common Commands
- `npm run dev`: run client + server together
- `npm run dev:client`: run Vite client only
- `npm run dev:server`: run API only
- `npm run build`: production client build
- `npm run preview`: preview built client
- `npm run start`: run API/server (serves `dist/` when present)

## Data Maintenance
`npm run dev` and `npm run start` use whatever data already exists on disk. Run the commands below only when you want to refresh or rebuild datasets.

Refresh mirrored dataset files:

```bash
npm run sync:data
```

Rebuild all local ISO-derived data (recommended path):

```bash
npm run pipeline:iso -- --iso /absolute/path/to/GALE01.iso
```

Step-by-step pipeline (if you need control):

```bash
npm run setup:melee-tools
npm run extract:iso -- --iso /absolute/path/to/GALE01.iso
npm run build:framedata:iso
npm run build:hurtboxes:iso
```

## Notes
- Runtime data is loaded from `server/data/datasets/hurtboxes-real/*.realboxes.json`.
- Extractor build outputs under `tools/hurtbox-cache-extractor/bin` and `obj` are generated and ignored by git.
- Additional pipeline details: [`docs/iso-pipeline.md`](./docs/iso-pipeline.md)
