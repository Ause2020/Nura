"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Pause,
  Play,
  RotateCcw,
  Square,
  Upload,
  X,
} from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { TraceabilityNavTabs } from "@/components/traceability/traceability-nav-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  ACCEPTED_FILE_EXTENSIONS,
  EXERCISE_MAX_SECONDS,
  EXERCISE_REASON_OPTIONS,
  EXERCISE_STAGES,
  EXERCISE_STORAGE_KEY,
  MASS_BALANCE_UNITS,
  STAGE_STATUS_LABELS,
  type StageStatus,
} from "@/lib/traceability/exercise-constants";
import {
  createInitialExerciseState,
  createInitialStageState,
  type ExerciseFileMeta,
  type TraceExerciseState,
} from "@/lib/traceability/exercise-types";
import {
  computeMassBalance,
  computeVerdict,
  formatClockTime,
  formatCountdown,
  formatElapsed,
  formatFileSize,
  formatShortTime,
  generateExerciseId,
  getTimerColor,
  getTimerProgress,
  getTotalFiles,
  getVerdictLabel,
  isAcceptedFile,
} from "@/lib/traceability/exercise-utils";
import { cn } from "@/lib/utils";

interface TraceabilityExerciseProps {
  organizationName: string;
}

function getFileIcon(name: string) {
  const lower = name.toLowerCase();
  if (/\.(jpg|jpeg|png)$/.test(lower)) return FileImage;
  if (/\.(xlsx|xls|csv)$/.test(lower)) return FileSpreadsheet;
  if (/\.(pdf|docx)$/.test(lower)) return FileText;
  return File;
}

function getStageBadgeVariant(status: StageStatus): "neutral" | "warning" | "success" {
  if (status === "complete") return "success";
  if (status === "in_progress") return "warning";
  return "neutral";
}

