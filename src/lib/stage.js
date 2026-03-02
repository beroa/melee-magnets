export const STAGE_CANVAS = {
  width: 1280,
  height: 760,
  topPadding: 36,
  bottomPadding: 56,
  sidePadding: 36,
  minY: -140,
  maxXPadding: 16
};

export const MODEL_SCALE = 1;
export const STAGE_ZOOM_MAX = 2.2;

// Geometry and blastzones from libmelee stage constants:
// https://github.com/altf4/libmelee/blob/main/melee/stages.py
export const STAGE_PRESETS = {
  fd: {
    id: "fd",
    name: "Final Destination",
    groundLeft: -85.5656967163,
    groundRight: 85.5656967163,
    platforms: [],
    blastzone: { left: -246, right: 246, top: 188, bottom: -140 }
  },
  battlefield: {
    id: "battlefield",
    name: "Battlefield",
    groundLeft: -68.4000015259,
    groundRight: 68.4000015259,
    platforms: [
      { y: 27.20009994506836, left: -57.60000228881836, right: -20 },
      { y: 27.20009994506836, left: 20, right: 57.60000228881836 },
      { y: 54.40010070800781, left: -18.80000114440918, right: 18.80000114440918 }
    ],
    blastzone: { left: -224, right: 224, top: 200, bottom: -108.8 }
  }
};

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getStageSurfaces(stageId) {
  const stage = STAGE_PRESETS[stageId] ?? STAGE_PRESETS.fd;
  return [
    { kind: "main", y: 0, left: stage.groundLeft, right: stage.groundRight },
    ...stage.platforms.map((platform, index) => ({
      kind: index === 2 ? "top" : "side",
      y: platform.y,
      left: Math.min(platform.left, platform.right),
      right: Math.max(platform.left, platform.right)
    }))
  ].map((surface) => ({
    ...surface,
    left: Math.min(surface.left, surface.right),
    right: Math.max(surface.left, surface.right)
  }));
}

function getTightBounds(stageId) {
  const surfaces = getStageSurfaces(stageId);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  surfaces.forEach((surface) => {
    minX = Math.min(minX, surface.left);
    maxX = Math.max(maxX, surface.right);
    minY = Math.min(minY, surface.y);
    maxY = Math.max(maxY, surface.y);
  });

  return {
    minX: minX - 26,
    maxX: maxX + 26,
    minY: minY - 26,
    maxY: maxY + 64
  };
}

export function getStageWorldBounds(stageId, mode = "tight") {
  const stage = STAGE_PRESETS[stageId] ?? STAGE_PRESETS.fd;
  if (mode === "full") {
    return {
      minX: stage.blastzone.left,
      maxX: stage.blastzone.right,
      minY: stage.blastzone.bottom,
      maxY: stage.blastzone.top
    };
  }
  return getTightBounds(stageId);
}

function getScaleForBounds(bounds) {
  const availableWidth = STAGE_CANVAS.width - STAGE_CANVAS.sidePadding * 2;
  const availableHeight = STAGE_CANVAS.height - STAGE_CANVAS.topPadding - STAGE_CANVAS.bottomPadding;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  return Math.min(availableWidth / width, availableHeight / height);
}

export function getProjection(stageId, zoom = 1) {
  const tightBounds = getStageWorldBounds(stageId, "tight");
  const fullBounds = getStageWorldBounds(stageId, "full");

  const baseScale = getScaleForBounds(tightBounds);
  const minScale = getScaleForBounds(fullBounds);
  const scale = clamp(baseScale * zoom, minScale, baseScale * STAGE_ZOOM_MAX);

  const centerX = (tightBounds.minX + tightBounds.maxX) * 0.5;
  const centerY = (tightBounds.minY + tightBounds.maxY) * 0.5;

  return {
    scale,
    minZoom: Math.max(0.2, minScale / baseScale),
    centerX,
    centerY,
    bounds: tightBounds,
    fullBounds
  };
}

export function worldToCanvas(point, projection) {
  return {
    x: STAGE_CANVAS.width * 0.5 + (point.x - projection.centerX) * projection.scale,
    y: STAGE_CANVAS.height * 0.5 - (point.y - projection.centerY) * projection.scale
  };
}

export function canvasToWorld(point, projection) {
  return {
    x: projection.centerX + (point.x - STAGE_CANVAS.width * 0.5) / projection.scale,
    y: projection.centerY - (point.y - STAGE_CANVAS.height * 0.5) / projection.scale
  };
}

function pointSegmentDistanceSquared(point, start, end) {
  const abx = end.x - start.x;
  const aby = end.y - start.y;
  const apx = point.x - start.x;
  const apy = point.y - start.y;
  const abLengthSquared = abx * abx + aby * aby;
  if (abLengthSquared <= Number.EPSILON) {
    return apx * apx + apy * apy;
  }

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLengthSquared));
  const closestX = start.x + abx * t;
  const closestY = start.y + aby * t;
  const dx = point.x - closestX;
  const dy = point.y - closestY;
  return dx * dx + dy * dy;
}

export function pointInCircle(point, circle) {
  const dx = point.x - circle.x;
  const dy = point.y - circle.y;
  return dx * dx + dy * dy <= circle.radius * circle.radius;
}

export function pointInCapsule(point, capsule) {
  const distanceSquared = pointSegmentDistanceSquared(
    point,
    { x: capsule.x1, y: capsule.y1 },
    { x: capsule.x2, y: capsule.y2 }
  );
  return distanceSquared <= capsule.radius * capsule.radius;
}

export function pointInHitShape(point, shape) {
  if (
    shape.kind === "capsule" ||
    (Number.isFinite(shape.x1) &&
      Number.isFinite(shape.y1) &&
      Number.isFinite(shape.x2) &&
      Number.isFinite(shape.y2))
  ) {
    return pointInCapsule(point, shape);
  }

  return pointInCircle(point, shape);
}

export function buildFighterFromCharacter(character, fallbackFacing, fallbackX) {
  if (!character) {
    return null;
  }

  return {
    characterId: character.id,
    moveId: character.moves[0]?.id,
    x: fallbackX,
    y: 0,
    facing: fallbackFacing,
    sizeScale: Number.isFinite(character.sizeScale) ? character.sizeScale : 1
  };
}

export function getSnapYForX(stageId, x, targetY) {
  const surfaces = getStageSurfaces(stageId);
  let best = null;
  surfaces.forEach((surface) => {
    if (x < surface.left || x > surface.right) {
      return;
    }

    if (!best) {
      best = surface;
      return;
    }

    if (Number.isFinite(targetY)) {
      const currentDistance = Math.abs(surface.y - targetY);
      const bestDistance = Math.abs(best.y - targetY);
      if (currentDistance < bestDistance) {
        best = surface;
      }
      return;
    }

    if (surface.y < best.y) {
      best = surface;
    }
  });

  return best?.y ?? null;
}

export function toCanvasPoint(canvas, event, projection) {
  const rect = canvas.getBoundingClientRect();
  const screen = {
    x: ((event.clientX - rect.left) * canvas.width) / rect.width,
    y: ((event.clientY - rect.top) * canvas.height) / rect.height
  };

  if (!projection) {
    return screen;
  }

  return canvasToWorld(screen, projection);
}
