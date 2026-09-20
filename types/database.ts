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
  | "audit_upcoming"
  | "nc_new"
  | "document_read_required"
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
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  generation_result: string | null;
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
          | "id"
          | "created_at"
          | "updated_at"
          | "generated_at"
          | "source"
          | "overall_risk"
          | "input_tokens"
          | "output_tokens"
          | "duration_ms"
          | "generation_result"
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
      get_dashboard_metrics: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_kiosk_metrics: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      current_organization_access_allowed: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      create_org_notifications: {
        Args: { p_rows: Json };
        Returns: Database["public"]["Tables"]["notifications"]["Row"][];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
