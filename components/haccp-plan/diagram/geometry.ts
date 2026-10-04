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
export const STUB = 28;
export const AROUND = 44;
export const CORNER_R = 12;

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

export function oppositeSide(side: DiagramSide): DiagramSide {
  switch (side) {
    case "top":
      return "bottom";
    case "bottom":
      return "top";
    case "left":
      return "right";
    case "right":
      return "left";
  }
}

const DIR: Record<DiagramSide, Point> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

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

function facingEachOther(
  sourceSide: DiagramSide,
  targetSide: DiagramSide,
  a: Point,
  b: Point
) {
  if (sourceSide === "right" && targetSide === "left") return a.x <= b.x;
  if (sourceSide === "left" && targetSide === "right") return a.x >= b.x;
  if (sourceSide === "bottom" && targetSide === "top") return a.y <= b.y;
  if (sourceSide === "top" && targetSide === "bottom") return a.y >= b.y;
  return false;
}

function outerCoord(side: DiagramSide, a: Point, b: Point) {
  if (side === "right") return Math.max(a.x, b.x) + AROUND;
  if (side === "left") return Math.min(a.x, b.x) - AROUND;
  if (side === "bottom") return Math.max(a.y, b.y) + AROUND;
  return Math.min(a.y, b.y) - AROUND;
}

function bridgeParallel(a: Point, sourceSide: DiagramSide, b: Point, targetSide: DiagramSide): Point[] {
  const horizontal = isHorizontal(sourceSide);
  if (facingEachOther(sourceSide, targetSide, a, b)) {
    if (horizontal) {
      const midX = (a.x + b.x) / 2;
      return [
        { x: midX, y: a.y },
        { x: midX, y: b.y },
      ];
    }
    const midY = (a.y + b.y) / 2;
    return [
      { x: a.x, y: midY },
      { x: b.x, y: midY },
    ];
  }

  if (sourceSide === targetSide) {
    if (horizontal) {
      const x = outerCoord(sourceSide, a, b);
      return [
        { x, y: a.y },
        { x, y: b.y },
      ];
    }
    const y = outerCoord(sourceSide, a, b);
    return [
      { x: a.x, y },
      { x: b.x, y },
    ];
  }

  if (horizontal) {
    const x = sourceSide === "right" || targetSide === "right"
      ? Math.max(a.x, b.x) + AROUND
      : Math.min(a.x, b.x) - AROUND;
    return [
      { x, y: a.y },
      { x, y: b.y },
    ];
  }
  const y = sourceSide === "bottom" || targetSide === "bottom"
    ? Math.max(a.y, b.y) + AROUND
    : Math.min(a.y, b.y) - AROUND;
  return [
    { x: a.x, y },
    { x: b.x, y },
  ];
}

function bridgePerpendicular(
  a: Point,
  sourceSide: DiagramSide,
  b: Point,
  targetSide: DiagramSide
): Point[] {
  const sourceH = isHorizontal(sourceSide);
  const primary = sourceH ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  const sourceDir = DIR[sourceSide];
  const targetDir = DIR[targetSide];
  const leaveOk = sourceH
    ? (primary.x - a.x) * sourceDir.x >= -1
    : (primary.y - a.y) * sourceDir.y >= -1;
  const arriveOk = sourceH
    ? (b.y - primary.y) * -targetDir.y >= -1
    : (b.x - primary.x) * -targetDir.x >= -1;

  if (leaveOk && arriveOk) {
    return [primary];
  }

  if (sourceH) {
    const y = targetSide === "top"
      ? Math.min(a.y, b.y) - AROUND
      : Math.max(a.y, b.y) + AROUND;
    return [
      { x: a.x, y },
      { x: b.x, y },
    ];
  }

  const x = targetSide === "left"
    ? Math.min(a.x, b.x) - AROUND
    : Math.max(a.x, b.x) + AROUND;
  return [
    { x, y: a.y },
    { x, y: b.y },
  ];
}

function routePoints(
  start: Point,
  sourceSide: DiagramSide,
  end: Point,
  targetSide: DiagramSide
): Point[] {
  const a1 = project(start, sourceSide, STUB);
  const b1 = project(end, targetSide, STUB);
  const alignedH =
    Math.abs(start.y - end.y) < 1.5 &&
    isHorizontal(sourceSide) &&
    isHorizontal(targetSide) &&
    facingEachOther(sourceSide, targetSide, a1, b1);
  const alignedV =
    Math.abs(start.x - end.x) < 1.5 &&
    !isHorizontal(sourceSide) &&
    !isHorizontal(targetSide) &&
    facingEachOther(sourceSide, targetSide, a1, b1);

  if (alignedH || alignedV) {
    return [start, end];
  }

  const middle =
    isHorizontal(sourceSide) === isHorizontal(targetSide)
      ? bridgeParallel(a1, sourceSide, b1, targetSide)
      : bridgePerpendicular(a1, sourceSide, b1, targetSide);

  return [start, a1, ...middle, b1, end];
}

