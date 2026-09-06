import type { HazardType, Probability, ProcessStepType, Severity } from "@/types/database";

export interface HazardSuggestion {
  step_type: ProcessStepType;
  hazard_type: HazardType;
  description: string;
  source: string;
  control_measures: string;
}

export const HAZARDS_LIBRARY: HazardSuggestion[] = [
  // RECEPCIÓN
  { step_type: "reception", hazard_type: "biological", description: "Contaminación con Salmonella en materia prima", source: "Proveedor / transporte", control_measures: "Certificado de análisis, temperatura de recepción, inspección visual" },
  { step_type: "reception", hazard_type: "biological", description: "Contaminación con E. coli en carnes crudas", source: "Materia prima", control_measures: "Proveedor aprobado, cadena de frío, muestreo microbiológico" },
  { step_type: "reception", hazard_type: "biological", description: "Contaminación con Listeria monocytogenes", source: "Ingredientes refrigerados", control_measures: "Control de temperatura ≤4°C, certificados del proveedor" },
  { step_type: "reception", hazard_type: "chemical", description: "Residuos de plaguicidas en frutas y vegetales", source: "Agricultura convencional", control_measures: "Certificado de libre de plaguicidas, proveedor certificado" },
  { step_type: "reception", hazard_type: "chemical", description: "Contaminación por lubricantes del transporte", source: "Vehículo de transporte", control_measures: "Inspección de vehículos, separación de químicos y alimentos" },
  { step_type: "reception", hazard_type: "physical", description: "Presencia de plásticos o materiales extraños del empaque", source: "Empaque del proveedor", control_measures: "Inspección visual, rechazo de lotes con empaque dañado" },
  { step_type: "reception", hazard_type: "physical", description: "Presencia de metales en materia prima", source: "Proceso del proveedor", control_measures: "Detector de metales en recepción, proveedor con control metal" },
  { step_type: "reception", hazard_type: "allergen", description: "Contaminación cruzada con alérgenos no declarados", source: "Transporte compartido", control_measures: "Verificar declaración de alérgenos, transporte dedicado" },

  // ALMACENAMIENTO
  { step_type: "storage", hazard_type: "biological", description: "Multiplicación de microorganismos por temperatura inadecuada", source: "Falla de refrigeración", control_measures: "Monitoreo continuo de temperatura, alarmas, mantenimiento preventivo" },
  { step_type: "storage", hazard_type: "biological", description: "Contaminación por moho en ambientes húmedos", source: "Condiciones de almacenamiento", control_measures: "Control de humedad <65%, rotación FIFO, inspección periódica" },
  { step_type: "storage", hazard_type: "chemical", description: "Contaminación química por almacenamiento conjunto", source: "Químicos de limpieza cercanos", control_measures: "Almacenamiento segregado, señalización, capacitación" },
  { step_type: "storage", hazard_type: "physical", description: "Infestación de roedores o insectos", source: "Plagas", control_measures: "Programa de control de plagas, trampas, inspección diaria" },
  { step_type: "storage", hazard_type: "allergen", description: "Contaminación cruzada de alérgenos en almacén", source: "Almacenamiento mixto", control_measures: "Zonas dedicadas por alérgeno, etiquetado claro, limpieza verificada" },

  // PROCESADO
  { step_type: "processing", hazard_type: "biological", description: "Contaminación cruzada de crudo a cocido", source: "Equipos y utensilios compartidos", control_measures: "Separación de flujos crudo/cocido, sanitización entre lotes" },
  { step_type: "processing", hazard_type: "biological", description: "Contaminación por manipuladores", source: "Personal", control_measures: "Higiene de manos, guantes, capacitación en BPM" },
  { step_type: "processing", hazard_type: "chemical", description: "Contaminación por desinfectante mal enjuagado", source: "Limpieza de equipos", control_measures: "Procedimiento CIP validado, enjuague verificado, concentraciones controladas" },
  { step_type: "processing", hazard_type: "physical", description: "Fragmentos de equipo en el producto", source: "Desgaste de maquinaria", control_measures: "Mantenimiento preventivo, inspección pre-operacional, detector de metales" },
  { step_type: "processing", hazard_type: "allergen", description: "Contaminación cruzada durante cambio de producto", source: "Línea compartida", control_measures: "Limpieza validada entre productos, secuenciación de producción" },

  // COCCIÓN
  { step_type: "cooking", hazard_type: "biological", description: "Supervivencia de patógenos por temperatura insuficiente", source: "Proceso de cocción", control_measures: "Temperatura mínima interna verificada, registro continuo" },
  { step_type: "cooking", hazard_type: "biological", description: "Supervivencia de Listeria monocytogenes por temperatura insuficiente", source: "Cocción incompleta", control_measures: "Temperatura interna ≥74°C, verificación con termómetro calibrado" },
  { step_type: "cooking", hazard_type: "biological", description: "Supervivencia de Salmonella en aves", source: "Tiempo/temperatura inadecuados", control_measures: "≥74°C por 15 segundos mínimo, registro de temperatura" },
  { step_type: "cooking", hazard_type: "chemical", description: "Formación de compuestos por sobrecocción", source: "Temperatura excesiva prolongada", control_measures: "Control de tiempo máximo de cocción, capacitación operadores" },
  { step_type: "cooking", hazard_type: "physical", description: "Presencia de termómetro roto en producto", source: "Equipo de medición", control_measures: "Termómetros de un solo uso o verificación de integridad" },

  // ENFRIAMIENTO
  { step_type: "cooling", hazard_type: "biological", description: "Multiplicación en zona de peligro (5-60°C)", source: "Enfriamiento lento", control_measures: "Enfriamiento rápido ≤2h de 60°C a 21°C, registro de temperatura" },
  { step_type: "cooling", hazard_type: "biological", description: "Crecimiento de Clostridium perfringens", source: "Enfriamiento prolongado", control_measures: "Tiempo máximo en zona de peligro, monitoreo continuo" },
  { step_type: "cooling", hazard_type: "biological", description: "Recontaminación post-cocción", source: "Contacto con superficies no sanitizadas", control_measures: "Enfriamiento en área segregada, utensilios dedicados" },
  { step_type: "cooling", hazard_type: "physical", description: "Contaminación por condensación de equipos", source: "Equipos de frío", control_measures: "Mantenimiento de evaporadores, diseño inclinado de superficies" },

  // EMPAQUE
  { step_type: "packaging", hazard_type: "biological", description: "Contaminación por material de empaque no sanitario", source: "Empaque", control_measures: "Proveedor aprobado de empaque, almacenamiento protegido" },
  { step_type: "packaging", hazard_type: "biological", description: "Recontaminación en línea de envasado", source: "Ambiente de empaque", control_measures: "Presión positiva, filtros HEPA, higiene del personal" },
  { step_type: "packaging", hazard_type: "chemical", description: "Migración de tinta del empaque al alimento", source: "Material de empaque", control_measures: "Empaque grado alimentario certificado, proveedor aprobado" },
  { step_type: "packaging", hazard_type: "physical", description: "Fragmentos de selladora en el producto", source: "Equipo de sellado", control_measures: "Mantenimiento preventivo, inspección visual del sello" },
  { step_type: "packaging", hazard_type: "allergen", description: "Etiquetado incorrecto de alérgenos", source: "Error de envasado", control_measures: "Verificación de etiqueta vs. formulación, detector de etiquetas" },

  // DESPACHO
  { step_type: "dispatch", hazard_type: "biological", description: "Ruptura de cadena de frío en despacho", source: "Transporte", control_measures: "Temperatura de camión verificada, registros de despacho" },
  { step_type: "dispatch", hazard_type: "biological", description: "Producto fuera de vida útil despachado", source: "Control de lotes", control_measures: "Sistema FEFO/FIFO, verificación de fecha antes de despacho" },
  { step_type: "dispatch", hazard_type: "chemical", description: "Contaminación por combustibles del vehículo", source: "Transporte", control_measures: "Vehículos dedicados, separación de carga química" },
  { step_type: "dispatch", hazard_type: "physical", description: "Daño físico del empaque durante transporte", source: "Manipulación", control_measures: "Estiba adecuada, pallets en buen estado, capacitación" },

  // OTRO
  { step_type: "other", hazard_type: "biological", description: "Contaminación ambiental general", source: "Ambiente de planta", control_measures: "Programa de higiene ambiental, muestreo de superficies" },
  { step_type: "other", hazard_type: "chemical", description: "Contaminación por agua no potable", source: "Sistema de agua", control_measures: "Análisis periódico de agua, cloración verificada" },
  { step_type: "other", hazard_type: "physical", description: "Contaminación por vidrio roto", source: "Instalaciones", control_measures: "Política de vidrio, registro de roturas, inspección" },
  { step_type: "other", hazard_type: "allergen", description: "Exposición no controlada a alérgenos", source: "Múltiples fuentes", control_measures: "Programa de gestión de alérgenos, capacitación" },
  { step_type: "storage", hazard_type: "biological", description: "Contaminación por condensación en cámaras frías", source: "Infraestructura", control_measures: "Mantenimiento de cámaras, drenajes funcionales" },
  { step_type: "processing", hazard_type: "biological", description: "Biofilm en equipos de difícil limpieza", source: "Equipos", control_measures: "Desmontaje periódico, validación de limpieza, CIP" },
  { step_type: "reception", hazard_type: "biological", description: "Contaminación por aves en área de recepción", source: "Fauna", control_measures: "Control de acceso, mallas, programa de plagas" },
  { step_type: "cooking", hazard_type: "biological", description: "Contaminación por Cronobacter en productos lácteos", source: "Ingredientes / ambiente", control_measures: "Pasteurización validada, ambiente controlado" },
  { step_type: "packaging", hazard_type: "chemical", description: "Contaminación por lubricante de la línea", source: "Maquinaria", control_measures: "Lubricantes grado alimentario, mantenimiento controlado" },
  { step_type: "cooling", hazard_type: "chemical", description: "Contaminación por refrigerante en túneles de frío", source: "Equipos de refrigeración", control_measures: "Mantenimiento preventivo, detectores de fugas" },
];

export function getHazardSuggestions(
  stepType: ProcessStepType,
  hazardType?: HazardType
): HazardSuggestion[] {
  return HAZARDS_LIBRARY.filter(
    (h) =>
      h.step_type === stepType &&
      (!hazardType || h.hazard_type === hazardType)
  );
}
