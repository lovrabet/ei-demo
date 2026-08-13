/**
 * 写入 biz_action_record 操作流水（叶子 COMMON：不调用其它 COMMON）。
 *
 * [脚本描述] 记录业务对象、动作、操作者、前后状态与备注；bizActionRecord code 内联
 * [脚本名称] cpoActionRecorder
 * [脚本类型] COMMON（leaf）
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoActionRecorder.js
 *
 * @param {Object} params { bizType, bizId, action, fromStatus?, toStatus?, comment?, actorUserId, actorName?, actorRole? }
 * @returns {Promise<{actionRecordId:number}>}
 */
const BIZ_ACTION_RECORD_CODE = "65619b5104e44f03b0dcea52b4d8c397";

export default async function cpoActionRecorder(params, context) {
  const {
    bizType,
    bizId,
    action,
    fromStatus,
    toStatus,
    comment,
    actorUserId,
    actorName,
    actorRole,
    workflowKey,
    workflowVersion,
  } = params || {};
  const numericBizId = Number(bizId);
  if (!bizType || !Number.isFinite(numericBizId) || !action) {
    throw new Error("INVALID_PARAMS:recordAction requires bizType,bizId,action");
  }

  const actionModel = context.client.models[`dataset_${BIZ_ACTION_RECORD_CODE}`];

  const payload = {
    biz_type: bizType,
    biz_id: numericBizId,
    actor_user_id: actorUserId || "",
    action,
    // created_at 由 DB DEFAULT 自动维护
  };
  if (fromStatus) payload.from_status = fromStatus;
  if (toStatus) payload.to_status = toStatus;
  if (comment) payload.comment = comment;
  if (actorName) payload.actor_name_snapshot = actorName;
  if (actorRole) payload.actor_role_snapshot = actorRole; // SELECT: applicant/reviewer/voucher_creator/payer/admin
  if (workflowKey) payload.workflow_key = workflowKey;
  if (Number(workflowVersion) > 0) {
    payload.workflow_version = Number(workflowVersion);
  }

  const actionRecordId = await actionModel.create(payload);
  return { actionRecordId };
}
