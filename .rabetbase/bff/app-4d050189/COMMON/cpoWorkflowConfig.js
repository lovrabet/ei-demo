/**
 * 场景化工作流配置读取器。
 *
 * [脚本描述] 从版本化节点与动作配置读取已发布定义，生成统一状态机、任务路由和兼容视图
 * [脚本名称] cpoWorkflowConfig
 * [脚本类型] COMMON
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoWorkflowConfig.js
 *
 * @returns {Promise<Object>} 场景、版本及兼容 bizType 工作流配置
 */
const WORKFLOW_STEP_CONFIG_CODE = "e541dc67b0b1410998c8c9c645f06f83";
const WORKFLOW_ACTION_CONFIG_CODE = "d3e59fb7cdf943e8af7e6edee5586cdd";

const FALLBACK_MODEL_KEYS = [
  "cpoWorkflowStepConfig",
  "workflowStepConfig",
  "dataset_cpo_workflow_step_config",
];
const ACTION_FALLBACK_MODEL_KEYS = [
  "cpoWorkflowActionConfig",
  "workflowActionConfig",
  "dataset_cpo_workflow_action_config",
];

function optionalText(value) {
  return String(value ?? "").trim();
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

function truthyFlag(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
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

function workflowKeyOf(row) {
  return (
    optionalText(row.workflow_key) ||
    LEGACY_WORKFLOW_KEYS[optionalText(row.biz_type)] ||
    ""
  );
}

function normalizeStep(row) {
  const taskType = optionalText(row.task_type) || "review";
  const nodeType =
    optionalText(row.node_type) || (taskType === "cc" ? "cc" : "approval");
  return {
    id: Number(row.id),
    bizType: optionalText(row.biz_type),
    workflowKey: workflowKeyOf(row),
    versionNo: Number(row.version_no) || 1,
    definitionStatus: optionalText(row.definition_status) || "published",
    stepNo: Number(row.step_no),
    nodeType,
    taskType,
    stepName: optionalText(row.step_name) || `审批步骤 ${row.step_no}`,
    fromStatus: optionalText(row.from_status) || "submitted",
    passAction: optionalText(row.pass_action) || "review_pass",
    passToStatus: optionalText(row.pass_to_status) || "reviewed",
    rejectAction: optionalText(row.reject_action) || "review_reject",
    rejectToStatus: optionalText(row.reject_to_status) || "rejected",
    assigneeUserId: optionalText(row.assignee_user_id),
    assigneeName: optionalText(row.assignee_name_snapshot),
    assigneeRole: optionalText(row.assignee_role) || "reviewer",
    enabled: truthyFlag(row.enabled),
  };
}

function normalizeTransition(row) {
  const handlerCodes = parseJson(row.handler_codes_json, []);
  const extraUpdates = parseJson(row.field_updates_json, {});
  return {
    id: Number(row.id),
    bizType: optionalText(row.biz_type),
    workflowKey: workflowKeyOf(row),
    versionNo: Number(row.version_no) || 1,
    definitionStatus: optionalText(row.definition_status) || "published",
    action: optionalText(row.action_code),
    label: optionalText(row.action_label) || optionalText(row.action_code),
    fromStatus: optionalText(row.from_status),
    toStatus: optionalText(row.to_status),
    currentStepNo: Number(row.current_step_no) || 0,
    currentTaskType: optionalText(row.current_task_type),
    nextStepNo:
      row.next_step_no === undefined ||
      row.next_step_no === null ||
      row.next_step_no === ""
        ? null
        : Number(row.next_step_no),
    actorScope: optionalText(row.actor_scope) || "assignee_or_manager",
    actorRole: optionalText(row.actor_role),
    danger: truthyFlag(row.danger),
    commentRequired: truthyFlag(row.comment_required),
    manualAllowed: truthyFlag(row.manual_allowed),
    visibleCondition: optionalText(row.visible_condition),
    handlerCodes: Array.isArray(handlerCodes)
      ? handlerCodes.map(optionalText).filter(Boolean)
      : [],
    extraUpdates:
      extraUpdates &&
      typeof extraUpdates === "object" &&
      !Array.isArray(extraUpdates)
        ? extraUpdates
        : {},
    displayOrder: Number(row.display_order) || 100,
    enabled: truthyFlag(row.enabled),
  };
}

function getModel(context, code, fallbacks) {
  const models = context?.client?.models || {};
  return (
    models[`dataset_${code}`] ||
    fallbacks.map((key) => models[key]).find(Boolean)
  );
}

function buildTaskFields(step) {
  if (!step) return {};
  return {
    nextTaskType: step.taskType,
    nextWorkflowStepNo: step.stepNo,
    nextWorkflowStepName: step.stepName,
    nextAssigneeUserId: step.assigneeUserId,
    nextAssigneeName: step.assigneeName,
    nextAssigneeRole: step.assigneeRole,
  };
}

function findCurrentStep(steps, transition) {
  const currentStepNo = Number(transition.currentStepNo) || 0;
  if (currentStepNo) {
    return steps.find((step) => Number(step.stepNo) === currentStepNo) || null;
  }
  if (transition.currentTaskType) {
    return (
      steps.find((step) => step.taskType === transition.currentTaskType) || null
    );
  }
  return null;
}

function buildRouteFields(steps, transition) {
  const currentStepNo = Number(findCurrentStep(steps, transition)?.stepNo) || 0;
  const nextStepNo = transition.nextStepNo;
  const nextStep =
    nextStepNo === null
      ? null
      : steps.find((step) => Number(step.stepNo) === Number(nextStepNo));
  const ccSteps = steps.filter((step) => {
    if (step.nodeType !== "cc" || step.stepNo <= currentStepNo) return false;
    return nextStepNo === null || step.stepNo < Number(nextStepNo);
  });
  return {
    ...(nextStep ? buildTaskFields(nextStep) : { nextTaskType: null }),
    ccSteps,
  };
}

function materializeTransition(transition, steps) {
  const currentStep = findCurrentStep(steps, transition);
  return {
    ...transition,
    currentWorkflowStepNo: Number(currentStep?.stepNo) || null,
    currentWorkflowStepName: currentStep?.stepName || "",
    currentAssigneeUserId: currentStep?.assigneeUserId || "",
    currentAssigneeName: currentStep?.assigneeName || "",
    currentAssigneeRole: currentStep?.assigneeRole || transition.actorRole,
    from: [transition.fromStatus],
    to: transition.toStatus,
    ...buildRouteFields(steps, transition),
  };
}

function buildDefinition(steps, rawTransitions, workflowKey, versionNo) {
  const transitions = rawTransitions.map((transition) =>
    materializeTransition(transition, steps),
  );
  const actions = {};
  for (const transition of transitions) {
    if (!actions[transition.action]) {
      actions[transition.action] = { ...transition };
      continue;
    }
    actions[transition.action].from = Array.from(
      new Set([
        ...(actions[transition.action].from || []),
        transition.fromStatus,
      ]),
    );
  }
  return {
    workflowKey,
    versionNo,
    bizType: steps[0]?.bizType || rawTransitions[0]?.bizType || "",
    steps,
    actions,
    transitions,
  };
}

function compositeKey(workflowKey, versionNo) {
  return `${workflowKey}@${Number(versionNo) || 1}`;
}

export default async function cpoWorkflowConfig(params, context) {
  const stepModel = getModel(
    context,
    WORKFLOW_STEP_CONFIG_CODE,
    FALLBACK_MODEL_KEYS,
  );
  const actionModel = getModel(
    context,
    WORKFLOW_ACTION_CONFIG_CODE,
    ACTION_FALLBACK_MODEL_KEYS,
  );
  if (!stepModel?.filter) throw new Error("WORKFLOW_CONFIG_DATASET_MISSING");
  if (!actionModel?.filter) throw new Error("WORKFLOW_ACTION_CONFIG_MISSING");

  const [stepResponse, actionResponse] = await Promise.all([
    stepModel.filter({
      where: { enabled: { $eq: 1 } },
      select: [
        "id",
        "biz_type",
        "workflow_key",
        "version_no",
        "definition_status",
        "step_no",
        "task_type",
        "node_type",
        "step_name",
        "from_status",
        "pass_action",
        "pass_to_status",
        "reject_action",
        "reject_to_status",
        "assignee_user_id",
        "assignee_name_snapshot",
        "assignee_role",
        "enabled",
      ],
      orderBy: [
        { workflow_key: "asc" },
        { version_no: "asc" },
        { step_no: "asc" },
      ],
      currentPage: 1,
      pageSize: 1000,
    }),
    actionModel.filter({
      where: { enabled: { $eq: 1 } },
      select: [
        "id",
        "biz_type",
        "workflow_key",
        "version_no",
        "definition_status",
        "action_code",
        "action_label",
        "from_status",
        "to_status",
        "current_step_no",
        "current_task_type",
        "next_step_no",
        "actor_scope",
        "actor_role",
        "danger",
        "comment_required",
        "manual_allowed",
        "visible_condition",
        "handler_codes_json",
        "field_updates_json",
        "display_order",
        "enabled",
      ],
      orderBy: [
        { workflow_key: "asc" },
        { version_no: "asc" },
        { display_order: "asc" },
        { id: "asc" },
      ],
      currentPage: 1,
      pageSize: 2000,
    }),
  ]);

  const stepsByDefinition = {};
  const transitionsByDefinition = {};
  const publishedVersionByKey = {};

  for (const step of readRows(stepResponse).map(normalizeStep)) {
    if (!step.workflowKey || !Number.isFinite(step.stepNo) || !step.enabled) {
      continue;
    }
    const key = compositeKey(step.workflowKey, step.versionNo);
    (stepsByDefinition[key] = stepsByDefinition[key] || []).push(step);
    if (step.definitionStatus === "published") {
      publishedVersionByKey[step.workflowKey] = Math.max(
        publishedVersionByKey[step.workflowKey] || 0,
        step.versionNo,
      );
    }
  }
  for (const steps of Object.values(stepsByDefinition)) {
    steps.sort((a, b) => a.stepNo - b.stepNo);
  }

  for (const transition of readRows(actionResponse).map(normalizeTransition)) {
    if (
      !transition.workflowKey ||
      !transition.action ||
      !transition.fromStatus ||
      !transition.toStatus ||
      !transition.enabled
    ) {
      continue;
    }
    const key = compositeKey(transition.workflowKey, transition.versionNo);
    (transitionsByDefinition[key] = transitionsByDefinition[key] || []).push(
      transition,
    );
    if (transition.definitionStatus === "published") {
      publishedVersionByKey[transition.workflowKey] = Math.max(
        publishedVersionByKey[transition.workflowKey] || 0,
        transition.versionNo,
      );
    }
  }

  const allDefinitionKeys = new Set([
    ...Object.keys(stepsByDefinition),
    ...Object.keys(transitionsByDefinition),
  ]);
  const WORKFLOW_CONFIG_BY_KEY_VERSION = {};
  for (const key of allDefinitionKeys) {
    const [workflowKey, rawVersion] = key.split("@");
    const versionNo = Number(rawVersion) || 1;
    WORKFLOW_CONFIG_BY_KEY_VERSION[key] = buildDefinition(
      stepsByDefinition[key] || [],
      transitionsByDefinition[key] || [],
      workflowKey,
      versionNo,
    );
  }

  const WORKFLOW_CONFIG_BY_KEY = {};
  for (const [workflowKey, versionNo] of Object.entries(
    publishedVersionByKey,
  )) {
    const definition =
      WORKFLOW_CONFIG_BY_KEY_VERSION[compositeKey(workflowKey, versionNo)];
    if (definition) WORKFLOW_CONFIG_BY_KEY[workflowKey] = definition;
  }

  // 兼容旧调用：每个 bizType 指向该类型当前已发布的默认场景。
  const WORKFLOW_CONFIG = {};
  const WORKFLOW_STEPS_BY_TYPE = {};
  const WORKFLOW_TRANSITIONS_BY_TYPE = {};
  for (const definition of Object.values(WORKFLOW_CONFIG_BY_KEY)) {
    if (!definition.bizType || WORKFLOW_CONFIG[definition.bizType]) continue;
    WORKFLOW_CONFIG[definition.bizType] = definition;
    WORKFLOW_STEPS_BY_TYPE[definition.bizType] = definition.steps;
    WORKFLOW_TRANSITIONS_BY_TYPE[definition.bizType] = definition.transitions;
  }

  return {
    WORKFLOW_CONFIG,
    WORKFLOW_STEPS_BY_TYPE,
    WORKFLOW_TRANSITIONS_BY_TYPE,
    WORKFLOW_CONFIG_BY_KEY,
    WORKFLOW_CONFIG_BY_KEY_VERSION,
    PUBLISHED_VERSION_BY_KEY: publishedVersionByKey,
  };
}
