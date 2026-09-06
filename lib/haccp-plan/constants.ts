import type {
  ConsumerGroups,
  HazardType,
  ProductSpec,
  RiskMatrix,
  VerificationCategory,
} from "@/lib/haccp-plan/types";

export const DEFAULT_RISK_MATRIX: RiskMatrix = {
  severity: [
    { value: 1, label: "Menor" },
    { value: 2, label: "Moderada" },
    { value: 3, label: "Seria" },
    { value: 4, label: "Crítica" },
  ],
  probability: [
    { value: 1, label: "Remota" },
    { value: 2, label: "Baja" },
    { value: 3, label: "Probable" },
    { value: 4, label: "Frecuente" },
  ],
  significanceThreshold: 9,
};

export const STEP_META: {
  id: number;
  short: string;
  title: string;
  description: string;
  banner?: string;
}[] = [
  {
    id: 1,
    short: "Equipo",
    title: "Formación del equipo HACCP",
    description: "NCh 2861 cl. 5.1 — equipo multidisciplinario con líder, cargos y capacitación.",
  },
  {
    id: 2,
    short: "Producto",
    title: "Descripción del producto",
    description: "NCh 2861 + DS 977/96 — ficha técnica, resolución sanitaria y alérgenos.",
  },
  {
    id: 3,
    short: "Uso",
    title: "Uso previsto",
    description: "NCh 2861 — uso esperado, RTE vs cocción y grupos vulnerables (YOPI).",
  },
  {
    id: 4,
    short: "Flujo",
    title: "Diagrama de flujo",
    description: "NCh 2861 — todas las etapas de recepción a despacho, reproceso y entradas.",
  },
  {
    id: 5,
    short: "Validación",
    title: "Validación in situ",
    description: "NCh 2861 cl. 5.5 — recorrer la línea, verificar turnos y firmar el acta.",
  },
  {
    id: 6,
    short: "Peligros",
    title: "Análisis de peligros",
    description: "Codex Principio 1 — peligros B/Q/F, probabilidad × severidad y medidas preventivas.",
  },
  {
    id: 7,
    short: "Árbol PCC",
    title: "Determinación de PCC",
    description: "Codex Principio 2 — árbol de decisiones sobre peligros significativos.",
  },
  {
    id: 8,
    short: "Límites",
    title: "Límites críticos",
    description: "Codex Principio 3 — límites medibles, validados y operacionales más estrictos.",
    banner: "NCh 2861 / Codex P3 — el límite crítico es el valor que no puede superarse.",
  },
  {
    id: 9,
    short: "Monitoreo",
    title: "Sistema de monitoreo",
    description: "Codex Principio 4 — QUÉ, CÓMO, CUÁNDO y QUIÉN para cada PCC.",
    banner: "NCh 2861 / Codex P4 — el monitoreo debe detectar la pérdida de control a tiempo.",
  },
  {
    id: 10,
    short: "Acciones",
    title: "Acciones correctivas",
    description: "Codex Principio 5 — disposición del producto y corrección de la causa.",
    banner: "NCh 2861 / Codex P5 — si se pierde el control, el producto no avanza sin disposición.",
  },
  {
    id: 11,
    short: "Verificación",
    title: "Verificación",
    description: "Codex Principio 6 — calibración, muestreos, revisión de registros y auditorías.",
    banner: "NCh 2861 / Codex P6 — la verificación confirma que el plan funciona en la planta.",
  },
  {
    id: 12,
    short: "Docs",
    title: "Documentación",
    description: "Codex Principio 7 — manual, control de versiones y disponibilidad para la autoridad.",
  },
];

export const INITIAL_PRODUCT_SPECS: ProductSpec[] = [
  { label: "Nombre del Producto", value: "" },
  { label: "Ingredientes", value: "" },
  { label: "Características Físico-Químicas", value: "" },
  { label: "Tratamiento", value: "" },
  { label: "Empaque", value: "" },
  { label: "Vida Útil (Art. 107 DS 977)", value: "" },
  { label: "Condiciones de Almacenamiento", value: "" },
  { label: "Instrucciones de Uso", value: "" },
];

export const DEFAULT_CONSUMER_GROUPS: ConsumerGroups = {
  general: true,
  infants: false,
  children: false,
  pregnant: false,
  elderly: false,
  immunocompromised: false,
};

export const YOPI_GROUPS: { key: keyof ConsumerGroups; label: string }[] = [
  { key: "general", label: "Público general" },
  { key: "infants", label: "Lactantes / niños pequeños" },
  { key: "elderly", label: "Tercera edad" },
  { key: "immunocompromised", label: "Inmunosuprimidos" },
];

