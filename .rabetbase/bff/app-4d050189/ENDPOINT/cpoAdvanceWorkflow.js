/**
 * 核心状态推进入口（ENDPOINT 内编排）：状态机校验 -> 主单更新 -> 当前任务完成 -> 下一任务创建 -> 流水写入。
 *
 * [脚本描述] ENDPOINT 是唯一允许 bff.execute 调用多个 leaf COMMON 的入口；这是平台对 COMMON→COMMON 的硬约束
 * [接口路径] POST /api/endpoint/app-4d050189/cpoAdvanceWorkflow
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * {
 *   "bizType": "expense|contract|payment",
 *   "bizId": 123,
 *   "taskId": 456,
 *   "action": "submit|review_pass|review_reject|create_voucher|prepare_bank_order|submit_to_bank|confirm_paid|confirm_legacy_paid|mark_payment_failed|sign|cancel",
 *   "comment": "操作意见（可选）",
 *   "payload": { "bank_receipt_attachment_id": 789, "nextAssigneeUserId": "...", "actorRole": "reviewer" }
 * }
 *
 * [返回数据结构]
 * { bizType, bizId, action, status, currentTaskId, nextTaskId, summary }
 */

// MySQL DATETIME(3) 兼容的 Asia/Shanghai 时间字符串。
// 关键：不能含 'T' 或 'Z'，否则与平台注入的 naive local 时间混用时触发 SQL-530。
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
      ? (value.id ??
        value.result?.id ??
        value.data?.id ??
        value.data?.result?.id)
      : value;
  const numericBizId = Number(candidate);
  if (!Number.isFinite(numericBizId) || numericBizId <= 0) {
    throw new Error("INVALID_PARAMS:bizId must be a finite positive number");
  }
  return numericBizId;
}

function optionalText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

const LEGACY_WORKFLOW_KEYS = {
  expense: "expense_reimbursement",
  travel: "travel_request",
  payment: "vendor_payment",
  salary_payment: "salary_payment",
  contract: "external_service_contract",
  crm_contract: "receivable_sales_contract",
  invoice: "outgoing_invoice_application",
  invoice_application: "outgoing_invoice_application",
};

async function resolveScenario(bff, bizType, record, task) {
  try {
    return await bff.execute({
      scriptName: "cpoWorkflowScenario",
      params: { bizType, record, task },
    });
  } catch (error) {
    const workflowKey =
      optionalText(task?.workflow_key) || LEGACY_WORKFLOW_KEYS[bizType];
    if (!workflowKey) throw error;
    return {
      workflowKey,
      versionNo: Number(task?.workflow_version) || null,
      scenario: { executionMode: "workflow" },
    };
  }
}

function resolveNotificationEventType(action, toStatus, nextTaskId) {
  if (nextTaskId) return "TASK_ASSIGNED";
  const normalizedAction = optionalText(action).toLowerCase();
  const normalizedStatus = optionalText(toStatus).toLowerCase();
  if (
    normalizedAction.includes("reject") ||
    normalizedStatus.includes("reject")
  ) {
    return "WORKFLOW_REJECTED";
  }
  if (
    ["cancel", "withdraw"].includes(normalizedAction) ||
    ["cancelled", "withdrawn"].includes(normalizedStatus)
  ) {
    return "WORKFLOW_CANCELLED";
  }
  if (
    normalizedAction.includes("failed") ||
    normalizedStatus.includes("failed")
  ) {
    return "WORKFLOW_UPDATED";
  }
  return "WORKFLOW_COMPLETED";
}

async function sendWorkflowNotification(bff, params) {
  try {
    const result = await bff.execute({
      scriptName: "cpoWorkflowNotifier",
      params,
    });
    return {
      sent: result?.sent === true,
      channelType: result?.channelType || "WEBHOOK",
    };
  } catch (_error) {
    return { sent: false, errorCode: "NOTIFICATION_FAILED" };
  }
}

const ADMIN_ROLES = new Set([
  "admin",
  "administrator",
  "super_admin",
  "cpo_admin",
  "workflow_admin",
]);

function actorIsAdmin(actor) {
  const raw = actor?.raw || {};
  if (
    raw.isAdmin === true ||
    raw.admin === true ||
    raw.is_super_admin === true
  ) {
    return true;
  }
  const roles = Array.isArray(actor?.roles) ? actor.roles : [actor?.roles];
  return roles.some((role) => {
    const value = optionalText(
      typeof role === "string"
        ? role
        : role?.code || role?.name || role?.value || role?.roleCode,
    ).toLowerCase();
    return ADMIN_ROLES.has(value);
  });
}

