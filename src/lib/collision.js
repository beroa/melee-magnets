import { MODEL_SCALE } from "./stage.js";

function circlesOverlap(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const distanceSquared = dx * dx + dy * dy;
  const radius = a.radius + b.radius;
  return distanceSquared <= radius * radius;
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

function circleCapsuleOverlap(circle, capsule) {
  const distanceSquared = pointSegmentDistanceSquared(
    { x: circle.x, y: circle.y },
    { x: capsule.x1, y: capsule.y1 },
    { x: capsule.x2, y: capsule.y2 }
  );
  const radius = circle.radius + capsule.radius;
  return distanceSquared <= radius * radius;
}

function orientation(a, b, c) {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function onSegment(a, b, c) {
  return (
    b.x <= Math.max(a.x, c.x) + Number.EPSILON &&
    b.x + Number.EPSILON >= Math.min(a.x, c.x) &&
    b.y <= Math.max(a.y, c.y) + Number.EPSILON &&
    b.y + Number.EPSILON >= Math.min(a.y, c.y)
  );
}

function segmentsIntersect(aStart, aEnd, bStart, bEnd) {
  const o1 = orientation(aStart, aEnd, bStart);
  const o2 = orientation(aStart, aEnd, bEnd);
  const o3 = orientation(bStart, bEnd, aStart);
  const o4 = orientation(bStart, bEnd, aEnd);

  if (
    ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) &&
    ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))
  ) {
    return true;
  }

  if (Math.abs(o1) <= Number.EPSILON && onSegment(aStart, bStart, aEnd)) {
    return true;
  }
  if (Math.abs(o2) <= Number.EPSILON && onSegment(aStart, bEnd, aEnd)) {
    return true;
  }
  if (Math.abs(o3) <= Number.EPSILON && onSegment(bStart, aStart, bEnd)) {
    return true;
  }
  if (Math.abs(o4) <= Number.EPSILON && onSegment(bStart, aEnd, bEnd)) {
    return true;
  }

  return false;
}

function segmentSegmentDistanceSquared(aStart, aEnd, bStart, bEnd) {
  if (segmentsIntersect(aStart, aEnd, bStart, bEnd)) {
    return 0;
  }

  return Math.min(
    pointSegmentDistanceSquared(aStart, bStart, bEnd),
    pointSegmentDistanceSquared(aEnd, bStart, bEnd),
    pointSegmentDistanceSquared(bStart, aStart, aEnd),
    pointSegmentDistanceSquared(bEnd, aStart, aEnd)
  );
}

function capsuleCapsuleOverlap(left, right) {
  const distanceSquared = segmentSegmentDistanceSquared(
    { x: left.x1, y: left.y1 },
    { x: left.x2, y: left.y2 },
    { x: right.x1, y: right.y1 },
    { x: right.x2, y: right.y2 }
  );
  const radius = left.radius + right.radius;
  return distanceSquared <= radius * radius;
}

function isCapsule(shape) {
  return (
    shape.kind === "capsule" ||
    (Number.isFinite(shape.x1) &&
      Number.isFinite(shape.y1) &&
      Number.isFinite(shape.x2) &&
      Number.isFinite(shape.y2))
  );
}

function hitShapeOverlap(left, right) {
  const leftCapsule = isCapsule(left);
  const rightCapsule = isCapsule(right);

  if (!leftCapsule && !rightCapsule) {
    return circlesOverlap(left, right);
  }
  if (!leftCapsule && rightCapsule) {
    return circleCapsuleOverlap(left, right);
  }
  if (leftCapsule && !rightCapsule) {
    return circleCapsuleOverlap(right, left);
  }

  return capsuleCapsuleOverlap(left, right);
}

function transformBox(box, fighter) {
  const scale = MODEL_SCALE;

  if (isCapsule(box)) {
    return {
      ...box,
      kind: "capsule",
      x: fighter.x + box.x * scale * fighter.facing,
      y: fighter.y + box.y * scale,
      x1: fighter.x + box.x1 * scale * fighter.facing,
      y1: fighter.y + box.y1 * scale,
      x2: fighter.x + box.x2 * scale * fighter.facing,
      y2: fighter.y + box.y2 * scale,
      radius: box.radius * scale
    };
  }

  return {
    ...box,
    kind: box.kind ?? "circle",
    x: fighter.x + box.x * scale * fighter.facing,
    y: fighter.y + box.y * scale,
    radius: box.radius * scale
  };
}

