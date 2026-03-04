import { getStageSurfaces, STAGE_CANVAS, worldToCanvas } from "./stage.js";

function drawCircle(ctx, circle, fillStyle, strokeStyle) {
  ctx.beginPath();
  ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawCapsule(ctx, capsule, fillStyle, strokeStyle) {
  const dx = capsule.x2 - capsule.x1;
  const dy = capsule.y2 - capsule.y1;
  const length = Math.hypot(dx, dy);
  const radius = Math.max(1, capsule.radius);

  if (length <= Number.EPSILON) {
    drawCircle(ctx, { x: capsule.x1, y: capsule.y1, radius }, fillStyle, strokeStyle);
    return;
  }

  const angle = Math.atan2(dy, dx);

  ctx.save();
  ctx.translate(capsule.x1, capsule.y1);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.lineTo(length, -radius);
  ctx.arc(length, 0, radius, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(0, radius);
  ctx.arc(0, 0, radius, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

function projectShape(shape, projection) {
  if (
    shape.kind === "capsule" ||
    (Number.isFinite(shape.x1) &&
      Number.isFinite(shape.y1) &&
      Number.isFinite(shape.x2) &&
      Number.isFinite(shape.y2))
  ) {
    const p1 = worldToCanvas({ x: shape.x1, y: shape.y1 }, projection);
    const p2 = worldToCanvas({ x: shape.x2, y: shape.y2 }, projection);
    const center = worldToCanvas({ x: shape.x, y: shape.y }, projection);
    return {
      ...shape,
      kind: "capsule",
      x: center.x,
      y: center.y,
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      radius: shape.radius * projection.scale
    };
  }

  const p = worldToCanvas({ x: shape.x, y: shape.y }, projection);
  return {
    ...shape,
    kind: shape.kind ?? "circle",
    x: p.x,
    y: p.y,
    radius: shape.radius * projection.scale
  };
}

function drawHitShape(ctx, shape, fillStyle, strokeStyle) {
  if (
    shape.kind === "capsule" ||
    (Number.isFinite(shape.x1) &&
      Number.isFinite(shape.y1) &&
      Number.isFinite(shape.x2) &&
      Number.isFinite(shape.y2))
  ) {
    drawCapsule(ctx, shape, fillStyle, strokeStyle);
    return;
  }

  drawCircle(ctx, shape, fillStyle, strokeStyle);
}

function drawFighter(ctx, fighterLabel, boxes, origin, selected, hurtboxFill, hurtboxStroke, projection) {
  boxes.hurtboxes.forEach((hurtbox) => {
    drawHitShape(ctx, projectShape(hurtbox, projection), hurtboxFill, hurtboxStroke);
  });

  boxes.hitboxes.forEach((hitbox) => {
    drawHitShape(ctx, projectShape(hitbox, projection), "#ffd166a6", "#ffe873");
  });

  const canvasOrigin = worldToCanvas(origin, projection);

  ctx.beginPath();
  ctx.arc(canvasOrigin.x, canvasOrigin.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = "#f2f4ff";
  ctx.fill();

  if (selected) {
    ctx.beginPath();
    ctx.arc(canvasOrigin.x, canvasOrigin.y, 32, 0, Math.PI * 2);
    ctx.strokeStyle = "#f8fbff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.fillStyle = "#f2f4ff";
  ctx.font = '600 14px "IBM Plex Sans", sans-serif';
  ctx.fillText(fighterLabel, canvasOrigin.x - 18, canvasOrigin.y - 58);
}

function drawBlastzoneBorder(ctx, projection) {
  const topLeft = worldToCanvas(
    { x: projection.fullBounds.minX, y: projection.fullBounds.maxY },
    projection
  );
  const bottomRight = worldToCanvas(
    { x: projection.fullBounds.maxX, y: projection.fullBounds.minY },
    projection
  );

  ctx.save();
  ctx.strokeStyle = "#ff4d4dd4";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 7]);
  ctx.strokeRect(
    topLeft.x,
    topLeft.y,
    bottomRight.x - topLeft.x,
    bottomRight.y - topLeft.y
  );
  ctx.restore();
}

export function drawStageFrame(ctx, {
  frameState,
  fighterA,
  fighterB,
  characterAName,
  characterBName,
  selectedFighter,
  frameIndexA,
  frameIndexB,
  frameCountA,
  frameCountB,
  stageId,
  projection
}) {
  ctx.clearRect(0, 0, STAGE_CANVAS.width, STAGE_CANVAS.height);

  const gradient = ctx.createLinearGradient(0, 0, 0, STAGE_CANVAS.height);
  gradient.addColorStop(0, "#0c1527");
  gradient.addColorStop(1, "#070b12");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, STAGE_CANVAS.width, STAGE_CANVAS.height);
  drawBlastzoneBorder(ctx, projection);

  const surfaces = getStageSurfaces(stageId);
  surfaces.forEach((surface) => {
    const left = worldToCanvas({ x: surface.left, y: surface.y }, projection);
    const right = worldToCanvas({ x: surface.right, y: surface.y }, projection);
    ctx.strokeStyle = surface.kind === "main" ? "#8aa9e766" : "#8aa9e744";
    ctx.lineWidth = surface.kind === "main" ? 4 : 3;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y + 1);
    ctx.lineTo(right.x, right.y + 1);
    ctx.stroke();
  });

  drawFighter(
    ctx,
    characterAName,
    frameState.boxesA,
    { x: fighterA.x, y: fighterA.y },
    selectedFighter === "A",
    "#ff3b3d5e",
    "#ff5a5ccc",
    projection
  );

  drawFighter(
    ctx,
    characterBName,
    frameState.boxesB,
    { x: fighterB.x, y: fighterB.y },
    selectedFighter === "B",
    "#ff3b3d5e",
    "#ff5a5ccc",
    projection
  );

  ctx.fillStyle = "#dce4ff";
  ctx.font = '500 13px "IBM Plex Sans", sans-serif';
  ctx.fillText(`A Frame ${frameIndexA + 1}/${frameCountA}`, 20, 28);
  ctx.fillText(`B Frame ${frameIndexB + 1}/${frameCountB}`, 20, 46);
  ctx.fillText("Click or drag a fighter to move and edit it.", 20, 64);
}