export function dragAxisOf(points: Point[]): "x" | "y" {
  if (points.length < 2) return "y";
  if (points.length === 2) {
    const dx = Math.abs(points[1].x - points[0].x);
    const dy = Math.abs(points[1].y - points[0].y);
    return dx >= dy ? "y" : "x";
  }
  let bestLen = -1;
  let axis: "x" | "y" = "y";
  const last = Math.max(1, points.length - 2);
  for (let i = 1; i < last; i += 1) {
    const dx = Math.abs(points[i + 1].x - points[i].x);
    const dy = Math.abs(points[i + 1].y - points[i].y);
    const len = Math.hypot(dx, dy);
    if (len > bestLen) {
      bestLen = len;
      axis = dx >= dy ? "y" : "x";
    }
  }
  return axis;
}

function applyRouteOffset(points: Point[], offset: number): Point[] {
  if (!offset || points.length < 2) return points;
  const axis = dragAxisOf(points);

  if (points.length === 2) {
    const [start, end] = points;
    if (axis === "y") {
      return [
        start,
        { x: start.x, y: start.y + offset },
        { x: end.x, y: end.y + offset },
        end,
      ];
    }
    return [
      start,
      { x: start.x + offset, y: start.y },
      { x: end.x + offset, y: end.y },
      end,
    ];
  }

  let index = 1;
  let bestLen = -1;
  const last = Math.max(1, points.length - 2);
  for (let i = 1; i < last; i += 1) {
    const len = Math.hypot(
      points[i + 1].x - points[i].x,
      points[i + 1].y - points[i].y
    );
    if (len > bestLen) {
      bestLen = len;
      index = i;
    }
  }

  return points.map((point, i) => {
    if (i !== index && i !== index + 1) return point;
    return axis === "y"
      ? { ...point, y: point.y + offset }
      : { ...point, x: point.x + offset };
  });
}

function resolvedSides(
  source: DiagramNode,
  target: DiagramNode,
  sourceSide?: DiagramSide,
  targetSide?: DiagramSide
) {
  return sourceSide && targetSide
    ? { sourceSide, targetSide }
    : inferSides(source, target);
}

export function edgePoints(
  source: DiagramNode,
  target: DiagramNode,
  sourceSide?: DiagramSide,
  targetSide?: DiagramSide,
  offset = 0
): Point[] {
  const sides = resolvedSides(source, target, sourceSide, targetSide);
  const base = routePoints(
    nodeAnchor(source, sides.sourceSide),
    sides.sourceSide,
    nodeAnchor(target, sides.targetSide),
    sides.targetSide
  );
  return applyRouteOffset(base, offset);
}

export function edgeDragInfo(
  source: DiagramNode,
  target: DiagramNode,
  sourceSide?: DiagramSide,
  targetSide?: DiagramSide,
  offset = 0
): { axis: "x" | "y"; handle: Point } {
  const points = edgePoints(source, target, sourceSide, targetSide, offset);
  const axis = dragAxisOf(points);
  const mid = Math.floor(points.length / 2);
  const a = points[Math.max(0, mid - 1)];
  const b = points[Math.min(points.length - 1, mid)];
  return {
    axis,
    handle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
  };
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
  targetSide?: DiagramSide,
  offset = 0
): string {
  return roundedPath(edgePoints(source, target, sourceSide, targetSide, offset));
}

export function previewPath(
  source: DiagramNode,
  sourceSide: DiagramSide,
  cursor: Point,
  target?: DiagramNode,
  targetSide?: DiagramSide
): string {
  if (target && targetSide) {
    return edgePath(source, target, sourceSide, targetSide);
  }
  const start = nodeAnchor(source, sourceSide);
  const ghost: DiagramNode = {
    id: "_preview",
    type: "step",
    label: "",
    x: cursor.x - 8,
    y: cursor.y - 8,
  };
  const side = targetSide ?? inferSideFromPoint(ghost, nodeCenter(source));
  return roundedPath(routePoints(start, sourceSide, cursor, side));
}

export function edgeMidpoint(
  source: DiagramNode,
  target: DiagramNode,
  sourceSide?: DiagramSide,
  targetSide?: DiagramSide,
  offset = 0
): Point {
  return edgeDragInfo(source, target, sourceSide, targetSide, offset).handle;
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
