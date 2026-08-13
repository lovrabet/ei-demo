/**
 * 批量汇总申请单打印登记状态。
 *
 * [脚本描述] 按财务、审批、业务角色分别归并打印发起、人工确认和撤销确认；无日志仅表示“未登记”
 * [脚本名称] cpoApplicationPrintStatusService
 * [脚本类型] COMMON
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoApplicationPrintStatusService.js
 *
 * @param {Object} params { items: [{ bizType, bizId }], financeUserIds?: string[], currentUserId?: string, currentRoleScope?: string }
 * @returns {Promise<{byBizKey:Object}>} 以 bizType:bizId 为内部连接键的角色化打印状态映射。
 */
const BIZ_ACTION_RECORD_MODEL_KEY = "dataset_65619b5104e44f03b0dcea52b4d8c397"; // 数据集: 业务操作日志 | 数据表: biz_action_record
const FETCH_PAGE_SIZE = 500;
const MAX_ITEMS = 1000;
const MAX_ACTION_ROWS_PER_TYPE = 10000;

const PRINT_ACTION = {
  SUMMARY_REQUESTED: "print_summary_requested",
  FULL_REQUESTED: "print_full_requested",
  CONFIRMED: "print_confirmed",
  CONFIRMATION_REVOKED: "print_confirmation_revoked",
};
const PRINT_ACTIONS = Object.values(PRINT_ACTION);
const PRINT_ROLE_SCOPES = ["finance", "approver", "business"];
const FINANCE_ROLE_MARKERS = new Set([
  "finance",
  "print_scope:finance",
  "voucher_creator",
  "payer",
  "confirmer",
]);
const APPROVER_ROLE_MARKERS = new Set([
  "approver",
  "print_scope:approver",
  "reviewer",
]);

