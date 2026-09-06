"use client";

import { FlowDiagramEditor } from "@/components/haccp-plan/diagram/flow-diagram-editor";
import type { ProcessDiagram } from "@/lib/haccp-plan/types";

export function Step4Flow({
  diagrams,
  activeId,
  onActiveChange,
  onChange,
  onAdd,
  onDelete,
}: {
  diagrams: ProcessDiagram[];
  activeId: string;
  onActiveChange: (id: string) => void;
  onChange: (diagrams: ProcessDiagram[]) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <FlowDiagramEditor
      diagrams={diagrams}
      activeId={activeId}
      onActiveChange={onActiveChange}
      onChange={onChange}
      onAddDiagram={onAdd}
      onDeleteDiagram={onDelete}
    />
  );
}
