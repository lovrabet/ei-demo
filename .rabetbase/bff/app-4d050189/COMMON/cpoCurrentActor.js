/**
 * 从平台正式注入的 context.userInfo 字段解析当前操作人。
 *
 * [脚本描述] 使用 userId/id、nickname、username、role 返回当前操作人
 * [脚本名称] cpoCurrentActor
 * [脚本类型] COMMON
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoCurrentActor.js
 *
 * @param {Object} params - 无需入参。
 * @param {Object} context - 平台注入上下文，读取 context.userInfo。
 * @returns {Promise<{userId:string, userName:string, nickname:string, displayName:string, roles:string[]}>}
 */
function optionalText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export default async function cpoCurrentActor(params, context) {
  const userInfo = (context && context.userInfo) || {};
  const userId = optionalText(userInfo.userId || userInfo.id);
  const nickname = optionalText(userInfo.nickname);
  const displayName = nickname || optionalText(userInfo.username) || userId;
  const role = optionalText(userInfo.role);

  return {
    userId,
    userName: displayName,
    nickname,
    displayName,
    roles: role ? [role] : [],
  };
}
