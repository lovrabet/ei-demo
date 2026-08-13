/**
 * CPO 受控删除入口保护。
 *
 * [脚本描述] 禁止业务端绕过受控 Backend Function 直接调用 Instant API delete；须走带校验与级联副作用的受控入口（平台 delete 已为逻辑删除，本守卫保护业务一致性而非防物理丢数）
 * [脚本名称] cpoLogicalDeleteGuard
 * [脚本类型] COMMON
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoLogicalDeleteGuard.js
 *
 * @param {Object} params - Input parameters.
 * @param {Object} context - Execution context (injected by platform).
 * @returns {Promise<Object>} Processing result.
 */
function optionalText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export default async function cpoLogicalDeleteGuard(params, context) {
  const resource = optionalText(params?.resource) || "record";
  const hint =
    resource === "expenseItem" ||
    resource === "bizInvoiceLink" ||
    resource === "salaryPaymentItem"
      ? "cpoSaveDraft；仅草稿删除调用 cpoApplicantFlowAction(action=delete_draft)，正式单据作废调用 action=cancel"
      : resource === "contractPaymentPlan"
        ? "cpoSyncContractPaymentPlans（仅可删除未关联付款的待付款计划）"
        : "对应的受控 Backend Function";
  throw new Error(
    `CPO_DIRECT_DELETE_FORBIDDEN:${resource}:请勿绕过业务校验调用 Instant API delete；请调用 Backend Function：${hint}`,
  );
}
