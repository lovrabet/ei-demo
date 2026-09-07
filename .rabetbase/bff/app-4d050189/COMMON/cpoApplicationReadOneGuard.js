/**
 * CPO application detail read guard.
 *
 * Lovrabet 管理员、应用 owner 和财务顾问可读取全部申请；普通用户只能读取本人申请
 * 或平台 Flow 写入 node_process_user 的当前流程参与单据。
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

function assertBizType(bizType) {
  if (!VALID_BIZ_TYPES.has(bizType)) {
    throw new Error(`INVALID_BIZ_TYPE:${bizType || ""}`);
  }
}

function normalizeResult(params) {
  if (params && typeof params === "object" && "result" in params) {
    return params.result;
  }
  if (params && typeof params === "object" && "values" in params) {
    return params.values;
  }
  return params;
}

/**
 * 平台原生审批流将审批人回写到业务表 node_process_user（JSON：
 * { assignees: [userId], candidateUsers, tasks: [{ assignee, ... }] }）。
 * legacy 的 biz_task 已废弃清空，审批人本人（含候选/抄送用户）应可读该单据。
 */
function parseNodeProcessUserIds(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const topLevel = [
      ...(Array.isArray(parsed?.assignees) ? parsed.assignees : []),
      ...(Array.isArray(parsed?.candidateUsers) ? parsed.candidateUsers : []),
    ];
    const taskLevel = Array.isArray(parsed?.tasks)
      ? parsed.tasks.flatMap((task) => {
          const assignee = task?.assignee;
          return Array.isArray(assignee)
            ? assignee
            : assignee === undefined || assignee === null
              ? []
              : [assignee];
        })
      : [];
    return Array.from(new Set([...topLevel, ...taskLevel]))
      .map(optionalText)
      .filter(Boolean);
  } catch {
    return [];
  }
}

export default async function cpoApplicationReadOneGuard(params, context) {
  const bizType = optionalText(params?.bizType);
  assertBizType(bizType);

  const result = normalizeResult(params);
  if (!result || typeof result !== "object" || !result.id) return result;

  const actor = currentActorFromContext(context);

  if (actorCanReadAll(actor, context)) return result;

  const actorUserId = optionalText(actor.userId);
  if (!actorUserId) throw new Error("CPO_ACTOR_MISSING");

  if (optionalText(result.applicant_user_id) === actorUserId) {
    return result;
  }

  // 平台审批人（node_process_user 中的人）可读该单据，不依赖 legacy biz_task。
  if (parseNodeProcessUserIds(result.node_process_user).includes(actorUserId)) {
    return result;
  }

  throw new Error(`CPO_READ_FORBIDDEN:${bizType}:${result.id}`);
}
