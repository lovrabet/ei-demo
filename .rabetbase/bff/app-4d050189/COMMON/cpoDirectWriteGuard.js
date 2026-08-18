/**
 * CPO 核心数据集标准写接口封堵。
 *
 * [脚本描述] 拒绝通过 Instant API 直接 create/batchCreate/update 核心业务表，写入必须走受控 Backend Function
 * [脚本名称] cpoDirectWriteGuard
 * [脚本类型] COMMON
 *
 * @param {Object} params - { resource, operation }
 * @returns {Promise<never>} 始终抛出标准错误。
 */
const ENDPOINT_HINTS = {
  expenseApplication:
    "cpoSaveDraft（聚合创建并由平台 Flow 自动发起）",
  expenseItem: "cpoSaveDraft（明细与发票关联须随报销单一起保存）",
  salaryPaymentItem: "cpoSaveDraft（工资付款明细须随工资付款申请一起保存）",
  contractPaymentPlan:
    "cpoSyncContractPaymentPlans（付款计划须随合同草稿一起保存）",
  bizInvoiceLink:
    "cpoSaveDraft（随业务单据同步关联）",
  invoiceRecord: "cpoSaveDraft（随业务单据受控创建）",
};

export default async function cpoDirectWriteGuard(params) {
  const resource = String(params?.resource || "unknown");
  const operation = String(params?.operation || "write");
  const hint = ENDPOINT_HINTS[resource] || "对应的受控 Backend Function";
  throw new Error(
    `CPO_DIRECT_WRITE_FORBIDDEN:${resource}:${operation}:请勿调用 Instant API；请调用 Backend Function：${hint}`,
  );
}
