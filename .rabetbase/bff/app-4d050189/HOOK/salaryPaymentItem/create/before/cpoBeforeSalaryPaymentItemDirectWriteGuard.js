/**
 * HOOK function template.
 *
 * [脚本描述] 工资付款明细禁止绕过受控保存入口写入
 * [接口路径] POST /api/app-4d050189/19ef166f3d2242a19911ccb8a5685bb8/create
 * [触发节点] before
 *
 * @param {Object} params - Current request params or response result.
 * @param {Object} context - Execution context (injected by platform).
 * @returns {Promise<Object>} Modified params object.
 */
export default async function cpoBeforeSalaryPaymentItemDirectWriteGuard(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoDirectWriteGuard",
    params: { resource: "salaryPaymentItem", operation: "create" },
  });
}
