/**
 * 返回当前登录用户的申请人展示信息，供前端表单预填申请人字段。
 *
 * [脚本描述] 返回当前登录用户申请人展示信息
 * [接口路径] POST /api/endpoint/app-4d050189/cpoGetCurrentActor
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * {} （无入参；按当前登录用户上下文返回）
 *
 * [返回数据结构]
 * { userId, userName, nickname, displayName, applicant_user_id, applicant_name_snapshot, roles }
 *
 * @param {Object} params - Request parameters.
 * @param {Object} context - Execution context (injected by platform).
 * @returns {Promise<Object>} Business result (wrapped in response.data).
 */
export default async function cpoGetCurrentActor(params, context) {
  const actor = await context.client.bff.execute({
    scriptName: "cpoCurrentActor",
    params: {},
  });

  const userId = actor?.userId || "";
  const displayName =
    actor?.nickname || actor?.displayName || actor?.userName || userId;

  return {
    ...actor,
    userId,
    userName: displayName,
    displayName,
    applicant_user_id: userId,
    applicant_name_snapshot: displayName,
  };
}
