/**
 * HOOK function template.
 *
 * [脚本描述] 禁止绕过受控入口直接删除工资付款明细；须随主单受控保存/删除（平台 delete 已为逻辑删除）
 * [接口路径] POST /api/app-4d050189/19ef166f3d2242a19911ccb8a5685bb8/delete
 * [触发节点] before
 *
 * @param {Object} params - Current request params or response result.
 * @param {Object} context - Execution context (injected by platform).
 * @returns {Promise<Object>} Modified params object.
 */
export default async function cpoBeforeSalaryPaymentItemDeleteGuard(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoLogicalDeleteGuard",
    params: { resource: "salaryPaymentItem", values: params },
  });
}
