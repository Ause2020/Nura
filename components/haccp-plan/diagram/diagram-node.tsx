"use client";

import { SIDES, nodeSize } from "@/components/haccp-plan/diagram/geometry";
import { cn } from "@/lib/utils";
import type { DiagramNode, DiagramSide } from "@/lib/haccp-plan/types";

const SIDE_STYLE: Record<DiagramSide, string> = {
  top: "left-1/2 -top-1.5 -translate-x-1/2",
  bottom: "left-1/2 -bottom-1.5 -translate-x-1/2",
  left: "-left-1.5 top-1/2 -translate-y-1/2",
  right: "-right-1.5 top-1/2 -translate-y-1/2",
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
  activeSide: DiagramSide | null;
  showHandles: boolean;
  zoom: number;
  panX: number;
  panY: number;
  onLabelChange: (label: string) => void;
  onPointerDown: (event: React.PointerEvent) => void;
  onHandlePointerDown: (side: DiagramSide, event: React.PointerEvent) => void;
  onHandlePointerUp: (side: DiagramSide, event: React.PointerEvent) => void;
}

export function DiagramNodeCard({
  node,
  selected,
  connecting,
  activeSide,
  showHandles,
  zoom,
  panX,
  panY,
  onLabelChange,
  onPointerDown,
  onHandlePointerDown,
  onHandlePointerUp,
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
        selected || connecting ? "z-20" : "z-10"
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
            stroke={selected ? "#1B4332" : connecting ? "#40916C" : "#3B6FD4"}
            strokeWidth={selected || connecting ? 2.4 : 1.75}
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
          node.type === "step" && "bg-white border border-border shadow-[0_1px_2px_rgba(22,18,16,0.04)]",
          node.type === "pcc" && "bg-white border border-red-200 shadow-[0_1px_2px_rgba(22,18,16,0.04)]",
          node.type === "allergen" && "bg-white border border-amber-200 shadow-[0_1px_2px_rgba(22,18,16,0.04)]",
          selected && !isDecision && "shadow-[0_0_0_2px_#1B4332]",
          connecting && !selected && !isDecision && "shadow-[0_0_0_2px_#40916C]",
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
              isTerminus ? "text-[11px] tracking-[0.12em] uppercase" : "text-[11px]",
              node.type === "end" ? "text-white placeholder:text-white/50" : "text-ink placeholder:text-ink-faint"
            )}
          />
        )}
      </div>

      {SIDES.map((side) => (
        <button
          key={side}
          type="button"
          data-handle="1"
          data-side={side}
          title={`Conectar por ${side}`}
          className={cn(
            "absolute h-3 w-3 rounded-full border-[1.5px] bg-white z-20 transition-all duration-150",
            SIDE_STYLE[side],
            showHandles || connecting || selected
              ? "opacity-100 scale-100"
              : "opacity-0 scale-75",
            activeSide === side
              ? "border-sage bg-sage scale-125"
              : "border-forest hover:bg-sage-light hover:border-sage"
          )}
          onPointerDown={(event) => onHandlePointerDown(side, event)}
          onPointerUp={(event) => onHandlePointerUp(side, event)}
        />
      ))}
    </div>
  );
}
