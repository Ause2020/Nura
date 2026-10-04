"use client";

import { SIDES, nodeSize } from "@/components/haccp-plan/diagram/geometry";
import { cn } from "@/lib/utils";
import type { DiagramNode, DiagramSide } from "@/lib/haccp-plan/types";

const SIDE_STYLE: Record<DiagramSide, string> = {
  top: "left-1/2 -top-2.5 -translate-x-1/2",
  bottom: "left-1/2 -bottom-2.5 -translate-x-1/2",
  left: "-left-2.5 top-1/2 -translate-y-1/2",
  right: "-right-2.5 top-1/2 -translate-y-1/2",
};

const SIDE_HINT: Record<DiagramSide, string> = {
  top: "Arriba",
  bottom: "Abajo",
  left: "Izquierda",
  right: "Derecha",
};

const TYPE_LABEL: Record<DiagramNode["type"], string> = {
  start: "Inicio",
  end: "Fin",
  step: "Etapa",
  pcc: "PCC",
  allergen: "Alérgeno",
  decision: "Decisión",
};

interface DiagramNodeCardProps {
  node: DiagramNode;
  selected: boolean;
  connecting: boolean;
  dropTarget: boolean;
  activeSide: DiagramSide | null;
  hoverSide: DiagramSide | null;
  showHandles: boolean;
  zoom: number;
  panX: number;
  panY: number;
  onLabelChange: (label: string) => void;
  onPointerDown: (event: React.PointerEvent) => void;
  onHandlePointerDown: (side: DiagramSide, event: React.PointerEvent) => void;
  onHandlePointerUp: (side: DiagramSide, event: React.PointerEvent) => void;
  onHandlePointerEnter: (side: DiagramSide) => void;
  onHandlePointerLeave: (side: DiagramSide) => void;
}

export function DiagramNodeCard({
  node,
  selected,
  connecting,
  dropTarget,
  activeSide,
  hoverSide,
  showHandles,
  zoom,
  panX,
  panY,
  onLabelChange,
  onPointerDown,
  onHandlePointerDown,
  onHandlePointerUp,
  onHandlePointerEnter,
  onHandlePointerLeave,
}: DiagramNodeCardProps) {
  const { w, h } = nodeSize(node.type);
  const isTerminus = node.type === "start" || node.type === "end";
  const isDecision = node.type === "decision";

  return (
    <div
      data-node="1"
      data-node-id={node.id}
      className={cn(
        "absolute select-none",
        selected || connecting || dropTarget ? "z-20" : "z-10"
      )}
      style={{
        width: w,
        height: h,
        left: node.x * zoom + panX,
        top: node.y * zoom + panY,
        transform: `scale(${zoom})`,
        transformOrigin: "top left",
      }}
      onPointerDown={onPointerDown}
    >
      {isDecision && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 152 152"
        >
          <polygon
            points="76,5 147,76 76,147 5,76"
            fill="#F4F7FF"
            stroke={
              selected
                ? "#1B4332"
                : dropTarget
                  ? "#40916C"
                  : connecting
                    ? "#40916C"
                    : "#3B6FD4"
            }
            strokeWidth={selected || connecting || dropTarget ? 2.6 : 1.75}
          />
        </svg>
      )}
      <div
        className={cn(
          "absolute inset-0 transition-shadow duration-150",
          isTerminus && "rounded-full",
          !isTerminus && !isDecision && "rounded-lg",
          isDecision && "bg-transparent",
          node.type === "start" && "bg-white border-[1.5px] border-forest",
          node.type === "end" && "bg-forest border-[1.5px] border-forest",
          node.type === "step" &&
            "bg-white border border-border shadow-[0_1px_2px_rgba(22,18,16,0.04)]",
          node.type === "pcc" &&
            "bg-white border border-red-200 shadow-[0_1px_2px_rgba(22,18,16,0.04)]",
          node.type === "allergen" &&
            "bg-white border border-amber-200 shadow-[0_1px_2px_rgba(22,18,16,0.04)]",
          selected && !isDecision && "shadow-[0_0_0_2px_#1B4332]",
          (connecting || dropTarget) &&
            !selected &&
            !isDecision &&
            "shadow-[0_0_0_2px_#40916C]"
        )}
      >
        {node.type === "step" && (
          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-sage" />
        )}
        {node.type === "pcc" && (
          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-danger" />
        )}
        {node.type === "allergen" && (
          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-amber" />
        )}
      </div>

      <div
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center px-3 pointer-events-none",
          isTerminus && "px-2",
          isDecision && "px-8"
        )}
      >
        {!isTerminus && !isDecision && (
          <span
            className={cn(
              "text-[8px] font-semibold uppercase tracking-[0.14em] mb-0.5",
              node.type === "pcc" && "text-danger",
              node.type === "allergen" && "text-amber",
              node.type === "step" && "text-ink-faint"
            )}
          >
            {TYPE_LABEL[node.type]}
          </span>
        )}
        {isDecision ? (
          <textarea
            value={node.label}
            rows={2}
            onChange={(event) => onLabelChange(event.target.value)}
            className="w-full resize-none bg-transparent text-center text-[10px] font-medium leading-snug text-ink outline-none pointer-events-auto"
          />
        ) : (
          <input
            value={node.label}
            onChange={(event) => onLabelChange(event.target.value)}
            className={cn(
              "w-full bg-transparent text-center font-medium outline-none pointer-events-auto leading-tight",
              isTerminus
                ? "text-[11px] tracking-[0.12em] uppercase"
                : "text-[11px]",
              node.type === "end"
                ? "text-white placeholder:text-white/50"
                : "text-ink placeholder:text-ink-faint"
            )}
          />
        )}
      </div>

      {SIDES.map((side) => {
        const active = activeSide === side;
        const hovered = hoverSide === side;
        return (
          <button
            key={side}
            type="button"
            data-handle="1"
            data-side={side}
            title={`Conectar por ${SIDE_HINT[side]}`}
            aria-label={`Puerto ${SIDE_HINT[side]}`}
            className={cn(
              "absolute z-30 flex items-center justify-center rounded-full transition-all duration-150",
              SIDE_STYLE[side],
              "h-5 w-5",
              showHandles || connecting || selected || dropTarget
                ? "opacity-100 scale-100"
                : "opacity-0 scale-75 pointer-events-none"
            )}
            onPointerDown={(event) => onHandlePointerDown(side, event)}
            onPointerUp={(event) => onHandlePointerUp(side, event)}
            onPointerEnter={() => onHandlePointerEnter(side)}
            onPointerLeave={() => onHandlePointerLeave(side)}
          >
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full border-2 bg-white shadow-sm",
                active
                  ? "border-sage bg-sage scale-125"
                  : hovered
                    ? "border-sage bg-sage-light scale-110"
                    : dropTarget
                      ? "border-sage"
                      : "border-forest"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
