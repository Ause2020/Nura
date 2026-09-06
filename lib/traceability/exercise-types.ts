import type {
  ExerciseReason,
  MassBalanceUnit,
  StageStatus,
} from "@/lib/traceability/exercise-constants";

export type ExerciseStatus = "idle" | "running" | "paused" | "finished";

export type ExerciseVerdict = "approved" | "partial" | "rejected";

export interface ExerciseFileMeta {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAtElapsed: number;
}

export interface ExerciseStageState {
  supplierLot: string;
  documentsChecked: Record<string, boolean>;
  files: ExerciseFileMeta[];
  observations: string;
  status: StageStatus;
  firstUploadAt: string | null;
  completedAt: string | null;
}

export interface MassBalanceState {
  unit: MassBalanceUnit;
  rawInput: string;
  finishedOutput: string;
  declaredLoss: string;
}

export interface PauseEntry {
  pausedAt: string;
  resumedAt: string | null;
}

export interface ExerciseLotData {
  product: string;
  batchNumber: string;
  productionDate: string;
  responsible: string;
  reason: ExerciseReason | "";
}

export interface TraceExerciseState {
  exerciseId: string | null;
  status: ExerciseStatus;
  lotData: ExerciseLotData;
  stages: Record<string, ExerciseStageState>;
  massBalance: MassBalanceState;
  startedAt: string | null;
  startedAtDisplay: string | null;
  elapsedSeconds: number;
  remainingSeconds: number;
  pauseLog: PauseEntry[];
  activeStageId: string;
  finishedAt: string | null;
  finishReason: "manual" | "timeout" | null;
  verdict: ExerciseVerdict | null;
  summaryOpen: boolean;
}

export function createInitialStageState(): ExerciseStageState {
  return {
    supplierLot: "",
    documentsChecked: {},
    files: [],
    observations: "",
    status: "pending",
    firstUploadAt: null,
    completedAt: null,
  };
}

export function createInitialExerciseState(): TraceExerciseState {
  return {
    exerciseId: null,
    status: "idle",
    lotData: {
      product: "",
      batchNumber: "",
      productionDate: "",
      responsible: "",
      reason: "",
    },
    stages: {},
    massBalance: {
      unit: "kg",
      rawInput: "",
      finishedOutput: "",
      declaredLoss: "",
    },
    startedAt: null,
    startedAtDisplay: null,
    elapsedSeconds: 0,
    remainingSeconds: 4 * 60 * 60,
    pauseLog: [],
    activeStageId: "raw_materials",
    finishedAt: null,
    finishReason: null,
    verdict: null,
    summaryOpen: true,
  };
}
