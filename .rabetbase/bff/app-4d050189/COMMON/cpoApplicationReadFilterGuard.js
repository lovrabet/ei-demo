/**
 * CPO application list read guard.
 *
 * Adds row-level visibility constraints to list-like Instant API operations.
 * Lovrabet 管理员、应用 owner 和财务顾问可读取全部申请；普通用户的 Dataset
 * 列表查询只读取本人申请。审批人的待办列表统一来自平台 Flow API。
 *
 * 平台原生审批流说明：审批人在业务表 node_process_user（JSON）中，无法在
 * dataset WHERE 上按 JSON 匹配，因此非管理角色的平台审批人在列表页需要
 * finance_advisor（财务顾问）等读全量角色才能看到待审批单据
 * （详情页 cpoApplicationReadOneGuard 已按 node_process_user 精确放行）。
 */
const VALID_BIZ_TYPES = new Set([
  "expense",
  "invoice",
  "invoice_application",
  "contract",
  "crm_contract",
  "payment",
  "salary_payment",
  "travel",
]);

function optionalText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeRole(value) {
  return optionalText(value).toLowerCase();
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
    .map(normalizeRole)
    .filter(Boolean);
}

function pickFirstText(...values) {
  for (const value of values) {
    const text = optionalText(value);
    if (text) return text;
  }
  return "";
}

function currentActorFromContext(context) {
  const userInfo = context?.userInfo || {};
  return {
    userId: pickFirstText(userInfo.userId, userInfo.id),
  };
}

function actorHasReadAllRole(actor, context) {
  const userInfo = context?.userInfo || {};
  if (
    userInfo.isAdmin === true ||
    userInfo.admin === true ||
    userInfo.is_super_admin === true
  ) {
    return true;
  }
  const roles = [
    ...normalizeRoles(userInfo.roles),
    ...normalizeRoles(userInfo.roleList),
    ...normalizeRoles(userInfo.roleCodes),
    ...normalizeRoles(userInfo.role),
  ];
  return roles.some((role) =>
    [
      "admin",
      "administrator",
      "super_admin",
      "owner",
      "cpo_admin",
      "管理员",
      "应用owner",
      "finance_advisor",
      "财务顾问",
    ].includes(role),
  );
}

function actorCanReadAll(actor, context) {
  return actorHasReadAllRole(actor, context);
}

function normalizeValues(params) {
  const values =
    params?.values && typeof params.values === "object"
      ? params.values
      : params;
  if (!values || typeof values !== "object") {
    throw new Error("INVALID_PARAMS:values are required");
  }
  return values;
}

function assertBizType(bizType) {
  if (!VALID_BIZ_TYPES.has(bizType)) {
    throw new Error(`INVALID_BIZ_TYPE:${bizType || ""}`);
  }
}

export default async function cpoApplicationReadFilterGuard(params, context) {
  const bizType = optionalText(params?.bizType);
  assertBizType(bizType);

  const values = normalizeValues(params);
  const actor = currentActorFromContext(context);
  const originalWhere = values.where || {};

  if (actorCanReadAll(actor, context)) {
    return { ...values, where: originalWhere };
  }

  const actorUserId = optionalText(actor.userId);
  if (!actorUserId) throw new Error("CPO_ACTOR_MISSING");

  return {
    ...values,
    where: {
      $and: [originalWhere, { applicant_user_id: { $eq: actorUserId } }],
    },
  };
}
