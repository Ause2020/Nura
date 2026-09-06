import type { AuditStandard } from "@/types/database";

export interface AuditCatalogItem {
  section: string;
  requirement: string;
  reference: string;
}

export type AuditCatalogCategory = "norma" | "operativa";

export interface AuditCatalogTemplate {
  key: string;
  name: string;
  description: string;
  standard: AuditStandard;
  category: AuditCatalogCategory;
  items: AuditCatalogItem[];
}

const HACCP_CODEX: AuditCatalogItem[] = [
  { section: "Equipo HACCP", requirement: "Existe un equipo multidisciplinario de HACCP identificado, con roles y evidencia de capacitación", reference: "Codex P1" },
  { section: "Equipo HACCP", requirement: "El equipo tiene autoridad para definir controles y detener el proceso si hay riesgo para la inocuidad", reference: "Codex P1" },
  { section: "Producto", requirement: "La descripción del producto incluye composición, envase, vida útil y condiciones de almacenamiento", reference: "Codex P2" },
  { section: "Producto", requirement: "Uso previsto, población objetivo y consumidores vulnerables están documentados", reference: "Codex P2" },
  { section: "Proceso", requirement: "El diagrama de flujo está actualizado y fue validado in situ contra el proceso real", reference: "Codex P3" },
  { section: "Proceso", requirement: "El diagrama cubre recepción, almacenamiento, proceso, empaque y despacho, incluidos reprocesos", reference: "Codex P3" },
  { section: "Análisis de peligros", requirement: "Hay análisis de peligros por etapa, con peligros biológicos, químicos, físicos y alérgenos", reference: "Codex P1" },
  { section: "Análisis de peligros", requirement: "La significancia de cada peligro está justificada (severidad × probabilidad) y documentada", reference: "Codex P1" },
  { section: "PCC", requirement: "Los PCC están identificados con árbol de decisiones o método equivalente documentado", reference: "Codex P2" },
  { section: "PCC", requirement: "Cada PCC tiene límite(s) crítico(s) validados con evidencia científica o ensayos", reference: "Codex P3" },
  { section: "Monitoreo", requirement: "El monitoreo de cada PCC define qué, cómo, cuándo, quién y el registro a completar", reference: "Codex P4" },
  { section: "Monitoreo", requirement: "Los registros de monitoreo están completos, legibles, firmados y disponibles en planta", reference: "Codex P4" },
  { section: "Acciones correctivas", requirement: "Hay acciones correctivas definidas para cada desviación de límite crítico", reference: "Codex P5" },
  { section: "Acciones correctivas", requirement: "Se evalúa y dispone el producto afectado; el cierre queda registrado", reference: "Codex P5" },
  { section: "Verificación", requirement: "Hay un plan de verificación (calibración, revisión de registros, auditorías, ensayos)", reference: "Codex P6" },
  { section: "Verificación", requirement: "El plan HACCP tiene validación inicial y revisión periódica documentada", reference: "Codex P6" },
  { section: "Documentación", requirement: "El plan, procedimientos y registros HACCP están controlados y accesibles", reference: "Codex P7" },
  { section: "Documentación", requirement: "Hay procedimiento para actualizar el plan ante cambios de proceso, producto o legislación", reference: "Codex P7" },
  { section: "PRP", requirement: "Los programas prerrequisito (higiene, limpieza, plagas, mantenimiento) están implementados", reference: "Codex GHP" },
  { section: "PRP", requirement: "El personal que opera PCC y PRP está capacitado y se evalúa la eficacia de la formación", reference: "Codex GHP" },
];

