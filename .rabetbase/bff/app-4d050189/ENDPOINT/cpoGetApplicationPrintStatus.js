/**
 * 查询单张申请单的角色化打印登记状态。
 *
 * [脚本描述] 校验当前用户可查看目标单据后，分别返回财务侧、审批侧、业务侧和当前用户的打印状态
 * [接口路径] POST /api/endpoint/app-4d050189/cpoGetApplicationPrintStatus
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * { "bizType": "expense|invoice|invoice_application|contract|crm_contract|payment|salary_payment|travel", "bizId": 1 }
 *
 * [返回数据结构]
 * { printStatus: { status, roleStatuses, currentUserStatus, currentRoleStatus }, currentRoleScope, currentRoleLabel, permissions }
 */
function optionalText(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function positiveId(value, fieldName) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`INVALID_PARAMS:${fieldName} must be a positive number`);
  }
  return numeric;
}

async function loadReadableRecord(context, map, bizType, bizId) {
  const meta = map?.BIZ_TYPE_TO_DATASET?.[bizType];
  if (!meta?.modelKey) throw new Error(`INVALID_BIZ_TYPE:${bizType}`);
  const record = await context.client.models[meta.modelKey].getOne({
    id: bizId,
  });
  if (!record) throw new Error(`CPO_APPLICATION_NOT_FOUND:${bizType}`);
  await context.client.bff.execute({
    scriptName: "cpoApplicationReadOneGuard",
    params: { bizType, result: record },
  });
}

function defaultStatus(bizType, bizId, roleScope) {
  return {
    bizType,
    bizId,
    roleScope,
    status: "unregistered",
    requestCount: 0,
    confirmedCount: 0,
    hasPendingRequest: false,
  };
}

function permissionsFor(printStatus, isFinance) {
  const current = printStatus?.currentRoleStatus || printStatus;
  return {
    canRequest: true,
    canConfirm:
      current?.status === "requested" || current?.hasPendingRequest === true,
    canBackfill: isFinance,
    canRevoke: isFinance && current?.status === "confirmed",
  };
}

export default async function cpoGetApplicationPrintStatus(params, context) {
  const bizType = optionalText(params?.bizType);
  const bizId = positiveId(params?.bizId, "bizId");
  const bff = context.client.bff;
  const [map, actor, dictionary] = await Promise.all([
    bff.execute({ scriptName: "cpoDatasetMap", params: {} }),
    bff.execute({ scriptName: "cpoCurrentActor", params: {} }),
    bff.execute({ scriptName: "cpoDictionary", params: {} }),
  ]);
  const actorScope = await bff.execute({
    scriptName: "cpoPrintActorScope",
    params: { bizType, bizId, actor, dictionary },
  });
  await loadReadableRecord(context, map, bizType, bizId);
  const result = await bff.execute({
    scriptName: "cpoApplicationPrintStatusService",
    params: {
      items: [{ bizType, bizId }],
      financeUserIds: actorScope.financeUserIds,
      currentUserId: actorScope.actor.userId,
      currentRoleScope: actorScope.roleScope,
    },
  });
  const key = `${bizType}:${bizId}`;
  const fallback = defaultStatus(bizType, bizId, actorScope.roleScope);
  const printStatus = result?.byBizKey?.[key] || {
    ...defaultStatus(bizType, bizId, "finance"),
    roleStatuses: {
      finance: defaultStatus(bizType, bizId, "finance"),
      approver: defaultStatus(bizType, bizId, "approver"),
      business: defaultStatus(bizType, bizId, "business"),
    },
    currentUserStatus: defaultStatus(bizType, bizId, "personal"),
    currentRoleStatus: fallback,
    currentRoleScope: actorScope.roleScope,
  };
  return {
    printStatus,
    currentRoleScope: actorScope.roleScope,
    currentRoleLabel: actorScope.roleLabel,
    permissions: permissionsFor(printStatus, actorScope.isFinance),
  };
}
