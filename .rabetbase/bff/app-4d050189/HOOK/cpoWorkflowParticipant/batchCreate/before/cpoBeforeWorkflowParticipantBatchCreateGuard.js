/**
 * HOOK function template.
 *
 * [脚本描述] 禁止标准接口批量创建工作流参与者
 * [接口路径] POST /api/app-4d050189/464ca3622eab43a3a4b4b4f23af26a8c/batchCreate
 * [触发节点] before
 *
 * @param {Object} params - Current request params or response result.
 * @param {Object} context - Execution context (injected by platform).
 * @returns {Promise<Object>} Modified params object.
 */
export default async function cpoBeforeWorkflowParticipantBatchCreateGuard(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoDirectWriteGuard",
    params: { resource: "cpoWorkflowParticipant", operation: "batchCreate" },
  });
}