const ISO_22000: AuditCatalogItem[] = [
  { section: "4. Contexto", requirement: "La organización determinó cuestiones internas y externas que afectan el SGIA", reference: "4.1" },
  { section: "4. Contexto", requirement: "Partes interesadas y sus requisitos de inocuidad están identificados y revisados", reference: "4.2" },
  { section: "4. Contexto", requirement: "El alcance del SGIA está documentado (productos, procesos y sitios)", reference: "4.3" },
  { section: "5. Liderazgo", requirement: "La alta dirección demuestra liderazgo y provee recursos para el SGIA", reference: "5.1" },
  { section: "5. Liderazgo", requirement: "La política de inocuidad está aprobada, comunicada y es comprensible en planta", reference: "5.2" },
  { section: "5. Liderazgo", requirement: "Roles, responsabilidades y autoridades de inocuidad están asignados por escrito", reference: "5.3" },
  { section: "6. Planificación", requirement: "Riesgos y oportunidades del SGIA tienen acciones planificadas y seguimiento", reference: "6.1" },
  { section: "6. Planificación", requirement: "Hay objetivos de inocuidad medibles, responsables y fechas de revisión", reference: "6.2" },
  { section: "7. Soporte", requirement: "Infraestructura, ambiente de trabajo y recursos de seguimiento son adecuados", reference: "7.1" },
  { section: "7. Soporte", requirement: "La competencia del personal se verifica con registros de formación y evaluación", reference: "7.2" },
  { section: "7. Soporte", requirement: "La información documentada se controla (aprobación, versión, distribución, retiro)", reference: "7.5" },
  { section: "8. Operación", requirement: "Los PRP están implementados, monitorizados y actualizados", reference: "8.2" },
  { section: "8. Operación", requirement: "El sistema de trazabilidad permite rastrear una etapa adelante y una atrás", reference: "8.3" },
  { section: "8. Operación", requirement: "Hay preparación y respuesta ante emergencias de inocuidad", reference: "8.4" },
  { section: "8. Operación", requirement: "El plan de control de peligros (HACCP/OPRP) está implementado según Codex", reference: "8.5" },
  { section: "8. Operación", requirement: "El control de proveedores y materias primas incluye criterios de aprobación", reference: "8.2.4" },
  { section: "9. Evaluación", requirement: "Se analizan resultados de monitoreo, auditorías, NC y quejas", reference: "9.1" },
  { section: "9. Evaluación", requirement: "La auditoría interna del SGIA está programada, ejecutada e independiente", reference: "9.2" },
  { section: "9. Evaluación", requirement: "La revisión por la dirección tiene entradas, salidas y acciones de seguimiento", reference: "9.3" },
  { section: "10. Mejora", requirement: "Las no conformidades se corrigen y se analizan causas para evitar recurrencia", reference: "10.1" },
  { section: "10. Mejora", requirement: "Hay evidencia de mejora continua del SGIA", reference: "10.3" },
];

const FSSC_22000: AuditCatalogItem[] = [
  { section: "SGIA ISO 22000", requirement: "El SGIA cumple los requisitos de ISO 22000 aplicables al alcance certificado", reference: "ISO 22000" },
  { section: "PRP sectorial", requirement: "Se aplican los PRP de ISO/TS 22002-1 (o PRP sectorial) y están verificados", reference: "ISO/TS 22002-1" },
  { section: "Cultura de inocuidad", requirement: "Hay un plan de cultura de inocuidad con objetivos, comunicación y medición", reference: "FSSC 2.5.8" },
  { section: "Defensa alimentaria", requirement: "Existe evaluación de amenazas y plan de food defense implementado", reference: "FSSC 2.5.3" },
  { section: "Fraude alimentario", requirement: "Hay evaluación de vulnerabilidad (VACCP) y plan de mitigación de food fraud", reference: "FSSC 2.5.4" },
  { section: "Alérgenos", requirement: "El manejo de alérgenos cubre formulación, etiquetado, limpieza y contaminación cruzada", reference: "FSSC 2.5.6" },
  { section: "Monitoreo ambiental", requirement: "Hay programa de monitoreo ambiental (patógenos/indicadores) con tendencias", reference: "FSSC 2.5.7" },
  { section: "Formulación", requirement: "Los cambios de receta, etiqueta o envase se evalúan antes de producir", reference: "FSSC 2.5.1" },
  { section: "Etiquetado", requirement: "El arte de etiqueta coincide con la fórmula y los requisitos legales del mercado", reference: "FSSC 2.5.2" },
  { section: "Transporte", requirement: "Vehículos y contenedores se inspeccionan y se evitan contaminaciones cruzadas", reference: "FSSC 2.5.10" },
  { section: "Almacenamiento", requirement: "Almacenes de MP, empaque y PT mantienen FIFO/FEFO y separación de alérgenos", reference: "ISO/TS 22002-1" },
  { section: "Logo y certificado", requirement: "El uso del logo FSSC y las declaraciones de certificación cumplen las reglas del esquema", reference: "FSSC Part 2" },
  { section: "Gestión de servicios", requirement: "Servicios que afectan inocuidad (lavandería, químicos, laboratorio) están controlados", reference: "ISO/TS 22002-1" },
  { section: "Gestión de equipos", requirement: "Equipos en contacto con alimento son aptos para uso alimentario y se mantienen", reference: "ISO/TS 22002-1" },
  { section: "Verificación", requirement: "Auditoría interna cubre ISO 22000, PRP sectorial y requisitos adicionales FSSC", reference: "FSSC 2.5.12" },
  { section: "NC y CAPA", requirement: "Las NC de auditorías internas y de certificación tienen causa raíz y cierre eficaz", reference: "ISO 22000 10.1" },
];

