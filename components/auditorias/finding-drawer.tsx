"use client";

import { useState } from "react";
import { Camera, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ComplianceRing } from "@/components/auditorias/compliance-ring";
import {
  FINDING_TYPE_LABELS,
} from "@/lib/audit/constants";
import {
  calculateComplianceScore,
  countResults,
} from "@/lib/audit/utils";
import { cn } from "@/lib/utils";
import type {
  Audit,
  AuditChecklistItem,
  AuditChecklistResult,
  FindingType,
} from "@/types/database";

interface ItemState {
  result: AuditChecklistResult;
  finding?: string;
  finding_type?: FindingType;
  photo_url?: string | null;
}

interface FindingDrawerProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    finding_type: FindingType;
    finding: string;
    photo_url: string | null;
  }) => void;
  initial?: ItemState;
  organizationId: string;
  auditId: string;
  itemId: string;
}

export function FindingDrawer({
  open,
  onClose,
  onSave,
  initial,
  organizationId,
  auditId,
  itemId,
}: FindingDrawerProps) {
  const [findingType, setFindingType] = useState<FindingType>(
    initial?.finding_type ?? "minor_nc"
  );
  const [finding, setFinding] = useState(initial?.finding ?? "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(
    initial?.photo_url ?? null
  );

  if (!open) return null;

  async function handlePhoto(file: File) {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { uploadPrivateObject } = await import("@/lib/storage/private");
    const uploaded = await uploadPrivateObject(supabase, {
      bucket: "audit-photos",
      organizationId,
      entityId: `${auditId}/${itemId}`,
      file,
      upsert: true,
    });
    if (!("error" in uploaded)) {
      setPhotoUrl(uploaded.path);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-ink/40 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 md:left-56 z-50 bg-white rounded-t-lg border-t border-border shadow-sm max-h-[80vh] overflow-y-auto">
        <div className="px-4 py-4 space-y-4">
          <h3 className="text-sm font-semibold text-ink">Registrar hallazgo</h3>

          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
              Tipo de hallazgo
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(FINDING_TYPE_LABELS) as FindingType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFindingType(type)}
                  className={cn(
                    "p-2 text-xs rounded-md border text-left transition-colors duration-150",
                    findingType === type
                      ? "border-forest bg-sage-light text-forest"
                      : "border-border hover:bg-background"
                  )}
                >
                  {FINDING_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          <Textarea
            label="Descripción del hallazgo"
            value={finding}
            onChange={(e) => setFinding(e.target.value)}
            placeholder="Describe la desviación encontrada..."
          />

          <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-ink-light">
            <Camera className="h-4 w-4" />
            Adjuntar evidencia fotográfica
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePhoto(file);
              }}
            />
          </label>
          {photoUrl && <p className="text-xs text-sage">Evidencia adjunta ✓</p>}

          <div className="flex gap-2 pb-4">
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                onSave({ finding_type: findingType, finding, photo_url: photoUrl });
                onClose();
              }}
              disabled={!finding.trim()}
            >
              Guardar hallazgo
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
