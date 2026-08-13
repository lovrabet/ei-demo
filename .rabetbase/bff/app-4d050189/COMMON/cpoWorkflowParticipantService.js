/**
 * 工作流参与人服务（叶子 COMMON，不调用其它 BFF）。
 *
 * [脚本描述] 为抄送节点写入幂等的单据可见性授权
 * [脚本名称] cpoWorkflowParticipantService
 * [脚本类型] COMMON
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoWorkflowParticipantService.js
 *
 * @param {{op:"grantCc",bizType:string,bizId:number,participantUserId:string,participantName?:string,workflowStepNo:number,workflowStepName?:string,grantedByUserId?:string,grantedByName?:string}} params
 * @returns {Promise<{participantId:number|string,created:boolean}>}
 */
const WORKFLOW_PARTICIPANT_MODEL_KEY =
  "dataset_464ca3622eab43a3a4b4b4f23af26a8c";

function optionalText(value) {
  return String(value ?? "").trim();
}

function positiveNumber(value, field) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`INVALID_PARAMS:${field}`);
  }
  return numeric;
}

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

function mysqlNow() {
  const chinaTimeOffsetMs = 8 * 60 * 60 * 1000;
  return new Date(Date.now() + chinaTimeOffsetMs)
    .toISOString()
    .replace("T", " ")
    .slice(0, 23);
}

export default async function cpoWorkflowParticipantService(params, context) {
  const {
    op,
    bizType,
    bizId,
    participantUserId,
    participantName = "",
    workflowStepNo,
    workflowStepName = "",
    grantedByUserId = "",
    grantedByName = "",
  } = params || {};
  if (op !== "grantCc") throw new Error(`UNSUPPORTED_OP:${op || ""}`);

  const normalizedBizType = optionalText(bizType);
  const normalizedParticipantUserId = optionalText(participantUserId);
  if (!normalizedBizType || !normalizedParticipantUserId) {
    throw new Error("INVALID_PARAMS:bizType and participantUserId are required");
  }
  const numericBizId = positiveNumber(bizId, "bizId");
  const numericStepNo = positiveNumber(workflowStepNo, "workflowStepNo");
  const model = context?.client?.models?.[WORKFLOW_PARTICIPANT_MODEL_KEY];
  if (!model?.filter || !model?.create || !model?.update) {
    throw new Error("WORKFLOW_PARTICIPANT_DATASET_MISSING");
  }

  const response = await model.filter({
    where: {
      biz_type: { $eq: normalizedBizType },
      biz_id: { $eq: numericBizId },
      participant_user_id: { $eq: normalizedParticipantUserId },
      participant_type: { $eq: "cc" },
      workflow_step_no: { $eq: numericStepNo },
    },
    currentPage: 1,
    pageSize: 1,
    orderBy: [{ id: "desc" }],
  });
  const existing = rowsOf(response)[0];
  const values = {
    participant_name_snapshot: optionalText(participantName),
    workflow_step_name: optionalText(workflowStepName),
    granted_by_user_id: optionalText(grantedByUserId),
    granted_by_name_snapshot: optionalText(grantedByName),
    granted_at: mysqlNow(),
  };

  if (existing?.id) {
    await model.update({ id: existing.id, ...values });
    return { participantId: existing.id, created: false };
  }

  const participantId = await model.create({
    biz_type: normalizedBizType,
    biz_id: numericBizId,
    participant_user_id: normalizedParticipantUserId,
    participant_type: "cc",
    workflow_step_no: numericStepNo,
    ...values,
  });
  return { participantId, created: true };
}
