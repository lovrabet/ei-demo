/**
 * HOOK function template.
 *
 * [脚本描述] 禁止绕过受控入口直接删除付款计划；须走 cpoSyncContractPaymentPlans（校验未关联付款等业务约束）
 * [接口路径] POST /api/app-4d050189/08e17d8ba3a24e938fef89816c8f4ccb/delete
 * [触发节点] before
 *
 * @param {Object} params - Current request params or response result.
 * @param {Object} context - Execution context (injected by platform).
 * @returns {Promise<Object>} Modified params object.
 */
export default async function cpoBeforeContractPaymentPlanDeleteGuard(
  params,
  context,
) {
  return context.client.bff.execute({
    scriptName: "cpoLogicalDeleteGuard",
    params: { resource: "contractPaymentPlan", values: params },
  });
}
