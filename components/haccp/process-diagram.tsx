"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StepModal, type StepFormData } from "@/components/haccp/step-modal";
import { getStepTypeConfig } from "@/lib/haccp/constants";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { HaccpProcessStep, HaccpProduct } from "@/types/database";
import { Settings } from "lucide-react";

interface ProcessDiagramProps {
  product: HaccpProduct;
  initialSteps: HaccpProcessStep[];
  organizationId: string;
}

function computeCompletion(stepCount: number, product: HaccpProduct): number {
  let score = 0;
  if (product.name && product.category) score += 15;
  if (product.intended_use) score += 10;
  if (product.target_consumer) score += 10;
  if (stepCount > 0) score += Math.min(stepCount * 10, 40);
  if (stepCount >= 3) score += 15;
  return Math.min(score, 100);
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

export function ProcessDiagram({
  product,
  initialSteps,
  organizationId,
}: ProcessDiagramProps) {
  const router = useRouter();
  const [steps, setSteps] = useState(
    [...initialSteps].sort((a, b) => a.position - b.position)
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<HaccpProcessStep | null>(null);
  const [saving, setSaving] = useState(false);

  const updatePlanCompletion = useCallback(
    async (stepCount: number) => {
      const completion = computeCompletion(stepCount, product);
      const supabase = createClient();
      await supabase
        .from("haccp_products")
        .update({ plan_completion: completion })
        .eq("id", product.id);
    },
    [product]
  );

  async function persistOrder(reordered: HaccpProcessStep[]) {
    const supabase = createClient();
    await Promise.all(
      reordered.map((step, index) =>
        supabase
          .from("haccp_process_steps")
          .update({ position: index + 1 })
          .eq("id", step.id)
      )
    );
    router.refresh();
  }

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setOverIndex(index);
  }

  function handleDrop(index: number) {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }

    const reordered = [...steps];
    const [removed] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, removed);
    const withPositions = reordered.map((s, i) => ({ ...s, position: i + 1 }));
    setSteps(withPositions);
    persistOrder(withPositions);
    setDragIndex(null);
    setOverIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setOverIndex(null);
  }

  async function handleSaveStep(data: StepFormData) {
    setSaving(true);
    const supabase = createClient();
    const payload = {
      name: data.name.trim(),
      step_type: data.step_type,
      description: data.description.trim() || null,
      temperature_min: parseOptionalNumber(data.temperature_min),
      temperature_max: parseOptionalNumber(data.temperature_max),
      duration_minutes: data.duration_minutes
        ? parseInt(data.duration_minutes, 10)
        : null,
      is_ccp: data.is_ccp,
      is_oprp: data.is_oprp,
    };

    if (editingStep) {
      const { error } = await supabase
        .from("haccp_process_steps")
        .update(payload)
        .eq("id", editingStep.id);

      if (!error) {
        setSteps((prev) =>
          prev.map((s) =>
            s.id === editingStep.id ? { ...s, ...payload } : s
          )
        );
      }
    } else {
      const { data: newStep, error } = await supabase
        .from("haccp_process_steps")
        .insert({
          ...payload,
          product_id: product.id,
          organization_id: organizationId,
          position: steps.length + 1,
        })
        .select("*")
        .single();

      if (!error && newStep) {
        setSteps((prev) => [...prev, newStep as HaccpProcessStep]);
        await updatePlanCompletion(steps.length + 1);
      }
    }

    setSaving(false);
    setModalOpen(false);
    setEditingStep(null);
    router.refresh();
  }

  async function handleDelete(step: HaccpProcessStep) {
    if (
      !window.confirm(`¿Eliminar el paso "${step.name}"? Esta acción no se puede deshacer.`)
    ) {
      return;
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("haccp_process_steps")
      .delete()
      .eq("id", step.id);

    if (!error) {
      const remaining = steps
        .filter((s) => s.id !== step.id)
        .map((s, i) => ({ ...s, position: i + 1 }));
      setSteps(remaining);
      await persistOrder(remaining);
      await updatePlanCompletion(remaining.length);
    }
    router.refresh();
  }

  function openAdd() {
    setEditingStep(null);
    setModalOpen(true);
  }

  function openEdit(step: HaccpProcessStep) {
    setEditingStep(step);
    setModalOpen(true);
  }

  if (steps.length === 0) {
    return (
      <div className="bg-white rounded-md border border-border">
        <EmptyState
          icon={Settings}
          title="Define tu diagrama de flujo"
          description="Agrega los pasos del proceso de producción en orden. Podrás reordenarlos arrastrando."
          actionLabel="Agregar paso"
          onAction={openAdd}
        />
        <StepModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSave={handleSaveStep}
          saving={saving}
        />
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {steps.map((step, index) => {
        const typeConfig = getStepTypeConfig(step.step_type);
        const Icon = typeConfig.icon;
        const isDragging = dragIndex === index;
        const isOver = overIndex === index && dragIndex !== index;

        return (
          <div key={step.id}>
            <div
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              className={cn(
                "flex items-center gap-2 h-12 px-3 bg-white border border-border rounded-md transition-all duration-150",
                isDragging && "opacity-50 scale-[0.98]",
                isOver && "border-sage bg-sage-light/30",
                !isDragging && "hover:border-ink-faint"
              )}
              style={{
                transform: isDragging ? "scale(0.98)" : undefined,
              }}
            >
              <GripVertical className="h-4 w-4 text-ink-faint shrink-0 cursor-grab active:cursor-grabbing" />

              <span className="text-xs font-mono text-ink-faint w-5 shrink-0">
                {step.position}
              </span>

              <Icon className="h-4 w-4 text-ink-light shrink-0" />

              <span className="flex-1 text-sm font-medium text-ink truncate">
                {step.name}
              </span>

              {step.is_ccp && <Badge variant="success">CCP</Badge>}
              {step.is_oprp && <Badge variant="warning">OPRP</Badge>}

              <button
                type="button"
                onClick={() => openEdit(step)}
                className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-background transition-colors duration-150"
                aria-label="Editar paso"
              >
                <Pencil className="h-3.5 w-3.5 text-ink-faint" />
              </button>

              <button
                type="button"
                onClick={() => handleDelete(step)}
                className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-red-50 transition-colors duration-150"
                aria-label="Eliminar paso"
              >
                <Trash2 className="h-3.5 w-3.5 text-danger" />
              </button>
            </div>

            {index < steps.length - 1 && (
              <div className="border-l-2 border-dashed border-border h-4 ml-6" />
            )}
          </div>
        );
      })}

      <Button
        type="button"
        variant="secondary"
        className="mt-4 w-full"
        onClick={openAdd}
      >
        <Plus className="h-4 w-4" />
        Agregar paso
      </Button>

      <StepModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingStep(null);
        }}
        onSave={handleSaveStep}
        step={editingStep}
        saving={saving}
      />
    </div>
  );
}
