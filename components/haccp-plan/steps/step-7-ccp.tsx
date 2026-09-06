"use client";

import { useEffect, useState } from "react";
import { Pencil, RotateCcw, Undo2 } from "lucide-react";
import { CODEX_QUESTIONS } from "@/lib/haccp-plan/constants";
import {
  activeQuestionKey,
  answeredKeys,
  applyQuestionChange,
  branchDestination,
  ccpDecisionLabel,
  defaultQuestionTexts,
  evaluateCcpTree,
  isQuestionEnabled,
  resolveQuestionTexts,
  resultExplanation,
} from "@/lib/haccp-plan/ccp-tree";
import type {
  CcpQuestionKey,
  CcpQuestionTexts,
  HazardRow,
} from "@/lib/haccp-plan/types";
import { cn } from "@/lib/utils";

const KEYS: CcpQuestionKey[] = ["q1", "q2", "q3", "q4"];

export function Step7Ccp({
  hazards,
  selectedId,
  questions,
  onSelect,
  onChange,
  onQuestionsChange,
}: {
  hazards: HazardRow[];
  selectedId: string | null;
  questions?: CcpQuestionTexts;
  onSelect: (id: string) => void;
  onChange: (hazard: HazardRow) => void;
  onQuestionsChange: (questions: CcpQuestionTexts) => void;
}) {
  const selected = hazards.find((item) => item.id === selectedId) ?? hazards[0];
  const texts = resolveQuestionTexts(questions);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(texts);
  const [focusKey, setFocusKey] = useState<CcpQuestionKey | null>(null);

  useEffect(() => {
    setFocusKey(null);
  }, [selected?.id]);

  if (hazards.length === 0) {
    return (
      <p className="text-sm text-ink-light">
        No hay peligros significativos. Completa el paso 6 y usa un score ≥ umbral
        (3×3=9 con umbral 9).
      </p>
    );
  }

  const autoKey = selected ? activeQuestionKey(selected) : "q1";
  const currentKey =
    focusKey && selected && isQuestionEnabled(focusKey, selected)
      ? focusKey
      : autoKey;
  const currentMeta = CODEX_QUESTIONS.find((item) => item.key === currentKey);
  const result = selected
    ? evaluateCcpTree(selected.q1, selected.q2, selected.q3, selected.q4)
    : undefined;
  const explanation = selected ? resultExplanation(selected) : null;
  const showResult = currentKey === "done" && explanation;
  const path = selected ? answeredKeys(selected) : [];

  function answer(value: boolean) {
    if (!selected || currentKey === "done") return;
    const next = applyQuestionChange(selected, currentKey, value);
    const isCCP = evaluateCcpTree(next.q1, next.q2, next.q3, next.q4);
    setFocusKey(null);
    onChange({ ...selected, ...next, isCCP });
  }

  function jumpTo(key: CcpQuestionKey) {
    if (!selected || !isQuestionEnabled(key, selected)) return;
    setFocusKey(key);
  }

  function restart() {
    if (!selected) return;
    setFocusKey(null);
    onChange({
      ...selected,
      q1: null,
      q2: null,
      q3: null,
      q4: null,
      isCCP: undefined,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-light max-w-xl">
          Responde una pregunta a la vez. El árbol Codex decide si el peligro es PCC
          según el camino Sí / No.
        </p>
        <button
          type="button"
          onClick={() => {
            setDraft(texts);
            setEditing((open) => !open);
          }}
          className="h-8 px-3 rounded-md text-xs bg-white border border-border text-ink-light inline-flex items-center gap-1.5 hover:border-forest hover:text-forest"
        >
          <Pencil className="h-3.5 w-3.5" />
          {editing ? "Cerrar preguntas" : "Editar preguntas Codex"}
        </button>
      </div>

      {editing && (
        <div className="rounded-lg border border-border bg-white p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-ink">Preguntas del árbol</p>
              <p className="text-xs text-ink-light mt-0.5">
                Puedes adaptar el texto si el Codex o tu procedimiento interno cambia.
                La lógica Sí / No se mantiene.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const defaults = defaultQuestionTexts();
                setDraft(defaults);
                onQuestionsChange(defaults);
              }}
              className="h-8 px-3 rounded-md text-xs border border-border text-ink-light inline-flex items-center gap-1"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar Codex
            </button>
          </div>
          {KEYS.map((key, index) => (
            <label key={key} className="block">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
                Pregunta {index + 1}
              </span>
              <textarea
                value={draft[key]}
                rows={2}
                onChange={(event) => {
                  const next = { ...draft, [key]: event.target.value };
                  setDraft(next);
                  onQuestionsChange(next);
                }}
                className="hp-input mt-1"
              />
            </label>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-[220px_minmax(0,1fr)_220px] gap-4">
        <aside className="space-y-1">
          {hazards.map((hazard, index) => {
            const status = ccpDecisionLabel(
              evaluateCcpTree(hazard.q1, hazard.q2, hazard.q3, hazard.q4)
            );
            return (
              <button
                key={hazard.id}
                type="button"
                onClick={() => onSelect(hazard.id)}
                className={cn(
                  "w-full text-left rounded-md px-3 py-2 text-xs border",
                  selected?.id === hazard.id
                    ? "bg-sage-light border-sage text-ink"
                    : "bg-white border-border text-ink-light"
                )}
              >
                <span className="block font-medium truncate">{hazard.description}</span>
                <span className="text-ink-faint">{hazard.processStep}</span>
                <span
                  className={cn(
                    "mt-1 block text-[10px] font-semibold uppercase tracking-wider",
                    status === "PCC" && "text-danger",
                    status === "No es PCC" && "text-ink-faint",
                    status === "Pendiente" && "text-amber"
                  )}
                >
                  {status === "PCC" ? `PCC ${index + 1}` : status}
                </span>
              </button>
            );
          })}
        </aside>

        {selected && (
          <div className="rounded-xl border border-border bg-white p-5 space-y-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
                Peligro en evaluación
              </p>
              <p className="text-sm font-medium text-ink mt-1">{selected.description}</p>
              <p className="text-xs text-ink-faint">{selected.processStep}</p>
              {selected.controlMeasures && (
                <p className="text-xs text-ink-light mt-2">
                  Medida preventiva: {selected.controlMeasures}
                </p>
              )}
            </div>

            {path.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {path.map((key, index) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => jumpTo(key)}
                    className="h-7 px-2 rounded-md text-[10px] font-medium border border-border text-ink-light hover:border-forest hover:text-forest"
                  >
                    P{index + 1} {selected[key] ? "Sí" : "No"}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={restart}
                  className="h-7 px-2 rounded-md text-[10px] text-ink-faint inline-flex items-center gap-1 hover:text-forest"
                >
                  <Undo2 className="h-3 w-3" />
                  Reiniciar
                </button>
              </div>
            )}

            {showResult ? (
              <div
                className={cn(
                  "rounded-lg px-4 py-6 text-center",
                  result === true ? "bg-sage-light" : "bg-[#F7F4EE]"
                )}
              >
                <p
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-[0.16em]",
                    result === true ? "text-forest" : "text-ink-faint"
                  )}
                >
                  Resultado del árbol
                </p>
                <p className="font-display text-2xl text-ink mt-2">
                  {explanation.title}
                </p>
                <p className="text-sm text-ink-light mt-2 max-w-md mx-auto">
                  {explanation.detail}
                </p>
                <button
                  type="button"
                  onClick={restart}
                  className="mt-4 h-9 px-4 rounded-md text-xs border border-border bg-white text-ink-light hover:border-forest hover:text-forest"
                >
                  Volver a recorrer el árbol
                </button>
              </div>
            ) : currentMeta && currentKey !== "done" ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1 rounded-full bg-[#EFEAE3] overflow-hidden">
                    <div
                      className="h-full bg-forest transition-all duration-200"
                      style={{
                        width: `${((KEYS.indexOf(currentKey) + 1) / KEYS.length) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-[11px] tabular-nums text-ink-faint">
                    Pregunta {KEYS.indexOf(currentKey) + 1} de 4
                  </span>
                </div>

                <p className="text-lg font-medium text-ink leading-snug">
                  {texts[currentKey]}
                </p>

                <div className="grid sm:grid-cols-2 gap-3">
                  {[true, false].map((value) => {
                    const dest = branchDestination(currentKey, value);
                    const selectedAnswer = selected[currentKey] === value;
                    return (
                      <button
                        key={String(value)}
                        type="button"
                        onClick={() => answer(value)}
                        className={cn(
                          "rounded-lg border px-4 py-4 text-left transition-colors",
                          selectedAnswer
                            ? "border-forest bg-sage-light"
                            : "border-border bg-[#F7F4EE] hover:border-forest"
                        )}
                      >
                        <span className="block text-sm font-semibold text-ink">
                          {value ? "Sí" : "No"}
                        </span>
                        <span className="mt-1 block text-xs text-ink-light">
                          {value ? currentMeta.yesHint : currentMeta.noHint}
                        </span>
                        <span className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                          {dest.type === "question"
                            ? `Siguiente: pregunta ${KEYS.indexOf(dest.key) + 1}`
                            : dest.isCcp
                              ? "Resultado: PCC"
                              : "Resultado: no es PCC"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        )}

        <aside className="rounded-xl border border-border bg-white p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint mb-3">
            Mapa del árbol
          </p>
          <TreeMap
            answers={selected ?? {}}
            active={currentKey === "done" ? null : currentKey}
            onSelect={jumpTo}
          />
        </aside>
      </div>
    </div>
  );
}

function TreeMap({
  answers,
  active,
  onSelect,
}: {
  answers: HazardRow | Record<string, never>;
  active: CcpQuestionKey | null;
  onSelect: (key: CcpQuestionKey) => void;
}) {
  return (
    <div className="space-y-3">
      {KEYS.map((key, index) => {
        const meta = CODEX_QUESTIONS[index];
        const destYes = branchDestination(key, true);
        const destNo = branchDestination(key, false);
        const enabled = isQuestionEnabled(key, answers);
        const value = answers[key];
        return (
          <div key={key} className="relative">
            {index < KEYS.length - 1 && (
              <span className="absolute left-[15px] top-8 bottom-[-12px] w-px bg-border" />
            )}
            <button
              type="button"
              disabled={!enabled}
              onClick={() => onSelect(key)}
              className={cn(
                "relative z-10 flex h-8 items-center gap-2 text-left disabled:cursor-default",
                enabled ? "text-ink" : "text-ink-faint"
              )}
            >
              <span
                className={cn(
                  "flex h-[31px] w-[31px] items-center justify-center rounded-full border text-[11px] font-semibold bg-white",
                  active === key && "border-forest text-forest shadow-[0_0_0_3px_#D8F3DC]",
                  value === true && active !== key && "border-sage bg-sage-light text-forest",
                  value === false && active !== key && "border-ink-faint text-ink-light",
                  value == null && active !== key && "border-border text-ink-faint"
                )}
              >
                P{index + 1}
              </span>
              <span className="text-[11px] leading-tight line-clamp-2">
                {meta.key.toUpperCase()}
                {value === true ? " · Sí" : value === false ? " · No" : ""}
              </span>
            </button>
            <div className="ml-10 mt-1 space-y-0.5 text-[10px] text-ink-faint">
              <p className={cn(value === true && "text-forest font-medium")}>
                Sí → {destLabel(destYes)}
              </p>
              <p className={cn(value === false && "text-ink font-medium")}>
                No → {destLabel(destNo)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function destLabel(dest: ReturnType<typeof branchDestination>) {
  if (dest.type === "question") return `P${KEYS.indexOf(dest.key) + 1}`;
  return dest.isCcp ? "PCC" : "No PCC";
}
