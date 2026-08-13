/**
 * CPO 主单受控删除保护。
 *
 * [脚本描述] 禁止主单绕过受控 BF 直接调用 Instant API delete；须走 cpoApplicantFlowAction（校验草稿/本人与级联清理后由 BF 调用平台逻辑删除）
 * [脚本名称] cpoApplicationDeleteGuard
 * [脚本类型] COMMON
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoApplicationDeleteGuard.js
 *
 * @param {Object} params - { bizType, values }，values 为 delete 原始参数。
 * @param {Object} context - 平台注入上下文（本脚本不依赖）。
 * @returns {Promise<never>} 始终拒绝业务端绕过受控入口直接删除。
 */
function optionalText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export default async function cpoApplicationDeleteGuard(params, context) {
  const bizType = optionalText(params?.bizType) || "unknown";
  throw new Error(
    `CPO_DELETE_FORBIDDEN:${bizType}:请勿调用 Instant API delete；仅草稿可调用 Backend Function cpoApplicantFlowAction，参数 { bizType: '${bizType}', bizId, action: 'delete_draft' }`,
  );
}
