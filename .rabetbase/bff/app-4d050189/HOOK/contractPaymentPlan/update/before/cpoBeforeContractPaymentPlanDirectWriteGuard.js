/**
 * HOOK function template.
 *
 * [脚本描述] 合同付款计划禁止绕过受控入口写入
 * [接口路径] POST /api/app-4d050189/08e17d8ba3a24e938fef89816c8f4ccb/update
 * [触发节点] before
 *
 * @param {Object} params - Current request params or response result.
 * @param {Object} context - Execution context (injected by platform).
 * @returns {Promise<Object>} Modified params object.
 */
export default async function cpoBeforeContractPaymentPlanDirectWriteGuard(
  params,
  context,
) {
  return context.client.bff.execute({
    scriptName: "cpoDirectWriteGuard",
    params: { resource: "contractPaymentPlan", operation: "update" },
  });
}