const BRCGS: AuditCatalogItem[] = [
  { section: "1. Compromiso", requirement: "La alta dirección revisa el plan de inocuidad y asigna recursos suficientes", reference: "BRCGS 1" },
  { section: "1. Compromiso", requirement: "Hay política de calidad/inocuidad comunicada y objetivos medibles", reference: "BRCGS 1" },
  { section: "2. Plan de inocuidad", requirement: "El plan HACCP/estudio de peligros está completo, validado y alineado al Codex", reference: "BRCGS 2" },
  { section: "3. Sistema de gestión", requirement: "El sistema documental está controlado; los registros se retienen el tiempo legal", reference: "BRCGS 3" },
  { section: "3. Sistema de gestión", requirement: "Auditorías internas cubren todo el alcance en 12 meses, con auditores independientes", reference: "BRCGS 3.4" },
  { section: "3. Sistema de gestión", requirement: "Quejas, incidentes y retiros se investigan y generan acciones", reference: "BRCGS 3.7 / 3.11" },
  { section: "4. Estándares del sitio", requirement: "Edificio, layout y flujos evitan contaminación cruzada (personal, residuo, alérgenos)", reference: "BRCGS 4" },
  { section: "4. Estándares del sitio", requirement: "Programa de plagas con mapa, inspecciones y acciones ante actividad", reference: "BRCGS 4.14" },
  { section: "4. Estándares del sitio", requirement: "Limpieza y desinfección están validadas; hay verificación (visual, ATP o micro)", reference: "BRCGS 4.11" },
  { section: "4. Estándares del sitio", requirement: "Mantenimiento preventivo cubre equipos de proceso y no introduce riesgos", reference: "BRCGS 4.7" },
  { section: "5. Control de producto", requirement: "Especificaciones de MP, empaque y PT están vigentes y acordadas", reference: "BRCGS 5" },
  { section: "5. Control de producto", requirement: "El control de alérgenos incluye riesgo, limpieza y verificación de etiqueta", reference: "BRCGS 5.3" },
  { section: "5. Control de producto", requirement: "Hay control de cuerpo extraño (vidrio, plástico duro, metal) con registros", reference: "BRCGS 4.9 / 4.10" },
  { section: "6. Control de proceso", requirement: "Los controles de proceso y PCC se monitorean con evidencia en línea", reference: "BRCGS 6" },
  { section: "6. Control de proceso", requirement: "El pesaje, dosificación y control de cantidad cumplen la especificación", reference: "BRCGS 6.3" },
  { section: "7. Personal", requirement: "Indumentaria, higiene y salud del personal se controlan en ingreso a zonas", reference: "BRCGS 7" },
  { section: "7. Personal", requirement: "La capacitación cubre inocuidad, alérgenos y el puesto específico", reference: "BRCGS 7.1" },
  { section: "8. Zonas de alto riesgo", requirement: "Si aplica, las zonas high-risk/high-care tienen barreras, vestimenta y controles de ambiente", reference: "BRCGS 8" },
];

const FDA_FSMA: AuditCatalogItem[] = [
  { section: "PCQI", requirement: "Hay un PCQI calificado responsable del plan de controles preventivos", reference: "21 CFR 117.126" },
  { section: "PCQI", requirement: "Los registros de formación del PCQI están disponibles", reference: "117.126" },
  { section: "Análisis de peligros", requirement: "El análisis cubre cada tipo de alimento y peligros razonablemente previsibles", reference: "117.130" },
  { section: "Controles preventivos", requirement: "Hay controles de proceso para peligros significativos, con parámetros definidos", reference: "117.135" },
  { section: "Controles preventivos", requirement: "Los controles de alérgenos evitan contacto cruzado y errores de etiquetado", reference: "117.135(c)" },
  { section: "Controles preventivos", requirement: "Los controles de cadena de suministro cubren ingredientes recibidos de riesgo", reference: "117.135(d)" },
  { section: "Controles preventivos", requirement: "Los controles de saneamiento están implementados y verificados", reference: "117.135(e)" },
  { section: "Monitoreo", requirement: "Cada control preventivo tiene procedimiento, frecuencia y responsable de monitoreo", reference: "117.145" },
  { section: "Acciones correctivas", requirement: "Ante desviación se evalúa producto, se corrige la causa y se registra", reference: "117.150" },
  { section: "Verificación", requirement: "Calibración, revisión de registros y, si aplica, ensayos de verificación están al día", reference: "117.165" },
  { section: "Reanálisis", requirement: "El plan se reanaliza al menos cada 3 años o ante cambios significativos", reference: "117.170" },
  { section: "Registros", requirement: "Los registros de alimentos están completos y se retienen al menos 2 años", reference: "117.190" },
  { section: "cGMP", requirement: "Instalaciones, equipos y prácticas de personal cumplen cGMP aplicables", reference: "117 Subpart B" },
  { section: "cGMP", requirement: "Hay control de contaminación cruzada en flujo de personal, utensilios y producto", reference: "117.35" },
];

