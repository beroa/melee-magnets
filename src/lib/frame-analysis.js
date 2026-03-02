export function formatEvent(event) {
  return `F${event.frameIndex + 1}: ${event.attackerName} ${event.moveName} -> ${event.defenderName} (${event.damage}% @ ${event.angle}deg)`;
}

export function resolveFrameOutcome(hitEvents) {
  const hitsFromA = hitEvents.filter((event) => event.attackerId.startsWith("A-"));
  const hitsFromB = hitEvents.filter((event) => event.attackerId.startsWith("B-"));

  if (hitsFromA.length === 0 && hitsFromB.length === 0) {
    return "No winner on this frame.";
  }

  if (hitsFromA.length > 0 && hitsFromB.length === 0) {
    return `${hitsFromA[0].attackerName} wins this frame.`;
  }

  if (hitsFromB.length > 0 && hitsFromA.length === 0) {
    return `${hitsFromB[0].attackerName} wins this frame.`;
  }

  const maxDamageA = Math.max(...hitsFromA.map((event) => event.damage));
  const maxDamageB = Math.max(...hitsFromB.map((event) => event.damage));

  if (maxDamageA > maxDamageB) {
    return `${hitsFromA[0].attackerName} wins trade (${maxDamageA} > ${maxDamageB}).`;
  }

  if (maxDamageB > maxDamageA) {
    return `${hitsFromB[0].attackerName} wins trade (${maxDamageB} > ${maxDamageA}).`;
  }

  return `Trade: both connect for ${maxDamageA}.`;
}

export function getActiveFrames(animation) {
  if (!animation) {
    return new Set();
  }

  const active = new Set();
  animation.move.frames.forEach((frame) => {
    if (frame.hitboxes.length > 0) {
      active.add(frame.index);
    }
  });
  return active;
}