function optionalText(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function positiveId(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

function totalOf(response, fallback) {
  return typeof response?.paging?.totalCount === "number"
    ? response.paging.totalCount
    : fallback;
}

function timestampOf(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const timestamp = new Date(String(value).replace(" ", "T")).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function bizKey(bizType, bizId) {
  return `${bizType}:${Number(bizId)}`;
}

function defaultStatus(bizType, bizId, roleScope = "") {
  return {
    bizType,
    bizId,
    roleScope,
    status: "unregistered",
    requestCount: 0,
    confirmedCount: 0,
    hasPendingRequest: false,
    lastPrintMode: "",
    lastRequestedAt: null,
    lastRequestedBy: "",
    lastConfirmedAt: null,
    lastConfirmedBy: "",
    lastEventAt: null,
    lastEventBy: "",
  };
}

function normalizeUserIds(value) {
  return new Set(
    (Array.isArray(value) ? value : []).map(optionalText).filter(Boolean),
  );
}

function normalizedRoleScope(value) {
  const scope = optionalText(value).toLowerCase();
  return PRINT_ROLE_SCOPES.includes(scope) ? scope : "business";
}

function actionRoleScope(action, financeUserIds) {
  const actorUserId = optionalText(action?.actor_user_id);
  const role = optionalText(action?.actor_role_snapshot).toLowerCase();
  if (financeUserIds.has(actorUserId) || FINANCE_ROLE_MARKERS.has(role)) {
    return "finance";
  }
  if (APPROVER_ROLE_MARKERS.has(role)) return "approver";
  return "business";
}

function defaultOverview(item, currentRoleScope) {
  const roleStatuses = Object.fromEntries(
    PRINT_ROLE_SCOPES.map((scope) => [
      scope,
      defaultStatus(item.bizType, item.bizId, scope),
    ]),
  );
  return {
    ...roleStatuses.finance,
    roleStatuses,
    currentRoleScope,
    currentRoleStatus: roleStatuses[currentRoleScope],
    currentUserStatus: defaultStatus(item.bizType, item.bizId, "personal"),
  };
}

function normalizeItems(value) {
  const input = Array.isArray(value) ? value : [];
  if (input.length > MAX_ITEMS) {
    throw new Error(`CPO_PRINT_STATUS_TOO_MANY_ITEMS:${input.length}`);
  }
  const unique = new Map();
  for (const item of input) {
    const bizType = optionalText(item?.bizType);
    const bizId = positiveId(item?.bizId);
    if (!bizType || !bizId) continue;
    unique.set(bizKey(bizType, bizId), { bizType, bizId });
  }
  return Array.from(unique.values());
}

async function fetchActions(model, bizType, bizIds) {
  const all = [];
  let currentPage = 1;
  let totalCount = 0;
  do {
    const response = await model.filter({
      where: {
        biz_type: { $eq: bizType },
        biz_id: { $in: bizIds },
        action: { $in: PRINT_ACTIONS },
      },
      select: [
        "id",
        "biz_type",
        "biz_id",
        "action",
        "actor_user_id",
        "actor_name_snapshot",
        "actor_role_snapshot",
        "comment",
        "created_at",
      ],
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      currentPage,
      pageSize: FETCH_PAGE_SIZE,
    });
    const rows = rowsOf(response);
    all.push(...rows);
    totalCount = totalOf(response, all.length);
    if (!rows.length) break;
    currentPage += 1;
  } while (all.length < totalCount && all.length < MAX_ACTION_ROWS_PER_TYPE);
  return all;
}

function actorNameOf(action) {
  return optionalText(action?.actor_name_snapshot) || "操作人姓名缺失";
}

function printModeOf(action) {
  if (action?.action === PRINT_ACTION.SUMMARY_REQUESTED) return "summary";
  if (action?.action === PRINT_ACTION.FULL_REQUESTED) return "full";
  return "";
}

function summarize(item, actions, roleScope = "") {
  if (!actions.length) {
    return defaultStatus(item.bizType, item.bizId, roleScope);
  }
  const ordered = [...actions].sort((left, right) => {
    const timeDifference =
      timestampOf(left.created_at) - timestampOf(right.created_at);
    return timeDifference || Number(left.id || 0) - Number(right.id || 0);
  });
  const requested = ordered.filter((action) =>
    [PRINT_ACTION.SUMMARY_REQUESTED, PRINT_ACTION.FULL_REQUESTED].includes(
      action.action,
    ),
  );
  const confirmed = ordered.filter(
    (action) => action.action === PRINT_ACTION.CONFIRMED,
  );
  const confirmationEvents = ordered.filter((action) =>
    [PRINT_ACTION.CONFIRMED, PRINT_ACTION.CONFIRMATION_REVOKED].includes(
      action.action,
    ),
  );
  const lastAction = ordered[ordered.length - 1];
  const lastRequest = requested[requested.length - 1];
  const lastConfirmation = confirmed[confirmed.length - 1];
  const lastConfirmationEvent =
    confirmationEvents[confirmationEvents.length - 1];
  const lastRequestIndex = lastRequest ? ordered.indexOf(lastRequest) : -1;
  const lastConfirmationEventIndex = lastConfirmationEvent
    ? ordered.indexOf(lastConfirmationEvent)
    : -1;
  const hasActiveConfirmation =
    lastConfirmationEvent?.action === PRINT_ACTION.CONFIRMED;
  const hasPendingRequest =
    Boolean(lastRequest) && lastRequestIndex > lastConfirmationEventIndex;
  let status = "unregistered";
  if (hasActiveConfirmation) status = "confirmed";
  else if (hasPendingRequest) status = "requested";
  else if (
    lastConfirmationEvent?.action === PRINT_ACTION.CONFIRMATION_REVOKED
  ) {
    status = "revoked";
  }

  return {
    bizType: item.bizType,
    bizId: item.bizId,
    roleScope,
    status,
    requestCount: requested.length,
    confirmedCount: confirmed.length,
    hasPendingRequest,
    lastPrintMode: printModeOf(lastRequest),
    lastRequestedAt: lastRequest?.created_at || null,
    lastRequestedBy: actorNameOf(lastRequest),
    lastConfirmedAt: hasActiveConfirmation
      ? lastConfirmationEvent?.created_at || null
      : lastConfirmation?.created_at || null,
    lastConfirmedBy: actorNameOf(
      hasActiveConfirmation ? lastConfirmationEvent : lastConfirmation,
    ),
    lastEventAt: lastAction?.created_at || null,
    lastEventBy: actorNameOf(lastAction),
  };
}

export default async function cpoApplicationPrintStatusService(
  params,
  context,
) {
  const items = normalizeItems(params?.items);
  const financeUserIds = normalizeUserIds(params?.financeUserIds);
  const currentUserId = optionalText(params?.currentUserId);
  const currentRoleScope = normalizedRoleScope(params?.currentRoleScope);
  const byBizKey = Object.fromEntries(
    items.map((item) => [
      bizKey(item.bizType, item.bizId),
      defaultOverview(item, currentRoleScope),
    ]),
  );
  if (!items.length) return { byBizKey };

  const actionModel = context.client.models[BIZ_ACTION_RECORD_MODEL_KEY];
  if (!actionModel?.filter) {
    throw new Error("CPO_PRINT_ACTION_MODEL_UNAVAILABLE");
  }
  const idsByType = {};
  for (const item of items) {
    idsByType[item.bizType] = idsByType[item.bizType] || new Set();
    idsByType[item.bizType].add(item.bizId);
  }
  const actionLists = await Promise.all(
    Object.entries(idsByType).map(([bizType, idSet]) =>
      fetchActions(actionModel, bizType, Array.from(idSet)),
    ),
  );
  const actionsByBizKey = {};
  for (const action of actionLists.flat()) {
    const key = bizKey(action.biz_type, action.biz_id);
    actionsByBizKey[key] = actionsByBizKey[key] || [];
    actionsByBizKey[key].push(action);
  }
  for (const item of items) {
    const key = bizKey(item.bizType, item.bizId);
    const actions = actionsByBizKey[key] || [];
    const roleStatuses = Object.fromEntries(
      PRINT_ROLE_SCOPES.map((scope) => [
        scope,
        summarize(
          item,
          actions.filter(
            (action) => actionRoleScope(action, financeUserIds) === scope,
          ),
          scope,
        ),
      ]),
    );
    const currentUserStatus = summarize(
      item,
      currentUserId
        ? actions.filter(
            (action) => optionalText(action.actor_user_id) === currentUserId,
          )
        : [],
      "personal",
    );
    byBizKey[key] = {
      ...roleStatuses.finance,
      roleStatuses,
      currentRoleScope,
      currentRoleStatus: roleStatuses[currentRoleScope],
      currentUserStatus,
    };
  }
  return { byBizKey };
}
