/**
 * 按当前用户的业务角色受控登记申请单打印事件。
 *
 * [脚本描述] 财务、审批、业务角色的打印状态互不覆盖；浏览器 afterprint 不被视为物理打印成功
 * [接口路径] POST /api/endpoint/app-4d050189/cpoRegisterApplicationPrint
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * { "bizType": "expense|invoice|invoice_application|contract|crm_contract|payment|salary_payment|travel", "bizId": 1, "event": "request|confirm|revoke", "printMode": "summary|full（发起时必填）", "reason": "补登记或撤销原因" }
 *
 * [返回数据结构]
 * { registered, event, actionRecordId, printStatus, currentRoleScope, currentRoleLabel, permissions }
 */
const EVENTS = new Set(["request", "confirm", "revoke"]);
const PRINT_MODES = new Set(["summary", "full"]);
const ACTION_BY_MODE = {
  summary: "print_summary_requested",
  full: "print_full_requested",
};

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

async function loadPrintStatus(bff, bizType, bizId, actorScope) {
  const result = await bff.execute({
    scriptName: "cpoApplicationPrintStatusService",
    params: {
      items: [{ bizType, bizId }],
      financeUserIds: actorScope.financeUserIds,
      currentUserId: actorScope.actor.userId,
      currentRoleScope: actorScope.roleScope,
    },
  });
  const fallback = {
    bizType,
    bizId,
    roleScope: actorScope.roleScope,
    status: "unregistered",
    requestCount: 0,
    confirmedCount: 0,
    hasPendingRequest: false,
  };
  return (
    result?.byBizKey?.[`${bizType}:${bizId}`] || {
      ...fallback,
      currentRoleStatus: fallback,
    }
  );
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

function actionAndComment({
  event,
  printMode,
  reason,
  manualBackfill,
  roleLabel,
}) {
  const modeLabel = printMode === "full" ? "完整归档件" : "一页摘要";
  if (event === "request") {
    return {
      action: ACTION_BY_MODE[printMode],
      comment: `${roleLabel}发起打印：${modeLabel}`,
    };
  }
  if (event === "confirm") {
    return {
      action: "print_confirmed",
      comment: manualBackfill
        ? `${roleLabel}历史打印补登记：${reason}`
        : `${roleLabel}确认纸质打印完成：${modeLabel}`,
    };
  }
  return {
    action: "print_confirmation_revoked",
    comment: `${roleLabel}撤销打印确认：${reason}`,
  };
}

export default async function cpoRegisterApplicationPrint(params, context) {
  const bizType = optionalText(params?.bizType);
  const bizId = positiveId(params?.bizId, "bizId");
  const event = optionalText(params?.event);
  const printMode = optionalText(params?.printMode);
  const reason = optionalText(params?.reason);
  if (!EVENTS.has(event)) throw new Error(`INVALID_PRINT_EVENT:${event}`);
  if (event === "request" && !PRINT_MODES.has(printMode)) {
    throw new Error(`INVALID_PRINT_MODE:${printMode}`);
  }
  if (reason.length > 500) throw new Error("PRINT_REASON_TOO_LONG");

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
  const before = await loadPrintStatus(bff, bizType, bizId, actorScope);
  const currentBefore = before.currentRoleStatus || before;
  const hasPendingRequest =
    currentBefore.status === "requested" ||
    currentBefore.hasPendingRequest === true;
  const manualBackfill = event === "confirm" && !hasPendingRequest;

  if (manualBackfill && !actorScope.isFinance) {
    throw new Error("CPO_PRINT_BACKFILL_FINANCE_REQUIRED");
  }
  if (manualBackfill && !reason) {
    throw new Error("CPO_PRINT_BACKFILL_REASON_REQUIRED");
  }
  if (event === "revoke") {
    if (!actorScope.isFinance) {
      throw new Error("CPO_PRINT_REVOKE_FINANCE_REQUIRED");
    }
    if (currentBefore.status !== "confirmed") {
      throw new Error("CPO_PRINT_CONFIRMATION_NOT_ACTIVE");
    }
    if (!reason) throw new Error("CPO_PRINT_REVOKE_REASON_REQUIRED");
  }

  const effectiveMode = PRINT_MODES.has(printMode)
    ? printMode
    : currentBefore.lastPrintMode || "summary";
  const { action, comment } = actionAndComment({
    event,
    printMode: effectiveMode,
    reason,
    manualBackfill,
    roleLabel: actorScope.roleLabel,
  });
  const recorded = await bff.execute({
    scriptName: "cpoActionRecorder",
    params: {
      bizType,
      bizId,
      action,
      comment,
      actorUserId: actor.userId,
      actorName: actor.displayName || actor.userName || actor.userId,
      actorRole: `print_scope:${actorScope.roleScope}`,
    },
  });
  const printStatus = await loadPrintStatus(bff, bizType, bizId, actorScope);
  return {
    registered: true,
    event,
    actionRecordId: recorded?.actionRecordId,
    printStatus,
    currentRoleScope: actorScope.roleScope,
    currentRoleLabel: actorScope.roleLabel,
    permissions: permissionsFor(printStatus, actorScope.isFinance),
  };
}
