export const STEP_CHECKLISTS: Record<number, string[]> = {
  1: [
    "Líder del equipo HACCP designado",
    "Equipo multidisciplinario (Calidad, Producción, Mantención)",
    "Cargo y responsabilidad documentados",
    "Capacitación en HACCP del equipo",
  ],
  2: [
    "Composición e ingredientes descritos",
    "Características físico-químicas (pH, Aw)",
    "Empaque y vida útil definidos",
    "Almacenamiento y distribución descritos",
  ],
  3: [
    "Uso esperado documentado",
    "Cocción previa vs RTE identificado",
    "Grupos vulnerables (YOPI) evaluados",
    "Alérgenos considerados si aplica",
  ],
  4: [
    "Todas las etapas de recepción a despacho",
    "Reproceso / reciclaje representados",
    "Entradas de agua / aire / vapor",
    "Etapas con alérgenos identificadas",
  ],
  5: [
    "Recorrer la línea con el diagrama",
    "Verificar en distintos turnos",
    "Corregir desviaciones encontradas",
    "Firmar el acta de validación",
  ],
  6: [
    "Peligros biológicos, químicos y físicos listados",
    "Probabilidad × severidad aplicada",
    "Significancia justificada",
    "Medidas preventivas para significativos",
  ],
  7: [
    "Árbol de decisiones aplicado a significativos",
    "PCC vs PRP diferenciados",
    "Justificación de cada decisión",
    "PCC numerados",
  ],
  8: [
    "Límites críticos medibles",
    "Validados con bibliografía / normativa",
    "Medibles en tiempo real",
    "Límites operacionales más estrictos",
  ],
  9: [
    "QUÉ / CÓMO / CUÁNDO / QUIÉN definidos",
    "Planillas de registro identificadas",
    "Frecuencia de monitoreo definida",
    "Monitores capacitados",
  ],
  10: [
    "Disposición del producto definida",
    "Corrección de la causa",
    "Responsable asignado",
    "Registrar y cerrar la desviación",
  ],
  11: [
    "Calibración de instrumentos",
    "Muestreos microbiológicos / analíticos",
    "Revisión de registros PCC",
    "Auditorías internas HACCP",
  ],
  12: [
    "Manual HACCP completo",
    "Control de versiones activo",
    "Retención de registros definida",
    "Disponible para la autoridad sanitaria",
  ],
};

export function isStepComplete(
  stepId: number,
  progress: Record<string, Record<string, boolean>> | undefined
): boolean {
  const items = STEP_CHECKLISTS[stepId] ?? [];
  const step = progress?.[String(stepId)] ?? {};
  return items.length > 0 && items.every((_, index) => step[String(index)] === true);
}

export function stepChecklistStats(
  stepId: number,
  progress: Record<string, Record<string, boolean>> | undefined
) {
  const items = STEP_CHECKLISTS[stepId] ?? [];
  const step = progress?.[String(stepId)] ?? {};
  const done = items.filter((_, index) => step[String(index)] === true).length;
  return { done, total: items.length };
}

export function countCompletedSteps(
  progress: Record<string, Record<string, boolean>> | undefined
): number {
  return Object.keys(STEP_CHECKLISTS).filter((id) =>
    isStepComplete(Number(id), progress)
  ).length;
}
