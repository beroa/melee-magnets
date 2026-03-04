# 1:1 Engine Match Gap List

This document lists repository-evidenced blockers that currently prevent a 1:1 Super Smash Bros. Melee engine match.

## Scope
- Target: runtime behavior parity with Melee engine (state machine, collision, hit resolution, movement, and stage interaction).
- Basis: current code in `src/`, `server/`, and `tools/hurtbox-cache-extractor/`.

## P0 Blockers (Fundamental)

### 1) No engine state machine simulation
- Why this blocks 1:1: runtime does not execute ActionState logic (`Anim/IASA/Phys/Coll`) or state transitions.
- Evidence:
  - `src/App.jsx` drives two selected moves directly via frame indices and loops them (`setInterval`, modulo frame counts).
  - `src/App.jsx` only fetches one animation payload per fighter/move and renders it.
- Confidence: high.

### 2) Hit resolution is overlap-only, not gameplay resolution
- Why this blocks 1:1: overlaps are logged, but no damage %, knockback, hitstun, hitlag, tumble, or state changes are applied.
- Evidence:
  - `src/lib/collision.js` `detectHitEvents(...)` only emits event records.
  - `src/lib/frame-analysis.js` `resolveFrameOutcome(...)` chooses text winner by damage comparison only.
  - No percent/velocity/hitstun state exists in `src/App.jsx` fighter state.
- Confidence: high.

### 3) Movement/physics engine is absent
- Why this blocks 1:1: there is no gravity, drift, traction, jump logic, aerial momentum, friction, or collision response.
- Evidence:
  - `src/App.jsx` pointer drag writes fighter `x/y` directly.
  - `src/App.jsx` `getGroundedOriginY(...)` snaps to nearest platform and clamps Y.
- Confidence: high.

### 4) Stage collision model is simplified to flat line segments
- Why this blocks 1:1: no full collision polygons, ledges, walls, ceilings, or stage-specific collision behavior.
- Evidence:
  - `src/lib/stage.js` defines only `groundLeft/groundRight` plus simple platform segments.
  - `src/lib/stage.js` `getSnapYForX(...)` only picks a surface by X range + nearest Y.
- Confidence: high.

## P1 Blockers (Major Fidelity Gaps)

### 5) Dataset excludes parts of move/character space
- Why this blocks 1:1: runtime cannot match engine behavior for excluded moves/characters.
- Evidence:
  - `server/data/meleeRealDataProvider.js` filters out throws (`isThrowMove`) and pummel (`isHiddenMove`).
  - `server/data/meleeRealDataProvider.js` hides `ice-climbers-nana` and `kirby` (`hiddenCharacterIds`).
  - `server/data/meleeRealDataProvider.js` keeps only "verified" moves requiring hurtboxes each frame (`isVerifiedRealMove`).
- Confidence: high.

### 6) IASA and phase semantics are inferred/flattened
- Why this blocks 1:1: startup/active/recovery windows are approximated by hitbox presence, not full engine transition logic.
- Evidence:
  - `server/data/meleeRealDataProvider.js` `buildMoveAnimation(...)` sets `phase` from first/last active hitbox.
  - Same function sets `iasa: null` for all moves.
- Confidence: high.

### 7) Extractor command-script parsing is partial
- Why this blocks 1:1: only a subset of subaction event types influence hitbox timelines.
- Evidence:
  - `tools/hurtbox-cache-extractor/Program.cs` `TryBuildFrameHitboxMapFromSubactionEvents(...)` handles only `waitUntil`, `waitFor`, `hitbox`, `endOneCollision`, `endAllCollisions`.
- Confidence: high.

### 8) Bone/frame mapping includes heuristics
- Why this blocks 1:1: several pose/hitbox transforms rely on assumptions rather than full engine evaluation.
- Evidence:
  - `tools/hurtbox-cache-extractor/Program.cs` `PoseFrameOffset = 1`.
  - `FindMotionNodeIndex(...)` assumes first child of root is motion node.
  - `ResolveModelDatPath(...)` prefers `Pl??Nr.dat` else first available costume/model.
- Confidence: medium-high.

### 9) Collision detection uses swept capsules between frames
- Why this blocks 1:1: swept overlap can report contacts that discrete frame-by-frame engine checks may not (or vice versa).
- Evidence:
  - `src/lib/collision.js` `buildSweptHitbox(...)` converts moving circles into capsules across frame delta.
- Confidence: high.

### 10) Runtime tick rate is user-variable
- Why this blocks 1:1: simulation/playback can run at non-60 rates.
- Evidence:
  - `src/App.jsx` FPS slider range is 10-60 and drives interval timing.
- Confidence: high.

### 11) Stage set is incomplete
- Why this blocks 1:1: only two stage presets are represented.
- Evidence:
  - `src/lib/stage.js` `STAGE_PRESETS` includes only `fd` and `battlefield`.
- Confidence: high.

### 12) Camera behavior is custom viewer logic, not game camera logic
- Why this blocks 1:1: viewport centering/zoom/pan is UI-defined.
- Evidence:
  - `src/lib/stage.js` custom projection math (`getProjection`, zoom bounds, manual camera offset).
  - `src/App.jsx` pointer-driven pan/zoom handlers.
- Confidence: high.

## P2 Blockers (Still Required for Full Parity)

### 13) No shield/clank/grab resolution system in runtime
- Why this blocks 1:1: many interaction outcomes depend on systems not modeled.
- Evidence:
  - Runtime collision path contains only hitbox-vs-hurtbox overlap (`src/lib/collision.js`, `src/lib/frame-analysis.js`).
  - No runtime shield/grab/clank state machine in `src/App.jsx` or `server/` API payloads.
- Confidence: medium-high.

### 14) No full match context (stocks, percent accumulation, stale queue, ports, etc.)
- Why this blocks 1:1: engine outcomes depend on persistent per-fighter and per-match state.
- Evidence:
  - Fighter state in `src/App.jsx` stores only `{ characterId, moveId, x, y, facing, sizeScale }`.
  - No persistent damage/stale/history state in client or API models.
- Confidence: high.

## Uncertainties
- Exact quantitative impact of extractor heuristics (`PoseFrameOffset`, motion-node inference, model variant choice) should be validated against known in-game snapshots.
- Some fidelity gaps may also originate upstream in source datasets (`dat-dumps`, framedata JSON), not just runtime code.

## Next Verification Steps
1. Add a per-frame replay validator comparing this runtime vs. Dolphin memory snapshots for selected test cases.
2. Prioritize P0 replacement with a deterministic fixed-step simulation core (state + physics + collision + hit resolution).
3. Expand extractor validation tests for subaction commands and bone mapping against known reference moves.
