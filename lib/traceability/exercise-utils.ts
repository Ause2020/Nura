import {
  EXERCISE_AMBER_THRESHOLD,
  EXERCISE_MAX_SECONDS,
  EXERCISE_RED_THRESHOLD,
  EXERCISE_TIMER_AMBER,
  EXERCISE_TIMER_GREEN,
  EXERCISE_TIMER_RED,
  type StageStatus,
} from "@/lib/traceability/exercise-constants";
import type { ExerciseVerdict, TraceExerciseState } from "@/lib/traceability/exercise-types";

export function formatCountdown(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatElapsed(seconds: number): string {
  return formatCountdown(seconds);
}

export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatShortTime(date: Date): string {
  return date.toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function generateExerciseId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `TRACE-${y}${m}${d}-${rand}`;
}

export function getTimerColor(remainingSeconds: number): string {
  if (remainingSeconds <= EXERCISE_RED_THRESHOLD) return EXERCISE_TIMER_RED;
  if (remainingSeconds <= EXERCISE_AMBER_THRESHOLD) return EXERCISE_TIMER_AMBER;
  return EXERCISE_TIMER_GREEN;
}

export function getTimerProgress(remainingSeconds: number): number {
  return Math.min(
    100,
    ((EXERCISE_MAX_SECONDS - remainingSeconds) / EXERCISE_MAX_SECONDS) * 100
  );
}

export function deriveStageStatus(
  stage: { files: unknown[]; status: StageStatus },
  locked: boolean
): StageStatus {
  if (stage.status === "complete") return "complete";
  if (stage.files.length > 0) return "in_progress";
  return locked ? "pending" : "pending";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isAcceptedFile(file: File): boolean {
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  const accepted = [".pdf", ".xlsx", ".xls", ".docx", ".csv", ".jpg", ".jpeg", ".png"];
  return accepted.includes(ext) || file.type.startsWith("image/");
}

export interface MassBalanceResult {
  balancePct: number | null;
  variationPct: number | null;
  tone: "success" | "warning" | "danger" | "neutral";
}

export function computeMassBalance(
  rawInput: string,
  finishedOutput: string,
  declaredLoss: string
): MassBalanceResult {
  const raw = parseFloat(rawInput);
  const finished = parseFloat(finishedOutput);
  const loss = parseFloat(declaredLoss) || 0;

  if (!raw || raw <= 0 || isNaN(finished)) {
    return { balancePct: null, variationPct: null, tone: "neutral" };
  }

  const balancePct = ((finished + loss) / raw) * 100;
  const variationPct = Math.abs(100 - balancePct);

  let tone: MassBalanceResult["tone"] = "success";
  if (variationPct > 10) tone = "danger";
  else if (variationPct > 5) tone = "warning";

  return {
    balancePct: Math.round(balancePct * 10) / 10,
    variationPct: Math.round(variationPct * 10) / 10,
    tone,
  };
}

export function computeVerdict(
  state: TraceExerciseState,
  stageIds: string[]
): ExerciseVerdict {
  const allComplete = stageIds.every(
    (id) => state.stages[id]?.status === "complete"
  );

  if (allComplete) return "approved";
  if (state.finishReason === "timeout") return "rejected";
  return "partial";
}

export function getVerdictLabel(verdict: ExerciseVerdict): string {
  if (verdict === "approved") return "APROBADO";
  if (verdict === "partial") return "PARCIAL";
  return "NO APROBADO";
}

export function getTotalFiles(state: TraceExerciseState): number {
  return Object.values(state.stages).reduce((sum, s) => sum + s.files.length, 0);
}