function actorCanOverrideAssignment(actor, dictionary) {
  if (actorIsAdmin(actor)) return true;
  const userId = optionalText(actor?.userId);
  return Boolean(
    userId &&
    Object.prototype.hasOwnProperty.call(
      dictionary?.workflow_admin_user || {},
      userId,
    ),
  );
}

function resolveWorkflowRule(transitions, currentTask, currentStatus, action) {
  const currentStepNo = Number(currentTask?.workflow_step_no) || 0;
  const currentTaskType = optionalText(currentTask?.task_type);
  const candidates = (transitions || []).filter(
    (transition) =>
      transition.action === action && transition.fromStatus === currentStatus,
  );
  if (currentTask?.status === "pending") {
    return (
      candidates.find(
        (transition) =>
          Number(transition.currentStepNo) === currentStepNo &&
          (!transition.currentTaskType ||
            transition.currentTaskType === currentTaskType),
      ) ||
      candidates.find(
        (transition) =>
          Number(transition.currentStepNo) === 0 &&
          transition.currentTaskType === currentTaskType,
      )
    );
  }
  return candidates.find(
    (transition) =>
      Number(transition.currentStepNo) === 0 &&
      (transition.manualAllowed || action === "submit"),
  );
}

function actorCanPerformRule(
  rule,
  currentTask,
  record,
  actor,
  canOverrideAssignment,
) {
  const actorUserId = optionalText(actor?.userId);
  const applicantUserId = optionalText(record?.applicant_user_id);
  const assigneeUserId = optionalText(currentTask?.assignee_user_id);
  const configuredAssigneeUserId = optionalText(rule.currentAssigneeUserId);
  const isAssignee = Boolean(
    actorUserId && assigneeUserId && actorUserId === assigneeUserId,
  );
  const isConfiguredAssignee = Boolean(
    !currentTask?.id &&
    actorUserId &&
    configuredAssigneeUserId &&
    actorUserId === configuredAssigneeUserId,
  );
  if (rule.actorScope === "manager") return canOverrideAssignment;
  if (rule.actorScope === "applicant") return actorUserId === applicantUserId;
  if (rule.actorScope === "applicant_or_manager") {
    return canOverrideAssignment || actorUserId === applicantUserId;
  }
  return canOverrideAssignment || isAssignee || isConfiguredAssignee;
}

async function grantCcSteps({
  steps,
  bizType,
  bizId,
  actorUserId,
  actorUserName,
  actorRole,
  status,
  workflowKey,
  workflowVersion,
  context,
}) {
  const participantIds = [];
  for (const step of steps || []) {
    if (!step.assigneeUserId) {
      throw new Error(
        `WORKFLOW_STEP_ASSIGNEE_MISSING:${bizType}:${step.stepNo}`,
      );
    }
    const granted = await context.client.bff.execute({
      scriptName: "cpoWorkflowParticipantService",
      params: {
        op: "grantCc",
        bizType,
        bizId,
        participantUserId: step.assigneeUserId,
        participantName: step.assigneeName,
        workflowStepNo: step.stepNo,
        workflowStepName: step.stepName,
        grantedByUserId: actorUserId,
        grantedByName: actorUserName,
      },
    });
    if (granted?.participantId) participantIds.push(granted.participantId);
    await context.client.bff.execute({
      scriptName: "cpoActionRecorder",
      params: {
        bizType,
        bizId,
        action: "cc_notify",
        fromStatus: status,
        toStatus: status,
        comment: `抄送给${step.assigneeName || step.assigneeUserId}`,
        actorUserId,
        actorName: actorUserName,
        actorRole,
        workflowKey,
        workflowVersion,
      },
    });
  }
  return participantIds;
}

function assertConfiguredNextAssignee(bizType, rule) {
  if (!rule?.nextTaskType || !rule.nextWorkflowStepNo) return;
  if (!rule.nextAssigneeUserId || !rule.nextAssigneeName) {
    throw new Error(
      `WORKFLOW_STEP_ASSIGNEE_MISSING:${bizType}:${rule.nextWorkflowStepNo}`,
    );
  }
}

