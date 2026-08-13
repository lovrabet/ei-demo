/**
 * Lovrabet 流程内 SCRIPT 节点回调：同步业务主单状态。
 *
 * [脚本描述] 被 Lovrabet 审批流 SCRIPT 节点调用，根据流程变量更新 yuntoo-ei 业务主单
 * [接口路径] POST /api/endpoint/app-4d050189/cpoFlowBizStateSync
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * {
 *   "bizType": "expense",
 *   "bizId": 12345,
 *   "targetStatus": "submitted",
 *   "handler": "submission_timestamp|fund_execution|contract_sign|activate_receivable_plans|...",
 *   "processInstanceId": "xxx",
 *   "taskId": "xxx",
 *   "variables": { ... }
 * }
 *
 * [返回数据结构]
 * { success: true, updatedFields: { ... } }
 */

function optionalText(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function mysqlNow() {
  const chinaTimeOffsetMs = 8 * 60 * 60 * 1000;
  return new Date(Date.now() + chinaTimeOffsetMs)
    .toISOString()
    .replace("T", " ")
    .slice(0, 23);
}

function normalizeBizId(value) {
  const candidate =
    value && typeof value === "object"
      ? (value.id ?? value.result?.id ?? value.data?.id)
      : value;
  const numericBizId = Number(candidate);
  if (!Number.isFinite(numericBizId) || numericBizId <= 0) {
    throw new Error("INVALID_PARAMS:bizId must be a finite positive number");
  }
  return numericBizId;
}

export default async function cpoFlowBizStateSync(params, context) {
  const {
    bizType,
    bizId,
    targetStatus,
    handler,
    processInstanceId,
    payload = {},
  } = params || {};

  if (!bizType || !targetStatus) {
    throw new Error("INVALID_PARAMS:bizType and targetStatus are required");
  }
  const numericBizId = normalizeBizId(bizId);

  const bff = context.client.bff;
  const [{ BIZ_TYPE_TO_DATASET, DATASET_CODES }, actor] = await Promise.all([
    bff.execute({ scriptName: "cpoDatasetMap", params: {} }),
    bff.execute({ scriptName: "cpoCurrentActor", params: {} }),
  ]);

  const meta = BIZ_TYPE_TO_DATASET[bizType];
  if (!meta) throw new Error(`INVALID_BIZ_TYPE:${bizType}`);

  const model = context.client.models[meta.modelKey];
  if (!model?.update) throw new Error(`MODEL_MISSING:${meta.modelKey}`);

  const record = await model.getOne({ id: numericBizId });
  if (!record?.id) throw new Error(`BIZ_RECORD_NOT_FOUND:${bizType}:${numericBizId}`);

  const now = mysqlNow();
  const actorUserId = optionalText(actor?.userId);
  const actorUserName = optionalText(actor?.userName);

  const updateFields = {
    id: numericBizId,
    [meta.statusField]: targetStatus,
  };

  // 回填 process_instance_id（首次）
  if (processInstanceId && !record.process_instance_id) {
    updateFields.process_instance_id = processInstanceId;
  }

  const handlerSet = new Set(
    Array.isArray(handler) ? handler.map(optionalText) : [optionalText(handler)],
  );

  if (handlerSet.has("submission_timestamp") && meta.hasSubmittedAt && !record.submitted_at) {
    updateFields.submitted_at = now;
  }

  if (handlerSet.has("contract_sign") && meta.signedAtField) {
    updateFields[meta.signedAtField] = meta.signedAtDateOnly ? now.slice(0, 10) : now;
  }

  if (handlerSet.has("fund_execution")) {
    updateFields.last_action_at = now;
    if (payload.bank_status === "bank_pending") {
      updateFields.bank_submitted_at = now;
    }
    if (payload.bank_status === "paid_confirmed") {
      if (!record.bank_submitted_at) updateFields.bank_submitted_at = now;
      updateFields.bank_confirmed_at = now;
      if (actorUserId) updateFields.bank_confirmed_by_user_id = actorUserId;
      if (actorUserName) updateFields.bank_confirmed_by_name_snapshot = actorUserName;
      if (payload.bank_receipt_attachment_id) {
        updateFields.bank_receipt_attachment_id = Number(payload.bank_receipt_attachment_id);
      }
    }
  }

  await model.update(updateFields);

  // 激活收款计划
  if (handlerSet.has("activate_receivable_plans") && DATASET_CODES?.crmReceivablePlan) {
    const planModel = context.client.models[`dataset_${DATASET_CODES.crmReceivablePlan}`];
    if (planModel?.filter && planModel?.update) {
      const planResp = await planModel.filter({
        where: {
          contract_id: { $eq: numericBizId },
          status: { $eq: "DRAFT" },
        },
        select: ["id"],
        currentPage: 1,
        pageSize: 500,
      });
      const planIds = (planResp?.tableData || [])
        .map((row) => Number(row.id))
        .filter((id) => Number.isFinite(id) && id > 0);
      if (planIds.length) {
        await planModel.update({ id: planIds, status: "PENDING" });
      }
    }
  }

  return {
    success: true,
    bizType,
    bizId: numericBizId,
    targetStatus,
    updatedFields: Object.keys(updateFields),
  };
}
