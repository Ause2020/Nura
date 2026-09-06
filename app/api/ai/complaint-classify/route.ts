/**
 * POST /api/ai/complaint-classify
 *
 * Receives complaint description and returns suggested type + severity.
 * Uses exact enum values from ComplaintType and ComplaintSeverity.
 * Server-side only.
 *
 * Body: { description }
 * Response: { type: ComplaintType, severity: ComplaintSeverity }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callClaude, parseAiJson, isAiConfigured } from "@/lib/ai/anthropic";
import type { ComplaintSeverity, ComplaintType } from "@/types/database";

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un experto en gestión de reclamos de clientes para empresas de alimentos y bebidas.
Respondes ÚNICAMENTE en español.
Respondes ÚNICAMENTE con JSON válido, sin texto adicional.`;

function buildUserPrompt(description: string): string {
  return `
Clasifica el siguiente reclamo de un cliente de empresa de alimentos:

"${description}"

Elige el tipo de reclamo más apropiado de esta lista exacta (usa solo estos valores):
- foreign_body (cuerpo extraño en el producto)
- deterioration (producto deteriorado antes del vencimiento)
- labeling (error en etiqueta o información del empaque)
- taste_odor (sabor u olor anormal)
- allergen (presencia de alérgeno no declarado)
- packaging (defecto en envase o embalaje)
- quantity (peso o volumen incorrecto)
- service (problema con la atención o entrega)
- other (cualquier otro tipo)

Elige la severidad más apropiada de esta lista exacta (usa solo estos valores):
- safety_critical (riesgo real de daño al consumidor: cuerpo extraño, alérgeno, contaminación)
- quality (desviación de calidad sin riesgo para la salud)
- labeling (problema solo de etiquetado o información)
- cosmetic (problema de apariencia sin afectar inocuidad ni calidad)

Responde SOLO con este JSON (sin texto adicional):
{"type": "<valor>", "severity": "<valor>"}
`.trim();
}

// ─── Route handler ────────────────────────────────────────────────────────────

const VALID_TYPES = new Set<ComplaintType>([
  "foreign_body", "deterioration", "labeling", "taste_odor",
  "allergen", "packaging", "quantity", "service", "other",
]);

const VALID_SEVERITIES = new Set<ComplaintSeverity>([
  "safety_critical", "quality", "labeling", "cosmetic",
]);

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI no disponible", unavailable: true },
      { status: 503 }
    );
  }

  const body = await req.json() as { description?: string };
  if (!body.description?.trim()) {
    return NextResponse.json({ error: "description es requerida" }, { status: 400 });
  }

  const result = await callClaude({
    system: SYSTEM_PROMPT,
    userMessage: buildUserPrompt(body.description),
    maxTokens: 80,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const parsed = parseAiJson<{ type: string; severity: string }>(result.text);

  if (
    !parsed ||
    !VALID_TYPES.has(parsed.type as ComplaintType) ||
    !VALID_SEVERITIES.has(parsed.severity as ComplaintSeverity)
  ) {
    return NextResponse.json(
      { error: "Clasificación inválida, intenta de nuevo" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    type: parsed.type as ComplaintType,
    severity: parsed.severity as ComplaintSeverity,
  });
}
