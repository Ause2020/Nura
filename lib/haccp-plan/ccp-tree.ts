import { CODEX_QUESTIONS } from "@/lib/haccp-plan/constants";
import type { CcpQuestionKey, CcpQuestionTexts } from "@/lib/haccp-plan/types";

export type CcpResult = boolean | undefined;

export type CcpAnswers = {
  q1?: boolean | null;
  q2?: boolean | null;
  q3?: boolean | null;
  q4?: boolean | null;
};

export type CcpBranch =
  | { type: "question"; key: CcpQuestionKey }
  | { type: "result"; isCcp: boolean };

export function defaultQuestionTexts(): Record<CcpQuestionKey, string> {
  return {
    q1: CODEX_QUESTIONS[0].text,
    q2: CODEX_QUESTIONS[1].text,
    q3: CODEX_QUESTIONS[2].text,
    q4: CODEX_QUESTIONS[3].text,
  };
}

export function resolveQuestionTexts(
  custom?: CcpQuestionTexts | null
): Record<CcpQuestionKey, string> {
  const defaults = defaultQuestionTexts();
  return {
    q1: custom?.q1?.trim() || defaults.q1,
    q2: custom?.q2?.trim() || defaults.q2,
    q3: custom?.q3?.trim() || defaults.q3,
    q4: custom?.q4?.trim() || defaults.q4,
  };
}

export function evaluateCcpTree(
  q1: boolean | null | undefined,
  q2: boolean | null | undefined,
  q3: boolean | null | undefined,
  q4: boolean | null | undefined
): CcpResult {
  if (q1 === false) return false;
  if (q1 !== true) return undefined;
  if (q2 === true) return true;
  if (q2 !== false) return undefined;
  if (q3 === false) return false;
  if (q3 !== true) return undefined;
  if (q4 === true) return false;
  if (q4 === false) return true;
  return undefined;
}

export function ccpDecisionLabel(isCcp: CcpResult): string {
  if (isCcp === true) return "PCC";
  if (isCcp === false) return "No es PCC";
  return "Pendiente";
}

export function applyQuestionChange(
  current: CcpAnswers,
  key: CcpQuestionKey,
  value: boolean
) {
  const next = { ...current, [key]: value };
  if (key === "q1" && value === false) {
    next.q2 = null;
    next.q3 = null;
    next.q4 = null;
  }
  if (key === "q2" && value === true) {
    next.q3 = null;
    next.q4 = null;
  }
  if (key === "q3" && value === false) {
    next.q4 = null;
  }
  return next;
}

export function isQuestionEnabled(key: CcpQuestionKey, answers: CcpAnswers): boolean {
  if (key === "q1") return true;
  if (key === "q2") return answers.q1 === true;
  if (key === "q3") return answers.q1 === true && answers.q2 === false;
  return answers.q1 === true && answers.q2 === false && answers.q3 === true;
}

export function branchDestination(key: CcpQuestionKey, answer: boolean): CcpBranch {
  if (key === "q1") return answer ? { type: "question", key: "q2" } : { type: "result", isCcp: false };
  if (key === "q2") return answer ? { type: "result", isCcp: true } : { type: "question", key: "q3" };
  if (key === "q3") return answer ? { type: "question", key: "q4" } : { type: "result", isCcp: false };
  return { type: "result", isCcp: !answer };
}

export function activeQuestionKey(answers: CcpAnswers): CcpQuestionKey | "done" {
  if (answers.q1 !== true && answers.q1 !== false) return "q1";
  if (answers.q1 === false) return "done";
  if (answers.q2 !== true && answers.q2 !== false) return "q2";
  if (answers.q2 === true) return "done";
  if (answers.q3 !== true && answers.q3 !== false) return "q3";
  if (answers.q3 === false) return "done";
  if (answers.q4 !== true && answers.q4 !== false) return "q4";
  return "done";
}

export function answeredKeys(answers: CcpAnswers): CcpQuestionKey[] {
  return (["q1", "q2", "q3", "q4"] as const).filter(
    (key) => answers[key] === true || answers[key] === false
  );
}

export function resultExplanation(answers: CcpAnswers): {
  title: string;
  detail: string;
} | null {
  const result = evaluateCcpTree(answers.q1, answers.q2, answers.q3, answers.q4);
  if (result === undefined) return null;
  if (answers.q1 === false) {
    return {
      title: "No es PCC",
      detail:
        "No hay una medida de control en este paso, así que no puede ser un punto crítico. Revisa un PRP o rediseña el proceso.",
    };
  }
  if (answers.q2 === true) {
    return {
      title: "Es un PCC",
      detail:
        "Este paso está específicamente diseñado para eliminar o reducir el peligro a un nivel aceptable.",
    };
  }
  if (answers.q3 === false) {
    return {
      title: "No es PCC",
      detail:
        "El peligro no se introduce ni aumenta a un nivel inaceptable en este paso.",
    };
  }
  if (answers.q4 === true) {
    return {
      title: "No es PCC",
      detail:
        "Un paso posterior elimina o reduce el peligro. El control se asigna más adelante.",
    };
  }
  return {
    title: "Es un PCC",
    detail:
      "El peligro puede ocurrir o aumentar aquí y no hay un paso posterior que lo controle.",
  };
}