export default async function cpoAdvanceWorkflow(params, context) {
  const {
    bizType,
    bizId,
    taskId,
    action,
    comment = "",
    payload = {},
  } = params || {};
  if (!bizType || bizId === undefined || bizId === null || !action) {
    throw new Error("INVALID_PARAMS:bizType, bizId and action are required");
  }
  const numericBizId = normalizeBizId(bizId);
  const bff = context.client.bff;

  // 1. 状态机配置
  const workflowConfig = await bff.execute({
    scriptName: "cpoWorkflowConfig",
    params: {},
  });

  // 2. 主单元数据 + 当前操作人
  const { BIZ_TYPE_TO_DATASET, DATASET_CODES } = await bff.execute({
    scriptName: "cpoDatasetMap",
    params: {},
  });
  const meta = BIZ_TYPE_TO_DATASET[bizType];
  if (!meta) throw new Error(`INVALID_BIZ_TYPE:${bizType}`);

  const actor = await bff.execute({
    scriptName: "cpoCurrentActor",
    params: {},
  });
  const actorUserId = optionalText(actor.userId);
  const actorUserName = optionalText(actor.userName);
  const permissionDictionary = await bff.execute({
    scriptName: "cpoDictionary",
    params: {},
  });
  // 流程管理员和平台系统管理员可以代操作；申请单汇总可见用户仍必须是当前任务负责人。
  const canOverrideAssignment = actorCanOverrideAssignment(
    actor,
    permissionDictionary,
  );

  const { record, summary } = await bff.execute({
    scriptName: "cpoBizResolver",
    params: { bizType, bizId: numericBizId, meta },
  });
  const currentStatus = record[meta.statusField];
  if (
    bizType === "crm_contract" &&
    Number(record[meta.workflowManagedField || "workflow_managed"]) !== 1
  ) {
    throw new Error("WORKFLOW_NOT_MANAGED:crm_contract");
  }

  // 平台审批流守卫：主单已接入平台原生 Flow（带 process_instance_id）时，
  // 审批动作必须走平台 /api/approve，不再进入 legacy 状态机（biz_task 已废弃）。
  // legacy 引擎仅对未绑定平台流程的历史单据生效。
  if (record.process_instance_id) {
    throw new Error(
      `WORKFLOW_MIGRATED_TO_PLATFORM:${bizType}:${numericBizId} 该单据已接入平台原生审批流，请在平台审批中心操作`,
    );
  }

  // 3. 当前待办任务
  const { task: currentTask } = await bff.execute({
    scriptName: "cpoTaskService",
    params: { op: "getCurrentTask", bizType, bizId: numericBizId, taskId },
  });

  const scenario = await resolveScenario(bff, bizType, record, currentTask);
  const workflowKey = scenario.workflowKey;
  const pinnedVersion = Number(scenario.versionNo) || 0;
  const versionedDefinition = pinnedVersion
    ? workflowConfig.WORKFLOW_CONFIG_BY_KEY_VERSION?.[
        `${workflowKey}@${pinnedVersion}`
      ]
    : workflowConfig.WORKFLOW_CONFIG_BY_KEY?.[workflowKey];
  const legacyDefinition = workflowConfig.WORKFLOW_CONFIG?.[bizType];
  const definition =
    versionedDefinition ||
    (legacyDefinition
      ? {
          ...legacyDefinition,
          versionNo: legacyDefinition.versionNo || 1,
          transitions:
            legacyDefinition.transitions ||
            workflowConfig.WORKFLOW_TRANSITIONS_BY_TYPE?.[bizType] ||
            [],
        }
      : null);
  if (!definition) {
    throw new Error(
      `WORKFLOW_DEFINITION_MISSING:${workflowKey}:${pinnedVersion || "published"}`,
    );
  }
  const workflowVersion = Number(definition.versionNo);

  const rule = resolveWorkflowRule(
    definition.transitions,
    currentTask,
    currentStatus,
    action,
  );
  if (!rule) throw new Error(`ACTION_NOT_ALLOWED:${bizType}:${action}`);

  // 4. 状态机校验
  if (!rule.from.includes(currentStatus)) {
    throw new Error(
      `STATUS_TRANSITION_INVALID:${bizType}:${currentStatus}:${action}`,
    );
  }
  if (
    !actorCanPerformRule(
      rule,
      currentTask,
      record,
      actor,
      canOverrideAssignment,
    )
  ) {
    throw new Error(`WORKFLOW_ACTION_FORBIDDEN:${bizType}:${action}`);
  }
  if (rule.commentRequired && !optionalText(comment)) {
    throw new Error(`WORKFLOW_COMMENT_REQUIRED:${action}`);
  }
  assertConfiguredNextAssignee(bizType, rule);

  // 兼容历史调用方可能直接以 action=submit 进入本端点的情况；即使绕过
  // cpoSubmitApplication，报销提交仍必须通过同一个服务端发票查重守卫。
  const handlerCodes = new Set(rule.handlerCodes || []);
  if (handlerCodes.has("expense_invoice_guard")) {
    await bff.execute({
      scriptName: "cpoInvoiceDuplicateGuard",
      params: { expenseId: numericBizId, assertUnique: true },
    });
  }

  // 5. 任务归属校验：任务已指派给具体人时，操作人必须一致
  if (
    currentTask &&
    currentTask.assignee_user_id &&
    actorUserId &&
    optionalText(currentTask.assignee_user_id) !== actorUserId
  ) {
    if (!canOverrideAssignment) {
      throw new Error(`TASK_ASSIGNEE_MISMATCH:${currentTask.id}`);
    }
  }

  // 6. 组装主单更新字段
  // 注：updated_at 由平台自动注入并管理，不在此显式赋值（曾因与自定义时间字段格式混用触发 SQL-530）
  // 自定义 DATETIME 字段必须使用与平台 updated_at 同格式（naive local, 无 T/Z），否则 SQL 拼装失败
  const now = mysqlNow();
  const updateFields = { id: numericBizId, [meta.statusField]: rule.to };
  if (rule.extraUpdates) Object.assign(updateFields, rule.extraUpdates);

  if (handlerCodes.has("fund_execution")) {
    updateFields.last_action_at = now;
    if (rule.extraUpdates?.bank_status === "bank_pending") {
      updateFields.bank_submitted_at = now;
    }
    if (rule.extraUpdates?.bank_status === "paid_confirmed") {
      // 新版资金流程由“网银复核并提交”直接完成，不再创建独立的付款确认任务。
      // 首次进入已支付状态时同时保留提交网银与确认完成两个审计时间点。
      if (!record.bank_submitted_at) updateFields.bank_submitted_at = now;
      updateFields.bank_confirmed_at = now;
      if (actorUserId) updateFields.bank_confirmed_by_user_id = actorUserId;
      if (actorUserName)
        updateFields.bank_confirmed_by_name_snapshot = actorUserName;
      if (
        payload.bank_receipt_attachment_id !== undefined &&
        payload.bank_receipt_attachment_id !== null &&
        payload.bank_receipt_attachment_id !== ""
      ) {
        updateFields.bank_receipt_attachment_id = Number(
          payload.bank_receipt_attachment_id,
        );
      }
    }
  }
  if (
    handlerCodes.has("submission_timestamp") &&
    meta.hasSubmittedAt &&
    !record.submitted_at
  ) {
    updateFields.submitted_at = now;
  }
  // 合同签署时回填签署时间
  if (handlerCodes.has("contract_sign")) {
    const signedAtField = meta.signedAtField || "signed_at";
    updateFields[signedAtField] = meta.signedAtDateOnly
      ? now.slice(0, 10)
      : now;
  }

  let receivablePlanModel = null;
  let receivablePlanIds = [];
  if (handlerCodes.has("activate_receivable_plans")) {
    const planCode = DATASET_CODES?.crmReceivablePlan;
    if (!planCode) throw new Error("DATASET_CODE_MISSING:crmReceivablePlan");
    receivablePlanModel = context.client.models[`dataset_${planCode}`];
    if (!receivablePlanModel?.filter || !receivablePlanModel?.update) {
      throw new Error(`MODEL_MISSING:dataset_${planCode}`);
    }
    const response = await receivablePlanModel.filter({
      where: {
        contract_id: { $eq: numericBizId },
        status: { $eq: "DRAFT" },
      },
      select: ["id"],
      currentPage: 1,
      pageSize: 500,
    });
    receivablePlanIds = (response?.tableData || [])
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  let paymentPlanIdToRefresh = null;
  if (handlerCodes.has("payment_plan_sync") && record.payment_plan_id) {
    const planCode = DATASET_CODES?.contractPaymentPlan;
    if (!planCode) throw new Error("DATASET_CODE_MISSING:contractPaymentPlan");
    const paymentPlanModel = context.client.models[`dataset_${planCode}`];
    if (!paymentPlanModel?.getOne) {
      throw new Error(`MODEL_MISSING:dataset_${planCode}`);
    }
    const plan = await paymentPlanModel.getOne({
      id: Number(record.payment_plan_id),
    });
    if (!plan?.id) {
      throw new Error(`PAYMENT_PLAN_NOT_FOUND:${record.payment_plan_id}`);
    }
    if (["not_required", "cancelled"].includes(optionalText(plan.status))) {
      throw new Error(`PAYMENT_PLAN_STATUS_INVALID:${plan.id}:${plan.status}`);
    }
    paymentPlanIdToRefresh = Number(plan.id);
  }

  // 7. 更新主单
  await context.client.models[meta.modelKey].update(updateFields);
  if (receivablePlanModel && receivablePlanIds.length) {
    await receivablePlanModel.update({
      id: receivablePlanIds,
      status: "PENDING",
    });
  }
  if (paymentPlanIdToRefresh) {
    await bff.execute({
      scriptName: "cpoPaymentPlanSummary",
      params: { planIds: [paymentPlanIdToRefresh] },
    });
  }

  // 8. 完成当前任务
  let currentTaskId = null;
  if (currentTask && currentTask.id) {
    currentTaskId = currentTask.id;
    await bff.execute({
      scriptName: "cpoTaskService",
      params: {
        op: "completeTask",
        taskId: currentTask.id,
        actorUserId,
        actorName: actorUserName,
      },
    });
  }

  // 9. 创建下一任务
  let nextTaskId = null;
  if (rule.nextTaskType) {
    const created = await bff.execute({
      scriptName: "cpoTaskService",
      params: {
        op: "createTask",
        bizType,
        bizId: numericBizId,
        taskType: rule.nextTaskType,
        workflowStepNo: rule.nextWorkflowStepNo || "",
        workflowStepName: rule.nextWorkflowStepName || "",
        workflowKey,
        workflowVersion,
        title: rule.nextWorkflowStepName || "待处理任务",
        assigneeRole: rule.nextAssigneeRole || payload.nextAssigneeRole || "",
        assigneeUserId:
          rule.nextAssigneeUserId || payload.nextAssigneeUserId || "",
        assigneeName: rule.nextAssigneeName || payload.nextAssigneeName || "",
        comment,
      },
    });
    nextTaskId = created.taskId;
  }

  // 10. 写操作流水
  const actionRecord = await bff.execute({
    scriptName: "cpoActionRecorder",
    params: {
      bizType,
      bizId: numericBizId,
      action,
      fromStatus: currentStatus,
      toStatus: rule.to,
      comment,
      actorUserId,
      actorName: actorUserName,
      actorRole: payload.actorRole || rule.actorRole || "",
      workflowKey,
      workflowVersion,
    },
  });

  const configuredCcSteps = rule.ccSteps || [];
  const finalCcSteps =
    handlerCodes.has("salary_applicant_cc") &&
    !rule.nextTaskType &&
    record.applicant_user_id &&
    !configuredCcSteps.some(
      (step) =>
        optionalText(step.assigneeUserId) ===
        optionalText(record.applicant_user_id),
    )
      ? [
          {
            stepNo:
              configuredCcSteps[0]?.stepNo ||
              Number(rule.currentWorkflowStepNo || 0) + 1,
            stepName: "抄送申请人",
            assigneeUserId: optionalText(record.applicant_user_id),
            assigneeName: optionalText(record.applicant_name_snapshot),
            assigneeRole: "cc",
          },
          ...configuredCcSteps,
        ]
      : configuredCcSteps;
  const ccParticipantIds = await grantCcSteps({
    steps: finalCcSteps,
    bizType,
    bizId: numericBizId,
    actorUserId,
    actorUserName,
    actorRole: payload.actorRole || rule.actorRole || "",
    status: rule.to,
    workflowKey,
    workflowVersion,
    context,
  });

  // 11. 重读主单摘要返回
  const refreshed = await bff.execute({
    scriptName: "cpoBizResolver",
    params: { bizType, bizId: numericBizId, meta },
  });

  // 审批状态、任务、流水和抄送均完成后再通知；外部渠道故障不得影响审批结果。
  const notification = await sendWorkflowNotification(bff, {
    eventId: actionRecord?.actionRecordId,
    eventType: resolveNotificationEventType(
      action,
      refreshed.summary.status || rule.to,
      nextTaskId,
    ),
    bizType,
    bizId: numericBizId,
    action,
    fromStatus: currentStatus,
    toStatus: refreshed.summary.status || rule.to,
    comment,
    summary: refreshed.summary,
    nextTask: nextTaskId
      ? {
          taskId: nextTaskId,
          taskType: rule.nextTaskType,
          stepName: rule.nextWorkflowStepName || "待处理任务",
          assigneeUserId:
            rule.nextAssigneeUserId || payload.nextAssigneeUserId || "",
          assigneeName: rule.nextAssigneeName || payload.nextAssigneeName || "",
        }
      : null,
    actor: {
      userId: actorUserId,
      name: actorUserName,
    },
  });

  return {
    bizType,
    bizId: numericBizId,
    action,
    status: refreshed.summary.status,
    currentTaskId,
    nextTaskId,
    ccParticipantIds,
    summary: refreshed.summary,
    notification,
    workflowKey,
    workflowVersion,
  };
}
