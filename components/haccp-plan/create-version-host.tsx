"use client";

import dynamic from "next/dynamic";
import type { LoadedStepData } from "@/lib/haccp-plan/step-data-service";
import type { HaccpPlanDetails } from "@/lib/haccp-plan/types";

const CreateVersionModal = dynamic(
  () =>
    import("@/components/haccp-plan/create-version-modal").then(
      (m) => m.CreateVersionModal
    ),
  { ssr: false }
);

export function CreateVersionHost({
  stepId,
  organizationId,
  userId,
  details,
  stepData,
  activeDiagramId,
  onClose,
}: {
  stepId: number;
  organizationId: string;
  userId: string;
  details: HaccpPlanDetails;
  stepData: LoadedStepData;
  activeDiagramId: string;
  onClose: () => void;
}) {
  return (
    <CreateVersionModal
      open
      stepId={stepId}
      onClose={onClose}
      onSubmit={async (input) => {
        const { buildStepSnapshot, createPlanVersionDocument } = await import(
          "@/lib/haccp-plan/snapshots"
        );
        await createPlanVersionDocument({
          organizationId,
          userId,
          stepId,
          ...input,
          snapshot: buildStepSnapshot(
            stepId,
            details,
            {
              7: stepData[7] ?? undefined,
              8: stepData[8] ?? undefined,
              9: stepData[9] ?? undefined,
              10: stepData[10] ?? undefined,
              11: stepData[11] ?? undefined,
            },
            activeDiagramId
          ),
        });
      }}
    />
  );
}
