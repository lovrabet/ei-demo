/**
 * HOOK function template.
 *
 * [脚本描述] 工资付款明细单条读取继承主单权限
 * [接口路径] POST /api/app-4d050189/19ef166f3d2242a19911ccb8a5685bb8/getOneOrigin
 * [触发节点] after
 *
 * @param {Object} params - Current request params or response result.
 * @param {Object} context - Execution context (injected by platform).
 * @returns {Promise<Object>} Modified params object.
 */
export default async function cpoAfterSalaryPaymentItemReadOneGuard(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoSalaryPaymentItemReadOneGuard",
    params: { result: params },
  });
}