const BPM_GMP: AuditCatalogItem[] = [
  { section: "Instalaciones", requirement: "Pisos, paredes y techos son lavables, están íntegros y no acumulan suciedad", reference: "Codex GHP" },
  { section: "Instalaciones", requirement: "Iluminación, ventilación y desagües no contaminan el producto", reference: "Codex GHP" },
  { section: "Higiene del personal", requirement: "Lavado de manos, indumentaria y restricciones (joyas, comida) se cumplen en zona", reference: "Codex GHP" },
  { section: "Higiene del personal", requirement: "Hay control de salud y notificación de enfermedades transmisibles por alimentos", reference: "Codex GHP" },
  { section: "Limpieza", requirement: "Existe POE de limpieza por equipo/área, con químicos aprobados y diluciones", reference: "Codex GHP" },
  { section: "Limpieza", requirement: "Se verifica la limpieza (visual y, si aplica, ATP/micro) antes de iniciar", reference: "Codex GHP" },
  { section: "Plagas", requirement: "El programa de plagas tiene mapa, cebos asegurados y tendencia de capturas", reference: "Codex GHP" },
  { section: "Agua y hielo", requirement: "El agua de proceso es potable; hay análisis periódicos y diferenciación de redes", reference: "Codex GHP" },
  { section: "Residuos", requirement: "Residuos se retiran con frecuencia, en recipientes identificados, sin reflujo a proceso", reference: "Codex GHP" },
  { section: "Químicos", requirement: "Químicos de limpieza y mantenimiento están identificados, locked y con FDS", reference: "Codex GHP" },
  { section: "Mantenimiento", requirement: "Herramientas y lubricantes en zona de alimento son food-grade y se controlan", reference: "Codex GHP" },
  { section: "Recepción", requirement: "MP y empaque se inspeccionan al ingreso (temp, integridad, lote, alérgenos)", reference: "Codex GHP" },
  { section: "Almacenamiento", requirement: "MP, empaque y PT están separados, identificados y en condiciones de T/HR", reference: "Codex GHP" },
  { section: "Proceso", requirement: "Utensilios y superficies en contacto con alimento están limpios e íntegros", reference: "Codex GHP" },
  { section: "Empaque", requirement: "Material de empaque es apto para alimento y se protege de contaminación", reference: "Codex GHP" },
  { section: "Capacitación", requirement: "El personal conoce las BPM de su puesto y hay evidencia de inducción", reference: "Codex GHP" },
];

const PRP_22002: AuditCatalogItem[] = [
  { section: "Construcción", requirement: "El layout permite flujo higiénico y separación de zonas sucias/limpias", reference: "ISO/TS 22002-1 4" },
  { section: "Layout", requirement: "Hay control de acceso a zonas de producción y vestuarios adecuados", reference: "ISO/TS 22002-1 4" },
  { section: "Servicios", requirement: "Aire, vapor, gases y agua en contacto con alimento están especificados y controlados", reference: "ISO/TS 22002-1 6" },
  { section: "Residuos", requirement: "Contenedores de residuo están identificados y no se usan para producto", reference: "ISO/TS 22002-1 7" },
  { section: "Equipos", requirement: "Equipos son higiénicos, desmontables para limpieza y tienen plan de mantenimiento", reference: "ISO/TS 22002-1 8" },
  { section: "Compras", requirement: "Materiales y servicios que afectan inocuidad se compran a proveedores aprobados", reference: "ISO/TS 22002-1 9" },
  { section: "Medidas preventivas", requirement: "Hay controles de contaminación (física, química, biológica y alérgenos)", reference: "ISO/TS 22002-1 10" },
  { section: "Limpieza", requirement: "Programas de limpieza están validados para los suelos de suciedad reales", reference: "ISO/TS 22002-1 11" },
  { section: "Plagas", requirement: "El control de plagas es preventivo; no hay cebos tóxicos abiertos en zona de alimento", reference: "ISO/TS 22002-1 12" },
  { section: "Higiene personal", requirement: "Vestimenta, lavado, heridas y conducta en planta están definidos y se auditan", reference: "ISO/TS 22002-1 13" },
  { section: "Retrabajo", requirement: "El reproceso está identificado, autorizado y no introduce peligros nuevos", reference: "ISO/TS 22002-1 14" },
  { section: "Retiro", requirement: "Hay procedimiento de retiro/recall con contactos y criterios de activación", reference: "ISO/TS 22002-1 15" },
  { section: "Almacenamiento", requirement: "Almacenes protegen el producto de humedad, plagas, olores y mezcla de lotes", reference: "ISO/TS 22002-1 16" },
  { section: "Información del producto", requirement: "Etiquetas e información al cliente coinciden con la composición real", reference: "ISO/TS 22002-1 17" },
  { section: "Defensa", requirement: "Se controla el acceso de visitas y contratistas a zonas sensibles", reference: "ISO/TS 22002-1 18" },
];

