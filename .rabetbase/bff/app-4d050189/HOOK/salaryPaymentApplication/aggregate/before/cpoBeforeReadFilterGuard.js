/**
 * HOOK function template.
 *
 * [脚本描述] 工资付款主单权限保护
 * [接口路径] POST /api/app-4d050189/235e11a9cb7945c8926b4d31fe64843f/aggregate
 * [触发节点] before
 *
 * @param {Object} params - Current request params or response result.
 * @param {Object} context - Execution context (injected by platform).
 * @returns {Promise<Object>} Modified params object.
 */
export default async function cpoBeforeReadFilterGuard(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoApplicationReadFilterGuard",
    params: { bizType: "salary_payment", values: params },
  });
}
