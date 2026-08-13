/**
 * CPO application detail read guard.
 *
 * Checks a getOne-like result after the record has been loaded. Ordinary users
 * can read records they applied for, plus records connected to tasks assigned
 * to or completed by them. Admin roles keep the original result.
 */
const READ_ALL_USER_CATEGORIES = [
  "workflow_admin_user",
  "application_read_all_user",
];

const BIZ_TASK_MODEL_KEY = "dataset_da9cddc0fd244545b94ae7cddfde21ea";
const WORKFLOW_PARTICIPANT_MODEL_KEY =
  "dataset_464ca3622eab43a3a4b4b4f23af26a8c";
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
  return normalizeRole(userInfo.role) === "admin";
}

async function actorIsConfiguredReadAllUser(actor, context) {
  const actorUserId = optionalText(actor?.userId);
  const execute = context?.client?.bff?.execute;
  if (!actorUserId || typeof execute !== "function") return false;
  try {
    const dictionary = await execute({
      scriptName: "cpoDictionary",
      params: {},
    });
    return READ_ALL_USER_CATEGORIES.some((category) =>
      Object.prototype.hasOwnProperty.call(
        dictionary?.[category] || {},
        actorUserId,
      ),
    );
  } catch {
    return false;
  }
}

async function actorCanReadAll(actor, context) {
  return (
    actorHasReadAllRole(actor, context) ||
    (await actorIsConfiguredReadAllUser(actor, context))
  );
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

function readRows(response) {
  const rows =
    response?.tableData ||
    response?.data?.tableData ||
    response?.result?.tableData ||
    response?.data?.result?.tableData ||
    [];
  return Array.isArray(rows) ? rows : [];
}

async function actorHasTaskAccess(context, bizType, bizId, actorUserId) {
  const taskModel = context?.client?.models?.[BIZ_TASK_MODEL_KEY];
  if (!taskModel?.filter) return false;

  const response = await taskModel.filter({
    where: {
      biz_type: { $eq: bizType },
      biz_id: { $eq: Number(bizId) },
      $or: [
        { assignee_user_id: { $eq: actorUserId } },
        { completed_by_user_id: { $eq: actorUserId } },
      ],
    },
    select: ["id"],
    currentPage: 1,
    pageSize: 1,
  });
  return readRows(response).length > 0;
}

async function actorHasCcAccess(context, bizType, bizId, actorUserId) {
  const model = context?.client?.models?.[WORKFLOW_PARTICIPANT_MODEL_KEY];
  if (!model?.filter) return false;
  const response = await model.filter({
    where: {
      biz_type: { $eq: bizType },
      biz_id: { $eq: Number(bizId) },
      participant_user_id: { $eq: actorUserId },
      participant_type: { $eq: "cc" },
    },
    select: ["id"],
    currentPage: 1,
    pageSize: 1,
  });
  return readRows(response).length > 0;
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
  if (await actorCanReadAll(actor, context)) return result;

  const actorUserId = optionalText(actor.userId);
  if (!actorUserId) throw new Error("CPO_ACTOR_MISSING");

  if (optionalText(result.applicant_user_id) === actorUserId) {
    return result;
  }

  // 平台审批人（node_process_user 中的人）可读该单据，不依赖 legacy biz_task。
  if (parseNodeProcessUserIds(result.node_process_user).includes(actorUserId)) {
    return result;
  }

  const [hasTaskAccess, hasCcAccess] = await Promise.all([
    actorHasTaskAccess(context, bizType, result.id, actorUserId),
    actorHasCcAccess(context, bizType, result.id, actorUserId),
  ]);
  if (hasTaskAccess || hasCcAccess) {
    return result;
  }

  throw new Error(`CPO_READ_FORBIDDEN:${bizType}:${result.id}`);
}