const HIGIENE_PREOP: AuditCatalogItem[] = [
  { section: "Área", requirement: "Pisos, desagües y paredes están limpios, secos y sin charcos ni residuos", reference: "Preop" },
  { section: "Área", requirement: "No hay vidrio roto, plástico duro dañado ni madera astillada en zona", reference: "Preop" },
  { section: "Equipos", requirement: "Superficies de contacto están limpias al tacto/vista; sin biofilm ni resto de producto", reference: "Preop" },
  { section: "Equipos", requirement: "Protectores, bandas y utensilios están instalados y en buen estado", reference: "Preop" },
  { section: "Químicos", requirement: "No quedan restos de detergente/desinfectante; enjuague verificado", reference: "Preop" },
  { section: "Personal", requirement: "El equipo usa indumentaria completa, cabello cubierto y manos lavadas", reference: "Preop" },
  { section: "Personal", requirement: "No hay objetos personales, alimentos ni medicamentos en la línea", reference: "Preop" },
  { section: "Materiales", requirement: "MP y empaque del turno están identificados, aptos y sin daño de plaga", reference: "Preop" },
  { section: "Servicios", requirement: "Agua, vapor y frío del proceso están en rango antes de arrancar", reference: "Preop" },
  { section: "Documentación", requirement: "El checklist preoperativo está firmado por producción y verificado por calidad", reference: "Preop" },
  { section: "Liberación", requirement: "No se inicia producción si hay ítems críticos abiertos", reference: "Preop" },
];

const ALERGENOS: AuditCatalogItem[] = [
  { section: "Inventario", requirement: "Hay un inventario actualizado de alérgenos por receta, MP y sitio (lista legal del mercado)", reference: "Codex / FSSC 2.5.6" },
  { section: "Recepción", requirement: "Las MP alérgenas se identifican al ingreso y se almacenan separadas o en contención", reference: "BRCGS 5.3" },
  { section: "Formulación", requirement: "La receta y la etiqueta declaran los mismos alérgenos; hay control de cambios", reference: "FSMA 117.135" },
  { section: "Programación", requirement: "La secuencia de producción minimiza cambio de alérgeno a no alérgeno", reference: "GMP" },
  { section: "Línea", requirement: "Hay barreras o procedimientos contra contacto cruzado (utensilios, aire, personas)", reference: "Codex" },
  { section: "Limpieza", requirement: "La limpieza entre alérgenos está validada (visual + analítica si el riesgo lo exige)", reference: "BRCGS 5.3" },
  { section: "Etiquetado", requirement: "Hay verificación de etiqueta correcta al inicio, cambio de lote y fin de corrida", reference: "FSMA" },
  { section: "Retrabajo", requirement: "El reproceso con alérgenos está controlado y no se usa en fórmulas incompatibles", reference: "ISO/TS 22002-1" },
  { section: "Personal", requirement: "El personal conoce los alérgenos del sitio y las reglas de cambio de ropa/manos", reference: "Capacitación" },
  { section: "Proveedores", requirement: "Los proveedores declaran alérgenos y cambios de fórmula; se verifican COA", reference: "BRCGS 5.3" },
  { section: "Incidentes", requirement: "Hay procedimiento ante error de etiqueta o contacto cruzado (retención/retiro)", reference: "CAPA" },
];

const LIMPIEZA: AuditCatalogItem[] = [
  { section: "Programa", requirement: "Hay master sanitation schedule (diario, semanal, profundo) con responsables", reference: "SSOP" },
  { section: "POE", requirement: "Cada equipo/área tiene POE con pasos, tiempos, químicos y PPE", reference: "SSOP" },
  { section: "Químicos", requirement: "Detergentes y desinfectantes son aptos para alimento, con FDS y dilución verificada", reference: "Codex GHP" },
  { section: "Aplicación", requirement: "Se respeta el orden: seco → pre-enjuague → detergente → enjuague → desinfección", reference: "SSOP" },
  { section: "Validación", requirement: "Los POE críticos están validados (suelo de suciedad, geografía del equipo)", reference: "BRCGS 4.11" },
  { section: "Verificación", requirement: "Hay verificación rutinaria (visual, ATP, alérgeno o micro) con límites de acción", reference: "SSOP" },
  { section: "CIP", requirement: "Si hay CIP: tiempos, T, concentración y flujo se registran y están en especificación", reference: "ISO/TS 22002-1" },
  { section: "Utensilios", requirement: "Utensilios de limpieza están codificados por zona y no cruzan áreas sucias/limpias", reference: "GMP" },
  { section: "Almacenamiento", requirement: "Químicos y utensilios se guardan fuera de la línea, identificados", reference: "GMP" },
  { section: "Higiene ambiental", requirement: "Drenajes, techos y zonas altas tienen frecuencia de limpieza definida", reference: "SSOP" },
  { section: "Registros", requirement: "Los registros de limpieza están firmados y se revisan ante desviación", reference: "SSOP" },
];

