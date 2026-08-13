export type ReceivablePlan = {
  id: number;
  contract_id: number;
  phase_no: number;
  phase_name: string;
  planned_amount?: number | null;
  currency: string;
  planned_receipt_date?: string;
  trigger_condition?: string;
  status: string;
  statusLabel?: string;
  invoiced_amount: number;
  received_amount: number;
  actual_received_date?: string;
  data_quality_status: string;
  remark?: string;
};

export type CustomerReceipt = {
  id: number;
  receiptNo: string;
  title: string;
  amount: number;
  allocatedAmount: number;
  currency: string;
  receivedDate?: string;
  datePrecision: "exact" | "month" | "unknown" | string;
  receiptMethod?: string;
  bankReference?: string;
  dataQualityStatus?: string;
  remark?: string;
  allocations?: Array<{
    id: number;
    contractId?: number;
    contractTitle?: string;
    planId?: number | null;
    planTitle?: string;
    amount: number;
    currency: string;
  }>;
};

export type ReceivableContract = {
  id: number;
  company_id: number;
  opportunity_id?: number;
  contract_no: string;
  title: string;
  amount: number;
  currency: string;
  sign_status: string;
  signStatusLabel?: string;
  signed_date?: string;
  start_date?: string;
  end_date?: string;
  owner_user_id?: number;
  payment_periods?: number;
  applicant_user_id?: string;
  applicant_name_snapshot?: string;
  submitted_at?: string;
  workflow_managed?: number | boolean;
  remark?: string;
  companyName: string;
  opportunityName?: string;
  direction: "receivable";
};

export type CustomerCompany = {
  id: number;
  name: string;
  uscc: string;
  legal_rep?: string;
  industry?: string;
  reg_address?: string;
  business_scope?: string;
  status_code?: string;
  statusLabel?: string;
};

export type CustomerContact = {
  id: number;
  company_id: number;
  name: string;
  title?: string;
  phone?: string;
  email?: string;
  wechat?: string;
  dept?: string;
  is_primary?: number | boolean;
  remarks?: string;
};

export type CustomerOpportunity = {
  id: number;
  company_id: number;
  name: string;
  description?: string;
  stage: string;
  amount?: number;
  currency?: string;
  probability?: number;
  expected_close?: string;
  updated_at?: string;
};

export type CustomerFollowUp = {
  id: number;
  opportunity_id: number;
  contact_id?: number;
  follow_type: string;
  subject?: string;
  content?: string;
  next_action?: string;
  next_action_at?: string;
  followed_at?: string;
};

export type ReceivableContractDetailResponse = {
  contract: ReceivableContract;
  company: CustomerCompany | null;
  opportunity: CustomerOpportunity | null;
  contacts: CustomerContact[];
  plans: ReceivablePlan[];
  receipts: CustomerReceipt[];
  workflow: {
    status: "draft" | "in_progress" | "completed" | "voided";
    statusLabel: string;
    submittedAt?: string | null;
    approvedAt?: string | null;
    signedAt?: string | null;
    actions: Array<{
      id: number;
      action: string;
      actionLabel: string;
      fromStatus?: string;
      toStatus?: string;
      actorName: string;
      actorRole?: string;
      comment?: string;
      createdAt?: string;
    }>;
  };
  attachments: Array<{
    id: number;
    attachmentType?: string;
    fileName: string;
    filePath: string;
    fileType?: string;
    uploadedBy?: string;
    createdAt?: string;
  }>;
  invoices: Array<{
    id: number;
    title: string;
    invoiceNo?: string;
    amount: number;
    allocatedAmount?: number;
    invoiceDate?: string;
    status?: string;
    detailPath: string;
    allocations?: Array<{
      id: number;
      planId: number;
      planTitle: string;
      amount: number;
    }>;
  }>;
  summary: {
    planCount: number;
    completedPlanCount: number;
    plannedAmount: number;
    invoicedAmount: number;
    receiptCount: number;
    receivedAmount: number;
    invoiceCount: number;
    invoiceAmount: number;
    needsCompletionCount: number;
  };
};

export type Customer360ListItem = {
  id: number;
  name: string;
  industry?: string;
  statusCode?: string;
  statusLabel: string;
  opportunityCount: number;
  contractCount: number;
  contractAmount: number;
};

export type Customer360Response = {
  customers: Customer360ListItem[];
  statuses: Array<{ code: string; name: string }>;
  selectedCustomer: CustomerCompany | null;
  contacts: CustomerContact[];
  opportunities: CustomerOpportunity[];
  contracts: Array<
    Omit<ReceivableContract, "direction" | "companyName"> & {
      detailPath: string;
      direction?: "receivable";
      companyName?: string;
    }
  >;
  plans: ReceivablePlan[];
  receipts: CustomerReceipt[];
  followUps: CustomerFollowUp[];
  summary: {
    opportunityCount?: number;
    contractCount?: number;
    contractAmount?: number;
    plannedAmount?: number;
    receiptCount?: number;
    receivedAmount?: number;
  };
};
