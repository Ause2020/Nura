import { NextResponse } from "next/server";
import { callClaudeVision, isAiConfigured, parseAiJson } from "@/lib/ai/anthropic";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

interface OcrFieldHint {
  id: string;
  label: string;
  type: string;
  unit?: string | null;
}

interface OcrResult {
  lotNumber: string | null;
  notes: string | null;
  fields: { fieldId: string; value: string }[];
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "IA no configurada. Agrega ANTHROPIC_API_KEY para digitalizar planillas." },
      { status: 503 }
    );
  }

  const body = (await req.json()) as {
    imageBase64?: string;
    mediaType?: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
    fields?: OcrFieldHint[];
    templateName?: string;
  };

  if (!body.imageBase64 || !body.fields?.length) {
    return NextResponse.json({ error: "Imagen y campos de plantilla son requeridos" }, { status: 400 });
  }

  const raw = body.imageBase64.includes(",")
    ? body.imageBase64.split(",")[1]
    : body.imageBase64;

  if (raw.length > 6_000_000) {
    return NextResponse.json({ error: "La imagen es demasiado grande (máx. ~4 MB)" }, { status: 400 });
  }

  const schema = body.fields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    unit: f.unit ?? null,
  }));

  const result = await callClaudeVision({
    system:
      "Eres un analista de inocuidad. Lees planillas de monitoreo manuscritas o escaneadas. Respondes SOLO JSON válido en español, sin markdown.",
    userMessage: `
Plantilla: ${body.templateName ?? "monitoreo"}
Campos esperados:
${JSON.stringify(schema)}

Extrae los valores visibles. Si un campo no se lee, usa "".
Checklist: yes | no | na
Números: solo el valor numérico.
Responde SOLO:
{
  "lotNumber": "lote o null",
  "notes": "observaciones o null",
  "fields": [{ "fieldId": "id del esquema", "value": "texto extraído" }]
}
`.trim(),
    imageBase64: raw,
    mediaType: body.mediaType ?? "image/jpeg",
    maxTokens: 1200,
    timeoutMs: 28_000,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const parsed = parseAiJson<OcrResult>(result.text);
  if (!parsed || !Array.isArray(parsed.fields)) {
    return NextResponse.json({ error: "No se pudo leer la planilla. Prueba con otra foto." }, { status: 502 });
  }

  const allowed = new Set(body.fields.map((f) => f.id));
  return NextResponse.json({
    lotNumber: parsed.lotNumber ?? null,
    notes: parsed.notes ?? null,
    fields: parsed.fields.filter((f) => allowed.has(f.fieldId)),
  });
}