const PLAGAS: AuditCatalogItem[] = [
  { section: "Contrato", requirement: "Hay prestador competente o personal interno capacitado, con seguro y licencias", reference: "Codex GHP" },
  { section: "Mapa", requirement: "El mapa de estaciones (roedores, insectos, luz UV) está actualizado y coincide con el sitio", reference: "BRCGS 4.14" },
  { section: "Inspección", requirement: "Hay inspecciones periódicas con hallazgos, tendencia y acciones", reference: "PRP" },
  { section: "Barreras", requirement: "Puertas, mallas, burletes y desagües impiden el ingreso de plagas", reference: "Codex GHP" },
  { section: "Cebos", requirement: "No hay rodenticida abierto en zonas de alimento; las estaciones están aseguradas", reference: "ISO/TS 22002-1 12" },
  { section: "Interior", requirement: "No hay evidencia de actividad (heces, gnawing, insectos vivos) en almacén o proceso", reference: "Inspección" },
  { section: "Exteriores", requirement: "Perímetro libre de maleza, agua estancada y acumulación de pallets/residuos", reference: "GMP" },
  { section: "Químicos", requirement: "Los biocidas usados están registrados y se aplican según etiqueta", reference: "Legal" },
  { section: "Producto", requirement: "Hay criterio de retención si se sospecha contaminación por plaga", reference: "CAPA" },
  { section: "Documentación", requirement: "Informes, SDS y tendencias están disponibles para la auditoría", reference: "PRP" },
];

const PROVEEDOR: AuditCatalogItem[] = [
  { section: "Aprobación", requirement: "El proveedor está aprobado según riesgo (cuestionario, certificado, auditoría o ensayo)", reference: "ISO 22000 8.2.4" },
  { section: "Alcance", requirement: "El alcance auditado (planta, productos, procesos) está definido y es el que se compra", reference: "GFSI" },
  { section: "SGIA", requirement: "El proveedor tiene HACCP/SGIA documentado y evidencia de verificación", reference: "Codex" },
  { section: "PRP", requirement: "Higiene, plagas, limpieza y mantenimiento se observan eficaces en sitio o por evidencias", reference: "GMP" },
  { section: "Alérgenos", requirement: "Declara alérgenos, cambios de fórmula y controles de contacto cruzado", reference: "BRCGS 5.3" },
  { section: "Trazabilidad", requirement: "Puede rastrear lotes de MP y PT; hay simulacro de retiro reciente", reference: "ISO 22000 8.3" },
  { section: "Especificaciones", requirement: "Hay especificación acordada y COA/ensayos que la respaldan", reference: "Calidad" },
  { section: "Transporte", requirement: "El despacho mantiene integridad, temperatura e higiene del vehículo", reference: "FSSC 2.5.10" },
  { section: "Incidentes", requirement: "Hay historial de NC, recalls y quejas; se evalúa la respuesta CAPA", reference: "CAPA" },
  { section: "Documentos", requirement: "Certificados, licencias sanitarias y análisis están vigentes", reference: "Legal" },
  { section: "Reevaluación", requirement: "Existe frecuencia de reevaluación según desempeño y riesgo", reference: "ISO 22000" },
];

