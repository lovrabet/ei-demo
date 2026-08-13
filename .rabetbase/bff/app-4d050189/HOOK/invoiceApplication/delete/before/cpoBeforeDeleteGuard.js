/**
 * HOOK function template.
 *
 * [脚本描述] 禁止绕过受控 Backend Function 直接删除主单；须走 cpoApplicantFlowAction（校验草稿/本人与级联清理）
 * [接口路径] POST /api/app-4d050189/ae51202c44e140828ba87e4571094d1a/delete
 * [触发节点] before
 *
 * @param {Object} params - Current request params or response result.
 * @param {Object} context - Execution context (injected by platform).
 * @returns {Promise<Object>} Modified params object.
 */
export default async function cpoBeforeDeleteGuard(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoApplicationDeleteGuard",
    params: { bizType: "invoice_application", values: params },
  });
}
