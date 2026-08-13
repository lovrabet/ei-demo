/**
 * HOOK function template.
 *
 * [脚本描述] 禁止绕过受控 Backend Function 直接调用 Instant API delete；须走带校验与级联副作用的受控入口（平台 delete 已为逻辑删除，本守卫保护业务一致性）
 * [接口路径] POST /api/app-4d050189/68c70907e27c481cbefb96dd3906936e/delete
 * [触发节点] before
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/dataset/1013767#api-list
 *
 * @param {Object} params - Current request params or response result.
 * @param {Object} context - Execution context (injected by platform).
 * @returns {Promise<Object>} Modified params object.
 */
export default async function cpoBeforePhysicalDeleteGuard(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoLogicalDeleteGuard",
    params: { resource: "businessPartner", values: params },
  });
}
