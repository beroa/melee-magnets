import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FighterMenu from "./components/FighterMenu.jsx";
import { detectHitEvents, getFrameBoxes } from "./lib/collision.js";
import { formatEvent, getActiveFrames, resolveFrameOutcome } from "./lib/frame-analysis.js";
import {
  buildFighterFromCharacter,
  clamp,
  getProjection,
  getSnapYForX,
  getStageWorldBounds,
  MODEL_SCALE,
  pointInHitShape,
  STAGE_CANVAS,
  STAGE_PRESETS,
  STAGE_ZOOM_MAX,
  toCanvasPoint
} from "./lib/stage.js";
import { drawStageFrame } from "./lib/stage-render.js";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const FLOOR_SNAP_DISTANCE = 4;
const DEFAULT_STAGE_ID = "battlefield";

function getFrameBottomOffset(frame, fighter) {
  const hurtboxes = Array.isArray(frame?.hurtboxes) ? frame.hurtboxes : [];
  if (hurtboxes.length === 0) {
    return 0;
  }

  const scale = MODEL_SCALE;
  let minBottom = Number.POSITIVE_INFINITY;

  hurtboxes.forEach((box) => {
    if (
      box.kind === "capsule" ||
      (Number.isFinite(box.x1) &&
        Number.isFinite(box.y1) &&
        Number.isFinite(box.x2) &&
        Number.isFinite(box.y2))
    ) {
      const y1 = box.y1 * scale;
      const y2 = box.y2 * scale;
      const radius = box.radius * scale;
      minBottom = Math.min(minBottom, y1 - radius, y2 - radius);
      return;
    }

    const y = box.y * scale;
    const radius = box.radius * scale;
    minBottom = Math.min(minBottom, y - radius);
  });

  return Number.isFinite(minBottom) ? -minBottom : 0;
}

function getStandingBottomOffset(animation, fighter) {
  const firstFrame = animation?.move?.frames?.[0] ?? null;
  return getFrameBottomOffset(firstFrame, fighter);
}

function pickFighterAtPoint(point, fighters, frameState) {
  if (!fighters.fighterA || !fighters.fighterB || !frameState) {
    return null;
  }

  const targets = [
    {
      id: "A",
      shapes: [
        { kind: "circle", x: fighters.fighterA.x, y: fighters.fighterA.y, radius: 30 },
        ...frameState.boxesA.hurtboxes,
        ...frameState.boxesA.hitboxes
      ]
    },
    {
      id: "B",
      shapes: [
        { kind: "circle", x: fighters.fighterB.x, y: fighters.fighterB.y, radius: 30 },
        ...frameState.boxesB.hurtboxes,
        ...frameState.boxesB.hitboxes
      ]
    }
  ];

  let best = null;
  targets.forEach((target) => {
    target.shapes.forEach((shape) => {
      if (!pointInHitShape(point, shape)) {
        return;
      }

      const centerX =
        Number.isFinite(shape.x) ? shape.x : (shape.x1 + shape.x2) * 0.5;
      const centerY =
        Number.isFinite(shape.y) ? shape.y : (shape.y1 + shape.y2) * 0.5;
      const distanceSquared = (point.x - centerX) ** 2 + (point.y - centerY) ** 2;
      if (!best || distanceSquared < best.distanceSquared) {
        best = { id: target.id, distanceSquared };
      }
    });
  });

  return best?.id ?? null;
}

function getStageSpawnX(stageId, slot) {
  const bounds = getStageWorldBounds(stageId);
  const span = bounds.maxX - bounds.minX;
  const ratio = slot === "A" ? 0.34 : 0.66;
  return Math.round(bounds.minX + span * ratio);
}

function getGroundedOriginY(stageId, x, animation, fighter) {
  const snapSurfaceY = getSnapYForX(stageId, x);
  const bottomOffset = getStandingBottomOffset(animation, fighter);
  const floorY = Number.isFinite(snapSurfaceY) ? snapSurfaceY : 0;
  return clamp(floorY + bottomOffset, STAGE_CANVAS.minY, 220);
}

