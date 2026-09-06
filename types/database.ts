export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Industry =
  | "carnico"
  | "lacteo"
  | "panaderia"
  | "conservas"
  | "foodservice"
  | "otro";

export type EmployeesRange = "1-10" | "11-50" | "51-200" | "200+";

export type UserRole = "admin" | "quality_manager" | "operator";

export type AccessStatus = "pending" | "active" | "suspended" | "expired";

export type HaccpProductStatus = "draft" | "active" | "archived";

export type ProcessStepType =
  | "reception"
  | "storage"
  | "processing"
  | "cooking"
  | "cooling"
  | "packaging"
  | "dispatch"
  | "other";

export type HazardType = "biological" | "chemical" | "physical" | "allergen";

export type Severity = "low" | "medium" | "high" | "critical";

export type Probability = "low" | "medium" | "high";

export type CcpDetermination = "ccp" | "oprp" | "prp" | "not_significant";

export type PrpType =
  | "cleaning"
  | "pest_control"
  | "maintenance"
  | "hygiene"
  | "water"
  | "allergen"
  | "traceability"
  | "calibration"
  | "waste"
  | "other";

export type PrpFrequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "annual"
  | "asneeded";

export type PrpRecordStatus = "pending" | "completed" | "completed_with_findings";

export type PrpOverallResult = "pass" | "fail" | "partial";

export type PrpItemResult = "ok" | "nok" | "na" | "observation";

export type AuditType = "internal" | "external" | "supplier" | "regulatory";

export type AuditStandard =
  | "haccp_codex"
  | "iso22000"
  | "brc"
  | "fssc22000"
  | "fda_fsma"
  | "custom";

export type AuditStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export type AuditChecklistResult =
  | "complies"
  | "not_complies"
  | "partial"
  | "na"
  | "not_evaluated";

export type FindingType =
  | "major_nc"
  | "minor_nc"
  | "observation"
  | "opportunity";

export type NcOrigin =
  | "prp"
  | "audit"
  | "process"
  | "production_record"
  | "lab"
  | "complaint"
  | "inspection"
  | "supplier"
  | "other";

export type NcSeverity = "critical" | "major" | "minor" | "observation";

export type NcStatus =
  | "open"
  | "in_analysis"
  | "in_progress"
  | "pending_verification"
  | "closed"
  | "overdue";

export type CapaStage =
  | "identification"
  | "containment"
  | "investigation"
  | "action_plan"
  | "implementation"
  | "effectiveness"
  | "closure"
  | "closed";

export type EffectivenessResult = "pending" | "effective" | "ineffective";

export type RootCauseMethod = "5why" | "fishbone" | "pareto";

export type CapaActionType = "corrective" | "preventive" | "immediate";

export type CapaActionStatus = "pending" | "in_progress" | "completed" | "overdue";

export type SpecType =
  | "microbiological"
  | "physicochemical"
  | "organoleptic"
  | "packaging"
  | "labeling";

export type SamplePoint =
  | "reception"
  | "in_process"
  | "finished_product"
  | "storage";

export type LabType = "internal" | "external";

export type LabOverallResult = "approved" | "rejected" | "conditional";

export type LabResultStatus = "pass" | "fail" | "observation";

export type LotReleaseStatus = "pending" | "released" | "retained" | "rejected";

export interface ProductSpecification {
  id: string;
  organization_id: string;
  product_id: string | null;
  spec_type: SpecType;
  parameter: string;
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  target_value: number | null;
  method: string | null;
  is_critical: boolean;
  created_at: string;
}

export interface SamplingPlan {
  id: string;
  organization_id: string;
  product_id: string | null;
  sample_point: SamplePoint;
  spec_id: string | null;
  frequency: string;
  sample_size: string | null;
  responsible: string | null;
  is_active: boolean;
  created_at: string;
}

export interface LabAnalysis {
  id: string;
  organization_id: string;
  product_id: string | null;
  lot_number: string;
  sample_point: SamplePoint;
  analysis_date: string;
  analyzed_by: string | null;
  lab_type: LabType;
  lab_name: string | null;
  overall_result: LabOverallResult | null;
  notes: string | null;
  report_url: string | null;
  nc_generated: boolean;
  created_at: string;
}

export interface LabResult {
  id: string;
  analysis_id: string;
  spec_id: string;
  organization_id: string;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  result: LabResultStatus;
  deviation_pct: number | null;
  notes: string | null;
  created_at: string;
}

export interface LotRelease {
  id: string;
  organization_id: string;
  product_id: string | null;
  lot_number: string;
  production_date: string | null;
  quantity: number | null;
  unit: string | null;
  status: LotReleaseStatus;
  analysis_id: string | null;
  released_by: string | null;
  released_at: string | null;
  retention_reason: string | null;
  nc_id: string | null;
  created_at: string;
}

export interface ProcessControl {
  id: string;
  organization_id: string;
  product_id: string | null;
  ccp_id: string | null;
  lot_number: string | null;
  parameter: string;
  value: number;
  unit: string | null;
  recorded_by: string | null;
  recorded_at: string;
  is_within_limits: boolean | null;
  action_taken: string | null;
}

export type SupplierCategory =
  | "raw_material"
  | "packaging"
  | "service"
  | "equipment"
  | "other";

export type SupplierCriticality = "critical" | "major" | "minor";

export type SupplierStatus =
  | "pending"
  | "in_evaluation"
  | "approved"
  | "conditional"
  | "suspended";

export type SupplierApprovalStage =
  | "request"
  | "review"
  | "approved"
  | "active"
  | "rejected"
  | "suspended";

export type SupplierDocReviewStatus =
  | "pending_review"
  | "approved"
  | "rejected";

export type SupplierDocType =
  | "sanitary_certificate"
  | "haccp_cert"
  | "iso_cert"
  | "analysis_report"
  | "technical_sheet"
  | "other";

export type SupplierDocStatus = "valid" | "expiring" | "expired";