function normalizeFrameIndex(frameIndex, frameCount) {
  if (frameCount <= 0) {
    return 0;
  }

  const modulo = frameIndex % frameCount;
  return modulo < 0 ? modulo + frameCount : modulo;
}

function hitboxPrimaryKey(hitbox) {
  return `${hitbox.groupId ?? ""}:${hitbox.id ?? ""}:${hitbox.guid ?? ""}`;
}

function findPreviousHitbox(currentHitbox, previousBuckets) {
  const candidates = previousBuckets.get(hitboxPrimaryKey(currentHitbox)) ?? [];
  if (candidates.length === 0) {
    return null;
  }

  const boneMatch = candidates.find((candidate) => candidate.bone === currentHitbox.bone);
  return boneMatch ?? candidates[0];
}

function buildSweptHitbox(currentHitbox, previousHitbox) {
  if (!previousHitbox || isCapsule(currentHitbox) || isCapsule(previousHitbox)) {
    return currentHitbox;
  }

  const dx = currentHitbox.x - previousHitbox.x;
  const dy = currentHitbox.y - previousHitbox.y;
  if (dx * dx + dy * dy <= 1e-6) {
    return currentHitbox;
  }

  return {
    ...currentHitbox,
    kind: "capsule",
    x1: previousHitbox.x,
    y1: previousHitbox.y,
    x2: currentHitbox.x,
    y2: currentHitbox.y,
    radius: Math.max(currentHitbox.radius, previousHitbox.radius),
    swept: true
  };
}

function buildSweptHitboxes(currentHitboxes, previousHitboxes) {
  if (previousHitboxes.length === 0) {
    return currentHitboxes;
  }

  const previousBuckets = new Map();
  previousHitboxes.forEach((hitbox) => {
    const key = hitboxPrimaryKey(hitbox);
    const bucket = previousBuckets.get(key) ?? [];
    bucket.push(hitbox);
    previousBuckets.set(key, bucket);
  });

  return currentHitboxes.map((currentHitbox) => {
    const previousHitbox = findPreviousHitbox(currentHitbox, previousBuckets);
    return buildSweptHitbox(currentHitbox, previousHitbox);
  });
}

export function getFrameBoxes(animation, frameIndex, fighter) {
  if (!animation || !animation.move.frames.length) {
    return { hurtboxes: [], hitboxes: [], phase: "idle" };
  }

  const frameCount = animation.move.frames.length;
  const resolvedFrameIndex = normalizeFrameIndex(frameIndex, frameCount);
  const frame = animation.move.frames[resolvedFrameIndex];
  const previousFrame = resolvedFrameIndex > 0
    ? animation.move.frames[resolvedFrameIndex - 1]
    : null;

  const currentHitboxes = frame.hitboxes.map((box) => transformBox(box, fighter));
  const previousHitboxes = previousFrame
    ? previousFrame.hitboxes.map((box) => transformBox(box, fighter))
    : [];

  return {
    hurtboxes: frame.hurtboxes.map((box) => transformBox(box, fighter)),
    hitboxes: buildSweptHitboxes(currentHitboxes, previousHitboxes),
    phase: frame.phase
  };
}

export function detectHitEvents({ attacker, defender, attackerBoxes, defenderBoxes, frameIndex }) {
  const events = [];

  attackerBoxes.hitboxes.forEach((hitbox) => {
    defenderBoxes.hurtboxes.forEach((hurtbox) => {
      if (hitShapeOverlap(hitbox, hurtbox)) {
        const key = `${attacker.id}->${defender.id}:${hitbox.id}:${hurtbox.id}`;
        events.push({
          key,
          frameIndex,
          attackerId: attacker.id,
          attackerName: attacker.name,
          defenderId: defender.id,
          defenderName: defender.name,
          moveName: attacker.moveName,
          damage: hitbox.damage,
          angle: hitbox.angle,
          hitbox,
          hurtbox
        });
      }
    });
  });

  return events;
}
