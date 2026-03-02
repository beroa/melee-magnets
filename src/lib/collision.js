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

  return (
    circleCapsuleOverlap(
      { x: left.x1, y: left.y1, radius: left.radius },
      right
    ) ||
    circleCapsuleOverlap(
      { x: left.x2, y: left.y2, radius: left.radius },
      right
    ) ||
    circleCapsuleOverlap(
      { x: right.x1, y: right.y1, radius: right.radius },
      left
    ) ||
    circleCapsuleOverlap(
      { x: right.x2, y: right.y2, radius: right.radius },
      left
    )
  );
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

export function getFrameBoxes(animation, frameIndex, fighter) {
  if (!animation || !animation.move.frames.length) {
    return { hurtboxes: [], hitboxes: [], phase: "idle" };
  }

  const frame = animation.move.frames[frameIndex % animation.move.frames.length];
  return {
    hurtboxes: frame.hurtboxes.map((box) => transformBox(box, fighter)),
    hitboxes: frame.hitboxes.map((box) => transformBox(box, fighter)),
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
import { MODEL_SCALE } from "./stage.js";
