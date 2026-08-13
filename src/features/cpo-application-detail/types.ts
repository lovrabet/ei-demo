export const CPO_APPLICATION_BIZ_TYPES = [
  "expense",
  "invoice",
  "invoice_application",
  "contract",
  "crm_contract",
  "payment",
  "salary_payment",
  "travel",
] as const;

export type CpoApplicationBizType = (typeof CPO_APPLICATION_BIZ_TYPES)[number];

export type DetailParamResult =
  | { ok: true; bizType: CpoApplicationBizType; bizId: number }
  | { ok: false; message: string };

export type DetailValueFormat =
  | "text"
  | "money"
  | "percent"
  | "date"
  | "datetime"
  | "boolean"
  | "companions"
  | "markdown";

export type DetailField = {
  name: string;
  label: string;
  format?: DetailValueFormat;
  currencyField?: string;
  options?: Record<string, string>;
  span?: 1 | 2;
};

export type DetailSection = {
  title: string;
  fields: DetailField[];
};

export type Document360ModuleKey =
  | "executiveSummary"
  | "document"
  | "relations"
  | "relatedDocuments"
  | "paymentPlans"
  | "expenseItems"
  | "salaryItems"
  | "invoiceLinks"
  | "attachments"
  | "workflow";

export type Document360ModuleDefinition = {
  key: Document360ModuleKey;
  label: string;
  area: "main" | "aside" | "full";
  showWhenEmpty?: boolean;
};

export type ApplicationDetailConfig = {
  label: string;
  editPath: (id: number) => string;
  maxWidth: number;
  amountField: string;
  currencyField?: string;
  sections: DetailSection[];
  modules: Document360ModuleDefinition[];
};

export type WorkflowTask = Record<string, unknown> & {
  id?: number | string;
  workflow_step_no?: number;
  workflow_step_name?: string;
  task_type?: string;
  title?: string;
  assignee_user_id?: string;
  assignee_name_snapshot?: string;
  assignee_role?: string;
  status?: string;
  due_at?: string | number;
  completed_at?: string | number;
  completed_by_name_snapshot?: string;
  comment?: string;
  created_at?: string | number;
  updated_at?: string | number;
};

export type WorkflowAction = Record<string, unknown> & {
  id?: number | string;
  actor_user_id?: string;
  actor_name_snapshot?: string;
  actor_role_snapshot?: string;
  action?: string;
  from_status?: string;
  to_status?: string;
  comment?: string;
  created_at?: string | number;
};

export type WorkflowPlanStep = {
  stepNo: number;
  stepName: string;
  nodeType?: "approval" | "cc";
  taskType?: string;
  assigneeUserId?: string;
  assigneeName?: string;
  assigneeRole?: string;
  state:
    | "upcoming"
    | "current"
    | "completed"
    | "notified"
    | "rejected"
    | "cancelled";
  taskId?: number | string | null;
  taskStatus?: string;
  startedAt?: string | number | null;
  completedAt?: string | number | null;
  attempts?: number;
  conclusion?: {
    action?: string;
    actorUserId?: string;
    actorName?: string;
    comment?: string;
    createdAt?: string | number;
  } | null;
};

export type WorkflowParticipant = Record<string, unknown> & {
  id?: number | string;
  participant_user_id?: string;
  participant_name_snapshot?: string;
  participant_type?: string;
  workflow_step_no?: number;
  workflow_step_name?: string;
  granted_at?: string | number;
};

export type WorkflowAvailableAction = {
  action: string;
  label: string;
  danger?: boolean;
  commentRequired?: boolean;
  adminOverride?: boolean;
  adminOverrideReason?: string;
};

export type AttachmentRecord = Record<string, unknown> & {
  id?: number | string;
  attachment_type?: string;
  file_name?: string;
  file_path?: string;
  file_type?: string;
  source_dir?: string;
  uploaded_by?: string;
  created_at?: string | number;
};

export type ExpenseItemRecord = Record<string, unknown> & {
  id?: number | string;
  expense_id?: number | string;
  occurred_date?: string | number;
  category?: string;
  description?: string;
  original_currency?: string;
  original_amount?: number;
  exchange_rate_to_cny?: number;
  cny_amount?: number;
  reimburse_ratio?: number;
  reimbursable_cny_amount?: number;
  compliance_status?: string;
  remark?: string;
};

export type SalaryPaymentItemRecord = Record<string, unknown> & {
  id?: number | string;
  salary_payment_id?: number | string;
  internal_legal_entity_id?: number | string;
  internal_legal_entity_name_snapshot?: string;
  payment_project?: string;
  employee_count?: number;
  amount?: number;
  currency?: string;
  payment_method?: string;
  sort_no?: number;
  remark?: string;
};

export type ContractPaymentLinkRecord = {
  id: number | string;
  title?: string;
  amount?: number;
  currency?: string;
  status?: string;
};

export type ContractPaymentPlanRecord = Record<string, unknown> & {
  id?: number | string;
  contract_id?: number | string;
  phase_no?: number;
  phase_name?: string;
  planned_amount?: number;
  currency?: string;
  planned_pay_date?: string | number;
  trigger_condition?: string;
  status?: string;
  linked_payment_application_id?: number | string;
  linked_payment_title?: string;
  linked_payment_amount?: number;
  linked_payment_currency?: string;
  linked_payment_status?: string;
  linked_payments?: ContractPaymentLinkRecord[];
  actual_paid_amount?: number;
  actual_paid_at?: string | number;
  remark?: string;
};

