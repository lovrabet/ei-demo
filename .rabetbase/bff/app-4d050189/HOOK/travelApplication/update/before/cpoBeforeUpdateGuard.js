/**
 * HOOK function template.
 *
 * [脚本描述] CPO主单普通更新权限保护
 * [接口路径] POST /api/app-4d050189/28494f18f334400c893576b6e168d3f6/update
 * [触发节点] before
 *
 * @param {Object} params - Current request params or response result.
 * @param {Object} context - Execution context (injected by platform).
 * @returns {Promise<Object>} Modified params object.
 */
export default async function cpoBeforeUpdateGuard(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoApplicationUpdateGuard",
    params: { bizType: "travel", values: params },
  });
}