export const HAZARD_CATALOG: Record<Exclude<HazardType, "allergen">, string[]> = {
  biological: [
    "Salmonella spp.",
    "Listeria monocytogenes",
    "Escherichia coli",
    "Staphylococcus aureus",
    "Clostridium botulinum",
    "Mohos y Levaduras",
    "Virus (Norovirus, Hepatitis A)",
  ],
  chemical: [
    "Residuos de pesticidas",
    "Residuos de productos de limpieza",
    "Alérgenos no declarados",
    "Metales pesados",
    "Micotoxinas",
    "Aditivos en exceso",
    "Migración de envases",
  ],
  physical: [
    "Fragmentos de metal",
    "Fragmentos de vidrio / plástico duro",
    "Piedras / Tierra",
    "Madera / Astillas",
    "Plagas (insectos, roedores)",
    "Objetos personales (joyas, botones)",
  ],
};

export const CRITICAL_LIMIT_PARAMETERS = [
  "Temperatura (°C)",
  "Tiempo (min)",
  "pH",
  "Aw",
  "Concentración de cloro (ppm)",
  "Presión (bar)",
  "Humedad (%)",
  "Detección de metales",
  "Inspección visual",
  "Otro",
] as const;

export const MONITORING_FREQUENCIES = [
  "Continuo",
  "Cada lote",
  "Cada hora",
  "Cada 2 horas",
  "Cada 4 horas",
  "Cada turno",
  "Diario",
  "Semanal",
  "Por partida",
  "Otro",
] as const;

export const PRODUCT_DISPOSITIONS = [
  "Retener y evaluar",
  "Reprocesar",
  "Rechazar/Destruir",
  "Desviar a otro uso",
  "Liberar con condiciones",
  "Otro",
] as const;

export const VERIFICATION_CATEGORIES: {
  value: VerificationCategory;
  label: string;
  placeholder: string;
}[] = [
  {
    value: "calibration",
    label: "Calibración de Instrumentos",
    placeholder: "Calibración del termómetro de cocción frente a patrón certificado",
  },
  {
    value: "sampling",
    label: "Muestreo Microbiológico/Analítico",
    placeholder: "Muestreo de Listeria en zonas de RTE, 5 puntos por línea",
  },
  {
    value: "records_review",
    label: "Revisión de Registros PCC",
    placeholder: "Revisión semanal de planillas de CCP-01 por Jefe de Calidad",
  },
  {
    value: "internal_audit",
    label: "Auditoría Interna HACCP",
    placeholder: "Auditoría interna del plan HACCP según programa anual",
  },
  {
    value: "validation",
    label: "Validación del Plan HACCP",
    placeholder: "Revalidación del tratamiento térmico 72°C / 15 s",
  },
  {
    value: "supplier",
    label: "Verificación de Proveedores",
    placeholder: "Revisión de certificados de análisis de materia prima crítica",
  },
  {
    value: "other",
    label: "Otra",
    placeholder: "Describe la actividad de verificación",
  },
];

export const VERIFICATION_FREQUENCIES = [
  "Diario",
  "Semanal",
  "Quincenal",
  "Mensual",
  "Trimestral",
  "Semestral",
  "Anual",
  "Por lote",
  "Según necesidad",
  "Otro",
] as const;

export const CODEX_QUESTIONS = [
  {
    key: "q1" as const,
    text: "¿Existen medidas de control para el peligro?",
    yesHint: "Hay una medida aplicable. Sigue a la pregunta 2.",
    noHint: "Sin control en este paso, no puede ser PCC.",
  },
  {
    key: "q2" as const,
    text: "¿El paso está específicamente diseñado para eliminar o reducir el peligro a un nivel aceptable?",
    yesHint: "Este paso está diseñado para controlar el peligro. Es un PCC.",
    noHint: "El control no es específico de este paso. Sigue a la pregunta 3.",
  },
  {
    key: "q3" as const,
    text: "¿Podría ocurrir contaminación con el peligro en exceso de niveles aceptables o aumentar a niveles inaceptables?",
    yesHint: "El peligro puede aparecer o aumentar aquí. Sigue a la pregunta 4.",
    noHint: "El peligro no se introduce ni aumenta en este paso. No es PCC.",
  },
  {
    key: "q4" as const,
    text: "¿Un paso posterior eliminará el peligro o lo reducirá a un nivel aceptable?",
    yesHint: "Un paso más adelante lo controla. No es PCC aquí.",
    noHint: "No hay un control posterior. Este paso es un PCC.",
  },
] as const;

export const EVIDENCE_ACCEPT = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const EVIDENCE_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"];

export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

export const LOCAL_BACKUP_KEY = "haccp_steps_data";
