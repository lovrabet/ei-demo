/**
 * biz_task 轻量任务服务（叶子 COMMON：不调用其它 COMMON）。
 *
 * [脚本描述] 通过 params.op 分派四种任务操作；bizTask 数据集 code 内联在脚本中
 * [脚本名称] cpoTaskService
 * [脚本类型] COMMON（leaf）
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoTaskService.js
 *
 * @param {Object} params
 *   op="getCurrentTask"  { bizType, bizId, taskId? } -> { task }
 *   op="createTask"      { bizType, bizId, taskType, workflowStepNo?, workflowStepName?, title?, assigneeUserId?, assigneeName?, assigneeRole?, comment? } -> { taskId }
 *   op="completeTask"    { taskId, actorUserId?, actorName? } -> { taskId, status }
 *   op="cancelTask"      { taskId, comment? } -> { taskId, status, bizType, bizId }
 * @returns {Promise<Object>}
 */
// MySQL DATETIME 兼容时间字符串，避免与平台自动管理的 updated_at 格式混用触发 SQL-530
function mysqlNow() {
  const chinaTimeOffsetMs = 8 * 60 * 60 * 1000;
  return new Date(Date.now() + chinaTimeOffsetMs)
    .toISOString()
    .replace("T", " ")
    .slice(0, 23);
}

// 与 cpoDatasetMap 保持一致的 bizTask code（平台不变，重复安全）
const BIZ_TASK_CODE = "da9cddc0fd244545b94ae7cddfde21ea";

export default async function cpoTaskService(params, context) {
  const { op } = params || {};
  const taskModel = context.client.models[`dataset_${BIZ_TASK_CODE}`];

  if (op === "getCurrentTask") {
    const { bizType, bizId, taskId } = params;
    if (taskId !== undefined && taskId !== null && taskId !== "") {
      const task = await taskModel.getOne({ id: Number(taskId) });
      return { task: task?.id ? task : null };
    }
    const resp = await taskModel.filter({
      where: {
        biz_type: { $eq: bizType },
        biz_id: { $eq: Number(bizId) },
        status: { $eq: "pending" },
      },
      currentPage: 1,
      pageSize: 1,
    });
    return { task: (resp.tableData && resp.tableData[0]) || null };
  }

  if (op === "createTask") {
    const {
      bizType,
      bizId,
      taskType,
      workflowStepNo,
      workflowStepName,
      workflowKey,
      workflowVersion,
      title,
      assigneeUserId,
      assigneeName,
      assigneeRole,
      comment,
    } = params;
    const numericBizId = Number(bizId);
    if (!bizType || !Number.isFinite(numericBizId) || !taskType) {
      throw new Error("INVALID_PARAMS:createTask requires bizType,bizId,taskType");
    }
    // created_at/updated_at 由 DB DEFAULT/ON UPDATE 自动维护，不显式赋值
    const payload = {
      biz_type: bizType,
      biz_id: numericBizId,
      task_type: taskType,
      title: title || `${bizType}-${numericBizId}-${taskType}`,
      status: "pending",
    };
    if (workflowStepNo !== undefined && workflowStepNo !== null && workflowStepNo !== "") {
      payload.workflow_step_no = Number(workflowStepNo);
    }
    if (workflowStepName) payload.workflow_step_name = workflowStepName;
    if (workflowKey) payload.workflow_key = workflowKey;
    if (Number(workflowVersion) > 0) {
      payload.workflow_version = Number(workflowVersion);
    }
    if (assigneeUserId) payload.assignee_user_id = assigneeUserId;
    if (assigneeName) payload.assignee_name_snapshot = assigneeName;
    if (assigneeRole) payload.assignee_role = assigneeRole; // SELECT: reviewer/voucher_creator/payer/confirmer/admin
    if (comment) payload.comment = comment;
    const taskId = await taskModel.create(payload);
    return { taskId };
  }

  if (op === "completeTask") {
    const { taskId, actorUserId, actorName } = params;
    const numericTaskId = Number(taskId);
    if (!Number.isFinite(numericTaskId)) throw new Error("INVALID_PARAMS:completeTask requires taskId");
    const existing = await taskModel.getOne({ id: numericTaskId });
    if (!existing?.id) {
      throw new Error(`TASK_NOT_FOUND:${numericTaskId}`);
    }
    const payload = { id: numericTaskId, status: "done", completed_at: mysqlNow() };
    if (actorUserId) payload.completed_by_user_id = actorUserId;
    if (actorName) payload.completed_by_name_snapshot = actorName;
    await taskModel.update(payload);
    return { taskId: numericTaskId, status: "done" };
  }

  if (op === "cancelTask") {
    const { taskId, comment } = params;
    const numericTaskId = Number(taskId);
    if (!Number.isFinite(numericTaskId)) throw new Error("INVALID_PARAMS:cancelTask requires taskId");
    const existing = await taskModel.getOne({ id: numericTaskId });
    if (!existing?.id) {
      throw new Error(`TASK_NOT_FOUND:${numericTaskId}`);
    }
    const payload = { id: numericTaskId, status: "cancelled" };
    if (comment) payload.comment = comment;
    await taskModel.update(payload);
    return { taskId: numericTaskId, status: "cancelled", bizType: existing.biz_type, bizId: existing.biz_id };
  }

  throw new Error(`TASK_OP_NOT_SUPPORTED:${op || "undefined"}`);
}
