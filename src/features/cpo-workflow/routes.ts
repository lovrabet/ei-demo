import { $i18n } from "@/i18n";

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
  expense: $i18n.t("workflow.bizType.expense", "报销"),
  invoice: $i18n.t("workflow.bizType.invoice", "发票"),
  invoice_application: $i18n.t(
    "workflow.bizType.invoiceApplication",
    "销项开票申请",
  ),
  contract: $i18n.t("workflow.bizType.contract", "合同"),
  crm_contract: $i18n.t("workflow.bizType.crmContract", "对外销售合同"),
  payment: $i18n.t("workflow.bizType.payment", "付款"),
  salary_payment: $i18n.t("workflow.bizType.salaryPayment", "工资付款"),
  travel: $i18n.t("workflow.bizType.travel", "差旅出行"),
};

export const CPO_TASK_TYPE_LABEL: Record<string, string> = {
  review: $i18n.t("workflow.task.review", "审核"),
  create_voucher: $i18n.t("workflow.task.createVoucher", "制单"),
  pay: $i18n.t("workflow.task.pay", "付款"),
  bank_review: $i18n.t("workflow.task.bankReview", "网银复核"),
  confirm: $i18n.t("workflow.task.confirm", "确认"),
  sign: $i18n.t("workflow.task.sign", "签署合同"),
  archive: $i18n.t("workflow.task.archive", "历史归档"),
  supplement_material: $i18n.t("workflow.task.supplement", "补材料"),
};

export const CPO_STATUS_LABEL: Record<string, string> = {
  draft: $i18n.t("workflow.status.draft", "草稿"),
  submitted: $i18n.t("workflow.status.submitted", "已提交"),
  reviewed: $i18n.t("workflow.status.reviewed", "已审核"),
  rejected: $i18n.t("workflow.status.rejected", "审批驳回"),
  signed: $i18n.t("workflow.status.signed", "已签署"),
  archived: $i18n.t("workflow.status.completed", "已完成"),
  completed: $i18n.t("workflow.status.completed", "已完成"),
  voucher_created: $i18n.t("workflow.status.voucherCreated", "财务已制单"),
  bank_review_pending: $i18n.t(
    "workflow.status.bankReviewPending",
    "网银待复核",
  ),
  bank_pending: $i18n.t("workflow.status.bankPending", "银行处理中"),
  paid_confirmed: $i18n.t("workflow.status.paidConfirmed", "已支付"),
  payment_failed: $i18n.t("workflow.status.paymentFailed", "付款失败"),
  cancelled: $i18n.t("workflow.status.cancelled", "已作废"),
};

export const CPO_BANK_STATUS_LABEL: Record<string, string> = {
  not_submitted: $i18n.t("workflow.status.pendingBankVoucher", "待网银制单"),
  bank_review_pending: $i18n.t(
    "workflow.status.bankReviewPending",
    "网银待复核",
  ),
  bank_pending: $i18n.t("workflow.status.bankPending", "银行处理中"),
  paid_confirmed: $i18n.t("workflow.status.paidConfirmed", "已支付"),
  payment_failed: $i18n.t("workflow.status.paymentFailed", "付款失败"),
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