export default function App() {
  const canvasRef = useRef(null);
  const activeHitKeysRef = useRef(new Set());
  const dragStateRef = useRef(null);
  const fightersRef = useRef({ fighterA: null, fighterB: null });
  const frameStateRef = useRef(null);
  const spawnedRef = useRef({ A: false, B: false });

  const [characters, setCharacters] = useState([]);
  const [fighterA, setFighterA] = useState(null);
  const [fighterB, setFighterB] = useState(null);
  const [animationA, setAnimationA] = useState(null);
  const [animationB, setAnimationB] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(60);
  const [frameIndexA, setFrameIndexA] = useState(0);
  const [frameIndexB, setFrameIndexB] = useState(0);
  const [hitLog, setHitLog] = useState([]);
  const [selectedFighter, setSelectedFighter] = useState(null);
  const [draggingFighter, setDraggingFighter] = useState(null);
  const [stageId, setStageId] = useState(DEFAULT_STAGE_ID);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");

  const characterMap = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters]
  );

  const characterA = fighterA ? characterMap.get(fighterA.characterId) : null;
  const characterB = fighterB ? characterMap.get(fighterB.characterId) : null;
  const projection = useMemo(() => getProjection(stageId, zoom), [stageId, zoom]);
  const minZoom = projection.minZoom;

  const setFighterValue = useCallback((which, key, value) => {
    if (which === "A") {
      setFighterA((current) => ({ ...current, [key]: value }));
      return;
    }
    setFighterB((current) => ({ ...current, [key]: value }));
  }, []);

  const resetFighterFrameContext = useCallback((which) => {
    if (which === "A") {
      setFrameIndexA(0);
    } else if (which === "B") {
      setFrameIndexB(0);
    }
    setPlaying(false);
    setHitLog([]);
    activeHitKeysRef.current = new Set();
  }, []);

  const setFighterCharacter = useCallback(
    (which, characterId) => {
      const character = characterMap.get(characterId);
      if (!character) {
        return;
      }

      const updater = (current) => ({
        ...current,
        characterId,
        moveId: character.moves[0]?.id || "",
        sizeScale: Number.isFinite(character.sizeScale) ? character.sizeScale : 1
      });

      if (which === "A") {
        setFighterA(updater);
        spawnedRef.current.A = false;
      } else {
        setFighterB(updater);
        spawnedRef.current.B = false;
      }

      resetFighterFrameContext(which);
    },
    [characterMap, resetFighterFrameContext]
  );

  const setFighterMove = useCallback(
    (which, moveId) => {
      if (which === "A") {
        setFighterA((current) => ({ ...current, moveId }));
      } else {
        setFighterB((current) => ({ ...current, moveId }));
      }

      resetFighterFrameContext(which);
    },
    [resetFighterFrameContext]
  );

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [charactersResponse, metadataResponse] = await Promise.all([
          fetch(`${API_BASE}/api/characters`),
          fetch(`${API_BASE}/api/metadata`)
        ]);

        if (!charactersResponse.ok) {
          throw new Error(`Could not load characters: ${charactersResponse.status}`);
        }

        const charactersPayload = await charactersResponse.json();
        setCharacters(charactersPayload.characters);

        const first = charactersPayload.characters[0] || null;
        const second = charactersPayload.characters[1] || charactersPayload.characters[0] || null;
        setFighterA(buildFighterFromCharacter(first, 1, getStageSpawnX(DEFAULT_STAGE_ID, "A")));
        setFighterB(buildFighterFromCharacter(second, -1, getStageSpawnX(DEFAULT_STAGE_ID, "B")));

        if (metadataResponse.ok) {
          const metadataPayload = await metadataResponse.json();
          setMetadata(metadataPayload.metadata || null);
        }
      } catch (loadError) {
        setError(loadError.message);
      }
    }

    loadInitialData();
  }, []);

  const loadAnimation = useCallback(async (fighter, setAnimation) => {
    if (!fighter?.characterId || !fighter?.moveId) {
      return;
    }

    const response = await fetch(`${API_BASE}/api/animation/${fighter.characterId}/${fighter.moveId}`);
    if (!response.ok) {
      throw new Error(`Could not load animation for ${fighter.characterId}/${fighter.moveId}`);
    }

    const payload = await response.json();
    setAnimation(payload.animation);
  }, []);

  useEffect(() => {
    loadAnimation(fighterA, setAnimationA).catch((loadError) => setError(loadError.message));
  }, [loadAnimation, fighterA?.characterId, fighterA?.moveId]);

  useEffect(() => {
    loadAnimation(fighterB, setAnimationB).catch((loadError) => setError(loadError.message));
  }, [loadAnimation, fighterB?.characterId, fighterB?.moveId]);

  useEffect(() => {
    setZoom((current) => clamp(current, minZoom, STAGE_ZOOM_MAX));
  }, [minZoom]);

  const frameCountA = animationA?.move.frameCount || 1;
  const frameCountB = animationB?.move.frameCount || 1;
  const frameCount = Math.max(frameCountA, frameCountB);

  useEffect(() => {
    setFrameIndexA((current) => Math.min(current, Math.max(0, frameCountA - 1)));
  }, [frameCountA]);

  useEffect(() => {
    setFrameIndexB((current) => Math.min(current, Math.max(0, frameCountB - 1)));
  }, [frameCountB]);

  useEffect(() => {
    if (!playing) {
      return undefined;
    }

    const tick = window.setInterval(() => {
      setFrameIndexA((current) => (current + 1) % frameCountA);
      setFrameIndexB((current) => (current + 1) % frameCountB);
    }, 1000 / fps);

    return () => window.clearInterval(tick);
  }, [playing, fps, frameCountA, frameCountB]);

  const frameState = useMemo(() => {
    if (!fighterA || !fighterB) {
      return null;
    }

    const boxesA = getFrameBoxes(animationA, frameIndexA, fighterA);
    const boxesB = getFrameBoxes(animationB, frameIndexB, fighterB);

    const sameCharacter = fighterA.characterId === fighterB.characterId;
    const attackerAName = sameCharacter
      ? "A"
      : animationA?.character.name || characterA?.name || "Fighter A";
    const attackerBName = sameCharacter
      ? "B"
      : animationB?.character.name || characterB?.name || "Fighter B";

    const attackerA = {
      id: `A-${fighterA.characterId}`,
      name: attackerAName,
      moveName: animationA?.move.name || fighterA.moveId
    };

    const attackerB = {
      id: `B-${fighterB.characterId}`,
      name: attackerBName,
      moveName: animationB?.move.name || fighterB.moveId
    };

    const hitEvents = [
      ...detectHitEvents({
        attacker: attackerA,
        defender: attackerB,
        attackerBoxes: boxesA,
        defenderBoxes: boxesB,
        frameIndex: frameIndexA
      }),
      ...detectHitEvents({
        attacker: attackerB,
        defender: attackerA,
        attackerBoxes: boxesB,
        defenderBoxes: boxesA,
        frameIndex: frameIndexB
      })
    ];

    return {
      boxesA,
      boxesB,
      hitEvents,
      outcome: resolveFrameOutcome(hitEvents)
    };
  }, [
    animationA,
    animationB,
    characterA?.name,
    characterB?.name,
    fighterA,
    fighterB,
    frameIndexA,
    frameIndexB
  ]);

  useEffect(() => {
    fightersRef.current = { fighterA, fighterB };
  }, [fighterA, fighterB]);

  useEffect(() => {
    frameStateRef.current = frameState;
  }, [frameState]);

  useEffect(() => {
    if (!frameState) {
      return;
    }

    const currentFrameKeys = new Set(frameState.hitEvents.map((event) => event.key));
    const newEvents = frameState.hitEvents.filter(
      (event) => !activeHitKeysRef.current.has(event.key)
    );

    if (newEvents.length > 0) {
      setHitLog((current) => {
        const next = [...newEvents.map(formatEvent), ...current];
        return next.slice(0, 10);
      });
    }

    activeHitKeysRef.current = currentFrameKeys;
  }, [frameState]);

  useEffect(() => {
    if (!fighterA || !animationA || spawnedRef.current.A) {
      return;
    }

    const spawnY = getGroundedOriginY(stageId, fighterA.x, animationA, fighterA);
    setFighterA((current) => ({ ...current, y: Math.round(spawnY) }));
    spawnedRef.current.A = true;
  }, [animationA, fighterA, stageId]);

  useEffect(() => {
    if (!fighterB || !animationB || spawnedRef.current.B) {
      return;
    }

    const spawnY = getGroundedOriginY(stageId, fighterB.x, animationB, fighterB);
    setFighterB((current) => ({ ...current, y: Math.round(spawnY) }));
    spawnedRef.current.B = true;
  }, [animationB, fighterB, stageId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frameState || !fighterA || !fighterB) {
      return;
    }

    const context = canvas.getContext("2d");
    drawStageFrame(context, {
      frameState,
      fighterA,
      fighterB,
      characterAName: characterA?.name || "A",
      characterBName: characterB?.name || "B",
      selectedFighter,
      frameIndexA,
      frameIndexB,
      frameCountA,
      frameCountB,
      stageId,
      projection
    });
  }, [
    characterA?.name,
    characterB?.name,
    fighterA,
    fighterB,
    frameCountA,
    frameCountB,
    frameIndexA,
    frameIndexB,
    frameState,
    selectedFighter,
    stageId,
    projection
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    function onPointerDown(event) {
      const point = toCanvasPoint(canvas, event, projection);
      const picked = pickFighterAtPoint(point, fightersRef.current, frameStateRef.current);
      if (!picked) {
        setSelectedFighter(null);
        return;
      }

      const fighter = picked === "A" ? fightersRef.current.fighterA : fightersRef.current.fighterB;
      if (!fighter) {
        return;
      }

      event.preventDefault();
      setSelectedFighter(picked);
      setDraggingFighter(picked);

      dragStateRef.current = {
        pointerId: event.pointerId,
        fighterId: picked,
        offsetX: point.x - fighter.x,
        offsetY: point.y - fighter.y
      };

      canvas.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event) {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const point = toCanvasPoint(canvas, event, projection);
      const stageBounds = getStageWorldBounds(stageId, "full");
      const nextX = clamp(
        point.x - dragState.offsetX,
        stageBounds.minX + STAGE_CANVAS.maxXPadding,
        stageBounds.maxX - STAGE_CANVAS.maxXPadding
      );
      const draggedFighter = dragState.fighterId === "A" ? fighterA : fighterB;
      const draggedAnimation = dragState.fighterId === "A" ? animationA : animationB;
      const bottomOffset = getStandingBottomOffset(draggedAnimation, draggedFighter);
      const nextYRaw = clamp(point.y - dragState.offsetY, STAGE_CANVAS.minY, 240);
      const snapSurfaceY = getSnapYForX(stageId, nextX, nextYRaw + bottomOffset);
      const groundedY = Number.isFinite(snapSurfaceY)
        ? clamp(snapSurfaceY + bottomOffset, STAGE_CANVAS.minY, 240)
        : null;
      const nextY = groundedY !== null && Math.abs(nextYRaw - groundedY) <= FLOOR_SNAP_DISTANCE
        ? groundedY
        : nextYRaw;

      setFighterValue(dragState.fighterId, "x", Math.round(nextX));
      setFighterValue(dragState.fighterId, "y", Math.round(nextY));
    }

    function stopDragging(event) {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      dragStateRef.current = null;
      setDraggingFighter(null);
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    }

    function onWheel(event) {
      event.preventDefault();
      const direction = Math.sign(event.deltaY);
      const step = direction > 0 ? -0.08 : 0.08;
      setZoom((current) => clamp(current + step, minZoom, STAGE_ZOOM_MAX));
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", stopDragging);
    canvas.addEventListener("pointercancel", stopDragging);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", stopDragging);
      canvas.removeEventListener("pointercancel", stopDragging);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [animationA, animationB, fighterA, fighterB, minZoom, projection, setFighterValue, stageId]);

  const selectedAnimation = selectedFighter === "A" ? animationA : animationB;
  const selectedCharacter = selectedFighter === "A" ? characterA : characterB;
  const selectedState = selectedFighter === "A" ? fighterA : fighterB;
  const selectedFrameIndex = selectedFighter === "A" ? frameIndexA : frameIndexB;
  const selectedFrameCount = selectedAnimation?.move.frameCount || 1;
  const activeFrames = useMemo(() => getActiveFrames(selectedAnimation), [selectedAnimation]);

  function handleFrameChange(nextFrame) {
    setPlaying(false);
    if (selectedFighter === "A") {
      setFrameIndexA(nextFrame);
      return;
    }
    if (selectedFighter === "B") {
      setFrameIndexB(nextFrame);
    }
  }

  return (
    <main className="app-shell">
      <section className="stage-wrap">
        <canvas ref={canvasRef} width={STAGE_CANVAS.width} height={STAGE_CANVAS.height} />

        <div className="topbar">
          <strong>Melee Overlay</strong>
          <span>
            {metadata ? `${metadata.rosterCount} chars, ${metadata.moveCount} moves` : "Loading..."}
          </span>
          <button type="button" onClick={() => setPlaying((current) => !current)}>
            {playing ? "Pause" : "Play"}
          </button>
          <label className="fps-control">
            FPS
            <input
              type="range"
              min="10"
              max="60"
              value={fps}
              onChange={(event) => setFps(Number(event.target.value))}
            />
          </label>
          <label className="stage-control">
            Stage
            <select value={stageId} onChange={(event) => setStageId(event.target.value)}>
              {Object.values(STAGE_PRESETS).map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </label>
          <label className="zoom-control">
            Zoom
            <input
              type="range"
              min={minZoom}
              max={STAGE_ZOOM_MAX}
              step="0.01"
              value={zoom}
              onChange={(event) =>
                setZoom(clamp(Number(event.target.value), minZoom, STAGE_ZOOM_MAX))
              }
            />
          </label>
        </div>

        <FighterMenu
          selectedFighter={selectedFighter}
          selectedCharacter={selectedCharacter}
          selectedState={selectedState}
          characters={characters}
          frameIndex={selectedFrameIndex}
          selectedFrameCount={selectedFrameCount}
          activeFrames={activeFrames}
          onCharacterChange={(characterId) => setFighterCharacter(selectedFighter, characterId)}
          onMoveChange={(moveId) => setFighterMove(selectedFighter, moveId)}
          onFacingChange={(facing) => setFighterValue(selectedFighter, "facing", facing)}
          onFrameChange={handleFrameChange}
        />

        <div className="status-bar">
          <span className="outcome-text">{frameState?.outcome || "Loading..."}</span>
          <span>{draggingFighter ? `Dragging ${draggingFighter}` : "Click fighter to edit"}</span>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      {hitLog.length > 0 ? (
        <section className="hit-log">
          {hitLog.slice(0, 3).map((entry, index) => (
            <p key={`${entry}-${index}`}>{entry}</p>
          ))}
        </section>
      ) : null}
    </main>
  );
}