const ALMACEN_FRIO: AuditCatalogItem[] = [
  { section: "Temperatura", requirement: "Cámaras y vehículos tienen setpoint, registro continuo y alarma ante desviación", reference: "Cadena de frío" },
  { section: "Temperatura", requirement: "Hay evidencia de calibración de sondas y termómetros de control", reference: "Metrología" },
  { section: "Recepción", requirement: "Se verifica T, integridad y lote al recibir; se rechaza o retiene lo fuera de rango", reference: "GMP" },
  { section: "Almacenamiento", requirement: "Producto no está en piso; hay separación de alérgenos, químicos y no conformes", reference: "Codex GHP" },
  { section: "Rotación", requirement: "Se aplica FIFO/FEFO; no hay vencidos ni lotes sin identificación", reference: "ISO/TS 22002-1 16" },
  { section: "Higiene", requirement: "Cámaras, condensados y pallets están limpios, sin hielo sucio ni olor", reference: "GMP" },
  { section: "Plagas", requirement: "Puertas cierran bien; no hay actividad de plagas en almacén", reference: "PRP" },
  { section: "Capacidad", requirement: "No hay sobrecarga que bloquee flujo de aire o pasillos de inspección", reference: "Buenas prácticas" },
  { section: "Despacho", requirement: "Se registra T de salida y condición del vehículo antes de cargar", reference: "FSSC 2.5.10" },
  { section: "Quiebre de frío", requirement: "Hay procedimiento ante desvío de T (evaluación, disposición, CAPA)", reference: "CAPA" },
  { section: "Trazabilidad", requirement: "Ubicación de lotes permite localizar producto en cámara de forma inmediata", reference: "ISO 22000 8.3" },
];

const TRAZABILIDAD: AuditCatalogItem[] = [
  { section: "Identificación", requirement: "Cada lote de MP, intermedio y PT tiene código único y fecha", reference: "ISO 22000 8.3" },
  { section: "Registros", requirement: "Se registra una etapa atrás (proveedor/lote) y una adelante (cliente/despacho)", reference: "Codex" },
  { section: "Proceso", requirement: "Los registros de proceso vinculan lote de MP con lote de PT y PCC del día", reference: "HACCP P7" },
  { section: "Empaque", requirement: "El lote impreso en empaque coincide con el registro de producción", reference: "Etiquetado" },
  { section: "Retrabajo", requirement: "El reproceso queda trazado al lote destino", reference: "ISO/TS 22002-1 14" },
  { section: "Simulacro", requirement: "Hay simulacro de retiro al menos anual, cronometrado y con informe de lecciones", reference: "BRCGS 3.11" },
  { section: "Simulacro", requirement: "El simulacro localiza ≥ el porcentaje objetivo del lote en el tiempo definido", reference: "Recall" },
  { section: "Contactos", requirement: "La lista de contactos (autoridad, clientes, equipo crisis) está vigente", reference: "Recall" },
  { section: "Disposición", requirement: "Producto retenido o retirado está identificado y no puede despacharse por error", reference: "ISO 22000 8.9" },
  { section: "FSMA 204", requirement: "Si aplica, los KDE/CTE críticos (recepción, transformación, despacho) están capturados", reference: "FSMA 204" },
];

const HIGIENE_PERSONAL: AuditCatalogItem[] = [
  { section: "Ingreso", requirement: "Hay control de ingreso (lavado, cofia, cubrebocas, calzado) según zona", reference: "Codex GHP" },
  { section: "Indumentaria", requirement: "La ropa de trabajo está limpia, completa y no se usa fuera de la planta", reference: "BRCGS 7" },
  { section: "Manos", requirement: "Lavamanos con agua, jabón, secado y, si aplica, desinfectante; se observa el método", reference: "GMP" },
  { section: "Joyas y objetos", requirement: "No se usan joyas, uñas postizas ni objetos sueltos en zona de producto", reference: "Codex GHP" },
  { section: "Salud", requirement: "Hay política de enfermedades, heridas cubiertas y retorno al puesto", reference: "Codex GHP" },
  { section: "Conducta", requirement: "No se come, bebe ni fuma en producción; celulares controlados si hay política", reference: "GMP" },
  { section: "Visitas", requirement: "Visitas y contratistas reciben inducción y usan la misma higiene que el personal", reference: "ISO/TS 22002-1 13" },
  { section: "Casilleros", requirement: "Ropa de calle y de trabajo están separadas; no hay alimento en casilleros de zona", reference: "GMP" },
  { section: "Capacitación", requirement: "Hay inducción y refuerzo de higiene con evaluación de comprensión", reference: "Capacitación" },
  { section: "Supervisión", requirement: "Se corrigen desvíos de higiene en el momento y se registran si son reiterados", reference: "Cultura" },
];

