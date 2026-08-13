/**
 * CPO application list read guard.
 *
 * Adds row-level visibility constraints to list-like Instant API operations.
 * Ordinary users can read records they applied for, plus records connected to
 * tasks assigned to or completed by them. Admin roles keep the original query.
 *
 * 平台原生审批流说明：审批人在业务表 node_process_user（JSON）中，无法在
 * dataset WHERE 上按 JSON 匹配，因此非 admin 的平台审批人在列表页需要
 * application_read_all_user / workflow_admin_user 角色才能看到待审批单据
 * （详情页 cpoApplicationReadOneGuard 已按 node_process_user 精确放行）。
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

function readRows(response) {
  const rows =
    response?.tableData ||
    response?.data?.tableData ||
    response?.result?.tableData ||
    response?.data?.result?.tableData ||
    [];
  return Array.isArray(rows) ? rows : [];
}

function uniqueNumericIds(rows) {
  return Array.from(
    new Set(
      rows
        .map((row) => Number(row?.biz_id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
}

async function fetchParticipantBizIds(context, bizType, actorUserId) {
  const taskModel = context?.client?.models?.[BIZ_TASK_MODEL_KEY];
  const ccModel = context?.client?.models?.[WORKFLOW_PARTICIPANT_MODEL_KEY];

  const [taskResponse, ccResponse] = await Promise.all([
    taskModel?.filter
      ? taskModel.filter({
          where: {
            biz_type: { $eq: bizType },
            $or: [
              { assignee_user_id: { $eq: actorUserId } },
              { completed_by_user_id: { $eq: actorUserId } },
            ],
          },
          select: ["biz_id"],
          currentPage: 1,
          pageSize: 1000,
        })
      : Promise.resolve({ tableData: [] }),
    ccModel?.filter
      ? ccModel.filter({
          where: {
            biz_type: { $eq: bizType },
            participant_user_id: { $eq: actorUserId },
            participant_type: { $eq: "cc" },
          },
          select: ["biz_id"],
          currentPage: 1,
          pageSize: 1000,
        })
      : Promise.resolve({ tableData: [] }),
  ]);
  return uniqueNumericIds([...readRows(taskResponse), ...readRows(ccResponse)]);
}

function buildVisibilityWhere(actorUserId, participantBizIds) {
  const visibleBranches = [{ applicant_user_id: { $eq: actorUserId } }];
  if (participantBizIds.length) {
    visibleBranches.push({ id: { $in: participantBizIds } });
  }
  return visibleBranches.length === 1
    ? visibleBranches[0]
    : { $or: visibleBranches };
}

export default async function cpoApplicationReadFilterGuard(params, context) {
  const bizType = optionalText(params?.bizType);
  assertBizType(bizType);

  const values = normalizeValues(params);
  const actor = currentActorFromContext(context);
  const originalWhere = values.where || {};
  if (await actorCanReadAll(actor, context)) {
    return { ...values, where: originalWhere };
  }

  const actorUserId = optionalText(actor.userId);
  if (!actorUserId) throw new Error("CPO_ACTOR_MISSING");

  const participantBizIds = await fetchParticipantBizIds(
    context,
    bizType,
    actorUserId,
  );

  return {
    ...values,
    where: {
      $and: [
        originalWhere,
        buildVisibilityWhere(actorUserId, participantBizIds),
      ],
    },
  };
}
