import type {
  DiagramEdge,
  DiagramNode,
  DiagramNodeType,
  DiagramSide,
} from "@/lib/haccp-plan/types";

export const NODE_W = 176;
export const NODE_H = 56;
export const GRID = 24;
export const SNAP = 8;
export const STUB = 22;
export const CORNER_R = 10;

const COL_GAP = 64;
const ROW_GAP = 72;

export const SIDES: DiagramSide[] = ["top", "bottom", "left", "right"];

export interface NodeSize {
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface GuideLine {
  axis: "x" | "y";
  position: number;
}

export function nodeSize(type: DiagramNodeType): NodeSize {
  switch (type) {
    case "start":
    case "end":
      return { w: 80, h: 80 };
    case "decision":
      return { w: 152, h: 152 };
    default:
      return { w: NODE_W, h: NODE_H };
  }
}

export function sizeOf(node: DiagramNode): NodeSize {
  return nodeSize(node.type);
}

export function nodeCenter(node: DiagramNode): Point {
  const { w, h } = sizeOf(node);
  return { x: node.x + w / 2, y: node.y + h / 2 };
}

export function nodeAnchor(node: DiagramNode, side: DiagramSide): Point {
  const { w, h } = sizeOf(node);
  switch (side) {
    case "top":
      return { x: node.x + w / 2, y: node.y };
    case "bottom":
      return { x: node.x + w / 2, y: node.y + h };
    case "left":
      return { x: node.x, y: node.y + h / 2 };
    case "right":
      return { x: node.x + w, y: node.y + h / 2 };
  }
}

function project(point: Point, side: DiagramSide, distance: number): Point {
  switch (side) {
    case "top":
      return { x: point.x, y: point.y - distance };
    case "bottom":
      return { x: point.x, y: point.y + distance };
    case "left":
      return { x: point.x - distance, y: point.y };
    case "right":
      return { x: point.x + distance, y: point.y };
  }
}

function isHorizontal(side: DiagramSide) {
  return side === "left" || side === "right";
}

export function inferSides(
  source: DiagramNode,
  target: DiagramNode
): { sourceSide: DiagramSide; targetSide: DiagramSide } {
  const s = nodeCenter(source);
  const t = nodeCenter(target);
  const dx = t.x - s.x;
  const dy = t.y - s.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceSide: "right", targetSide: "left" }
      : { sourceSide: "left", targetSide: "right" };
  }
  return dy >= 0
    ? { sourceSide: "bottom", targetSide: "top" }
    : { sourceSide: "top", targetSide: "bottom" };
}

