/**
 * HOOK function template.
 *
 * [脚本描述] 禁止绕过受控 Backend Function 直接删除工资付款主单；须走 cpoApplicantFlowAction（校验草稿/本人与级联清理）
 * [接口路径] POST /api/app-4d050189/235e11a9cb7945c8926b4d31fe64843f/delete
 * [触发节点] before
 *
 * @param {Object} params - Current request params or response result.
 * @param {Object} context - Execution context (injected by platform).
 * @returns {Promise<Object>} Modified params object.
 */
export default async function cpoBeforeDeleteGuard(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoApplicationDeleteGuard",
    params: { bizType: "salary_payment", values: params },
  });
}
