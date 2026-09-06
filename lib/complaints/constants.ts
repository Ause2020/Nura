import type {
  ComplaintChannel,
  ComplaintSeverity,
  ComplaintStatus,
  ComplaintType,
  RootCauseCategory,
} from "@/types/database";
import {
  Mail,
  MessageSquare,
  Phone,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";

export const COMPLAINT_CHANNELS: {
  value: ComplaintChannel;
  label: string;
  icon: LucideIcon;
}[] = [
  { value: "email", label: "Email", icon: Mail },
  { value: "phone", label: "Teléfono", icon: Phone },
  { value: "in_person", label: "Presencial", icon: Users },
  { value: "social_media", label: "Redes sociales", icon: MessageSquare },
  { value: "distributor", label: "Distribuidor", icon: Store },
  { value: "other", label: "Otro", icon: MessageSquare },
];

export const COMPLAINT_TYPES: {
  value: ComplaintType;
  label: string;
  description: string;
}[] = [
  {
    value: "foreign_body",
    label: "Cuerpo extraño",
    description: "Material ajeno al producto",
  },
  {
    value: "deterioration",
    label: "Deterioro",
    description: "Producto en mal estado antes del vencimiento",
  },
  {
    value: "labeling",
    label: "Etiquetado",
    description: "Error en información del empaque",
  },
  {
    value: "taste_odor",
    label: "Sabor / Olor",
    description: "Características organolépticas alteradas",
  },
  {
    value: "allergen",
    label: "Alérgeno",
    description: "Presencia no declarada de alérgeno",
  },
  {
    value: "packaging",
    label: "Empaque",
    description: "Defecto en el envase o embalaje",
  },
  {
    value: "quantity",
    label: "Cantidad",
    description: "Peso o volumen incorrecto",
  },
  {
    value: "service",
    label: "Servicio",
    description: "Atención o entrega al cliente",
  },
  { value: "other", label: "Otro", description: "Otro tipo de reclamo" },
];

export const COMPLAINT_SEVERITIES: {
  value: ComplaintSeverity;
  label: string;
  description: string;
}[] = [
  {
    value: "safety_critical",
    label: "Seguridad crítica",
    description: "Riesgo de daño al consumidor",
  },
  {
    value: "quality",
    label: "Calidad",
    description: "Desviación de especificación sin riesgo",
  },
  {
    value: "labeling",
    label: "Etiquetado",
    description: "Información incorrecta o incompleta",
  },
  {
    value: "cosmetic",
    label: "Cosmético",
    description: "Apariencia sin afectar inocuidad",
  },
];

export const COMPLAINT_STATUSES: { value: ComplaintStatus; label: string }[] = [
  { value: "open", label: "Abierto" },
  { value: "investigating", label: "En investigación" },
  { value: "responded", label: "Respondido" },
  { value: "closed", label: "Cerrado" },
];

export const ROOT_CAUSE_CATEGORIES: {
  value: RootCauseCategory;
  label: string;
}[] = [
  { value: "machine", label: "Máquina" },
  { value: "method", label: "Método" },
  { value: "material", label: "Material" },
  { value: "manpower", label: "Mano de obra" },
  { value: "environment", label: "Medio ambiente" },
  { value: "measurement", label: "Medición" },
];

export const RESPONSE_TEMPLATES: Record<
  "safety" | "quality" | "labeling",
  string
> = {
  safety: `Estimado/a {nombre_cliente},

Recibimos su reclamo relacionado con {producto} (lote {lote}) con fecha {fecha}. Lamentamos profundamente el incidente y lo tratamos con máxima prioridad.

Acciones inmediatas:
- Retención y aislamiento del lote afectado
- Investigación de causa raíz en curso
- Notificación a las áreas de calidad e inocuidad

Le mantendremos informado sobre el avance de la investigación y las medidas correctivas adoptadas.

Atentamente,
Equipo de Calidad`,

  quality: `Estimado/a {nombre_cliente},

Gracias por contactarnos respecto a {producto} (lote {lote}), recibido el {fecha}.

Tras revisar su reclamo, identificamos una desviación de especificación. Compartimos los hallazgos técnicos de la investigación y las acciones correctivas implementadas para evitar recurrencia.

Quedamos atentos a cualquier consulta adicional.

Atentamente,
Equipo de Calidad`,

  labeling: `Estimado/a {nombre_cliente},

Confirmamos la recepción de su reclamo sobre etiquetado de {producto} (lote {lote}) del {fecha}.

Hemos verificado la información del empaque y activado acciones correctivas en el proceso de etiquetado y liberación. Adjuntamos el detalle de la corrección aplicada.

Agradecemos su reporte, fundamental para mejorar nuestro sistema.

Atentamente,
Equipo de Calidad`,
};

export function getChannelLabel(v: ComplaintChannel): string {
  return COMPLAINT_CHANNELS.find((c) => c.value === v)?.label ?? v;
}

export function getComplaintTypeLabel(v: ComplaintType): string {
  return COMPLAINT_TYPES.find((t) => t.value === v)?.label ?? v;
}

export function getSeverityLabel(v: ComplaintSeverity): string {
  return COMPLAINT_SEVERITIES.find((s) => s.value === v)?.label ?? v;
}

export function getStatusLabel(v: ComplaintStatus): string {
  return COMPLAINT_STATUSES.find((s) => s.value === v)?.label ?? v;
}

export function getRootCauseCategoryLabel(v: RootCauseCategory): string {
  return ROOT_CAUSE_CATEGORIES.find((c) => c.value === v)?.label ?? v;
}

export function severityBadgeVariant(
  severity: ComplaintSeverity
): "danger" | "warning" | "neutral" {
  if (severity === "safety_critical") return "danger";
  if (severity === "quality" || severity === "labeling") return "warning";
  return "neutral";
}

export function statusBadgeVariant(
  status: ComplaintStatus
): "success" | "warning" | "danger" | "neutral" {
  if (status === "closed") return "success";
  if (status === "investigating") return "warning";
  if (status === "responded") return "neutral";
  return "danger";
}

export function templateKeyForComplaint(
  type: ComplaintType,
  severity: ComplaintSeverity
): "safety" | "quality" | "labeling" {
  if (severity === "safety_critical" || type === "allergen" || type === "foreign_body") {
    return "safety";
  }
  if (type === "labeling") return "labeling";
  return "quality";
}

export function fillTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, value);
  }
  return out;
}
