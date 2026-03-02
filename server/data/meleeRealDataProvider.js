import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REALBOX_DIR = path.join(__dirname, "datasets", "hurtboxes-real");

const CHARACTER_COLORS = [
  "#ff9f1c",
  "#4f8ee8",
  "#e76f51",
  "#2ec4b6",
  "#f94144",
  "#90be6d",
  "#f9844a",
  "#577590",
  "#43aa8b",
  "#f3722c",
  "#277da1",
  "#ff6b6b",
  "#ffd166",
  "#06d6a0",
  "#118ab2",
  "#ef476f",
  "#8ecae6",
  "#fb8500",
  "#c77dff",
  "#84a59d",
  "#b56576",
  "#6d597a",
  "#7cb518",
  "#e56b6f",
  "#3a86ff",
  "#ffbe0b",
  "#bc6c25"
];

let datasetPromise = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function asNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function slugifyCharacterName(name) {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function humanizeMoveId(moveId) {
  const quickMap = {
    nair: "Neutral Air",
    fair: "Forward Air",
    bair: "Back Air",
    uair: "Up Air",
    dair: "Down Air",
    jab1: "Jab 1",
    jab2: "Jab 2",
    jab3: "Jab 3",
    usmash: "Up Smash",
    dsmash: "Down Smash",
    fsmash_h: "Forward Smash (High)",
    fsmash_mh: "Forward Smash (Mid-High)",
    fsmash_m: "Forward Smash (Mid)",
    fsmash_ml: "Forward Smash (Mid-Low)",
    fsmash_l: "Forward Smash (Low)",
    utilt: "Up Tilt",
    dtilt: "Down Tilt",
    dashattack: "Dash Attack",
    ftap: "Forward Tap"
  };

  if (quickMap[moveId]) {
    return quickMap[moveId];
  }

  return moveId
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeRealHurtbox(hurtbox) {
  const x1 = asNumber(hurtbox.x1);
  const y1 = asNumber(hurtbox.y1);
  const x2 = asNumber(hurtbox.x2);
  const y2 = asNumber(hurtbox.y2);
  const radius = asNumber(hurtbox.radius, 1);

  return {
    id: `${hurtbox.id ?? "hb"}-${hurtbox.bone ?? 0}`,
    kind: "capsule",
    bone: hurtbox.bone ?? null,
    grabbable: Boolean(hurtbox.grabbable),
    type: hurtbox.type ?? "mid",
    x: asNumber(hurtbox.x, (asNumber(hurtbox.x1) + asNumber(hurtbox.x2)) * 0.5),
    y: asNumber(hurtbox.y, (asNumber(hurtbox.y1) + asNumber(hurtbox.y2)) * 0.5),
    x1,
    y1,
    x2,
    y2,
    radius
  };
}

function normalizeRealHitbox(hitbox) {
  return {
    id: `${hitbox.groupId ?? 0}-${hitbox.id ?? 0}-${hitbox.guid ?? 0}`,
    kind: "circle",
    x: asNumber(hitbox.x),
    y: asNumber(hitbox.y),
    radius: asNumber(hitbox.radius, 1),
    damage: asNumber(hitbox.damage, 0),
    angle: asNumber(hitbox.angle, 0),
    bone: hitbox.bone ?? null,
    element: hitbox.element ?? "normal",
    groupId: hitbox.groupId ?? null,
    guid: hitbox.guid ?? null
  };
}

function clampToFrame(index, frameCount) {
  return clamp(index, 0, Math.max(0, frameCount - 1));
}

function isHexMoveId(moveId) {
  return /^0x[0-9a-f]+$/iu.test(moveId);
}

function isVerifiedRealMove(moveId, moveData) {
  if (isHexMoveId(moveId) || !moveData || typeof moveData !== "object") {
    return false;
  }

  if (!Array.isArray(moveData.frames) || moveData.frames.length === 0) {
    return false;
  }

  return moveData.frames.every(
    (frame) =>
      Array.isArray(frame?.hurtboxes) &&
      frame.hurtboxes.length > 0 &&
      Array.isArray(frame?.hitboxes)
  );
}

function isThrowMove(moveId) {
  return moveId.includes("throw");
}

function getMoveSortKey(moveId) {
  const categoryOrder = [
    "jab",
    "grab",
    "tilt",
    "smash",
    "aerial",
    "special",
    "other"
  ];

  if (/^jab\d*$/u.test(moveId)) {
    const jabNumber = Number(moveId.replace("jab", "")) || 1;
    return [categoryOrder.indexOf("jab"), jabNumber, moveId];
  }

  if (moveId.startsWith("catch") || moveId.includes("grab")) {
    const grabOrder = {
      catch: 0,
      catchdash: 1,
      catchturn: 2,
      grab: 3,
      dashgrab: 4,
      pivotgrab: 5,
      catchattack: 6
    };
    return [categoryOrder.indexOf("grab"), grabOrder[moveId] ?? 10, moveId];
  }

  if (
    moveId === "utilt" ||
    moveId === "ftilt" ||
    moveId === "ftap" ||
    moveId === "dtilt" ||
    moveId.startsWith("ftilt")
  ) {
    const tiltOrder = {
      ftilt: 0,
      ftilt_h: 1,
      ftilt_mh: 2,
      ftilt_m: 3,
      ftilt_ml: 4,
      ftilt_l: 5,
      ftap: 6,
      utilt: 7,
      dtilt: 8
    };
    return [categoryOrder.indexOf("tilt"), tiltOrder[moveId] ?? 10, moveId];
  }

  if (moveId.includes("smash")) {
    const smashOrder = {
      fsmash: 0,
      fsmash_h: 1,
      fsmash_mh: 2,
      fsmash_m: 3,
      fsmash_ml: 4,
      fsmash_l: 5,
      usmash: 6,
      dsmash: 7
    };
    return [categoryOrder.indexOf("smash"), smashOrder[moveId] ?? 20, moveId];
  }

  if (moveId === "nair" || moveId === "fair" || moveId === "bair" || moveId === "uair" || moveId === "dair") {
    const airOrder = { nair: 0, fair: 1, bair: 2, uair: 3, dair: 4 };
    return [categoryOrder.indexOf("aerial"), airOrder[moveId] ?? 10, moveId];
  }

  if (moveId.startsWith("special")) {
    const specialPrefixOrder = [
      "specialn",
      "specialairn",
      "specials",
      "specialairs",
      "specialhi",
      "specialairhi",
      "speciallw",
      "specialairlw"
    ];
    const prefixIndex = specialPrefixOrder.findIndex((prefix) => moveId.startsWith(prefix));
    return [categoryOrder.indexOf("special"), prefixIndex === -1 ? 99 : prefixIndex, moveId];
  }

  return [categoryOrder.indexOf("other"), 999, moveId];
}

function buildMoveAnimation(moveId, realMoveData) {
  const realFrames = realMoveData.frames;
  const frameCount = Math.max(1, realFrames.length);
  const frames = Array.from({ length: frameCount }, (_, index) => {
    const realFrame = realFrames[clampToFrame(index, realFrames.length)];
    return {
      index,
      hurtboxes: realFrame.hurtboxes.map(normalizeRealHurtbox),
      hitboxes: realFrame.hitboxes.map(normalizeRealHitbox),
      phase: "idle"
    };
  });

  let firstActive = Number.POSITIVE_INFINITY;
  let lastActive = -1;
  frames.forEach((frame, index) => {
    if (frame.hitboxes.length > 0) {
      firstActive = Math.min(firstActive, index);
      lastActive = Math.max(lastActive, index);
    }
  });

  if (Number.isFinite(firstActive)) {
    frames.forEach((frame, index) => {
      if (index < firstActive) {
        frame.phase = "startup";
        return;
      }
      if (frame.hitboxes.length > 0) {
        frame.phase = "active";
        return;
      }
      if (index > lastActive) {
        frame.phase = "recovery";
        return;
      }
      frame.phase = "idle";
    });
  }

  return {
    id: moveId,
    name: humanizeMoveId(moveId),
    frameCount,
    fps: 60,
    subactionName: realMoveData.subactionName ?? null,
    iasa: null,
    frames
  };
}

async function loadDatasetFromDisk() {
  const directoryEntries = await fs.readdir(REALBOX_DIR, { withFileTypes: true });
  const dataFiles = directoryEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".realboxes.json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (dataFiles.length === 0) {
    throw new Error(
      `No real box files were found in ${REALBOX_DIR}. Run scripts/build-hurtbox-cache.sh first.`
    );
  }

  const records = await Promise.all(
    dataFiles.map(async (fileName, index) => {
      const filePath = path.join(REALBOX_DIR, fileName);
      const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
      const characterName =
        typeof parsed?.character === "string"
          ? parsed.character
          : decodeURIComponent(fileName.replace(/\.realboxes\.json$/u, ""));
      const characterId = slugifyCharacterName(characterName);
      const realMoves = parsed?.moves && typeof parsed.moves === "object" ? parsed.moves : {};

      const verifiedMoveEntries = Object.entries(realMoves)
        .filter(([moveId, moveData]) => isVerifiedRealMove(moveId, moveData))
        .filter(([moveId]) => !isThrowMove(moveId))
        .map(([moveId, moveData]) => ({
          id: moveId,
          name: humanizeMoveId(moveId),
          frameCount: Math.max(1, moveData.frames.length),
          fps: 60,
          realMoveData: moveData
        }))
        .sort((left, right) => {
          const leftKey = getMoveSortKey(left.id);
          const rightKey = getMoveSortKey(right.id);
          for (let index = 0; index < Math.max(leftKey.length, rightKey.length); index += 1) {
            const leftValue = leftKey[index];
            const rightValue = rightKey[index];
            if (leftValue === rightValue) {
              continue;
            }
            if (typeof leftValue === "number" && typeof rightValue === "number") {
              return leftValue - rightValue;
            }
            return String(leftValue).localeCompare(String(rightValue));
          }
          return left.name.localeCompare(right.name);
        });

      const moveMap = new Map(
        verifiedMoveEntries.map((entry) => [entry.id, { realMoveData: entry.realMoveData }])
      );
      const moveEntries = verifiedMoveEntries.map((entry) => ({
        id: entry.id,
        name: entry.name,
        frameCount: entry.frameCount,
        fps: entry.fps
      }));

      return {
        id: characterId,
        name: characterName,
        color: CHARACTER_COLORS[index % CHARACTER_COLORS.length],
        sizeScale: asNumber(parsed?.modelScale, 1),
        moveMap,
        moves: moveEntries
      };
    })
  );

  const characterById = new Map(records.map((record) => [record.id, record]));
  const animationCache = new Map();
  const realCharacterCount = records.filter((record) => record.moves.length > 0).length;
  const realMoveCount = records.reduce((sum, record) => sum + record.moves.length, 0);

  return {
    records,
    characterById,
    animationCache,
    metadata: {
      source: "vanilla.iso + DAT extraction + local realboxes cache",
      rosterCount: records.length,
      moveCount: realMoveCount,
      realCharacterCount,
      realMoveCount,
      note:
        "Runtime uses only local ISO-extracted realboxes cache. No framedata/dat-dump runtime dependency and no synthetic fallback data."
    }
  };
}

async function getDataset() {
  if (!datasetPromise) {
    datasetPromise = loadDatasetFromDisk();
  }
  return datasetPromise;
}

export class RealDataProvider {
  async getCharacters() {
    const dataset = await getDataset();
    return dataset.records.map((record) => ({
      id: record.id,
      name: record.name,
      color: record.color,
      sizeScale: record.sizeScale,
      moves: record.moves.map((move) => ({
        id: move.id,
        name: move.name,
        frameCount: move.frameCount,
        fps: move.fps
      }))
    }));
  }

  async getAnimation(characterId, moveId) {
    const dataset = await getDataset();
    const record = dataset.characterById.get(characterId);
    if (!record) {
      return null;
    }

    const moveBundle = record.moveMap.get(moveId);
    if (!moveBundle) {
      return null;
    }

    const cacheKey = `${characterId}:${moveId}`;
    if (!dataset.animationCache.has(cacheKey)) {
      const normalizedMove = buildMoveAnimation(moveId, moveBundle.realMoveData);
      dataset.animationCache.set(cacheKey, {
        character: {
          id: record.id,
          name: record.name,
          color: record.color,
          sizeScale: record.sizeScale
        },
        move: normalizedMove,
        source: dataset.metadata
      });
    }

    return dataset.animationCache.get(cacheKey);
  }

  async getMetadata() {
    const dataset = await getDataset();
    return dataset.metadata;
  }
}
