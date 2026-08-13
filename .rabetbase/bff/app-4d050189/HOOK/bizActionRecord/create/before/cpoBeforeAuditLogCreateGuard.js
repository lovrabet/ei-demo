/**
 * 业务操作日志标准创建接口保护。
 *
 * [脚本描述] 禁止通过标准接口伪造业务操作日志
 * [接口路径] POST /api/app-4d050189/65619b5104e44f03b0dcea52b4d8c397/create
 * [触发节点] before
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/dataset/1013766#api-list
 *
 * @param {Object} params - Current request params or response result.
 * @param {Object} context - Execution context (injected by platform).
 * @returns {Promise<Object>} Modified params object.
 */
export default async function cpoBeforeAuditLogCreateGuard(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoDirectWriteGuard",
    params: {
      resource: "bizActionRecord",
      operation: "create",
      values: params,
    },
  });
}