export const AUDIT_CATALOG: AuditCatalogTemplate[] = [
  {
    key: "haccp_codex",
    name: "HACCP Codex",
    description: "Los 7 principios y GHP para auditar el plan HACCP en planta.",
    standard: "haccp_codex",
    category: "norma",
    items: HACCP_CODEX,
  },
  {
    key: "iso22000",
    name: "ISO 22000:2018",
    description: "Sistema de gestión de inocuidad: contexto, operación, evaluación y mejora.",
    standard: "iso22000",
    category: "norma",
    items: ISO_22000,
  },
  {
    key: "fssc22000",
    name: "FSSC 22000",
    description: "ISO 22000 + PRP sectorial + requisitos adicionales (fraude, defensa, alérgenos, cultura).",
    standard: "fssc22000",
    category: "norma",
    items: FSSC_22000,
  },
  {
    key: "brc",
    name: "BRCGS Food Safety",
    description: "Compromiso, HACCP, sitio, producto, proceso y personal (enfoque Issue 9).",
    standard: "brc",
    category: "norma",
    items: BRCGS,
  },
  {
    key: "fda_fsma",
    name: "FDA FSMA (PCQI)",
    description: "Controles preventivos, cGMP y registros para plantas que exportan a EE. UU.",
    standard: "fda_fsma",
    category: "norma",
    items: FDA_FSMA,
  },
  {
    key: "bpm_gmp",
    name: "BPM / GMP (Codex GHP)",
    description: "Buenas prácticas de manufactura e higiene: la base diaria de inocuidad.",
    standard: "custom",
    category: "operativa",
    items: BPM_GMP,
  },
  {
    key: "prp_22002",
    name: "PRP ISO/TS 22002-1",
    description: "Prerrequisitos de manufactura de alimentos: layout, servicios, limpieza, plagas, retiro.",
    standard: "custom",
    category: "operativa",
    items: PRP_22002,
  },
  {
    key: "higiene_preop",
    name: "Higiene preoperativa",
    description: "Liberación de línea antes de arrancar: área, equipos, personal y materiales.",
    standard: "custom",
    category: "operativa",
    items: HIGIENE_PREOP,
  },
  {
    key: "alergenos",
    name: "Control de alérgenos",
    description: "Inventario, contacto cruzado, limpieza validada y verificación de etiqueta.",
    standard: "custom",
    category: "operativa",
    items: ALERGENOS,
  },
  {
    key: "limpieza",
    name: "Limpieza y sanitización",
    description: "POE, químicos, CIP, verificación ATP/micro y master sanitation.",
    standard: "custom",
    category: "operativa",
    items: LIMPIEZA,
  },
  {
    key: "plagas",
    name: "Control de plagas",
    description: "Barreras, mapa de estaciones, tendencias y criterios ante actividad.",
    standard: "custom",
    category: "operativa",
    items: PLAGAS,
  },
  {
    key: "proveedor",
    name: "Auditoría a proveedor",
    description: "Aprobación, SGIA del proveedor, especificaciones, transporte y reevaluación.",
    standard: "custom",
    category: "operativa",
    items: PROVEEDOR,
  },
  {
    key: "almacen_frio",
    name: "Almacén y cadena de frío",
    description: "Temperatura, FIFO/FEFO, higiene de cámaras y quiebre de frío.",
    standard: "custom",
    category: "operativa",
    items: ALMACEN_FRIO,
  },
  {
    key: "trazabilidad",
    name: "Trazabilidad y retiro",
    description: "Lotes, una atrás / una adelante, simulacro de recall y KDE si aplica.",
    standard: "custom",
    category: "operativa",
    items: TRAZABILIDAD,
  },
  {
    key: "higiene_personal",
    name: "Higiene del personal",
    description: "Ingreso, indumentaria, salud, visitas y cultura de higiene en planta.",
    standard: "custom",
    category: "operativa",
    items: HIGIENE_PERSONAL,
  },
];

const BY_KEY = new Map(AUDIT_CATALOG.map((t) => [t.key, t]));

export function getCatalogTemplate(key: string): AuditCatalogTemplate | undefined {
  return BY_KEY.get(key);
}

export function getCatalogChecklist(key: string): AuditCatalogItem[] {
  return BY_KEY.get(key)?.items ?? [];
}

export function getCatalogForStandard(standard: AuditStandard): AuditCatalogItem[] {
  const match = AUDIT_CATALOG.find((t) => t.standard === standard && t.key === standard);
  if (match) return match.items;
  const byStandard = AUDIT_CATALOG.find((t) => t.standard === standard);
  return byStandard?.items ?? HACCP_CODEX;
}

export function groupCatalogItems(items: AuditCatalogItem[]): Map<string, AuditCatalogItem[]> {
  const groups = new Map<string, AuditCatalogItem[]>();
  for (const item of items) {
    const list = groups.get(item.section) ?? [];
    list.push(item);
    groups.set(item.section, list);
  }
  return groups;
}

export function suggestedAuditTitle(catalogKey: string | null): string {
  const year = new Date().getFullYear();
  if (!catalogKey) return `Auditoría interna ${year}`;
  const template = getCatalogTemplate(catalogKey);
  return template ? `${template.name} ${year}` : `Auditoría interna ${year}`;
}
