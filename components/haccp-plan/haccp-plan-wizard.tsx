"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CreateVersionModal } from "@/components/haccp-plan/create-version-modal";
import { PlanStepper } from "@/components/haccp-plan/plan-stepper";
import { RiskMatrixModal } from "@/components/haccp-plan/risk-matrix-modal";
import { StepChecklist } from "@/components/haccp-plan/step-checklist";
import { StepHeader } from "@/components/haccp-plan/step-header";
import { Step1Team } from "@/components/haccp-plan/steps/step-1-team";
import { Step2Product } from "@/components/haccp-plan/steps/step-2-product";
import { Step3Use } from "@/components/haccp-plan/steps/step-3-use";
import { Step4Flow } from "@/components/haccp-plan/steps/step-4-flow";
import { Step5Validation } from "@/components/haccp-plan/steps/step-5-validation";
import { Step6Hazards } from "@/components/haccp-plan/steps/step-6-hazards";
import { Step7Ccp } from "@/components/haccp-plan/steps/step-7-ccp";
import { Step8Limits } from "@/components/haccp-plan/steps/step-8-limits";
import { Step9Monitoring } from "@/components/haccp-plan/steps/step-9-monitoring";
import { Step10Corrective } from "@/components/haccp-plan/steps/step-10-corrective";
import { Step11Verification } from "@/components/haccp-plan/steps/step-11-verification";
import { Step12Docs } from "@/components/haccp-plan/steps/step-12-docs";
import { ccpDecisionLabel, evaluateCcpTree } from "@/lib/haccp-plan/ccp-tree";
import {
  createDiagram,
  createHazard,
  createProduct,
  createTeamMember,
  deleteHazard,
  deleteProduct,
  deleteTeamMember,
  syncDiagrams,
  updateHazard,
  updatePlanFields,
  updateProduct,
  updateTeamMember,
  upsertCcpDecision,
  upsertValidation,
} from "@/lib/haccp-plan/data-service";
import { countCompletedSteps } from "@/lib/haccp-plan/checklists";
import { isSignificant } from "@/lib/haccp-plan/risk";
import { saveStepData } from "@/lib/haccp-plan/step-data-service";
import type { StepPayloadMap } from "@/lib/haccp-plan/step-data-service";
import { buildStepSnapshot, createPlanVersionDocument } from "@/lib/haccp-plan/snapshots";
import { useDebouncedCallback } from "@/lib/haccp-plan/use-debounced-callback";
import type {
  ChecklistProgress,
  EvidenceFile,
  Hazard,
  HazardRow,
  HaccpPlanDetails,
  PlanValidation,
  ProcessDiagram,
  Product,
  RiskMatrix,
  TeamMember,
} from "@/lib/haccp-plan/types";
import { createClient } from "@/lib/supabase/client";

interface HaccpPlanWizardProps {
  organizationId: string;
  userId: string;
  initial: HaccpPlanDetails;
  initialStepData: { [K in keyof StepPayloadMap]?: StepPayloadMap[K] | null };
}

