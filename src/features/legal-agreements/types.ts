export type LegalAgreementType =
  | "NDA"
  | "DPA"
  | "SERVICE_AGREEMENT"
  | "COOPERATION_AGREEMENT"
  | "OTHER";

export type LegalAgreementStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED"
  | "GENERATED"
  | "SENT"
  | "SIGNING"
  | "SIGNED"
  | "EFFECTIVE"
  | "TERMINATED"
  | "EXPIRED"
  | "CANCELLED"
  | "REJECTED";

export type LegalPartyRole = "OUR_SIDE" | "COUNTERPARTY" | "THIRD_PARTY";
export type LegalPartySourceType =
  | "INTERNAL_COMPANY"
  | "CRM_COMPANY"
  | "MANUAL";

export type LegalBreachPenaltyType =
  | "FIXED_AMOUNT"
  | "PERCENT_OF_DEAL"
  | "ACTUAL_LOSS"
  | "NONE";

export type LegalDisputeResolutionType = "LITIGATION" | "ARBITRATION";

export interface LegalAgreementPartyDraft {
  partyTitle: string;
  partyRole: LegalPartyRole;
  sourceType: LegalPartySourceType;
  crmCompanyId?: number | string;
  crmContactId?: number | string;
  companyName: string;
  uscc?: string;
  legalRep?: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  authorizedRepresentative?: string;
  representativeTitle?: string;
}

export interface LegalAgreementDraft {
  agreementType: LegalAgreementType;
  agreementTitle: string;
  projectName?: string;
  cooperationMatter?: string;
  agreementDate?: string;
  signedDate?: string;
  effectiveDate?: string;
  confidentialityYears?: number;
  returnDestroyDays?: number;
  breachPenaltyType: LegalBreachPenaltyType;
  breachPenaltyAmount?: number;
  breachPenaltyPercent?: number;
  disputeResolutionType: LegalDisputeResolutionType;
  disputeResolutionOrg?: string;
  disputeResolutionPlace?: string;
  signingPlace?: string;
  externalNote?: string;
  internalNote?: string;
  parties: LegalAgreementPartyDraft[];
}

export interface LegalAgreementSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  header: {
    agreementNo: string;
    agreementType: LegalAgreementType;
    agreementTitle: string;
    projectName?: string;
    cooperationMatter?: string;
    agreementDate?: string;
    signedDate?: string;
    effectiveDate?: string;
    signingPlace?: string;
  };
  parties: LegalAgreementPartyDraft[];
  terms: {
    confidentialityYears: number;
    returnDestroyDays: number;
    breachPenaltyType: LegalBreachPenaltyType;
    breachPenaltyAmount?: number;
    breachPenaltyPercent?: number;
    disputeResolutionType: LegalDisputeResolutionType;
    disputeResolutionOrg?: string;
    disputeResolutionPlace?: string;
  };
  externalNote?: string;
}

export interface LegalCrmCompanyRecord {
  id: number | string;
  name?: string;
  uscc?: string;
  legal_rep?: string;
  reg_address?: string;
  updated_at?: string;
}

export interface LegalCrmContactRecord {
  id: number | string;
  company_id?: number | string;
  name?: string;
  phone?: string;
  email?: string;
  is_primary?: boolean | number | string;
  updated_at?: string;
}

export interface LegalCustomerOption {
  source: "CRM_COMPANY";
  sourceId: number | string;
  customerName: string;
  taxNo?: string;
  legalRep?: string;
  companyAddress?: string;
  contactId?: number | string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export interface LegalAgreementRecord {
  id: number;
  agreement_no: string;
  revision_no?: number;
  agreement_type: LegalAgreementType;
  agreement_title: string;
  status: LegalAgreementStatus;
  project_name?: string;
  cooperation_matter?: string;
  primary_crm_company_id?: number | string;
  primary_crm_contact_id?: number | string;
  primary_party_name_snapshot?: string;
  agreement_date?: string;
  signed_date?: string;
  effective_date?: string;
  confidentiality_years?: number;
  return_destroy_days?: number;
  breach_penalty_type?: LegalBreachPenaltyType;
  breach_penalty_amount?: number;
  breach_penalty_percent?: number;
  dispute_resolution_type?: LegalDisputeResolutionType;
  dispute_resolution_org?: string;
  dispute_resolution_place?: string;
  governing_law?: string;
  signing_place?: string;
  external_note?: string;
  internal_note?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LegalAgreementPartyRecord {
  id: number;
  agreement_id: number;
  party_order: number;
  party_title: string;
  party_role: LegalPartyRole;
  source_type: LegalPartySourceType;
  crm_company_id?: number | string;
  crm_contact_id?: number | string;
  company_name_snapshot: string;
  uscc_snapshot?: string;
  legal_rep_snapshot?: string;
  address_snapshot?: string;
  contact_name_snapshot?: string;
  contact_phone_snapshot?: string;
  contact_email_snapshot?: string;
  authorized_representative?: string;
  representative_title?: string;
  is_primary_counterparty?: string;
  remark?: string;
}

export interface LegalDocumentRecord {
  id: number;
  agreement_id: number;
  template_id?: number | string;
  document_no: string;
  document_title: string;
  document_revision: number;
  file_format: string;
  file_url?: string;
  file_token?: string;
  snapshot_json?: string;
  rendered_content?: string;
  generated_by?: string;
  generated_at?: string;
  created_at?: string;
}

export interface LegalStatusLogRecord {
  id: number;
  agreement_id: number;
  from_status?: LegalAgreementStatus;
  to_status: LegalAgreementStatus;
  action_code: string;
  action_name?: string;
  operator_user_id?: string;
  operator_name?: string;
  action_note?: string;
  created_at?: string;
}

export interface LegalAgreementDetail {
  agreement: LegalAgreementRecord;
  parties: LegalAgreementPartyRecord[];
  documents: LegalDocumentRecord[];
  statusLogs: LegalStatusLogRecord[];
}

export interface LegalAgreementCreateRequest {
  mode: "CREATE_DRAFT";
  agreement: Record<string, unknown>;
  parties: Record<string, unknown>[];
  document: Record<string, unknown>;
  statusLog: Record<string, unknown>;
  snapshot: LegalAgreementSnapshot;
}

export interface LegalAgreementUpdateRequest {
  mode: "UPDATE_DRAFT";
  agreementId: number | string;
  documentId?: number | string;
  agreement: Record<string, unknown>;
  parties: Record<string, unknown>[];
  document: Record<string, unknown>;
  statusLog: Record<string, unknown>;
  snapshot: LegalAgreementSnapshot;
}

export type LegalAgreementSaveRequest =
  | LegalAgreementCreateRequest
  | LegalAgreementUpdateRequest;
