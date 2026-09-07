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

function normalizeRoles(roleLike) {
  const values = Array.isArray(roleLike) ? roleLike : [roleLike];
  return values
    .map((item) =>
      typeof item === "string"
        ? item
        : item?.code ||
          item?.name ||
          item?.value ||
          item?.roleCode ||
          item?.roleName,
    )
    .map(optionalText)
    .filter(Boolean);
}

function unique(values) {
  return Array.from(new Set(values));
}

const ADMIN_ROLES = new Set([
  "admin",
  "administrator",
  "super_admin",
  "owner",
  "cpo_admin",
  "管理员",
  "应用owner",
]);
const FINANCE_ADVISOR_ROLES = new Set(["finance_advisor", "财务顾问"]);
const WORKFLOW_ADMIN_ROLES = new Set(["workflow_admin", "流程管理员"]);

function hasRole(roles, expected) {
  return roles.some((role) => expected.has(optionalText(role).toLowerCase()));
}

export default async function cpoCurrentActor(params, context) {
  const userInfo = (context && context.userInfo) || {};
  const userId = optionalText(userInfo.userId || userInfo.id);
  const nickname = optionalText(userInfo.nickname);
  const displayName = nickname || optionalText(userInfo.username) || userId;
  const roles = unique([
    ...normalizeRoles(userInfo.roles),
    ...normalizeRoles(userInfo.roleList),
    ...normalizeRoles(userInfo.roleCodes),
    ...normalizeRoles(userInfo.role),
  ]);

  const isAdmin =
    userInfo.isAdmin === true ||
    userInfo.admin === true ||
    userInfo.is_super_admin === true ||
    hasRole(roles, ADMIN_ROLES);
  const isFinanceAdvisor = hasRole(roles, FINANCE_ADVISOR_ROLES);
  const isWorkflowAdmin = hasRole(roles, WORKFLOW_ADMIN_ROLES);

  return {
    userId,
    userName: displayName,
    nickname,
    displayName,
    roles,
    isAdmin,
    isFinanceAdvisor,
    isWorkflowAdmin,
    canReadAllApplications: isAdmin || isFinanceAdvisor,
  };
}
