/**
 * POST /api/ai/nc-analysis
 *
 * Receives NC context and returns a structured 5-Whys draft + CAPA actions.
 * Server-side only — API key never exposed to the client.
 *
 * Body: { description, severity, area?, origin?, product? }
 * Response: { fiveWhys: string[5], rootCause: string, suggestedActions: { description, type }[] }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callClaude, parseAiJson, isAiConfigured } from "@/lib/ai/anthropic";

// ─── Prompt ──────────────────────────────────────────────────────────────────
// Designed to respond in Spanish, strict JSON output, no preamble.

const SYSTEM_PROMPT = `Eres un experto en calidad e inocuidad alimentaria especializado en análisis de causa raíz y planes CAPA. 
Respondes ÚNICAMENTE en español.
Respondes ÚNICAMENTE con JSON válido, sin texto adicional antes o después.
El JSON debe seguir exactamente el esquema que el usuario especifique.`;

function buildUserPrompt(params: {
  description: string;
  severity: string;
  area?: string | null;
  origin?: string | null;
  product?: string | null;
}): string {
  const ctx = [
    `Descripción de la no conformidad: ${params.description}`,
    `Severidad: ${params.severity}`,
    params.area ? `Área: ${params.area}` : null,
    params.origin ? `Origen: ${params.origin}` : null,
    params.product ? `Producto/lote afectado: ${params.product}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `
Analiza la siguiente no conformidad y genera:
1. Un análisis de 5 Porqués (cadena causal)
2. Una causa raíz resumida en 1-2 frases
3. Entre 2 y 4 acciones CAPA concretas (inmediatas, correctivas o preventivas)

${ctx}

Responde SOLO con este JSON (sin texto adicional):
{
  "fiveWhys": [
    "¿Por qué 1? — [causa inmediata]",
    "¿Por qué 2? — [causa intermedia]",
    "¿Por qué 3? — [causa más profunda]",
    "¿Por qué 4? — [causa sistémica]",
    "¿Por qué 5? — [causa raíz]"
  ],
  "rootCause": "Resumen de la causa raíz en 1-2 frases",
  "suggestedActions": [
    { "description": "Acción concreta 1", "type": "immediate" },
    { "description": "Acción concreta 2", "type": "corrective" },
    { "description": "Acción concreta 3", "type": "preventive" }
  ]
}
Los tipos válidos son: "immediate", "corrective", "preventive".
Sé específico para la industria de alimentos. No uses frases genéricas.
`.trim();
}

// ─── Response schema ──────────────────────────────────────────────────────────

export interface NcAnalysisResponse {
  fiveWhys: [string, string, string, string, string];
  rootCause: string;
  suggestedActions: { description: string; type: "immediate" | "corrective" | "preventive" }[];
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI no disponible", unavailable: true },
      { status: 503 }
    );
  }

  const body = await req.json() as {
    description?: string;
    severity?: string;
    area?: string | null;
    origin?: string | null;
    product?: string | null;
  };

  if (!body.description?.trim()) {
    return NextResponse.json({ error: "description es requerida" }, { status: 400 });
  }

  const prompt = buildUserPrompt({
    description: body.description,
    severity: body.severity ?? "major",
    area: body.area,
    origin: body.origin,
    product: body.product,
  });

  const result = await callClaude({
    system: SYSTEM_PROMPT,
    userMessage: prompt,
    maxTokens: 600,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, unavailable: false },
      { status: 502 }
    );
  }

  const parsed = parseAiJson<NcAnalysisResponse>(result.text);
  if (!parsed || !Array.isArray(parsed.fiveWhys) || parsed.fiveWhys.length < 5) {
    return NextResponse.json(
      { error: "Respuesta de IA inválida, intenta de nuevo" },
      { status: 502 }
    );
  }

  // Sanitize: ensure exactly 5 whys
  const clean: NcAnalysisResponse = {
    fiveWhys: [
      parsed.fiveWhys[0] ?? "",
      parsed.fiveWhys[1] ?? "",
      parsed.fiveWhys[2] ?? "",
      parsed.fiveWhys[3] ?? "",
      parsed.fiveWhys[4] ?? "",
    ],
    rootCause: parsed.rootCause ?? "",
    suggestedActions: (parsed.suggestedActions ?? [])
      .slice(0, 4)
      .filter((a) => a.description?.trim())
      .map((a) => ({
        description: a.description,
        type: (["immediate", "corrective", "preventive"] as const).includes(
          a.type as "immediate" | "corrective" | "preventive"
        )
          ? (a.type as "immediate" | "corrective" | "preventive")
          : "corrective",
      })),
  };

  return NextResponse.json(clean);
}