export function TraceabilityExercise({ organizationName }: TraceabilityExerciseProps) {
  const [state, setState] = useState<TraceExerciseState>(createInitialExerciseState);
  const [wallClock, setWallClock] = useState(new Date());
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [massBalanceOpen, setMassBalanceOpen] = useState(true);
  const fileStoreRef = useRef<Map<string, File>>(new Map());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActive = state.status === "running" || state.status === "paused";
  const isLocked = state.status !== "idle";
  const panelsLocked = !isActive && state.status !== "paused";

  const timerColor = getTimerColor(state.remainingSeconds);
  const timerPulse = state.remainingSeconds <= 30 * 60 && state.status === "running";

  const massBalanceResult = useMemo(
    () =>
      computeMassBalance(
        state.massBalance.rawInput,
        state.massBalance.finishedOutput,
        state.massBalance.declaredLoss
      ),
    [state.massBalance]
  );

  const activeStage = EXERCISE_STAGES.find((s) => s.id === state.activeStageId);
  const activeStageState = state.stages[state.activeStageId] ?? createInitialStageState();

  // Hydrate from sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(EXERCISE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as TraceExerciseState;
        setState(parsed);
      }
    } catch {
      sessionStorage.removeItem(EXERCISE_STORAGE_KEY);
    }
  }, []);

  // Persist to sessionStorage (metadata only)
  useEffect(() => {
    if (state.status === "idle" && !state.exerciseId) {
      sessionStorage.removeItem(EXERCISE_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(EXERCISE_STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Wall clock
  useEffect(() => {
    const id = setInterval(() => setWallClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Timer tick
  useEffect(() => {
    if (state.status !== "running") {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }

    tickRef.current = setInterval(() => {
      setState((prev) => {
        const elapsed = prev.elapsedSeconds + 1;
        const remaining = Math.max(EXERCISE_MAX_SECONDS - elapsed, 0);

        if (remaining <= 0) {
          const verdict = computeVerdict(
            { ...prev, elapsedSeconds: elapsed, remainingSeconds: 0, finishReason: "timeout" },
            EXERCISE_STAGES.map((s) => s.id)
          );
          setResultsOpen(true);
          return {
            ...prev,
            status: "finished",
            elapsedSeconds: elapsed,
            remainingSeconds: 0,
            finishedAt: new Date().toISOString(),
            finishReason: "timeout",
            verdict,
          };
        }

        return { ...prev, elapsedSeconds: elapsed, remainingSeconds: remaining };
      });
    }, 1000);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [state.status]);

  // beforeunload warning
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isActive) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isActive]);

  function initStages(): Record<string, ReturnType<typeof createInitialStageState>> {
    const stages: Record<string, ReturnType<typeof createInitialStageState>> = {};
    for (const stage of EXERCISE_STAGES) {
      stages[stage.id] = createInitialStageState();
    }
    return stages;
  }

  function startExercise() {
    const { product, batchNumber, productionDate, responsible, reason } = state.lotData;
    if (!product.trim() || !batchNumber.trim() || !productionDate || !responsible.trim() || !reason) {
      alert("Completa todos los campos del lote antes de iniciar el ejercicio.");
      return;
    }

    const now = new Date();
    setState((prev) => ({
      ...prev,
      exerciseId: generateExerciseId(),
      status: "running",
      stages: initStages(),
      startedAt: now.toISOString(),
      startedAtDisplay: formatClockTime(now),
      elapsedSeconds: 0,
      remainingSeconds: EXERCISE_MAX_SECONDS,
      activeStageId: "raw_materials",
      finishedAt: null,
      finishReason: null,
      verdict: null,
    }));
  }

  const pauseExercise = useCallback(() => {
    setState((prev) => ({
      ...prev,
      status: "paused",
      pauseLog: [
        ...prev.pauseLog,
        { pausedAt: new Date().toISOString(), resumedAt: null },
      ],
    }));
  }, []);

  const resumeExercise = useCallback(() => {
    setState((prev) => {
      const log = [...prev.pauseLog];
      const last = log[log.length - 1];
      if (last && !last.resumedAt) {
        log[log.length - 1] = { ...last, resumedAt: new Date().toISOString() };
      }
      return { ...prev, status: "running", pauseLog: log };
    });
  }, []);

  // SPACE shortcut
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (state.status !== "running" && state.status !== "paused") return;
      e.preventDefault();
      if (state.status === "running") pauseExercise();
      else resumeExercise();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [state.status, pauseExercise, resumeExercise]);

  function finishExercise() {
    setState((prev) => {
      const verdict = computeVerdict(prev, EXERCISE_STAGES.map((s) => s.id));
      return {
        ...prev,
        status: "finished",
        finishedAt: new Date().toISOString(),
        finishReason: "manual",
        verdict,
      };
    });
    setResultsOpen(true);
  }

  function resetExercise() {
    fileStoreRef.current.clear();
    setState(createInitialExerciseState());
    setConfirmResetOpen(false);
    setResultsOpen(false);
    sessionStorage.removeItem(EXERCISE_STORAGE_KEY);
  }

  function updateLotField<K extends keyof TraceExerciseState["lotData"]>(
    key: K,
    value: TraceExerciseState["lotData"][K]
  ) {
    setState((prev) => ({
      ...prev,
      lotData: { ...prev.lotData, [key]: value },
    }));
  }

  function updateStage(stageId: string, patch: Partial<typeof activeStageState>) {
    setState((prev) => ({
      ...prev,
      stages: {
        ...prev.stages,
        [stageId]: { ...(prev.stages[stageId] ?? createInitialStageState()), ...patch },
      },
    }));
  }

  function handleFiles(stageId: string, fileList: FileList | null) {
    if (!fileList || panelsLocked) return;

    const now = new Date().toISOString();
    const newFiles: ExerciseFileMeta[] = [];

    Array.from(fileList).forEach((file) => {
      if (!isAcceptedFile(file)) return;
      const id = crypto.randomUUID();
      fileStoreRef.current.set(id, file);
      newFiles.push({
        id,
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAtElapsed: state.elapsedSeconds,
      });
    });

    if (newFiles.length === 0) return;

    setState((prev) => {
      const current = prev.stages[stageId] ?? createInitialStageState();
      const files = [...current.files, ...newFiles];
      return {
        ...prev,
        stages: {
          ...prev.stages,
          [stageId]: {
            ...current,
            files,
            status: current.status === "complete" ? "complete" : "in_progress",
            firstUploadAt: current.firstUploadAt ?? now,
          },
        },
      };
    });
  }

  function removeFile(stageId: string, fileId: string) {
    const stage = state.stages[stageId];
    if (!stage || stage.status === "complete") return;

    fileStoreRef.current.delete(fileId);
    const files = stage.files.filter((f) => f.id !== fileId);
    updateStage(stageId, {
      files,
      status: files.length > 0 ? "in_progress" : "pending",
      firstUploadAt: files.length > 0 ? stage.firstUploadAt : null,
    });
  }

  function completeStage(stageId: string) {
    const stage = state.stages[stageId];
    if (!stage || stage.files.length === 0) return;

    updateStage(stageId, {
      status: "complete",
      completedAt: new Date().toISOString(),
    });
  }

  function getStageStatus(stageId: string): StageStatus {
    const stage = state.stages[stageId];
    if (!stage) return "pending";
    if (stage.status === "complete") return "complete";
    if (stage.files.length > 0) return "in_progress";
    return "pending";
  }

  const totalFiles = getTotalFiles(state);
  const completedStages = EXERCISE_STAGES.filter(
    (s) => state.stages[s.id]?.status === "complete"
  ).length;

  return (
    <>
      <ModuleHeader
        title="Ejercicio de Trazabilidad"
        description="Simulacro operativo BRCGS 3.9 / IFS Food v8 — máximo 4 horas"
      />
      <TraceabilityNavTabs />

      <div className="px-6 py-4 space-y-4 pb-16">
        {/* BLOQUE 1 — Encabezado fijo */}
        <div className="sticky top-0 z-20 bg-white border border-border rounded-md p-4 shadow-sm space-y-4">
          <div className="text-center space-y-2">
            <p
              className={cn(
                "font-mono text-4xl md:text-5xl font-semibold tabular-nums tracking-tight transition-colors duration-500",
                timerPulse && "animate-pulse"
              )}
              style={{
                color:
                  state.status === "idle" ? undefined : timerColor,
              }}
            >
              {state.status === "idle"
                ? formatCountdown(EXERCISE_MAX_SECONDS)
                : formatCountdown(state.remainingSeconds)}
            </p>
            {state.status !== "idle" && (
              <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${getTimerProgress(state.remainingSeconds)}%`,
                    backgroundColor: timerColor,
                  }}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {state.status === "idle" && (
              <Button onClick={startExercise}>INICIAR EJERCICIO</Button>
            )}
            {state.status === "running" && (
              <Button variant="secondary" onClick={pauseExercise}>
                <Pause className="h-4 w-4" />
                PAUSAR
              </Button>
            )}
            {state.status === "paused" && (
              <Button onClick={resumeExercise}>
                <Play className="h-4 w-4" />
                REANUDAR
              </Button>
            )}
            {isLocked && state.status !== "finished" && (
              <>
                <Button variant="secondary" onClick={finishExercise}>
                  <Square className="h-4 w-4" />
                  FINALIZAR EJERCICIO
                </Button>
                <Button variant="danger" onClick={() => setConfirmResetOpen(true)}>
                  <RotateCcw className="h-4 w-4" />
                  REINICIAR
                </Button>
              </>
            )}
            {state.status === "finished" && (
              <Button onClick={() => setResultsOpen(true)}>VER RESULTADOS</Button>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-[10px] font-mono text-ink-faint">
            {state.startedAtDisplay && (
              <span>Ejercicio iniciado: {state.startedAtDisplay}</span>
            )}
            <span>Hora actual: {formatShortTime(wallClock)}</span>
            {state.exerciseId && <span>ID de Ejercicio: {state.exerciseId}</span>}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_260px] gap-4 items-start">
          <div className="space-y-4 min-w-0">
            {/* BLOQUE 2 — Datos del lote */}
            <section className="bg-white border border-border rounded-md p-4 space-y-3">
              <h2 className="text-sm font-semibold text-ink">Datos del lote a trazar</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <Input
                  label="Producto"
                  value={state.lotData.product}
                  onChange={(e) => updateLotField("product", e.target.value)}
                  readOnly={isLocked}
                  disabled={isLocked}
                  placeholder="Ej. Yogurt natural 1L"
                />
                <Input
                  label="Número de Lote / Batch"
                  value={state.lotData.batchNumber}
                  onChange={(e) => updateLotField("batchNumber", e.target.value)}
                  readOnly={isLocked}
                  disabled={isLocked}
                  placeholder="Ej. L-2026-042"
                />
                <Input
                  label="Fecha de Producción"
                  type="date"
                  value={state.lotData.productionDate}
                  onChange={(e) => updateLotField("productionDate", e.target.value)}
                  readOnly={isLocked}
                  disabled={isLocked}
                />
                <Input
                  label="Responsable del ejercicio"
                  value={state.lotData.responsible}
                  onChange={(e) => updateLotField("responsible", e.target.value)}
                  readOnly={isLocked}
                  disabled={isLocked}
                />
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
                    Motivo del ejercicio
                  </label>
                  <select
                    value={state.lotData.reason}
                    onChange={(e) =>
                      updateLotField("reason", e.target.value as TraceExerciseState["lotData"]["reason"])
                    }
                    disabled={isLocked}
                    className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white disabled:opacity-60"
                  >
                    <option value="">Seleccionar...</option>
                    {EXERCISE_REASON_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* BLOQUE 3 — Etapas tabs */}
            {isLocked && (
              <>
                <div className="border-b border-border overflow-x-auto">
                  <nav className="flex gap-1 min-w-max px-1">
                    {EXERCISE_STAGES.map((stage) => {
                      const status = getStageStatus(stage.id);
                      return (
                        <button
                          key={stage.id}
                          type="button"
                          disabled={panelsLocked}
                          onClick={() =>
                            setState((prev) => ({ ...prev, activeStageId: stage.id }))
                          }
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap border-b-2 transition-colors duration-150 -mb-px",
                            state.activeStageId === stage.id
                              ? "text-forest font-medium border-forest"
                              : "text-ink-faint border-transparent hover:text-ink-light",
                            status === "complete" && "text-sage"
                          )}
                        >
                          <span>{stage.emoji}</span>
                          <span className="hidden sm:inline">{stage.name}</span>
                          <Badge
                            variant={getStageBadgeVariant(status)}
                            showDot={false}
                            className="text-[9px] px-1 py-0"
                          >
                            {STAGE_STATUS_LABELS[status]}
                          </Badge>
                        </button>
                      );
                    })}
                  </nav>
                </div>

                {/* BLOQUE 4 — Panel de etapa */}
                {activeStage && (
                  <section
                    className={cn(
                      "bg-white border border-border rounded-md p-4 space-y-4",
                      activeStageState.status === "complete" && "border-sage/40 bg-sage-light/10"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-ink">
                          {activeStage.emoji} {activeStage.name}
                        </h3>
                        {activeStageState.firstUploadAt && (
                          <p className="text-[10px] font-mono text-ink-faint mt-0.5">
                            Primera carga:{" "}
                            {formatClockTime(new Date(activeStageState.firstUploadAt))}
                          </p>
                        )}
                      </div>
                      <Badge variant={getStageBadgeVariant(activeStageState.status)} showDot={false}>
                        {STAGE_STATUS_LABELS[getStageStatus(activeStage.id)]}
                      </Badge>
                    </div>

                    {/* A) Documentos requeridos */}
                    <div className="space-y-2">
                      <p className="text-xs font-mono uppercase tracking-wider text-ink-light">
                        Documentos requeridos
                      </p>
                      <ul className="space-y-2">
                        {activeStage.documents.map((doc) => (
                          <li
                            key={doc.id}
                            className="flex items-start gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={!!activeStageState.documentsChecked[doc.id]}
                              disabled={
                                panelsLocked || activeStageState.status === "complete"
                              }
                              onChange={(e) =>
                                updateStage(activeStage.id, {
                                  documentsChecked: {
                                    ...activeStageState.documentsChecked,
                                    [doc.id]: e.target.checked,
                                  },
                                })
                              }
                              className="mt-1 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-ink-light">{doc.label}</span>
                              <Badge variant="neutral" showDot={false} className="ml-2 text-[9px]">
                                {doc.normRef}
                              </Badge>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* B) Lote de referencia */}
                    <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border">
                      <div className="space-y-1">
                        <p className="text-xs font-mono uppercase tracking-wider text-ink-light">
                          Lote de referencia
                        </p>
                        <p className="font-mono text-sm text-forest">
                          {state.lotData.batchNumber || "—"}
                        </p>
                      </div>
                      <Input
                        label="Lote del proveedor / Lote interno"
                        value={activeStageState.supplierLot}
                        onChange={(e) =>
                          updateStage(activeStage.id, { supplierLot: e.target.value })
                        }
                        disabled={
                          panelsLocked || activeStageState.status === "complete"
                        }
                        placeholder="Opcional por etapa"
                      />
                    </div>

                    {/* BLOQUE 5 — Balance de masas (solo etapa 2) */}
                    {activeStage.id === "processing" && (
                      <div className="border border-border rounded-md overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setMassBalanceOpen((o) => !o)}
                          className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-ink bg-background hover:bg-background/80"
                        >
                          Calculadora de balance de masas
                          {massBalanceOpen ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                        {massBalanceOpen && (
                          <div className="p-3 space-y-3 border-t border-border">
                            <div className="flex gap-2 items-end">
                              <div className="flex-1">
                                <Input
                                  label="Total materias primas ingresadas"
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={state.massBalance.rawInput}
                                  onChange={(e) =>
                                    setState((prev) => ({
                                      ...prev,
                                      massBalance: {
                                        ...prev.massBalance,
                                        rawInput: e.target.value,
                                      },
                                    }))
                                  }
                                  disabled={
                                    panelsLocked || activeStageState.status === "complete"
                                  }
                                />
                              </div>
                              <select
                                value={state.massBalance.unit}
                                onChange={(e) =>
                                  setState((prev) => ({
                                    ...prev,
                                    massBalance: {
                                      ...prev.massBalance,
                                      unit: e.target.value as typeof state.massBalance.unit,
                                    },
                                  }))
                                }
                                disabled={
                                  panelsLocked || activeStageState.status === "complete"
                                }
                                className="h-9 px-2 text-xs border border-border rounded-md bg-white"
                              >
                                {MASS_BALANCE_UNITS.map((u) => (
                                  <option key={u} value={u}>
                                    {u}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <Input
                              label="Producto terminado obtenido"
                              type="number"
                              min="0"
                              step="any"
                              value={state.massBalance.finishedOutput}
                              onChange={(e) =>
                                setState((prev) => ({
                                  ...prev,
                                  massBalance: {
                                    ...prev.massBalance,
                                    finishedOutput: e.target.value,
                                  },
                                }))
                              }
                              disabled={
                                panelsLocked || activeStageState.status === "complete"
                              }
                            />
                            <Input
                              label="Merma / pérdida declarada"
                              type="number"
                              min="0"
                              step="any"
                              value={state.massBalance.declaredLoss}
                              onChange={(e) =>
                                setState((prev) => ({
                                  ...prev,
                                  massBalance: {
                                    ...prev.massBalance,
                                    declaredLoss: e.target.value,
                                  },
                                }))
                              }
                              disabled={
                                panelsLocked || activeStageState.status === "complete"
                              }
                            />
                            {massBalanceResult.balancePct != null && (
                              <div
                                className={cn(
                                  "rounded-md px-3 py-2 text-sm font-mono",
                                  massBalanceResult.tone === "success" &&
                                    "bg-sage-light text-forest",
                                  massBalanceResult.tone === "warning" &&
                                    "bg-amber-light text-amber",
                                  massBalanceResult.tone === "danger" &&
                                    "bg-red-50 text-danger"
                                )}
                              >
                                Balance: {massBalanceResult.balancePct}%
                                {massBalanceResult.variationPct != null &&
                                  ` (variación ${massBalanceResult.variationPct}%)`}
                              </div>
                            )}
                            <p className="text-[10px] text-ink-faint italic">
                              BRCGS e IFS exigen balance de masas documentado como parte de
                              la verificación de trazabilidad.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* C) Zona de carga */}
                    <div className="space-y-2">
                      <p className="text-xs font-mono uppercase tracking-wider text-ink-light">
                        Archivos de evidencia
                      </p>
                      <label
                        className={cn(
                          "flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-md p-6 text-center transition-colors",
                          panelsLocked || activeStageState.status === "complete"
                            ? "opacity-50 cursor-not-allowed"
                            : "cursor-pointer hover:border-sage/50 hover:bg-background"
                        )}
                      >
                        <Upload className="h-6 w-6 text-ink-faint" />
                        <span className="text-sm text-ink-light">
                          Arrastra archivos aquí o haz clic para explorar
                        </span>
                        <span className="text-[10px] text-ink-faint">
                          PDF, Excel, Word, CSV, JPG, PNG
                        </span>
                        <input
                          type="file"
                          multiple
                          accept={ACCEPTED_FILE_EXTENSIONS.join(",")}
                          className="sr-only"
                          disabled={
                            panelsLocked || activeStageState.status === "complete"
                          }
                          onChange={(e) => {
                            handleFiles(activeStage.id, e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <p className="text-[10px] text-ink-faint">
                        Los archivos se almacenan solo en memoria durante la sesión.
                      </p>

                      {activeStageState.files.length > 0 && (
                        <ul className="space-y-2">
                          {activeStageState.files.map((file) => {
                            const Icon = getFileIcon(file.name);
                            return (
                              <li
                                key={file.id}
                                className="flex items-center gap-2 bg-background border border-border rounded-md px-3 py-2 text-sm"
                              >
                                <Icon className="h-4 w-4 text-forest shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="truncate text-ink">{file.name}</p>
                                  <p className="text-[10px] font-mono text-ink-faint">
                                    {formatFileSize(file.size)} · ⏱{" "}
                                    {formatElapsed(file.uploadedAtElapsed)}
                                  </p>
                                </div>
                                {activeStageState.status !== "complete" && !panelsLocked && (
                                  <button
                                    type="button"
                                    onClick={() => removeFile(activeStage.id, file.id)}
                                    className="text-ink-faint hover:text-danger p-1"
                                    aria-label="Eliminar archivo"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    {/* D) Observaciones */}
                    <Textarea
                      label="Observaciones / Hallazgos"
                      placeholder="Registra brechas, desviaciones o hallazgos en esta etapa..."
                      value={activeStageState.observations}
                      onChange={(e) =>
                        updateStage(activeStage.id, { observations: e.target.value })
                      }
                      disabled={panelsLocked || activeStageState.status === "complete"}
                      className="min-h-[88px]"
                    />

                    {/* E) Completar etapa */}
                    {activeStageState.status !== "complete" && (
                      <Button
                        onClick={() => completeStage(activeStage.id)}
                        disabled={panelsLocked || activeStageState.files.length === 0}
                        className="w-full sm:w-auto"
                      >
                        MARCAR ETAPA COMO COMPLETA
                      </Button>
                    )}
                    {activeStageState.status === "complete" && activeStageState.completedAt && (
                      <p className="text-xs text-sage font-mono">
                        Etapa completada:{" "}
                        {formatClockTime(new Date(activeStageState.completedAt))}
                      </p>
                    )}
                  </section>
                )}
              </>
            )}

            {!isLocked && (
              <p className="text-sm text-ink-faint text-center py-8">
                Completa los datos del lote e inicia el ejercicio para desbloquear las
                etapas de la cadena.
              </p>
            )}
          </div>

          {/* BLOQUE 6 — Panel resumen */}
          {isLocked && (
            <aside className="lg:sticky lg:top-[200px] space-y-2">
              <button
                type="button"
                className="lg:hidden w-full flex items-center justify-between bg-white border border-border rounded-md px-3 py-2 text-xs font-semibold text-ink"
                onClick={() =>
                  setState((prev) => ({ ...prev, summaryOpen: !prev.summaryOpen }))
                }
              >
                Resumen del ejercicio
                {state.summaryOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {(state.summaryOpen || typeof window === "undefined") && (
                <div className="bg-white border border-border rounded-md p-4 space-y-3 text-sm hidden lg:block">
                  <SummaryPanel
                    state={state}
                    completedStages={completedStages}
                    totalFiles={totalFiles}
                    massBalanceResult={massBalanceResult}
                  />
                </div>
              )}
              {state.summaryOpen && (
                <div className="bg-white border border-border rounded-md p-4 space-y-3 text-sm lg:hidden">
                  <SummaryPanel
                    state={state}
                    completedStages={completedStages}
                    totalFiles={totalFiles}
                    massBalanceResult={massBalanceResult}
                  />
                </div>
              )}
            </aside>
          )}
        </div>

        <p className="text-[10px] text-ink-faint text-center font-mono">
          Atajo: <kbd className="px-1 border border-border rounded">Espacio</kbd> para
          pausar / reanudar
        </p>
      </div>

      {/* BLOQUE 8 — Informe imprimible */}
      <div id="trace-exercise-print" className="hidden print:block p-8 text-sm text-ink">
        <PrintReport
          state={state}
          organizationName={organizationName}
          massBalanceResult={massBalanceResult}
        />
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `@media print {
            body * { visibility: hidden; }
            #trace-exercise-print, #trace-exercise-print * { visibility: visible; }
            #trace-exercise-print {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              display: block !important;
            }
          }`,
        }}
      />

      {/* Modal reiniciar */}
      <Modal
        open={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        title="Reiniciar ejercicio"
      >
        <p className="text-sm text-ink-light mb-4">
          ¿Seguro? Se borrarán todos los datos cargados.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setConfirmResetOpen(false)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={resetExercise}>
            Reiniciar
          </Button>
        </div>
      </Modal>

      {/* BLOQUE 7 — Modal resultados */}
      <Modal
        open={resultsOpen}
        onClose={() => setResultsOpen(false)}
        title={
          state.finishReason === "timeout"
            ? "TIEMPO AGOTADO"
            : "EJERCICIO COMPLETADO"
        }
        className="max-w-2xl"
      >
        <ResultsContent
          state={state}
          onPrint={() => window.print()}
          onNewExercise={() => {
            setResultsOpen(false);
            setConfirmResetOpen(true);
          }}
        />
      </Modal>
    </>
  );
}

function SummaryPanel({
  state,
  completedStages,
  totalFiles,
  massBalanceResult,
}: {
  state: TraceExerciseState;
  completedStages: number;
  totalFiles: number;
  massBalanceResult: ReturnType<typeof computeMassBalance>;
}) {
  return (
    <>
      <p className="text-xs font-mono uppercase tracking-wider text-ink-light">
        Progreso
      </p>
      <dl className="space-y-2 text-xs">
        <div>
          <dt className="text-ink-faint">ID</dt>
          <dd className="font-mono text-forest">{state.exerciseId}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Producto / Lote</dt>
          <dd>
            {state.lotData.product || "—"} · {state.lotData.batchNumber || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-faint">Tiempo</dt>
          <dd className="font-mono">
            {formatElapsed(state.elapsedSeconds)} /{" "}
            {formatCountdown(state.remainingSeconds)} rest.
          </dd>
        </div>
        <div>
          <dt className="text-ink-faint">Etapas</dt>
          <dd>
            {completedStages} / {EXERCISE_STAGES.length} completas
          </dd>
        </div>
        <div>
          <dt className="text-ink-faint">Archivos</dt>
          <dd>{totalFiles} cargados</dd>
        </div>
        {massBalanceResult.balancePct != null && (
          <div>
            <dt className="text-ink-faint">Balance de masas</dt>
            <dd className="font-mono">{massBalanceResult.balancePct}%</dd>
          </div>
        )}
      </dl>
      <ul className="space-y-1.5 pt-2 border-t border-border">
        {EXERCISE_STAGES.map((stage) => {
          const st = state.stages[stage.id];
          const status = st?.status ?? "pending";
          const icon =
            status === "complete" ? "✅" : status === "in_progress" ? "⏳" : "⬜";
          return (
            <li key={stage.id} className="text-[11px] flex justify-between gap-2">
              <span className="truncate">
                {icon} {stage.name}
              </span>
              {st?.completedAt && (
                <span className="font-mono text-ink-faint shrink-0">
                  {formatShortTime(new Date(st.completedAt))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ResultsContent({
  state,
  onPrint,
  onNewExercise,
}: {
  state: TraceExerciseState;
  onPrint: () => void;
  onNewExercise: () => void;
}) {
  const verdict = state.verdict ?? "partial";
  const headerColor =
    verdict === "approved"
      ? "text-sage"
      : verdict === "partial"
        ? "text-amber"
        : "text-danger";

  return (
    <div className="space-y-4">
      <p className={cn("text-lg font-semibold font-display", headerColor)}>
        {state.finishReason === "timeout" ? "TIEMPO AGOTADO" : "EJERCICIO COMPLETADO"}
      </p>

      <p className="text-sm text-ink-light">
        Tiempo total utilizado:{" "}
        <span className="font-mono font-medium text-ink">
          {formatElapsed(state.elapsedSeconds)}
        </span>
      </p>

      <div className="flex items-center gap-2">
        <span className="text-sm text-ink-light">Veredicto:</span>
        <Badge
          variant={
            verdict === "approved"
              ? "success"
              : verdict === "partial"
                ? "warning"
                : "danger"
          }
          showDot={false}
        >
          {getVerdictLabel(verdict)}{" "}
          {verdict === "approved" ? "✅" : verdict === "partial" ? "⚠️" : "❌"}
        </Badge>
      </div>

      <div className="overflow-x-auto border border-border rounded-md">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-background text-left font-mono uppercase text-ink-faint">
              <th className="px-3 py-2">Etapa</th>
              <th className="px-3 py-2">Cierre</th>
              <th className="px-3 py-2">Archivos</th>
              <th className="px-3 py-2">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {EXERCISE_STAGES.map((stage) => {
              const st = state.stages[stage.id];
              return (
                <tr key={stage.id} className="border-t border-border">
                  <td className="px-3 py-2">{stage.name}</td>
                  <td className="px-3 py-2 font-mono">
                    {st?.completedAt
                      ? formatClockTime(new Date(st.completedAt))
                      : "—"}
                  </td>
                  <td className="px-3 py-2">{st?.files.length ?? 0}</td>
                  <td className="px-3 py-2 text-ink-light max-w-[200px] truncate">
                    {st?.observations || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-ink-faint leading-relaxed border-l-2 border-sage/40 pl-3">
        Este ejercicio fue realizado conforme a los requisitos de BRCGS Issue 9
        Cláusula 3.9 / IFS Food v8 / TESCO TFMS para simulacros de trazabilidad con
        tiempo máximo de 4 horas.
      </p>

      <div className="flex flex-wrap gap-2 pt-2">
        <Button onClick={onPrint}>EXPORTAR INFORME</Button>
        <Button variant="secondary" onClick={onNewExercise}>
          NUEVO EJERCICIO
        </Button>
      </div>
    </div>
  );
}

function PrintReport({
  state,
  organizationName,
  massBalanceResult,
}: {
  state: TraceExerciseState;
  organizationName: string;
  massBalanceResult: ReturnType<typeof computeMassBalance>;
}) {
  const verdict = state.verdict ?? computeVerdict(state, EXERCISE_STAGES.map((s) => s.id));
  const reasonLabel =
    EXERCISE_REASON_OPTIONS.find((r) => r.value === state.lotData.reason)?.label ??
    state.lotData.reason;

  return (
    <div className="space-y-6">
      <header className="border-b border-black pb-4">
        <h1 className="text-xl font-semibold">{organizationName}</h1>
        <p className="font-mono text-sm mt-1">Informe de Ejercicio de Trazabilidad</p>
        <p className="text-sm mt-2">
          ID: {state.exerciseId} · Fecha:{" "}
          {state.finishedAt
            ? new Date(state.finishedAt).toLocaleString("es")
            : new Date().toLocaleString("es")}
        </p>
      </header>

      <section className="space-y-1 text-sm">
        <p>
          <strong>Producto:</strong> {state.lotData.product}
        </p>
        <p>
          <strong>Lote:</strong> {state.lotData.batchNumber}
        </p>
        <p>
          <strong>Fecha de producción:</strong> {state.lotData.productionDate}
        </p>
        <p>
          <strong>Responsable:</strong> {state.lotData.responsible}
        </p>
        <p>
          <strong>Motivo:</strong> {reasonLabel}
        </p>
        <p>
          <strong>Tiempo utilizado:</strong> {formatElapsed(state.elapsedSeconds)}
        </p>
      </section>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-black">
            <th className="text-left py-2 pr-2">Etapa</th>
            <th className="text-left py-2 pr-2">Estado</th>
            <th className="text-left py-2 pr-2">Hora cierre</th>
            <th className="text-left py-2 pr-2">Archivos</th>
            <th className="text-left py-2">Observaciones</th>
          </tr>
        </thead>
        <tbody>
          {EXERCISE_STAGES.map((stage) => {
            const st = state.stages[stage.id];
            const status = st?.status ?? "pending";
            return (
              <tr key={stage.id} className="border-b border-gray-300">
                <td className="py-2 pr-2">{stage.name}</td>
                <td className="py-2 pr-2">{STAGE_STATUS_LABELS[status]}</td>
                <td className="py-2 pr-2 font-mono">
                  {st?.completedAt
                    ? formatClockTime(new Date(st.completedAt))
                    : "—"}
                </td>
                <td className="py-2 pr-2">{st?.files.length ?? 0}</td>
                <td className="py-2">{st?.observations || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {massBalanceResult.balancePct != null && (
        <p className="text-sm">
          <strong>Balance de masas:</strong> {massBalanceResult.balancePct}%
          {massBalanceResult.variationPct != null &&
            ` (variación ${massBalanceResult.variationPct}%)`}
        </p>
      )}

      <p className="text-sm font-semibold">
        Veredicto final: {getVerdictLabel(verdict)}
      </p>

      <p className="text-xs text-gray-600 border-l-2 border-gray-400 pl-3">
        Este ejercicio fue realizado conforme a los requisitos de BRCGS Issue 9
        Cláusula 3.9 / IFS Food v8 / TESCO TFMS para simulacros de trazabilidad con
        tiempo máximo de 4 horas.
      </p>

      <div className="pt-8 grid grid-cols-2 gap-8 text-sm">
        <p>Responsable: ________________________</p>
        <p>Fecha: ________________________</p>
      </div>
    </div>
  );
}
