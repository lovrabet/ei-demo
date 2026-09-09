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
 * @returns {Promise<{userId:string, userName:string, nickname:string, displayName:string, roles:string[], isAdmin:boolean, isFinanceAdvisor:boolean, isWorkflowAdmin:boolean, canReadAllApplications:boolean}>}
 */
function optionalText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function extractPlatformRoleCodes(roles) {
  if (!Array.isArray(roles)) return [];
  return roles
    .map((role) =>
      role && typeof role === "object" ? optionalText(role.roleCode) : "",
    )
    .filter(Boolean);
}

function unique(values) {
  return Array.from(new Set(values));
}

const FINANCE_ADVISOR_ROLE_CODE = "oa_demo_finance_advisor";
const WORKFLOW_ADMIN_ROLE_CODE = "oa_demo_workflow_admin";

function hasRoleCode(roleCodes, expectedRoleCode) {
  return roleCodes.includes(expectedRoleCode);
}

export default async function cpoCurrentActor(params, context) {
  const userInfo = (context && context.userInfo) || {};
  const userId = optionalText(userInfo.userId || userInfo.id);
  const nickname = optionalText(userInfo.nickname);
  const displayName = nickname || optionalText(userInfo.username) || userId;
  const roleCodes = unique(extractPlatformRoleCodes(userInfo.roles));

  const isAdmin = userInfo.isAdmin === true;
  const isFinanceAdvisor = hasRoleCode(
    roleCodes,
    FINANCE_ADVISOR_ROLE_CODE,
  );
  const isWorkflowAdmin = hasRoleCode(
    roleCodes,
    WORKFLOW_ADMIN_ROLE_CODE,
  );

  return {
    userId,
    userName: displayName,
    nickname,
    displayName,
    roles: roleCodes,
    isAdmin,
    isFinanceAdvisor,
    isWorkflowAdmin,
    canReadAllApplications: isAdmin || isFinanceAdvisor,
  };
}
