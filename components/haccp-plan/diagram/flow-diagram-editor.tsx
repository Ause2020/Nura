"use client";

import { useEffect, useRef, useState } from "react";
import {
  Maximize2,
  Minus,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { DiagramNodeCard } from "@/components/haccp-plan/diagram/diagram-node";
import {
  GRID,
  contentBounds,
  edgeMidpoint,
  edgePath,
  inferSideFromPoint,
  inferSides,
  layoutGeneratedStages,
  nodeSize,
  parseStageLines,
  previewPath,
  snapDrag,
} from "@/components/haccp-plan/diagram/geometry";
import { cn } from "@/lib/utils";
import type {
  DiagramEdge,
  DiagramNode,
  DiagramNodeType,
  DiagramSide,
  ProcessDiagram,
} from "@/lib/haccp-plan/types";

const PALETTE: Array<{
  type: DiagramNodeType;
  label: string;
  hint: string;
}> = [
  { type: "start", label: "Inicio", hint: "Círculo de arranque" },
  { type: "step", label: "Etapa", hint: "Proceso" },
  { type: "decision", label: "Decisión", hint: "Rombo Sí / No" },
  { type: "pcc", label: "PCC", hint: "Punto crítico" },
  { type: "allergen", label: "Alérgeno", hint: "Control de alérgeno" },
  { type: "end", label: "Fin", hint: "Círculo de cierre" },
];

const DEFAULT_LABEL: Record<DiagramNodeType, string> = {
  start: "Inicio",
  end: "Fin",
  step: "Nueva etapa",
  pcc: "PCC",
  allergen: "Alérgeno",
  decision: "¿Cumple el límite?",
};

interface FlowDiagramEditorProps {
  diagrams: ProcessDiagram[];
  activeId: string;
  onActiveChange: (id: string) => void;
  onChange: (diagrams: ProcessDiagram[]) => void;
  onAddDiagram: () => void;
  onDeleteDiagram: (id: string) => void;
}

type Selection =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | null;

export function FlowDiagramEditor({
  diagrams,
  activeId,
  onActiveChange,
  onChange,
  onAddDiagram,
  onDeleteDiagram,
}: FlowDiagramEditorProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const diagramRef = useRef<ProcessDiagram | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<{
    nodeId: string;
    side: DiagramSide;
  } | null>(null);
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number } | null>(
    null
  );
  const [guides, setGuides] = useState<Array<{ axis: "x" | "y"; position: number }>>(
    []
  );
  const [dragging, setDragging] = useState<{
    id: string;
    startX: number;
    startY: number;
    startClientX: number;
    startClientY: number;
  } | null>(null);
  const [panning, setPanning] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateText, setGenerateText] = useState("");
  const [generateDir, setGenerateDir] = useState<"vertical" | "horizontal">(
    "vertical"
  );

  const diagramsRef = useRef(diagrams);
  diagramsRef.current = diagrams;
  const diagram = diagrams.find((item) => item.id === activeId) ?? diagrams[0];
  diagramRef.current = diagram ?? null;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  function patchActive(next: Partial<ProcessDiagram>) {
    if (!diagram) return;
    onChange(
      diagrams.map((item) => (item.id === diagram.id ? { ...item, ...next } : item))
    );
  }

  function toWorld(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !diagram) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - diagram.panX) / diagram.zoom,
      y: (clientY - rect.top - diagram.panY) / diagram.zoom,
    };
  }

  function addNode(type: DiagramNodeType) {
    if (!diagram) return;
    const size = nodeSize(type);
    const rect = canvasRef.current?.getBoundingClientRect();
    const x = rect
      ? (rect.width / 2 - diagram.panX) / diagram.zoom - size.w / 2
      : 80;
    const y = rect
      ? (rect.height / 2 - diagram.panY) / diagram.zoom - size.h / 2
      : 80;
    const node: DiagramNode = {
      id: crypto.randomUUID(),
      type,
      label: DEFAULT_LABEL[type],
      x,
      y,
    };
    patchActive({ nodes: [...diagram.nodes, node] });
    setSelection({ kind: "node", id: node.id });
  }

  function connectNodes(
    sourceId: string,
    targetId: string,
    sourceSide?: DiagramSide,
    targetSide?: DiagramSide
  ) {
    if (!diagram || sourceId === targetId) return;
    const source = diagram.nodes.find((node) => node.id === sourceId);
    const target = diagram.nodes.find((node) => node.id === targetId);
    if (!source || !target) return;
    const inferred = inferSides(source, target);
    const outgoing = diagram.edges.filter((edge) => edge.source === sourceId);
    const exists = diagram.edges.some(
      (item) => item.source === sourceId && item.target === targetId
    );
    if (exists) {
      setConnectFrom(null);
      setCursorWorld(null);
      return;
    }
    const edge: DiagramEdge = {
      id: crypto.randomUUID(),
      source: sourceId,
      target: targetId,
      type: "step",
      sourceSide: sourceSide ?? inferred.sourceSide,
      targetSide: targetSide ?? inferred.targetSide,
      label:
        source.type === "decision"
          ? outgoing.length === 0
            ? "Sí"
            : outgoing.length === 1
              ? "No"
              : ""
          : undefined,
    };
    patchActive({ edges: [...diagram.edges, edge] });
    setConnectFrom(null);
    setCursorWorld(null);
    setSelection({ kind: "edge", id: edge.id });
  }

  function generate() {
    const labels = parseStageLines(generateText);
    if (labels.length === 0 || !diagram) return;
    const { nodes, edges } = layoutGeneratedStages(labels, generateDir);
    const rect = canvasRef.current?.getBoundingClientRect();
    const box = contentBounds(nodes);
    const width = Math.max(box.maxX - box.minX, 160);
    const height = Math.max(box.maxY - box.minY, 120);
    const zoom = rect
      ? Math.min(1.2, Math.max(0.45, Math.min((rect.width - 80) / width, (rect.height - 80) / height)))
      : 1;
    patchActive({
      nodes,
      edges,
      zoom,
      panX: rect ? (rect.width - width * zoom) / 2 - box.minX * zoom : 32,
      panY: rect ? (rect.height - height * zoom) / 2 - box.minY * zoom : 32,
    });
    setGenerateOpen(false);
    setGenerateText("");
    setSelection(nodes[0] ? { kind: "node", id: nodes[0].id } : null);
  }

  function fitView() {
    if (!diagram || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const box = contentBounds(diagram.nodes);
    const width = Math.max(box.maxX - box.minX, 160);
    const height = Math.max(box.maxY - box.minY, 120);
    const zoom = Math.min(1.4, Math.max(0.45, Math.min(
      (rect.width - 80) / width,
      (rect.height - 80) / height
    )));
    patchActive({
      zoom,
      panX: (rect.width - width * zoom) / 2 - box.minX * zoom,
      panY: (rect.height - height * zoom) / 2 - box.minY * zoom,
    });
  }

  function deleteSelection() {
    const current = diagramRef.current;
    if (!current || !selection) return;
    if (selection.kind === "node") {
      patchActive({
        nodes: current.nodes.filter((node) => node.id !== selection.id),
        edges: current.edges.filter(
          (edge) => edge.source !== selection.id && edge.target !== selection.id
        ),
      });
    } else {
      patchActive({
        edges: current.edges.filter((edge) => edge.id !== selection.id),
      });
    }
    setSelection(null);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const current = diagramRef.current;
      const el = canvasRef.current;
      if (!current || !el) return;
      const rect = el.getBoundingClientRect();
      const next = Math.min(
        2,
        Math.max(0.4, current.zoom + (event.deltaY > 0 ? -0.08 : 0.08))
      );
      const worldX = (event.clientX - rect.left - current.panX) / current.zoom;
      const worldY = (event.clientY - rect.top - current.panY) / current.zoom;
      onChange(
        diagramsRef.current.map((item) =>
          item.id === current.id
            ? {
                ...item,
                zoom: next,
                panX: event.clientX - rect.left - worldX * next,
                panY: event.clientY - rect.top - worldY * next,
              }
            : item
        )
      );
    }
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [onChange, diagram?.id]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const current = diagramRef.current;
      const currentSelection = selectionRef.current;
      if (!current) return;
      if (event.key === "Escape") {
        setConnectFrom(null);
        setCursorWorld(null);
        setSelection(null);
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        currentSelection
      ) {
        event.preventDefault();
        if (currentSelection.kind === "node") {
          onChange(
            diagramsRef.current.map((item) =>
              item.id === current.id
                ? {
                    ...item,
                    nodes: current.nodes.filter((node) => node.id !== currentSelection.id),
                    edges: current.edges.filter(
                      (edge) =>
                        edge.source !== currentSelection.id &&
                        edge.target !== currentSelection.id
                    ),
                  }
                : item
            )
          );
        } else {
          onChange(
            diagramsRef.current.map((item) =>
              item.id === current.id
                ? {
                    ...item,
                    edges: current.edges.filter((edge) => edge.id !== currentSelection.id),
                  }
                : item
            )
          );
        }
        setSelection(null);
      }
      if (
        currentSelection?.kind === "node" &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      ) {
        event.preventDefault();
        const step = event.shiftKey ? 1 : GRID / 2;
        const delta =
          {
            ArrowUp: { x: 0, y: -step },
            ArrowDown: { x: 0, y: step },
            ArrowLeft: { x: -step, y: 0 },
            ArrowRight: { x: step, y: 0 },
          }[event.key] ?? { x: 0, y: 0 };
        onChange(
          diagramsRef.current.map((item) =>
            item.id === current.id
              ? {
                  ...item,
                  nodes: current.nodes.map((node) =>
                    node.id === currentSelection.id
                      ? { ...node, x: node.x + delta.x, y: node.y + delta.y }
                      : node
                  ),
                }
              : item
          )
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChange]);

  if (!diagram) return null;

  const selectedNode =
    selection?.kind === "node"
      ? diagram.nodes.find((node) => node.id === selection.id)
      : null;
  const selectedEdge =
    selection?.kind === "edge"
      ? diagram.edges.find((edge) => edge.id === selection.id)
      : null;
  const selectedEdgeMid =
    selectedEdge
      ? (() => {
          const source = diagram.nodes.find((node) => node.id === selectedEdge.source);
          const target = diagram.nodes.find((node) => node.id === selectedEdge.target);
          if (!source || !target) return null;
          return edgeMidpoint(
            source,
            target,
            selectedEdge.sourceSide,
            selectedEdge.targetSide
          );
        })()
      : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {diagrams.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onActiveChange(item.id)}
            className={cn(
              "h-8 px-3 rounded-md text-xs border transition-colors",
              item.id === diagram.id
                ? "bg-forest text-white border-forest"
                : "bg-white text-ink-light border-border hover:border-ink-faint"
            )}
          >
            {item.name}
          </button>
        ))}
        <button
          type="button"
          onClick={onAddDiagram}
          className="h-8 px-3 rounded-md text-xs border border-dashed border-border text-ink-light hover:border-sage hover:text-forest"
        >
          + Proceso
        </button>
        {diagrams.length > 1 && (
          <button
            type="button"
            onClick={() => onDeleteDiagram(diagram.id)}
            className="h-8 w-8 rounded-md border border-border text-ink-faint flex items-center justify-center hover:text-danger hover:border-danger/30"
            aria-label="Eliminar proceso"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        <label className="ml-auto block text-xs text-ink-light min-w-[180px]">
          <span className="sr-only">Nombre del proceso</span>
          <input
            value={diagram.name}
            onChange={(event) => patchActive({ name: event.target.value })}
            placeholder="Nombre del proceso"
            className="hp-input h-8"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {PALETTE.map((item) => (
          <button
            key={item.type}
            type="button"
            title={item.hint}
            onClick={() => addNode(item.type)}
            className="h-9 px-2.5 rounded-md text-[11px] bg-white border border-border text-ink-light hover:border-forest hover:text-forest inline-flex items-center gap-2"
          >
            <ShapeMark type={item.type} />
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setGenerateOpen((open) => !open)}
          className="h-9 px-3 rounded-md text-[11px] bg-forest text-white inline-flex items-center gap-1.5"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Auto-generar
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              patchActive({ zoom: Math.max(0.4, Number((diagram.zoom - 0.1).toFixed(2))) })
            }
            className="h-8 w-8 rounded-md bg-white border border-border text-ink-light flex items-center justify-center"
            aria-label="Alejar"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-12 text-center text-[11px] tabular-nums text-ink-light">
            {Math.round(diagram.zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() =>
              patchActive({ zoom: Math.min(2, Number((diagram.zoom + 0.1).toFixed(2))) })
            }
            className="h-8 w-8 rounded-md bg-white border border-border text-ink-light flex items-center justify-center"
            aria-label="Acercar"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={fitView}
            className="h-8 w-8 rounded-md bg-white border border-border text-ink-light flex items-center justify-center"
            aria-label="Ajustar a vista"
            title="Ajustar a vista"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {generateOpen && (
        <div className="rounded-md border border-border bg-white p-4 space-y-3">
          <p className="text-sm font-medium text-ink">Generar diagrama desde etapas</p>
          <p className="text-xs text-ink-light">
            Una etapa por línea. Se agregan Inicio y Fin, y se reemplaza el proceso actual.
          </p>
          <textarea
            value={generateText}
            onChange={(event) => setGenerateText(event.target.value)}
            rows={6}
            placeholder={"Recepción materias primas\nAlmacenamiento\n¿Temperatura correcta?\nCocción\nEnfriado\nEmpaque\nDespacho"}
            className="hp-input"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setGenerateDir("vertical")}
              className={cn(
                "h-8 px-3 rounded-md text-xs border",
                generateDir === "vertical"
                  ? "bg-forest text-white border-forest"
                  : "bg-white text-ink-light border-border"
              )}
            >
              Vertical
            </button>
            <button
              type="button"
              onClick={() => setGenerateDir("horizontal")}
              className={cn(
                "h-8 px-3 rounded-md text-xs border",
                generateDir === "horizontal"
                  ? "bg-forest text-white border-forest"
                  : "bg-white text-ink-light border-border"
              )}
            >
              Horizontal
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={parseStageLines(generateText).length === 0}
              className="h-8 px-3 rounded-md text-xs bg-forest text-white disabled:opacity-40"
            >
              Generar
            </button>
          </div>
        </div>
      )}

      <div
        ref={canvasRef}
        className={cn(
          "relative h-[600px] overflow-hidden rounded-xl border border-border",
          panning ? "cursor-grabbing" : "cursor-grab"
        )}
        style={{
          backgroundColor: "#F7F4EE",
          backgroundImage: `radial-gradient(circle, #D8D2C8 1px, transparent 1px)`,
          backgroundSize: `${GRID * diagram.zoom}px ${GRID * diagram.zoom}px`,
          backgroundPosition: `${diagram.panX}px ${diagram.panY}px`,
        }}
        onPointerDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("[data-node],[data-handle],[data-edge],[data-edge-label]")) {
            return;
          }
          setPanning({
            x: event.clientX - diagram.panX,
            y: event.clientY - diagram.panY,
          });
          setSelection(null);
          if (!connectFrom) {
            setConnectFrom(null);
            setCursorWorld(null);
          }
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const world = toWorld(event.clientX, event.clientY);
          if (connectFrom) setCursorWorld(world);
          if (panning) {
            patchActive({
              panX: event.clientX - panning.x,
              panY: event.clientY - panning.y,
            });
          }
          if (dragging) {
            const rawX =
              dragging.startX + (event.clientX - dragging.startClientX) / diagram.zoom;
            const rawY =
              dragging.startY + (event.clientY - dragging.startClientY) / diagram.zoom;
            const moving = diagram.nodes.find((node) => node.id === dragging.id);
            if (!moving) return;
            const snapped = snapDrag(moving, rawX, rawY, diagram.nodes);
            setGuides(snapped.guides);
            patchActive({
              nodes: diagram.nodes.map((node) =>
                node.id === dragging.id
                  ? { ...node, x: snapped.x, y: snapped.y }
                  : node
              ),
            });
          }
        }}
        onPointerUp={(event) => {
          if (connectFrom) {
            const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
            const handle = target?.closest("[data-handle]") as HTMLElement | null;
            const nodeEl = target?.closest("[data-node]") as HTMLElement | null;
            const targetId = nodeEl?.dataset.nodeId;
            if (targetId && targetId !== connectFrom.nodeId) {
              const side = (handle?.dataset.side as DiagramSide | undefined) ?? undefined;
              const targetNode = diagram.nodes.find((node) => node.id === targetId);
              if (targetNode) {
                connectNodes(
                  connectFrom.nodeId,
                  targetId,
                  connectFrom.side,
                  side ?? inferSideFromPoint(targetNode, toWorld(event.clientX, event.clientY))
                );
              }
            } else if (!handle) {
              setConnectFrom(null);
              setCursorWorld(null);
            }
          }
          setPanning(null);
          setDragging(null);
          setGuides([]);
        }}
        onPointerLeave={() => {
          if (!connectFrom) setHoveredNodeId(null);
        }}
      >
        <svg className="absolute inset-0 w-full h-full">
          <defs>
            <marker
              id="haccp-arrow"
              viewBox="0 0 12 12"
              refX="10"
              refY="6"
              markerWidth="8"
              markerHeight="8"
              orient="auto"
            >
              <path d="M 1 1 L 11 6 L 1 11 Z" fill="#1B4332" />
            </marker>
            <marker
              id="haccp-arrow-active"
              viewBox="0 0 12 12"
              refX="10"
              refY="6"
              markerWidth="8"
              markerHeight="8"
              orient="auto"
            >
              <path d="M 1 1 L 11 6 L 1 11 Z" fill="#40916C" />
            </marker>
          </defs>
          <g transform={`translate(${diagram.panX} ${diagram.panY}) scale(${diagram.zoom})`}>
            {guides.map((guide) =>
              guide.axis === "x" ? (
                <line
                  key={`gx-${guide.position}`}
                  x1={guide.position}
                  y1={-4000}
                  x2={guide.position}
                  y2={4000}
                  stroke="#40916C"
                  strokeWidth="1"
                  strokeDasharray="4 3"
                />
              ) : (
                <line
                  key={`gy-${guide.position}`}
                  x1={-4000}
                  y1={guide.position}
                  x2={4000}
                  y2={guide.position}
                  stroke="#40916C"
                  strokeWidth="1"
                  strokeDasharray="4 3"
                />
              )
            )}

            {diagram.edges.map((edge) => {
              const source = diagram.nodes.find((node) => node.id === edge.source);
              const target = diagram.nodes.find((node) => node.id === edge.target);
              if (!source || !target) return null;
              const path = edgePath(source, target, edge.sourceSide, edge.targetSide);
              const mid = edgeMidpoint(source, target, edge.sourceSide, edge.targetSide);
              const active =
                selectedEdge?.id === edge.id || hoveredEdgeId === edge.id;
              return (
                <g key={edge.id}>
                  <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="16"
                    className="cursor-pointer"
                    data-edge="1"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setSelection({ kind: "edge", id: edge.id });
                      setConnectFrom(null);
                    }}
                    onPointerEnter={() => setHoveredEdgeId(edge.id)}
                    onPointerLeave={() => setHoveredEdgeId(null)}
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke={active ? "#40916C" : "#1B4332"}
                    strokeWidth={active ? 2.25 : 1.6}
                    markerEnd={active ? "url(#haccp-arrow-active)" : "url(#haccp-arrow)"}
                    className="pointer-events-none"
                  />
                  {edge.label ? (
                    <g transform={`translate(${mid.x} ${mid.y})`}>
                      <rect
                        x={-16}
                        y={-9}
                        width={32}
                        height={18}
                        rx={4}
                        fill="#F7F4EE"
                        stroke={active ? "#40916C" : "#E2DDD6"}
                      />
                      <text
                        textAnchor="middle"
                        y={4}
                        className="pointer-events-none"
                        fill="#161210"
                        fontSize="10"
                        fontWeight="600"
                      >
                        {edge.label}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}

            {connectFrom && cursorWorld && (() => {
              const source = diagram.nodes.find((node) => node.id === connectFrom.nodeId);
              if (!source) return null;
              return (
                <path
                  d={previewPath(source, connectFrom.side, cursorWorld)}
                  fill="none"
                  stroke="#40916C"
                  strokeWidth="1.6"
                  strokeDasharray="5 4"
                  markerEnd="url(#haccp-arrow-active)"
                  className="pointer-events-none"
                />
              );
            })()}
          </g>
        </svg>

        {diagram.nodes.map((node) => (
          <div
            key={node.id}
            onPointerEnter={() => setHoveredNodeId(node.id)}
            onPointerLeave={() => {
              if (!dragging) setHoveredNodeId((current) => (current === node.id ? null : current));
            }}
          >
            <DiagramNodeCard
              node={node}
              selected={selectedNode?.id === node.id}
              connecting={connectFrom?.nodeId === node.id}
              activeSide={
                connectFrom?.nodeId === node.id ? connectFrom.side : null
              }
              showHandles={
                hoveredNodeId === node.id ||
                selectedNode?.id === node.id ||
                Boolean(connectFrom)
              }
              zoom={diagram.zoom}
              panX={diagram.panX}
              panY={diagram.panY}
              onLabelChange={(label) =>
                patchActive({
                  nodes: diagram.nodes.map((item) =>
                    item.id === node.id ? { ...item, label } : item
                  ),
                })
              }
              onPointerDown={(event) => {
                if ((event.target as HTMLElement).closest("input,textarea,button,[data-handle]")) {
                  return;
                }
                event.stopPropagation();
                setSelection({ kind: "node", id: node.id });
                if (connectFrom && connectFrom.nodeId !== node.id) {
                  connectNodes(
                    connectFrom.nodeId,
                    node.id,
                    connectFrom.side,
                    inferSideFromPoint(node, toWorld(event.clientX, event.clientY))
                  );
                  return;
                }
                setDragging({
                  id: node.id,
                  startX: node.x,
                  startY: node.y,
                  startClientX: event.clientX,
                  startClientY: event.clientY,
                });
                canvasRef.current?.setPointerCapture(event.pointerId);
              }}
              onHandlePointerDown={(side, event) => {
                event.stopPropagation();
                event.preventDefault();
                if (connectFrom && connectFrom.nodeId !== node.id) {
                  connectNodes(connectFrom.nodeId, node.id, connectFrom.side, side);
                  return;
                }
                setSelection({ kind: "node", id: node.id });
                setConnectFrom({ nodeId: node.id, side });
                setCursorWorld(toWorld(event.clientX, event.clientY));
                canvasRef.current?.setPointerCapture(event.pointerId);
              }}
              onHandlePointerUp={(side, event) => {
                event.stopPropagation();
                if (connectFrom && connectFrom.nodeId !== node.id) {
                  connectNodes(connectFrom.nodeId, node.id, connectFrom.side, side);
                }
              }}
            />
          </div>
        ))}

        {selectedEdge && selectedEdgeMid && (
          <div
            data-edge-label="1"
            className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
            style={{
              left: selectedEdgeMid.x * diagram.zoom + diagram.panX,
              top: selectedEdgeMid.y * diagram.zoom + diagram.panY,
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <input
              value={selectedEdge.label ?? ""}
              onChange={(event) =>
                patchActive({
                  edges: diagram.edges.map((edge) =>
                    edge.id === selectedEdge.id
                      ? { ...edge, label: event.target.value }
                      : edge
                  ),
                })
              }
              placeholder="Etiqueta"
              className="h-7 w-[72px] rounded-md border border-sage bg-white text-center text-[11px] font-semibold text-ink outline-none"
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-ink-faint">
          {connectFrom
            ? "Suelta en otro bloque o en uno de sus puntos para crear la flecha."
            : "Arrastra el lienzo para moverte. Arrastra un punto para conectar. Las guías aparecen al alinear. Delete borra el seleccionado."}
        </p>
        {selection && (
          <button
            type="button"
            onClick={deleteSelection}
            className="h-7 px-2.5 rounded-md text-[11px] border border-border text-ink-light hover:text-danger hover:border-danger/30 inline-flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" />
            Eliminar {selection.kind === "node" ? "bloque" : "flecha"}
          </button>
        )}
      </div>
    </div>
  );
}

function ShapeMark({ type }: { type: DiagramNodeType }) {
  if (type === "start") {
    return <span className="h-3.5 w-3.5 rounded-full border-[1.5px] border-forest bg-white" />;
  }
  if (type === "end") {
    return <span className="h-3.5 w-3.5 rounded-full bg-forest" />;
  }
  if (type === "decision") {
    return (
      <span className="h-2.5 w-2.5 rotate-45 border-[1.5px] border-[#3B6FD4] bg-[#F4F7FF]" />
    );
  }
  if (type === "pcc") {
    return (
      <span className="relative h-3 w-4 rounded-[3px] border border-red-300 bg-white before:absolute before:left-0 before:top-0.5 before:bottom-0.5 before:w-0.5 before:bg-danger before:content-['']" />
    );
  }
  if (type === "allergen") {
    return (
      <span className="relative h-3 w-4 rounded-[3px] border border-amber-300 bg-white before:absolute before:left-0 before:top-0.5 before:bottom-0.5 before:w-0.5 before:bg-amber before:content-['']" />
    );
  }
  return (
    <span className="relative h-3 w-4 rounded-[3px] border border-border bg-white before:absolute before:left-0 before:top-0.5 before:bottom-0.5 before:w-0.5 before:bg-sage before:content-['']" />
  );
}
