export type CpoBizType =
  | "expense"
  | "invoice"
  | "invoice_application"
  | "contract"
  | "crm_contract"
  | "payment"
  | "salary_payment"
  | "travel";

export const CPO_BIZ_TYPE_LABEL: Record<CpoBizType, string> = {
  expense: "报销",
  invoice: "发票",
  invoice_application: "销项开票申请",
  contract: "合同",
  crm_contract: "对外销售合同",
  payment: "付款",
  salary_payment: "工资付款",
  travel: "差旅出行",
};

export const CPO_TASK_TYPE_LABEL: Record<string, string> = {
  review: "审核",
  create_voucher: "制单",
  pay: "付款",
  bank_review: "网银复核",
  confirm: "确认",
  sign: "签署合同",
  archive: "历史归档",
  supplement_material: "补材料",
};

export const CPO_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  submitted: "已提交",
  reviewed: "已审核",
  rejected: "审批驳回",
  signed: "已签署",
  archived: "已完成",
  completed: "已完成",
  voucher_created: "财务已制单",
  bank_review_pending: "网银待复核",
  bank_pending: "银行处理中",
  paid_confirmed: "已支付",
  payment_failed: "付款失败",
  cancelled: "已作废",
};

export const CPO_BANK_STATUS_LABEL: Record<string, string> = {
  not_submitted: "待网银制单",
  bank_review_pending: "网银待复核",
  bank_pending: "银行处理中",
  paid_confirmed: "已支付",
  payment_failed: "付款失败",
};

export const CPO_BANK_STATUS_COLOR: Record<string, string> = {
  not_submitted: "default",
  bank_review_pending: "gold",
  bank_pending: "processing",
  paid_confirmed: "success",
  payment_failed: "error",
};

export const CPO_FORM_CANCEL_PATH = "/my-drafts";

const CPO_BIZ_TYPES = new Set<CpoBizType>([
  "expense",
  "invoice",
  "invoice_application",
  "contract",
  "crm_contract",
  "payment",
  "salary_payment",
  "travel",
]);

const EDITABLE_STATUSES = new Set(["draft", "rejected"]);

export function getCpoDetailPath(bizType: string, bizId: number | string) {
  if (!CPO_BIZ_TYPES.has(bizType as CpoBizType)) return "";
  const id = String(bizId).trim();
  if (!id) return "";
  if (bizType === "crm_contract") {
    return `/receivable-contract-detail/${encodeURIComponent(id)}`;
  }
  return `/application-detail/${bizType}/${encodeURIComponent(id)}`;
}

export function isWorkflowReadonly(status?: string, mode?: string | null) {
  if (mode === "detail") return true;
  if (!status) return false;
  return !EDITABLE_STATUSES.has(status);
}