export function inferSideFromPoint(node: DiagramNode, point: Point): DiagramSide {
  const { w, h } = sizeOf(node);
  const cx = node.x + w / 2;
  const cy = node.y + h / 2;
  const dx = point.x - cx;
  const dy = point.y - cy;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

function routePoints(
  start: Point,
  sourceSide: DiagramSide,
  end: Point,
  targetSide: DiagramSide
): Point[] {
  const a1 = project(start, sourceSide, STUB);
  const b1 = project(end, targetSide, STUB);
  const sameY = Math.abs(start.y - end.y) < 1.5;
  const sameX = Math.abs(start.x - end.x) < 1.5;

  if (sameY && isHorizontal(sourceSide) && isHorizontal(targetSide)) {
    return [start, end];
  }
  if (sameX && !isHorizontal(sourceSide) && !isHorizontal(targetSide)) {
    return [start, end];
  }

  const sh = isHorizontal(sourceSide);
  const th = isHorizontal(targetSide);

  if (sh && th) {
    const midX = (a1.x + b1.x) / 2;
    const canSplit =
      (sourceSide === "right" && targetSide === "left" && a1.x <= b1.x) ||
      (sourceSide === "left" && targetSide === "right" && a1.x >= b1.x);
    if (canSplit) {
      return [start, a1, { x: midX, y: a1.y }, { x: midX, y: b1.y }, b1, end];
    }
    const outerX =
      sourceSide === "right"
        ? Math.max(a1.x, b1.x) + 28
        : Math.min(a1.x, b1.x) - 28;
    return [start, a1, { x: outerX, y: a1.y }, { x: outerX, y: b1.y }, b1, end];
  }

  if (!sh && !th) {
    const midY = (a1.y + b1.y) / 2;
    const canSplit =
      (sourceSide === "bottom" && targetSide === "top" && a1.y <= b1.y) ||
      (sourceSide === "top" && targetSide === "bottom" && a1.y >= b1.y);
    if (canSplit) {
      return [start, a1, { x: a1.x, y: midY }, { x: b1.x, y: midY }, b1, end];
    }
    const outerY =
      sourceSide === "bottom"
        ? Math.max(a1.y, b1.y) + 28
        : Math.min(a1.y, b1.y) - 28;
    return [start, a1, { x: a1.x, y: outerY }, { x: b1.x, y: outerY }, b1, end];
  }

  const corner = sh
    ? { x: b1.x, y: a1.y }
    : { x: a1.x, y: b1.y };
  return [start, a1, corner, b1, end];
}

function roundedPath(points: Point[], radius = CORNER_R): string {
  const cleaned = points.filter((point, index) => {
    if (index === 0) return true;
    const prev = points[index - 1];
    return Math.hypot(point.x - prev.x, point.y - prev.y) > 0.5;
  });
  if (cleaned.length < 2) return "";
  if (cleaned.length === 2) {
    return `M ${cleaned[0].x} ${cleaned[0].y} L ${cleaned[1].x} ${cleaned[1].y}`;
  }

  let d = `M ${cleaned[0].x} ${cleaned[0].y}`;
  for (let i = 1; i < cleaned.length - 1; i += 1) {
    const prev = cleaned[i - 1];
    const curr = cleaned[i];
    const next = cleaned[i + 1];
    const inDx = curr.x - prev.x;
    const inDy = curr.y - prev.y;
    const outDx = next.x - curr.x;
    const outDy = next.y - curr.y;
    const inLen = Math.hypot(inDx, inDy) || 1;
    const outLen = Math.hypot(outDx, outDy) || 1;
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const before = {
      x: curr.x - (inDx / inLen) * r,
      y: curr.y - (inDy / inLen) * r,
    };
    const after = {
      x: curr.x + (outDx / outLen) * r,
      y: curr.y + (outDy / outLen) * r,
    };
    d += ` L ${before.x} ${before.y} Q ${curr.x} ${curr.y} ${after.x} ${after.y}`;
  }
  const last = cleaned[cleaned.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export function edgePath(
  source: DiagramNode,
  target: DiagramNode,
  sourceSide?: DiagramSide,
  targetSide?: DiagramSide
): string {
  const sides =
    sourceSide && targetSide
      ? { sourceSide, targetSide }
      : inferSides(source, target);
  const start = nodeAnchor(source, sides.sourceSide);
  const end = nodeAnchor(target, sides.targetSide);
  return roundedPath(routePoints(start, sides.sourceSide, end, sides.targetSide));
}

export function previewPath(
  source: DiagramNode,
  sourceSide: DiagramSide,
  cursor: Point
): string {
  const start = nodeAnchor(source, sourceSide);
  const targetSide = isHorizontal(sourceSide)
    ? cursor.x >= start.x
      ? "left"
      : "right"
    : cursor.y >= start.y
      ? "top"
      : "bottom";
  return roundedPath(routePoints(start, sourceSide, cursor, targetSide));
}

export function edgeMidpoint(
  source: DiagramNode,
  target: DiagramNode,
  sourceSide?: DiagramSide,
  targetSide?: DiagramSide
): Point {
  const sides =
    sourceSide && targetSide
      ? { sourceSide, targetSide }
      : inferSides(source, target);
  const start = nodeAnchor(source, sides.sourceSide);
  const end = nodeAnchor(target, sides.targetSide);
  const points = routePoints(start, sides.sourceSide, end, sides.targetSide);
  const mid = Math.floor(points.length / 2);
  const a = points[Math.max(0, mid - 1)];
  const b = points[Math.min(points.length - 1, mid)];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function snapDrag(
  moving: DiagramNode,
  x: number,
  y: number,
  others: DiagramNode[],
  threshold = SNAP
): { x: number; y: number; guides: GuideLine[] } {
  const { w, h } = sizeOf(moving);
  const movingLines = {
    left: x,
    centerX: x + w / 2,
    right: x + w,
    top: y,
    centerY: y + h / 2,
    bottom: y + h,
  };

  let nextX = x;
  let nextY = y;
  let bestX = threshold + 1;
  let bestY = threshold + 1;
  const guides: GuideLine[] = [];
  let snapX: number | null = null;
  let snapY: number | null = null;

  for (const other of others) {
    if (other.id === moving.id) continue;
    const size = sizeOf(other);
    const lines = {
      left: other.x,
      centerX: other.x + size.w / 2,
      right: other.x + size.w,
      top: other.y,
      centerY: other.y + size.h / 2,
      bottom: other.y + size.h,
    };

    const xPairs: Array<[number, number, number]> = [
      [movingLines.left, lines.left, 0],
      [movingLines.centerX, lines.centerX, w / 2],
      [movingLines.right, lines.right, w],
      [movingLines.left, lines.centerX, 0],
      [movingLines.right, lines.centerX, w],
      [movingLines.centerX, lines.left, w / 2],
      [movingLines.centerX, lines.right, w / 2],
    ];
    const yPairs: Array<[number, number, number]> = [
      [movingLines.top, lines.top, 0],
      [movingLines.centerY, lines.centerY, h / 2],
      [movingLines.bottom, lines.bottom, h],
      [movingLines.top, lines.centerY, 0],
      [movingLines.bottom, lines.centerY, h],
      [movingLines.centerY, lines.top, h / 2],
      [movingLines.centerY, lines.bottom, h / 2],
    ];

    for (const [from, to, offset] of xPairs) {
      const delta = Math.abs(from - to);
      if (delta <= threshold && delta < bestX) {
        bestX = delta;
        nextX = to - offset;
        snapX = to;
      }
    }
    for (const [from, to, offset] of yPairs) {
      const delta = Math.abs(from - to);
      if (delta <= threshold && delta < bestY) {
        bestY = delta;
        nextY = to - offset;
        snapY = to;
      }
    }
  }

  if (snapX !== null) guides.push({ axis: "x", position: snapX });
  if (snapY !== null) guides.push({ axis: "y", position: snapY });

  return { x: nextX, y: nextY, guides };
}

export function parseStageLines(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferNodeType(label: string): DiagramNodeType {
  const value = label.toLowerCase();
  if (/^inicio$|^start$/.test(value)) return "start";
  if (/^fin$|^end$|^t[eé]rmino$/.test(value)) return "end";
  if (/\bpcc\b|punto cr[ií]tico/.test(value)) return "pcc";
  if (/al[eé]rgen/.test(value)) return "allergen";
  if (/\?|decisi[oó]n/.test(value)) return "decision";
  return "step";
}

export function layoutGeneratedStages(
  labels: string[],
  direction: "vertical" | "horizontal"
): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const stages = [...labels];
  if (!stages.some((label) => inferNodeType(label) === "start")) {
    stages.unshift("Inicio");
  }
  if (!stages.some((label) => inferNodeType(label) === "end")) {
    stages.push("Fin");
  }

  const startX = 72;
  const startY = 40;
  const nodes: DiagramNode[] = [];
  let cursorX = startX;
  let cursorY = startY;

  stages.forEach((label) => {
    const type = inferNodeType(label);
    const size = nodeSize(type);
    const x =
      direction === "horizontal"
        ? cursorX
        : startX + (NODE_W - size.w) / 2 + 48;
    const y =
      direction === "horizontal"
        ? startY + (NODE_H - size.h) / 2 + 48
        : cursorY;
    nodes.push({
      id: crypto.randomUUID(),
      type,
      label,
      x,
      y,
    });
    if (direction === "horizontal") {
      cursorX += size.w + COL_GAP;
    } else {
      cursorY += size.h + ROW_GAP;
    }
  });

  const edges: DiagramEdge[] = nodes.slice(0, -1).map((node, index) => ({
    id: crypto.randomUUID(),
    source: node.id,
    target: nodes[index + 1].id,
    type: "step" as const,
    sourceSide: direction === "horizontal" ? "right" : "bottom",
    targetSide: direction === "horizontal" ? "left" : "top",
  }));

  return { nodes, edges };
}

export function contentBounds(nodes: DiagramNode[]) {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 400, maxY: 300 };
  }
  return nodes.reduce(
    (box, node) => {
      const { w, h } = sizeOf(node);
      return {
        minX: Math.min(box.minX, node.x),
        minY: Math.min(box.minY, node.y),
        maxX: Math.max(box.maxX, node.x + w),
        maxY: Math.max(box.maxY, node.y + h),
      };
    },
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    }
  );
}