export type InvoiceLinkRecord = Record<string, unknown> & {
  id?: number | string;
  invoice_id?: number | string;
  biz_type?: string;
  biz_id?: number | string;
  relation_type?: string;
  amount_used?: number;
  created_at?: string | number;
  invoice?: {
    id?: number | string;
    invoice_no?: string;
    invoice_title?: string;
    seller_name?: string;
    total_amount?: number;
    status?: string;
    file_path?: string;
  };
  attachment?: AttachmentRecord;
};

export type ExecutiveMetric = {
  key: string;
  label: string;
  value: number | string;
  format: "money" | "number" | "text";
  currency?: string;
  tone?: "neutral" | "positive" | "warning";
  description?: string;
};

export type ExecutiveRisk = {
  key: string;
  level: "info" | "warning" | "error";
  title: string;
  description: string;
};

export type RelatedDocumentRecord = {
  key: string;
  bizType: CpoApplicationBizType | "quote" | "legal_agreement" | "crm_customer";
  bizId: number;
  relationType: string;
  relationId?: number;
  title: string;
  amount?: number;
  currency?: string;
  status?: string;
  subtitle?: string;
  details?: Record<string, unknown>;
  externalPath?: string;
};

export type BusinessContext = {
  metrics: ExecutiveMetric[];
  risks: ExecutiveRisk[];
  relatedDocuments: RelatedDocumentRecord[];
  counterpartyPortfolio?: CounterpartyPortfolio;
};

export type CounterpartyPortfolioItem = {
  key: string;
  bizType: "contract" | "quote" | "payment" | "invoice";
  bizId: number;
  title: string;
  amount?: number;
  currency?: string;
  status?: string;
  date?: string | number;
  subtitle?: string;
  matchBasis:
    "partner_id" | "exact_customer_name" | "explicit_business_relation";
  details?: Record<string, unknown>;
  externalPath?: string;
};

export type CounterpartyPortfolio = {
  partner: {
    id: number;
    name: string;
    type?: string;
    status?: string;
    contactName?: string;
    contactPhone?: string;
    source?: string;
  };
  summary: {
    contractCount: number;
    quoteCount: number;
    paymentCount: number;
    invoiceCount: number;
    contractAmount: number;
    paymentAmount: number;
    invoiceAmount: number;
    invoiceUnallocatedAmount: number;
  };
  groups: {
    contracts: CounterpartyPortfolioItem[];
    quotes: CounterpartyPortfolioItem[];
    payments: CounterpartyPortfolioItem[];
    invoices: CounterpartyPortfolioItem[];
  };
  matchNote?: string;
};

export type Document360Management = {
  canManage: boolean;
  capabilities: Array<
    | "contract_lifecycle"
    | "contract_relations"
    | "payment_bank_execution"
    | "payment_invoice_allocation"
    | "invoice_classification"
  >;
};

export type Document360Option = {
  value: number;
  label: string;
  secondary?: string;
  bizType: RelatedDocumentRecord["bizType"];
  bizId: number;
  status?: string;
  amount?: number;
  currency?: string;
  allocatedAmount?: number;
  availableAmount?: number;
};

export type ApplicationDetailSummary = {
  bizType: CpoApplicationBizType;
  bizId: number;
  title: string;
  amount?: number;
  status?: string;
  applicantName?: string;
  updatedAt?: string | number;
};

export type ApplicationDetailResponse = {
  biz: Record<string, unknown>;
  summary: ApplicationDetailSummary;
  tasks: WorkflowTask[];
  actions: WorkflowAction[];
  workflowPlan: WorkflowPlanStep[];
  participants?: WorkflowParticipant[];
  currentTask?: WorkflowTask | null;
  availableActions: WorkflowAvailableAction[];
  canAct: boolean;
  attachments: AttachmentRecord[];
  invoiceLinks: InvoiceLinkRecord[];
  expenseItems: ExpenseItemRecord[];
  salaryItems: SalaryPaymentItemRecord[];
  contractPaymentPlans?: ContractPaymentPlanRecord[];
  businessContext?: BusinessContext;
  management?: Document360Management;
  related: {
    partner?: Record<string, unknown>;
    contract?: Record<string, unknown>;
    paymentPlan?: ContractPaymentPlanRecord;
    bankReceipt?: AttachmentRecord;
  };
};

export type AdvanceWorkflowResponse = {
  bizType: CpoApplicationBizType;
  bizId: number;
  action: string;
  status: string;
  currentTaskId?: number | string | null;
  nextTaskId?: number | string | null;
  summary?: ApplicationDetailSummary;
};

export function parseApplicationDetailParams(
  type?: string,
  id?: string,
): DetailParamResult {
  if (!CPO_APPLICATION_BIZ_TYPES.includes(type as CpoApplicationBizType)) {
    return { ok: false, message: "不支持的单据类型" };
  }
  const bizId = Number(id);
  if (!Number.isInteger(bizId) || bizId <= 0) {
    return { ok: false, message: "单据 ID 无效" };
  }
  return { ok: true, bizType: type as CpoApplicationBizType, bizId };
}