export type SupplierIncidentType =
  | "quality"
  | "delivery"
  | "safety"
  | "documentation"
  | "other";

export interface SupplierScorecardWeights {
  quality: number;
  compliance: number;
  delivery: number;
  service: number;
}

export interface Supplier {
  id: string;
  organization_id: string;
  name: string;
  category: SupplierCategory;
  criticality: SupplierCriticality;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  country: string | null;
  status: SupplierStatus;
  approval_stage: SupplierApprovalStage;
  approval_date: string | null;
  next_evaluation_date: string | null;
  re_evaluation_months: number | null;
  approved_by: string | null;
  approval_signature_hash: string | null;
  notes: string | null;
  created_at: string;
}

export interface SupplierDocument {
  id: string;
  supplier_id: string;
  organization_id: string;
  doc_type: SupplierDocType;
  doc_name: string;
  file_url: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  status: SupplierDocStatus;
  review_status: SupplierDocReviewStatus;
  portal_upload: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface SupplierEvaluation {
  id: string;
  supplier_id: string;
  organization_id: string;
  evaluation_date: string;
  evaluated_by: string | null;
  period: string | null;
  quality_score: number | null;
  delivery_score: number | null;
  service_score: number | null;
  compliance_score: number | null;
  overall_score: number | null;
  classification: string | null;
  observations: string | null;
  action_required: boolean;
  created_at: string;
}

export interface SupplierIncident {
  id: string;
  supplier_id: string;
  organization_id: string;
  incident_date: string;
  incident_type: SupplierIncidentType;
  description: string;
  severity: NcSeverity;
  nc_id: string | null;
  created_at: string;
}

export interface SupplierApprovalChecklistItem {
  id: string;
  organization_id: string;
  criticality: SupplierCriticality;
  item_key: string;
  label: string;
  doc_type: SupplierDocType | null;
  required: boolean;
  sort_order: number;
}

export interface SupplierApprovalResponse {
  id: string;
  supplier_id: string;
  organization_id: string;
  item_key: string;
  checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
  notes: string | null;
}

export interface SupplierApprovalLog {
  id: string;
  supplier_id: string;
  organization_id: string;
  from_stage: SupplierApprovalStage | null;
  to_stage: SupplierApprovalStage;
  changed_by: string | null;
  comment: string | null;
  signature_hash: string;
  created_at: string;
}

export interface SupplierPortalToken {
  id: string;
  supplier_id: string;
  organization_id: string;
  token: string;
  expires_at: string;
  created_by: string | null;
  created_at: string;
}

export type TrainingCourseCategory =
  | "haccp"
  | "gmp"
  | "hygiene"
  | "allergens"
  | "safety"
  | "other";

export type TrainingContentType = "text" | "url";

export type TrainingAssignmentStatus =
  | "assigned"
  | "in_progress"
  | "completed"
  | "overdue";

export type TrainingCompetencyStatus =
  | "current"
  | "expiring"
  | "expired"
  | "pending"
  | "not_assigned";

export interface TrainingCourse {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  category: TrainingCourseCategory;
  content_type: TrainingContentType;
  content_text: string | null;
  content_url: string | null;
  validity_months: number;
  min_pass_score: number;
  has_quiz: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface TrainingQuizQuestion {
  id: string;
  organization_id: string;
  course_id: string;
  question_text: string;
  options: string[];
  correct_index: number;
  sort_order: number;
  created_at: string;
}

export interface TrainingRoleRequirement {
  id: string;
  organization_id: string;
  course_id: string;
  target_role: UserRole | "all";
  created_at: string;
}

export interface TrainingAssignment {
  id: string;
  organization_id: string;
  course_id: string;
  user_id: string;
  due_date: string | null;
  status: TrainingAssignmentStatus;
  nc_id: string | null;
  assigned_by: string | null;
  assigned_at: string;
  notes: string | null;
}

export interface TrainingCompletion {
  id: string;
  organization_id: string;
  assignment_id: string | null;
  user_id: string;
  course_id: string;
  completed_at: string;
  score: number | null;
  passed: boolean;
  signature_hash: string;
  valid_until: string | null;
  certificate_code: string;
}

export type ComplaintChannel =
  | "email"
  | "phone"
  | "in_person"
  | "social_media"
  | "distributor"
  | "other";

export type ComplaintType =
  | "foreign_body"
  | "deterioration"
  | "labeling"
  | "taste_odor"
  | "allergen"
  | "packaging"
  | "quantity"
  | "service"
  | "other";

export type ComplaintSeverity =
  | "safety_critical"
  | "quality"
  | "labeling"
  | "cosmetic";

export type ComplaintStatus =
  | "open"
  | "investigating"
  | "responded"
  | "closed";

export type RootCauseCategory =
  | "machine"
  | "method"
  | "material"
  | "manpower"
  | "environment"
  | "measurement";

export interface CustomerComplaint {
  id: string;
  organization_id: string;
  complaint_number: string;
  received_date: string;
  channel: ComplaintChannel;
  customer_name: string;
  customer_contact: string | null;
  product_id: string | null;
  lot_number: string | null;
  complaint_type: ComplaintType;
  severity: ComplaintSeverity;
  description: string;
  quantity_affected: number | null;
  product_returned: boolean;
  status: ComplaintStatus;
  investigation_summary: string | null;
  root_cause: string | null;
  root_cause_category: RootCauseCategory | null;
  nc_id: string | null;
  lot_analysis_id: string | null;
  response_date: string | null;
  response_summary: string | null;
  communication_log: string | null;
  recurrence: boolean;
  response_due_at: string | null;
  response_responsible: string | null;
  auto_nc_created: boolean;
  closed_at: string | null;
  created_at: string;
}

export interface ComplaintStatusLog {
  id: string;
  complaint_id: string;
  organization_id: string;
  from_status: ComplaintStatus | null;
  to_status: ComplaintStatus;
  changed_by: string | null;
  comment: string | null;
  created_at: string;
}

export interface ComplaintPhoto {
  id: string;
  complaint_id: string;
  organization_id: string;
  photo_url: string;
  description: string | null;
  created_at: string;
}

export type QcFieldType = "number" | "text" | "boolean" | "select";

export interface QcFormField {
  id: string;
  label: string;
  field_type: QcFieldType;
  required: boolean;
  options?: string[];
}

export interface QcControl {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  /** @deprecated usar qc_control_parameters */
  parameter: string;
  /** @deprecated usar qc_control_parameters */
  unit: string | null;
  /** @deprecated usar qc_control_parameters */
  min_value: number | null;
  /** @deprecated usar qc_control_parameters */
  max_value: number | null;
  extra_fields: QcFormField[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface QcControlParameter {
  id: string;
  organization_id: string;
  control_id: string;
  parameter: string;
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  sort_order: number;
  created_at: string;
}

export interface QcFieldLink {
  id: string;
  organization_id: string;
  control_id: string;
  token: string;
  label: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface QcSubmission {
  id: string;
  organization_id: string;
  control_id: string;
  link_id: string | null;
  recorded_value: number | null;
  responses: Record<string, string | number | boolean>;
  recorder_name: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  submitted_at: string;
  created_at: string;
}

export interface QcSubmissionReading {
  id: string;
  organization_id: string;
  submission_id: string;
  parameter_id: string;
  recorded_value: number;
  created_at: string;
}

export type DocumentCategory =
  | "procedure"
  | "instruction"
  | "form"
  | "policy"
  | "specification"
  | "record"
  | "other";

export type DocumentStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "published"
  | "obsolete";

export type DocumentVersionStatus = "draft" | "published" | "obsolete";

export type DocumentAckStatus = "pending" | "acknowledged";

export interface ControlledDocument {
  id: string;
  organization_id: string;
  code: string;
  title: string;
  category: DocumentCategory;
  status: DocumentStatus;
  current_version_id: string | null;
  owner_id: string | null;
  effective_date: string | null;
  next_review_date: string | null;
  read_target_roles: UserRole[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  organization_id: string;
  document_id: string;
  version_number: number;
  file_url: string | null;
  file_name: string | null;
  change_summary: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  published_at: string | null;
  approval_signature_hash: string | null;
  publish_signature_hash: string | null;
  version_status: DocumentVersionStatus;
  created_at: string;
}

export interface DocumentStateLog {
  id: string;
  organization_id: string;
  document_id: string;
  version_id: string | null;
  from_status: DocumentStatus | null;
  to_status: DocumentStatus;
  changed_by: string | null;
  comment: string | null;
  signature_hash: string;
  created_at: string;
}

export interface DocumentReadAcknowledgment {
  id: string;
  organization_id: string;
  document_id: string;
  version_id: string;
  user_id: string;
  status: DocumentAckStatus;
  acknowledged_at: string | null;
  signature_hash: string | null;
  created_at: string;
}

export type TraceLotType = "raw_material" | "finished" | "wip";

export type TraceEventType = "reception" | "transformation" | "shipment";

export type MockRecallStatus = "in_progress" | "completed" | "cancelled";

export interface TraceLot {
  id: string;
  organization_id: string;
  lot_code: string;
  lot_type: TraceLotType;
  product_name: string | null;
  supplier_id: string | null;
  received_at: string | null;
  produced_at: string | null;
  line_area: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  destination: string | null;
  production_submission_id: string | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  // FSMA 204 KDEs (optional — null if not captured)
  supplier_name: string | null;
  tlc_source: string | null;
}

export interface TraceLotComposition {
  id: string;
  organization_id: string;
  parent_lot_id: string;
  child_lot_id: string;
  quantity_used: number | null;
  quantity_unit: string | null;
  created_at: string;
}

export interface TraceEvent {
  id: string;
  organization_id: string;
  event_type: TraceEventType;
  lot_id: string;
  related_lot_id: string | null;
  event_at: string;
  location: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  performed_by: string | null;
  notes: string | null;
  created_at: string;
  // FSMA 204 KDEs (optional — null if not captured)
  reference_doc_type: string | null;
  reference_doc_number: string | null;
  recipient_name: string | null;
  recipient_location: string | null;
}

export interface MockRecallReport {
  target_lot_codes: string[];
  lots_found: {
    lot_id: string;
    lot_code: string;
    lot_type: TraceLotType;
    product_name: string | null;
    quantity: number | null;
    quantity_unit: string | null;
    destination: string | null;
    depth: number;
  }[];
  total_quantity: number;
  destinations: string[];
  customers_affected: string[];
}

export interface MockRecallSimulation {
  id: string;
  organization_id: string;
  simulation_number: string;
  started_at: string;
  completed_at: string | null;
  started_by: string | null;
  responsible_id: string | null;
  status: MockRecallStatus;
  goal_hours: number;
  elapsed_seconds: number | null;
  passed_goal: boolean | null;
  report: MockRecallReport | null;
  notes: string | null;
  created_at: string;
}

export type ProductionFieldType =
  | "text"
  | "number"
  | "select"
  | "multiselect"
  | "datetime"
  | "photo"
  | "checklist";

export type ProductionSubmissionStatus = "ok" | "deviation" | "pending_sync";

export type MonitoringSource = "form" | "qr" | "ocr";

export type ProductionSyncStatus = "synced" | "pending_sync";

export interface ProductionFormTemplate {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  area: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductionFormSection {
  id: string;
  organization_id: string;
  template_id: string;
  title: string;
  sort_order: number;
  created_at: string;
}

export interface ProductionFormField {
  id: string;
  organization_id: string;
  section_id: string;
  label: string;
  field_type: ProductionFieldType;
  required: boolean;
  sort_order: number;
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  options: string[];
  created_at: string;
}

export interface ProductionFormSubmission {
  id: string;
  organization_id: string;
  template_id: string;
  template_snapshot: Record<string, unknown>;
  area: string | null;
  lot_number: string | null;
  status: ProductionSubmissionStatus;
  sync_status: ProductionSyncStatus;
  has_deviation: boolean;
  deviation_notes: string | null;
  operator_signature_hash: string | null;
  operator_signed_at: string | null;
  submitted_by: string | null;
  submitted_at: string;
  nc_id: string | null;
  haccp_ccp_id: string | null;
  client_submission_id: string | null;
  source: MonitoringSource;
  qr_link_id: string | null;
  monitor_name: string | null;
  created_at: string;
}

export interface MonitoringQrLink {
  id: string;
  organization_id: string;
  template_id: string;
  token: string;
  label: string;
  expires_at: string;
  revoked_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductionFormSubmissionValue {
  id: string;
  organization_id: string;
  submission_id: string;
  field_id: string;
  field_label: string;
  field_type: ProductionFieldType;
  value_text: string | null;
  value_number: number | null;
  value_json: unknown;
  is_out_of_range: boolean;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  industry: Industry;
  country: string;
  city: string | null;
  employees_range: EmployeesRange | null;
  certifications: string[] | null;
  logo_url: string | null;
  access_status: AccessStatus;
  access_granted_at: string | null;
  access_expires_at: string | null;
  contract_notes: string | null;
  provisioned_by: string | null;
  nc_quarantine_severity_threshold?: NcSeverity | null;
  supplier_scorecard_weights?: SupplierScorecardWeights | null;
  complaint_response_sla_hours?: number | null;
  complaint_auto_nc_severity?: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  organization_id: string | null;
  full_name: string;
  role: UserRole;
  job_title: string | null;
  avatar_url: string | null;
  onboarding_completed: boolean;
  created_at: string;
}

export interface Invitation {
  id: string;
  organization_id: string;
  email: string;
  role: UserRole;
  token: string;
  invited_by: string | null;
  expires_at: string;
  accepted: boolean;
  accepted_at: string | null;
  created_at: string;
}

export interface NotificationPreferences {
  organization_id: string;
  email_capa_due: boolean;
  email_weekly_summary: boolean;
  email_audit_completed: boolean;
  updated_at: string;
}

export interface HaccpProduct {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  category: string;
  intended_use: string | null;
  target_consumer: string | null;
  shelf_life_days: number | null;
  storage_conditions: string | null;
  packaging_type: string | null;
  status: HaccpProductStatus;
  plan_status: DocumentStatus;
  current_version: number;
  effective_date: string | null;
  next_review_date: string | null;
  approved_by: string | null;
  published_at: string | null;
  plan_completion: number;
  created_at: string;
  updated_at: string;
}

export interface HaccpProcessStep {
  id: string;
  product_id: string;
  organization_id: string;
  name: string;
  step_type: ProcessStepType;
  description: string | null;
  temperature_min: number | null;
  temperature_max: number | null;
  duration_minutes: number | null;
  position: number;
  is_ccp: boolean;
  is_oprp: boolean;
  created_at: string;
}

export interface HaccpHazard {
  id: string;
  process_step_id: string;
  organization_id: string;
  hazard_type: HazardType;
  hazard_description: string;
  source: string | null;
  severity: Severity;
  probability: Probability;
  risk_level: string | null;
  is_significant: boolean;
  control_measures: string | null;
  ccp_determination: CcpDetermination | null;
  notes: string | null;
  created_at: string;
}

export interface HaccpCcp {
  id: string;
  hazard_id: string;
  process_step_id: string;
  organization_id: string;
  ccp_number: string;
  critical_limit: string;
  critical_limit_min: number | null;
  critical_limit_max: number | null;
  critical_limit_unit: string | null;
  monitoring_what: string;
  monitoring_how: string;
  monitoring_frequency: string;
  monitoring_responsible: string;
  corrective_action: string;
  verification_activity: string | null;
  verification_frequency: string | null;
  records_required: string | null;
  production_template_id: string | null;
  production_field_id: string | null;
  last_verification_at: string | null;
  created_at: string;
}

export interface HaccpPlanVersion {
  id: string;
  product_id: string;
  organization_id: string;
  version_number: number;
  snapshot: Record<string, unknown>;
  change_summary: string | null;
  status: DocumentStatus;
  effective_date: string | null;
  next_review_date: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  published_at: string | null;
  signature_hash: string | null;
  created_at: string;
}

export interface HaccpPlanVersionLog {
  id: string;
  product_id: string;
  organization_id: string;
  version_id: string | null;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  comment: string | null;
  signature_hash: string;
  created_at: string;
}

export interface PrpProgram {
  id: string;
  organization_id: string;
  name: string;
  prp_type: PrpType;
  description: string | null;
  frequency: PrpFrequency;
  responsible: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PrpChecklistItem {
  id: string;
  program_id: string;
  organization_id: string;
  item_text: string;
  is_critical: boolean;
  position: number;
  created_at: string;
}

export interface PrpRecord {
  id: string;
  program_id: string;
  organization_id: string;
  executed_by: string | null;
  executed_at: string;
  status: PrpRecordStatus;
  notes: string | null;
  overall_result: PrpOverallResult | null;
  created_at: string;
}

export interface PrpRecordItem {
  id: string;
  record_id: string;
  checklist_item_id: string;
  organization_id: string;
  result: PrpItemResult;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
}

export interface Audit {
  id: string;
  organization_id: string;
  title: string;
  audit_type: AuditType;
  standard: AuditStandard;
  scheduled_date: string;
  completed_date: string | null;
  auditor_name: string | null;
  scope: string | null;
  status: AuditStatus;
  compliance_score: number | null;
  compliance_by_section: Record<string, number> | null;
  template_id: string | null;
  assigned_to: string | null;
  site_area: string | null;
  site_responsible_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AuditChecklistItem {
  id: string;
  audit_id: string;
  organization_id: string;
  section: string;
  requirement: string;
  reference: string | null;
  result: AuditChecklistResult | null;
  finding: string | null;
  photo_url: string | null;
  position: number;
  created_at: string;
}

export interface AuditFinding {
  id: string;
  audit_id: string;
  checklist_item_id: string | null;
  organization_id: string;
  finding_type: FindingType;
  description: string;
  capa_id: string | null;
  created_at: string;
}

export interface AuditTemplate {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  source_standard: AuditStandard | string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditTemplateSection {
  id: string;
  template_id: string;
  organization_id: string;
  name: string;
  position: number;
  created_at: string;
}

export interface AuditTemplateItem {
  id: string;
  section_id: string;
  organization_id: string;
  requirement: string;
  reference: string | null;
  position: number;
  created_at: string;
}

export interface Nonconformity {
  id: string;
  organization_id: string;
  nc_number: string;
  origin: NcOrigin;
  origin_ref_id: string | null;
  description: string;
  severity: NcSeverity;
  product_affected: string | null;
  lot_number: string | null;
  area: string | null;
  detected_by: string | null;
  detected_at: string;
  status: NcStatus;
  capa_stage: CapaStage;
  assigned_to: string | null;
  containment_description: string | null;
  containment_completed_at: string | null;
  capa_target_close_date: string | null;
  effectiveness_due_date: string | null;
  effectiveness_result: EffectivenessResult;
  effectiveness_notes: string | null;
  effectiveness_verified_at: string | null;
  lot_quarantined: boolean;
  evidence_url: string | null;
  haccp_ccp_id: string | null;
  supplier_id: string | null;
  root_cause_method: RootCauseMethod | null;
  root_cause_summary: string | null;
  due_date: string | null;
  closed_at: string | null;
  recurrence: boolean;
  created_at: string;
}

export interface CapaStageLog {
  id: string;
  organization_id: string;
  nc_id: string;
  from_stage: CapaStage | null;
  to_stage: CapaStage;
  changed_by: string | null;
  comment: string | null;
  signature_hash: string;
  created_at: string;
}

export interface CapaAction {
  id: string;
  nc_id: string;
  organization_id: string;
  action_type: CapaActionType;
  description: string;
  responsible: string;
  due_date: string;
  completed_at: string | null;
  evidence_description: string | null;
  evidence_url: string | null;
  status: CapaActionStatus;
  created_at: string;
}

export interface Nc5Whys {
  id: string;
  nc_id: string;
  organization_id: string;
  why_1: string | null;
  why_2: string | null;
  why_3: string | null;
  why_4: string | null;
  why_5: string | null;
  root_cause: string | null;
  created_at: string;
}

export interface NcFishboneCause {
  id: string;
  nc_id: string;
  organization_id: string;
  category: string;
  cause_text: string;
  created_at: string;
}

export type NotificationType =
  | "capa_due"
  | "capa_overdue"
  | "prp_missed"
  | "audit_upcoming"
  | "nc_new"
  | "supplier_doc_expiring"
  | "supplier_eval_overdue"
  | "complaint_critical"
  | "document_read_required"
  | "training_due"
  | "training_overdue"
  | "complaint_sla_due"
  | "complaint_sla_overdue"
  | "daily_insight"
  | "system";

export interface Notification {
  id: string;
  organization_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  dedup_key: string | null;
  created_at: string;
}

export type AiInsightSource = "rules" | "ai";
export type AiInsightRisk = "ok" | "attention" | "critical";

export interface AiDailyInsight {
  id: string;
  organization_id: string;
  period_date: string;
  generated_at: string;
  source: AiInsightSource;
  model: string | null;
  overall_risk: AiInsightRisk;
  headline: string;
  summary: string;
  snapshot: Json;
  findings: Json;
  analysis: Json;
  created_at: string;
  updated_at: string;
}

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: Organization;
        Insert: Omit<
          Organization,
          | "id"
          | "created_at"
          | "access_status"
          | "access_granted_at"
          | "access_expires_at"
          | "contract_notes"
          | "provisioned_by"
        > & {
          id?: string;
          created_at?: string;
          access_status?: AccessStatus;
          access_granted_at?: string | null;
          access_expires_at?: string | null;
          contract_notes?: string | null;
          provisioned_by?: string | null;
        };
        Update: Partial<Organization>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at" | "onboarding_completed"> & {
          created_at?: string;
          onboarding_completed?: boolean;
        };
        Update: Partial<Profile>;
        Relationships: [];
      };
      haccp_products: {
        Row: HaccpProduct;
        Insert: Omit<HaccpProduct, "id" | "created_at" | "updated_at" | "status" | "plan_completion"> & {
          id?: string;
          status?: HaccpProductStatus;
          plan_completion?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<HaccpProduct>;
        Relationships: [];
      };
      haccp_process_steps: {
        Row: HaccpProcessStep;
        Insert: Omit<HaccpProcessStep, "id" | "created_at" | "is_ccp" | "is_oprp"> & {
          id?: string;
          is_ccp?: boolean;
          is_oprp?: boolean;
          created_at?: string;
        };
        Update: Partial<HaccpProcessStep>;
        Relationships: [];
      };
      haccp_hazards: {
        Row: HaccpHazard;
        Insert: Omit<HaccpHazard, "id" | "created_at" | "is_significant" | "risk_level"> & {
          id?: string;
          is_significant?: boolean;
          risk_level?: string | null;
          created_at?: string;
        };
        Update: Partial<HaccpHazard>;
        Relationships: [];
      };
      haccp_ccps: {
        Row: HaccpCcp;
        Insert: Omit<HaccpCcp, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<HaccpCcp>;
        Relationships: [];
      };
      haccp_plan_versions: {
        Row: HaccpPlanVersion;
        Insert: Omit<
          HaccpPlanVersion,
          "id" | "created_at" | "status" | "snapshot"
        > & {
          id?: string;
          status?: DocumentStatus;
          snapshot?: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<HaccpPlanVersion>;
        Relationships: [];
      };
      haccp_plan_version_log: {
        Row: HaccpPlanVersionLog;
        Insert: Omit<HaccpPlanVersionLog, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<HaccpPlanVersionLog>;
        Relationships: [];
      };
      prp_programs: {
        Row: PrpProgram;
        Insert: Omit<PrpProgram, "id" | "created_at" | "is_active"> & {
          id?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<PrpProgram>;
        Relationships: [];
      };
      prp_checklist_items: {
        Row: PrpChecklistItem;
        Insert: Omit<PrpChecklistItem, "id" | "created_at" | "is_critical"> & {
          id?: string;
          is_critical?: boolean;
          created_at?: string;
        };
        Update: Partial<PrpChecklistItem>;
        Relationships: [];
      };
      prp_records: {
        Row: PrpRecord;
        Insert: Omit<PrpRecord, "id" | "created_at" | "executed_at" | "status"> & {
          id?: string;
          executed_at?: string;
          status?: PrpRecordStatus;
          created_at?: string;
        };
        Update: Partial<PrpRecord>;
        Relationships: [];
      };
      prp_record_items: {
        Row: PrpRecordItem;
        Insert: Omit<PrpRecordItem, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<PrpRecordItem>;
        Relationships: [];
      };
      audits: {
        Row: Audit;
        Insert: Omit<Audit, "id" | "created_at" | "status" | "compliance_score" | "completed_date"> & {
          id?: string;
          status?: AuditStatus;
          compliance_score?: number | null;
          completed_date?: string | null;
          created_at?: string;
        };
        Update: Partial<Audit>;
        Relationships: [];
      };
      audit_checklist_items: {
        Row: AuditChecklistItem;
        Insert: Omit<AuditChecklistItem, "id" | "created_at" | "result"> & {
          id?: string;
          result?: AuditChecklistResult | null;
          created_at?: string;
        };
        Update: Partial<AuditChecklistItem>;
        Relationships: [];
      };
      audit_findings: {
        Row: AuditFinding;
        Insert: Omit<AuditFinding, "id" | "created_at" | "capa_id"> & {
          id?: string;
          capa_id?: string | null;
          created_at?: string;
        };
        Update: Partial<AuditFinding>;
        Relationships: [];
      };
      audit_templates: {
        Row: AuditTemplate;
        Insert: Omit<AuditTemplate, "id" | "created_at" | "updated_at" | "is_active"> & {
          id?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<AuditTemplate>;
        Relationships: [];
      };
      audit_template_sections: {
        Row: AuditTemplateSection;
        Insert: Omit<AuditTemplateSection, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<AuditTemplateSection>;
        Relationships: [];
      };
      audit_template_items: {
        Row: AuditTemplateItem;
        Insert: Omit<AuditTemplateItem, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<AuditTemplateItem>;
        Relationships: [];
      };
      nonconformities: {
        Row: Nonconformity;
        Insert: Omit<
          Nonconformity,
          | "id"
          | "created_at"
          | "detected_at"
          | "status"
          | "recurrence"
          | "closed_at"
          | "capa_stage"
          | "effectiveness_result"
          | "lot_quarantined"
        > & {
          id?: string;
          detected_at?: string;
          status?: NcStatus;
          capa_stage?: CapaStage;
          effectiveness_result?: EffectivenessResult;
          lot_quarantined?: boolean;
          recurrence?: boolean;
          closed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Nonconformity>;
        Relationships: [];
      };
      capa_stage_log: {
        Row: CapaStageLog;
        Insert: Omit<CapaStageLog, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<CapaStageLog>;
        Relationships: [];
      };
      capa_actions: {
        Row: CapaAction;
        Insert: Omit<CapaAction, "id" | "created_at" | "status" | "completed_at"> & {
          id?: string;
          status?: CapaActionStatus;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<CapaAction>;
        Relationships: [];
      };
      nc_5whys: {
        Row: Nc5Whys;
        Insert: Omit<Nc5Whys, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Nc5Whys>;
        Relationships: [];
      };
      nc_fishbone_causes: {
        Row: NcFishboneCause;
        Insert: Omit<NcFishboneCause, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<NcFishboneCause>;
        Relationships: [];
      };
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, "id" | "created_at" | "read"> & {
          id?: string;
          read?: boolean;
          created_at?: string;
        };
        Update: Partial<Notification>;
        Relationships: [];
      };
      invitations: {
        Row: Invitation;
        Insert: Omit<
          Invitation,
          "id" | "created_at" | "accepted" | "accepted_at"
        > & {
          id?: string;
          accepted?: boolean;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Invitation>;
        Relationships: [];
      };
      notification_preferences: {
        Row: NotificationPreferences;
        Insert: Omit<NotificationPreferences, "updated_at"> & {
          updated_at?: string;
        };
        Update: Partial<NotificationPreferences>;
        Relationships: [];
      };
      product_specifications: {
        Row: ProductSpecification;
        Insert: Omit<ProductSpecification, "id" | "created_at" | "is_critical"> & {
          id?: string;
          is_critical?: boolean;
          created_at?: string;
        };
        Update: Partial<ProductSpecification>;
        Relationships: [];
      };
      sampling_plans: {
        Row: SamplingPlan;
        Insert: Omit<SamplingPlan, "id" | "created_at" | "is_active"> & {
          id?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<SamplingPlan>;
        Relationships: [];
      };
      lab_analyses: {
        Row: LabAnalysis;
        Insert: Omit<LabAnalysis, "id" | "created_at" | "nc_generated" | "overall_result"> & {
          id?: string;
          nc_generated?: boolean;
          overall_result?: LabOverallResult | null;
          created_at?: string;
        };
        Update: Partial<LabAnalysis>;
        Relationships: [];
      };
      lab_results: {
        Row: LabResult;
        Insert: Omit<LabResult, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<LabResult>;
        Relationships: [];
      };
      lot_releases: {
        Row: LotRelease;
        Insert: Omit<LotRelease, "id" | "created_at" | "status"> & {
          id?: string;
          status?: LotReleaseStatus;
          created_at?: string;
        };
        Update: Partial<LotRelease>;
        Relationships: [];
      };
      process_controls: {
        Row: ProcessControl;
        Insert: Omit<ProcessControl, "id" | "recorded_at"> & {
          id?: string;
          recorded_at?: string;
        };
        Update: Partial<ProcessControl>;
        Relationships: [];
      };
      suppliers: {
        Row: Supplier;
        Insert: Omit<
          Supplier,
          "id" | "created_at" | "status" | "approval_stage"
        > & {
          id?: string;
          status?: SupplierStatus;
          approval_stage?: SupplierApprovalStage;
          created_at?: string;
        };
        Update: Partial<Supplier>;
        Relationships: [];
      };
      supplier_documents: {
        Row: SupplierDocument;
        Insert: Omit<
          SupplierDocument,
          "id" | "created_at" | "status" | "review_status" | "portal_upload"
        > & {
          id?: string;
          status?: SupplierDocStatus;
          review_status?: SupplierDocReviewStatus;
          portal_upload?: boolean;
          created_at?: string;
        };
        Update: Partial<SupplierDocument>;
        Relationships: [];
      };
      supplier_evaluations: {
        Row: SupplierEvaluation;
        Insert: Omit<
          SupplierEvaluation,
          "id" | "created_at" | "action_required" | "overall_score" | "classification"
        > & {
          id?: string;
          action_required?: boolean;
          overall_score?: number | null;
          classification?: string | null;
          created_at?: string;
        };
        Update: Partial<SupplierEvaluation>;
        Relationships: [];
      };
      supplier_incidents: {
        Row: SupplierIncident;
        Insert: Omit<SupplierIncident, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<SupplierIncident>;
        Relationships: [];
      };
      supplier_approval_checklist: {
        Row: SupplierApprovalChecklistItem;
        Insert: Omit<SupplierApprovalChecklistItem, "id"> & { id?: string };
        Update: Partial<SupplierApprovalChecklistItem>;
        Relationships: [];
      };
      supplier_approval_responses: {
        Row: SupplierApprovalResponse;
        Insert: Omit<SupplierApprovalResponse, "id"> & {
          id?: string;
          checked?: boolean;
        };
        Update: Partial<SupplierApprovalResponse>;
        Relationships: [];
      };
      supplier_approval_log: {
        Row: SupplierApprovalLog;
        Insert: Omit<SupplierApprovalLog, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<SupplierApprovalLog>;
        Relationships: [];
      };
      supplier_portal_tokens: {
        Row: SupplierPortalToken;
        Insert: Omit<SupplierPortalToken, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<SupplierPortalToken>;
        Relationships: [];
      };
      training_courses: {
        Row: TrainingCourse;
        Insert: Omit<
          TrainingCourse,
          "id" | "created_at" | "is_active" | "has_quiz"
        > & {
          id?: string;
          is_active?: boolean;
          has_quiz?: boolean;
          created_at?: string;
        };
        Update: Partial<TrainingCourse>;
        Relationships: [];
      };
      training_quiz_questions: {
        Row: TrainingQuizQuestion;
        Insert: Omit<TrainingQuizQuestion, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<TrainingQuizQuestion>;
        Relationships: [];
      };
      training_role_requirements: {
        Row: TrainingRoleRequirement;
        Insert: Omit<TrainingRoleRequirement, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<TrainingRoleRequirement>;
        Relationships: [];
      };
      training_assignments: {
        Row: TrainingAssignment;
        Insert: Omit<
          TrainingAssignment,
          "id" | "assigned_at" | "status"
        > & {
          id?: string;
          status?: TrainingAssignmentStatus;
          assigned_at?: string;
        };
        Update: Partial<TrainingAssignment>;
        Relationships: [];
      };
      training_completions: {
        Row: TrainingCompletion;
        Insert: Omit<TrainingCompletion, "id" | "completed_at" | "passed"> & {
          id?: string;
          completed_at?: string;
          passed?: boolean;
        };
        Update: Partial<TrainingCompletion>;
        Relationships: [];
      };
      customer_complaints: {
        Row: CustomerComplaint;
        Insert: Omit<
          CustomerComplaint,
          | "id"
          | "created_at"
          | "status"
          | "product_returned"
          | "recurrence"
          | "closed_at"
        > & {
          id?: string;
          status?: ComplaintStatus;
          product_returned?: boolean;
          recurrence?: boolean;
          closed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<CustomerComplaint>;
        Relationships: [];
      };
      complaint_photos: {
        Row: ComplaintPhoto;
        Insert: Omit<ComplaintPhoto, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<ComplaintPhoto>;
        Relationships: [];
      };
      complaint_status_log: {
        Row: ComplaintStatusLog;
        Insert: Omit<ComplaintStatusLog, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<ComplaintStatusLog>;
        Relationships: [];
      };
      qc_controls: {
        Row: QcControl;
        Insert: Omit<
          QcControl,
          "id" | "created_at" | "is_active" | "extra_fields"
        > & {
          id?: string;
          is_active?: boolean;
          extra_fields?: QcFormField[];
          created_at?: string;
        };
        Update: Partial<QcControl>;
        Relationships: [];
      };
      qc_field_links: {
        Row: QcFieldLink;
        Insert: Omit<QcFieldLink, "id" | "created_at" | "is_active"> & {
          id?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<QcFieldLink>;
        Relationships: [];
      };
      qc_submissions: {
        Row: QcSubmission;
        Insert: Omit<
          QcSubmission,
          "id" | "created_at" | "submitted_at" | "responses" | "recorded_value"
        > & {
          id?: string;
          recorded_value?: number | null;
          responses?: Record<string, string | number | boolean>;
          submitted_at?: string;
          created_at?: string;
        };
        Update: Partial<QcSubmission>;
        Relationships: [];
      };
      qc_control_parameters: {
        Row: QcControlParameter;
        Insert: Omit<QcControlParameter, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<QcControlParameter>;
        Relationships: [];
      };
      qc_submission_readings: {
        Row: QcSubmissionReading;
        Insert: Omit<QcSubmissionReading, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<QcSubmissionReading>;
        Relationships: [];
      };
      controlled_documents: {
        Row: ControlledDocument;
        Insert: Omit<
          ControlledDocument,
          "id" | "created_at" | "updated_at" | "status" | "current_version_id"
        > & {
          id?: string;
          status?: DocumentStatus;
          current_version_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ControlledDocument>;
        Relationships: [];
      };
      document_versions: {
        Row: DocumentVersion;
        Insert: Omit<
          DocumentVersion,
          | "id"
          | "created_at"
          | "version_status"
          | "approved_by"
          | "approved_at"
          | "published_at"
          | "approval_signature_hash"
          | "publish_signature_hash"
        > & {
          id?: string;
          version_status?: DocumentVersionStatus;
          approved_by?: string | null;
          approved_at?: string | null;
          published_at?: string | null;
          approval_signature_hash?: string | null;
          publish_signature_hash?: string | null;
          created_at?: string;
        };
        Update: Partial<DocumentVersion>;
        Relationships: [];
      };
      document_state_log: {
        Row: DocumentStateLog;
        Insert: Omit<DocumentStateLog, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<DocumentStateLog>;
        Relationships: [];
      };
      document_read_acknowledgments: {
        Row: DocumentReadAcknowledgment;
        Insert: Omit<
          DocumentReadAcknowledgment,
          "id" | "created_at" | "status" | "acknowledged_at" | "signature_hash"
        > & {
          id?: string;
          status?: DocumentAckStatus;
          acknowledged_at?: string | null;
          signature_hash?: string | null;
          created_at?: string;
        };
        Update: Partial<DocumentReadAcknowledgment>;
        Relationships: [];
      };
      trace_lots: {
        Row: TraceLot;
        Insert: Omit<TraceLot, "id" | "created_at" | "status"> & {
          id?: string;
          status?: string;
          created_at?: string;
        };
        Update: Partial<TraceLot>;
        Relationships: [];
      };
      trace_lot_compositions: {
        Row: TraceLotComposition;
        Insert: Omit<TraceLotComposition, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<TraceLotComposition>;
        Relationships: [];
      };
      trace_events: {
        Row: TraceEvent;
        Insert: Omit<TraceEvent, "id" | "created_at" | "event_at"> & {
          id?: string;
          event_at?: string;
          created_at?: string;
        };
        Update: Partial<TraceEvent>;
        Relationships: [];
      };
      mock_recall_simulations: {
        Row: MockRecallSimulation;
        Insert: Omit<
          MockRecallSimulation,
          "id" | "created_at" | "status" | "goal_hours" | "report"
        > & {
          id?: string;
          status?: MockRecallStatus;
          goal_hours?: number;
          report?: MockRecallReport | null;
          created_at?: string;
        };
        Update: Partial<MockRecallSimulation>;
        Relationships: [];
      };
      mock_recall_simulation_lots: {
        Row: {
          simulation_id: string;
          lot_id: string;
          organization_id: string;
        };
        Insert: {
          simulation_id: string;
          lot_id: string;
          organization_id: string;
        };
        Update: Partial<{
          simulation_id: string;
          lot_id: string;
          organization_id: string;
        }>;
        Relationships: [];
      };
      production_form_templates: {
        Row: ProductionFormTemplate;
        Insert: Omit<
          ProductionFormTemplate,
          "id" | "created_at" | "updated_at" | "is_active"
        > & {
          id?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ProductionFormTemplate>;
        Relationships: [];
      };
      production_form_sections: {
        Row: ProductionFormSection;
        Insert: Omit<ProductionFormSection, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<ProductionFormSection>;
        Relationships: [];
      };
      production_form_fields: {
        Row: ProductionFormField;
        Insert: Omit<
          ProductionFormField,
          "id" | "created_at" | "options"
        > & {
          id?: string;
          options?: string[];
          created_at?: string;
        };
        Update: Partial<ProductionFormField>;
        Relationships: [];
      };
      production_form_submissions: {
        Row: ProductionFormSubmission;
        Insert: Omit<
          ProductionFormSubmission,
          "id" | "created_at" | "submitted_at" | "status" | "sync_status" | "has_deviation"
        > & {
          id?: string;
          status?: ProductionSubmissionStatus;
          sync_status?: ProductionSyncStatus;
          has_deviation?: boolean;
          submitted_at?: string;
          created_at?: string;
          source?: MonitoringSource;
          qr_link_id?: string | null;
          monitor_name?: string | null;
        };
        Update: Partial<ProductionFormSubmission>;
        Relationships: [];
      };
      monitoring_qr_links: {
        Row: MonitoringQrLink;
        Insert: Omit<
          MonitoringQrLink,
          "id" | "created_at" | "updated_at" | "revoked_at"
        > & {
          id?: string;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<MonitoringQrLink>;
        Relationships: [];
      };
      production_form_submission_values: {
        Row: ProductionFormSubmissionValue;
        Insert: Omit<
          ProductionFormSubmissionValue,
          "id" | "created_at" | "is_out_of_range"
        > & {
          id?: string;
          is_out_of_range?: boolean;
          created_at?: string;
        };
        Update: Partial<ProductionFormSubmissionValue>;
        Relationships: [];
      };
      ai_daily_insights: {
        Row: AiDailyInsight;
        Insert: Omit<
          AiDailyInsight,
          "id" | "created_at" | "updated_at" | "generated_at" | "source" | "overall_risk"
        > & {
          id?: string;
          generated_at?: string;
          source?: AiInsightSource;
          overall_risk?: AiInsightRisk;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<AiDailyInsight>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