export function HaccpPlanWizard({
  organizationId,
  userId,
  initial,
  initialStepData,
}: HaccpPlanWizardProps) {
  const [plan, setPlan] = useState(initial.plan);
  const [team, setTeam] = useState(initial.team);
  const [products, setProducts] = useState(initial.products);
  const [diagrams, setDiagrams] = useState(initial.diagrams);
  const [validation, setValidation] = useState(initial.validation);
  const [hazards, setHazards] = useState(initial.hazards);
  const [currentStep, setCurrentStep] = useState(initial.plan.currentStep);
  const [progress, setProgress] = useState<ChecklistProgress>(
    initial.plan.checklistProgress
  );
  const [activeProductId, setActiveProductId] = useState(
    initial.products[0]?.id ?? ""
  );
  const [activeDiagramId, setActiveDiagramId] = useState(
    initial.diagrams[0]?.id ?? ""
  );
  const [step7, setStep7] = useState<HazardRow[]>(initialStepData[7]?.hazards ?? []);
  const [ccpQuestions, setCcpQuestions] = useState(
    initialStepData[7]?.questions ?? {}
  );
  const [step8, setStep8] = useState(initialStepData[8]?.criticalLimits ?? []);
  const [step9, setStep9] = useState(initialStepData[9]?.monitoringPlans ?? []);
  const [step10, setStep10] = useState(initialStepData[10]?.correctiveActions ?? []);
  const [step11, setStep11] = useState(
    initialStepData[11]?.verificationPlan ?? {
      activities: [],
      generalObservations: "",
    }
  );
  const [selectedCcpId, setSelectedCcpId] = useState<string | null>(null);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [error, setError] = useState("");
  const diagramsRef = useRef(diagrams);
  diagramsRef.current = diagrams;
  const previousStep = useRef(currentStep);

  const details: HaccpPlanDetails = {
    plan: { ...plan, checklistProgress: progress, currentStep },
    team,
    products,
    diagrams,
    validation,
    hazards,
  };

  const significantRows = useMemo(() => {
    const threshold = plan.riskMatrix.significanceThreshold;
    const saved = new Map(step7.map((row) => [row.id, row]));
    return hazards
      .filter((hazard) =>
        isSignificant(hazard.severity, hazard.probability, threshold)
      )
      .map((hazard) => {
        const nodeLabel =
          diagrams
            .flatMap((diagram) => diagram.nodes)
            .find((node) => node.id === hazard.stepId)?.label ?? hazard.stepId;
        const existing = saved.get(hazard.id);
        const row: HazardRow = {
          id: hazard.id,
          processStep: nodeLabel,
          hazardType: hazard.type,
          description: hazard.description,
          likelihood: hazard.probability,
          severity: hazard.severity,
          riskRanking: hazard.severity * hazard.probability,
          justification: hazard.justification,
          significant: true,
          controlMeasures: hazard.preventiveMeasure,
          q1: existing?.q1 ?? null,
          q2: existing?.q2 ?? null,
          q3: existing?.q3 ?? null,
          q4: existing?.q4 ?? null,
          isCCP: existing?.isCCP,
        };
        return row;
      });
  }, [hazards, diagrams, plan.riskMatrix.significanceThreshold, step7]);

  const ccps = significantRows.filter((row) => row.isCCP === true);

  const persistStep = useDebouncedCallback((step: number) => {
    void updatePlanFields(plan.id, { current_step: step, checklist_progress: progress });
  }, 800);

  const persistChecklist = useDebouncedCallback((next: ChecklistProgress) => {
    void updatePlanFields(plan.id, { checklist_progress: next });
  }, 600);

  const persistTeamMember = useDebouncedCallback((member: TeamMember) => {
    const index = team.findIndex((item) => item.id === member.id);
    void updateTeamMember(member, plan.id, index);
  }, 1500);

  const persistProduct = useDebouncedCallback((product: Product) => {
    const index = products.findIndex((item) => item.id === product.id);
    void updateProduct(product, plan.id, index);
  }, 1500);

  const persistDiagrams = useDebouncedCallback((next: ProcessDiagram[]) => {
    void syncDiagrams(plan.id, next);
  }, 800);

  const persistValidation = useDebouncedCallback((next: PlanValidation) => {
    void upsertValidation(plan.id, next, userId);
  }, 2000);

  const persistHazard = useDebouncedCallback((hazard: Hazard) => {
    const label =
      diagramsRef.current
        .flatMap((diagram) => diagram.nodes)
        .find((node) => node.id === hazard.stepId)?.label ?? "";
    void updateHazard(hazard, plan.id, plan.riskMatrix.significanceThreshold, label);
  }, 800);

  const persistStep7 = useDebouncedCallback((rows: HazardRow[], questions = ccpQuestions) => {
    void saveStepData(organizationId, 7, { hazards: rows, questions });
    const ccpIds = rows.filter((row) => row.isCCP === true).map((row) => row.id);
    rows.forEach((row) => {
      void upsertCcpDecision({
        planId: plan.id,
        hazardId: row.id,
        q1: row.q1,
        q2: row.q2,
        q3: row.q3,
        q4: row.q4,
        result: ccpDecisionLabel(evaluateCcpTree(row.q1, row.q2, row.q3, row.q4)),
        pccNumber: row.isCCP ? ccpIds.indexOf(row.id) + 1 : null,
      });
    });
  }, 1000);

  const persistStep8 = useDebouncedCallback((limits: typeof step8) => {
    void saveStepData(organizationId, 8, { criticalLimits: limits });
  }, 1000);
  const persistStep9 = useDebouncedCallback((plans: typeof step9) => {
    void saveStepData(organizationId, 9, { monitoringPlans: plans });
  }, 1000);
  const persistStep10 = useDebouncedCallback((actions: typeof step10) => {
    void saveStepData(organizationId, 10, { correctiveActions: actions });
  }, 1000);
  const persistStep11 = useDebouncedCallback((payload: typeof step11) => {
    void saveStepData(organizationId, 11, { verificationPlan: payload });
  }, 1000);

  useEffect(() => {
    if (previousStep.current === 4 && currentStep !== 4) {
      void syncDiagrams(plan.id, diagramsRef.current);
    }
    previousStep.current = currentStep;
    persistStep(currentStep);

    if (plan.status === "draft" && currentStep > 1) {
      setPlan((prev) => ({ ...prev, status: "in_progress" }));
      void updatePlanFields(plan.id, { status: "in_progress" });
    }
    if (
      plan.status !== "approved" &&
      plan.status !== "completed" &&
      countCompletedSteps(progress) === 12
    ) {
      setPlan((prev) => ({ ...prev, status: "completed" }));
      void updatePlanFields(plan.id, { status: "completed" });
    }
  }, [currentStep, persistStep, plan.id, plan.status, progress]);

  useEffect(() => {
    return () => {
      void syncDiagrams(plan.id, diagramsRef.current);
    };
  }, [plan.id]);

  function goTo(step: number) {
    setCurrentStep(Math.min(12, Math.max(1, step)));
  }

  return (
    <div className="px-6 py-6 space-y-5">
      <PlanStepper currentStep={currentStep} progress={progress} onSelect={goTo} />
      <StepHeader stepId={currentStep} onCreateVersion={() => setVersionOpen(true)} />
      <StepChecklist
        stepId={currentStep}
        progress={progress}
        onToggle={(index, value) => {
          const next = {
            ...progress,
            [String(currentStep)]: {
              ...(progress[String(currentStep)] ?? {}),
              [String(index)]: value,
            },
          };
          setProgress(next);
          persistChecklist(next);
        }}
      />
      {error && <p className="text-xs text-danger">{error}</p>}

      {currentStep === 1 && (
        <Step1Team
          team={team}
          onAdd={async () => {
            const member = await createTeamMember(plan.id, team.length);
            setTeam((prev) => [...prev, member]);
          }}
          onChange={(member) => {
            setTeam((prev) => prev.map((item) => (item.id === member.id ? member : item)));
            persistTeamMember(member);
          }}
          onDelete={async (id) => {
            await deleteTeamMember(id);
            setTeam((prev) => prev.filter((item) => item.id !== id));
          }}
          onUploadTraining={async (member, file) => {
            const supabase = createClient();
            const path = `${organizationId}/${plan.id}/team/${member.id}/${crypto.randomUUID()}-${file.name}`;
            const { error: uploadError } = await supabase.storage
              .from("haccp-evidence")
              .upload(path, file);
            let evidence: EvidenceFile;
            if (uploadError) {
              setError(
                "No se pudo subir la evidencia. Ejecuta la migración 032 y crea el bucket haccp-evidence."
              );
              evidence = {
                id: crypto.randomUUID(),
                name: file.name,
                type: file.type,
                url: "",
                date: new Date().toISOString(),
              };
            } else {
              const { data } = supabase.storage.from("haccp-evidence").getPublicUrl(path);
              evidence = {
                id: crypto.randomUUID(),
                name: file.name,
                type: file.type,
                url: data.publicUrl,
                date: new Date().toISOString(),
              };
              setError("");
            }
            const next = { ...member, trainingEvidence: evidence };
            setTeam((prev) => prev.map((item) => (item.id === member.id ? next : item)));
            const index = team.findIndex((item) => item.id === member.id);
            try {
              await updateTeamMember(next, plan.id, index);
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Ejecuta supabase/migrations/032_haccp_team_training_evidence.sql"
              );
            }
          }}
        />
      )}

      {currentStep === 2 && (
        <Step2Product
          products={products}
          activeId={activeProductId}
          onActiveChange={setActiveProductId}
          onAdd={async () => {
            const product = await createProduct(plan.id);
            setProducts((prev) => [...prev, product]);
            setActiveProductId(product.id);
          }}
          onDelete={async (id) => {
            if (products.length <= 1) return;
            await deleteProduct(id);
            const next = products.filter((item) => item.id !== id);
            setProducts(next);
            setActiveProductId(next[0]?.id ?? "");
          }}
          onChange={(product) => {
            setProducts((prev) => prev.map((item) => (item.id === product.id ? product : item)));
            persistProduct(product);
          }}
        />
      )}

      {currentStep === 3 && (
        <Step3Use
          products={products}
          activeId={activeProductId}
          onActiveChange={setActiveProductId}
          onAdd={async () => {
            const product = await createProduct(plan.id);
            setProducts((prev) => [...prev, product]);
            setActiveProductId(product.id);
          }}
          onDelete={async (id) => {
            if (products.length <= 1) return;
            await deleteProduct(id);
            const next = products.filter((item) => item.id !== id);
            setProducts(next);
            setActiveProductId(next[0]?.id ?? "");
          }}
          onChange={(product) => {
            setProducts((prev) => prev.map((item) => (item.id === product.id ? product : item)));
            persistProduct(product);
          }}
        />
      )}

      {currentStep === 4 && (
        <Step4Flow
          diagrams={diagrams}
          activeId={activeDiagramId}
          onActiveChange={setActiveDiagramId}
          onChange={(next) => {
            setDiagrams(next);
            persistDiagrams(next);
          }}
          onAdd={async () => {
            const diagram = await createDiagram(plan.id, `Proceso ${diagrams.length + 1}`);
            setDiagrams((prev) => [...prev, diagram]);
            setActiveDiagramId(diagram.id);
          }}
          onDelete={(id) => {
            if (diagrams.length <= 1) return;
            const next = diagrams.filter((item) => item.id !== id);
            setDiagrams(next);
            setActiveDiagramId(next[0]?.id ?? "");
            void syncDiagrams(plan.id, next);
          }}
        />
      )}

      {currentStep === 5 && (
        <Step5Validation
          validation={validation}
          onChange={(next) => {
            setValidation(next);
            persistValidation(next);
          }}
          onUpload={async (file) => {
            const supabase = createClient();
            const path = `${organizationId}/${plan.id}/${crypto.randomUUID()}-${file.name}`;
            const { error: uploadError } = await supabase.storage
              .from("haccp-evidence")
              .upload(path, file);
            if (uploadError) {
              setError("No se pudo subir el archivo. Crea el bucket haccp-evidence en Storage.");
              const local: EvidenceFile = {
                id: crypto.randomUUID(),
                name: file.name,
                type: file.type,
                url: "",
                date: new Date().toISOString(),
              };
              return local;
            }
            const { data } = supabase.storage.from("haccp-evidence").getPublicUrl(path);
            return {
              id: crypto.randomUUID(),
              name: file.name,
              type: file.type,
              url: data.publicUrl,
              date: new Date().toISOString(),
            };
          }}
        />
      )}

      {currentStep === 6 && (
        <Step6Hazards
          hazards={hazards}
          diagrams={diagrams}
          matrix={plan.riskMatrix}
          onOpenMatrix={() => setMatrixOpen(true)}
          onAdd={async () => {
            const created = await createHazard(
              plan.id,
              { diagramId: activeDiagramId, type: "biological" },
              plan.riskMatrix.significanceThreshold
            );
            setHazards((prev) => [...prev, { ...created, diagramId: activeDiagramId }]);
          }}
          onChange={(hazard) => {
            setHazards((prev) => prev.map((item) => (item.id === hazard.id ? hazard : item)));
            persistHazard(hazard);
          }}
          onDelete={async (id) => {
            await deleteHazard(id);
            setHazards((prev) => prev.filter((item) => item.id !== id));
          }}
        />
      )}

      {currentStep === 7 && (
        <Step7Ccp
          hazards={significantRows}
          selectedId={selectedCcpId}
          onSelect={setSelectedCcpId}
          onChange={(row) => {
            const next = significantRows.map((item) =>
              item.id === row.id
                ? row
                : (step7.find((saved) => saved.id === item.id) ?? item)
            );
            setStep7(next);
            persistStep7(next, ccpQuestions);
          }}
          questions={ccpQuestions}
          onQuestionsChange={(next) => {
            setCcpQuestions(next);
            persistStep7(step7, next);
          }}
        />
      )}

      {currentStep === 8 && (
        <Step8Limits
          ccps={ccps}
          limits={step8}
          onChange={(limits) => {
            setStep8(limits);
            persistStep8(limits);
          }}
        />
      )}
      {currentStep === 9 && (
        <Step9Monitoring
          ccps={ccps}
          limits={step8}
          plans={step9}
          onChange={(plans) => {
            setStep9(plans);
            persistStep9(plans);
          }}
        />
      )}
      {currentStep === 10 && (
        <Step10Corrective
          ccps={ccps}
          limits={step8}
          actions={step10}
          onChange={(actions) => {
            setStep10(actions);
            persistStep10(actions);
          }}
        />
      )}
      {currentStep === 11 && (
        <Step11Verification
          activities={step11.activities}
          observations={step11.generalObservations}
          onChange={(activities) => {
            const next = { ...step11, activities };
            setStep11(next);
            persistStep11(next);
          }}
          onObservations={(generalObservations) => {
            const next = { ...step11, generalObservations };
            setStep11(next);
            persistStep11(next);
          }}
        />
      )}
      {currentStep === 12 && <Step12Docs progress={progress} />}

      <div className="flex justify-between pt-2">
        <button
          type="button"
          disabled={currentStep === 1}
          onClick={() => goTo(currentStep - 1)}
          className="h-9 px-4 rounded-md text-xs bg-white border border-border text-ink-light disabled:opacity-40"
        >
          Anterior
        </button>
        <button
          type="button"
          disabled={currentStep === 12}
          onClick={() => goTo(currentStep + 1)}
          className="h-9 px-4 rounded-md text-xs bg-forest text-white disabled:opacity-40"
        >
          Siguiente paso
        </button>
      </div>

      <RiskMatrixModal
        open={matrixOpen}
        matrix={plan.riskMatrix}
        onClose={() => setMatrixOpen(false)}
        onSave={(matrix: RiskMatrix) => {
          setPlan((prev) => ({ ...prev, riskMatrix: matrix }));
          void updatePlanFields(plan.id, { risk_matrix: matrix });
        }}
      />
      <CreateVersionModal
        open={versionOpen}
        stepId={currentStep}
        onClose={() => setVersionOpen(false)}
        onSubmit={async (input) => {
          await createPlanVersionDocument({
            organizationId,
            userId,
            stepId: currentStep,
            ...input,
            snapshot: buildStepSnapshot(
              currentStep,
              details,
              { 7: { hazards: step7, questions: ccpQuestions }, 8: { criticalLimits: step8 }, 9: { monitoringPlans: step9 }, 10: { correctiveActions: step10 }, 11: { verificationPlan: step11 } },
              activeDiagramId
            ),
          });
        }}
      />
    </div>
  );
}
