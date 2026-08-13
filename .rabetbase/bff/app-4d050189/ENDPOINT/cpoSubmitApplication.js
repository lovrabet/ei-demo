/**
 * 草稿提交入口（独立实现，避免 ENDPOINT→ENDPOINT 依赖）。
 *
 * [脚本描述] submit 动作与 advance 共享状态机/任务/流水服务，但平台不允 ENDPOINT 调用 ENDPOINT，故独立实现 submit 分支
 * [接口路径] POST /api/endpoint/app-4d050189/cpoSubmitApplication
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * { "bizType": "expense|invoice|contract|payment|travel", "bizId": 123, "comment": "提交说明（可选）" }
 *
 * [返回数据结构]
 * { bizType, bizId, action, status, currentTaskId, nextTaskId, summary }
 */
// 与 cpoAdvanceWorkflow 同源：MySQL DATETIME 兼容时间字符串，避免与平台自动注入的 updated_at 格式冲突
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

async function resolveScenario(bff, bizType, record) {
  try {
    return await bff.execute({
      scriptName: "cpoWorkflowScenario",
      params: { bizType, record },
    });
  } catch (error) {
    // 兼容 BFF 分批发布窗口；正式环境完成发布后始终走场景解析器。
    const workflowKey = LEGACY_WORKFLOW_KEYS[bizType];
    if (!workflowKey) throw error;
    return {
      workflowKey,
      versionNo: null,
      scenario: { executionMode: "workflow" },
    };
  }
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

function assertNextAssignee(bizType, rule) {
  if (!rule || (!rule.nextTaskType && !(rule.ccSteps || []).length)) {
    throw new Error(`WORKFLOW_CONFIG_MISSING:${bizType}`);
  }
  if (
    rule.nextTaskType &&
    (!rule.nextAssigneeUserId || !rule.nextAssigneeName)
  ) {
    throw new Error(
      `WORKFLOW_STEP_ASSIGNEE_MISSING:${bizType}:${rule.nextWorkflowStepNo || "submit"}`,
    );
  }
}

async function grantCcSteps({
  steps,
  bizType,
  bizId,
  actor,
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
        grantedByUserId: actor.userId,
        grantedByName: actor.userName,
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
        actorUserId: actor.userId,
        actorName: actor.userName,
        actorRole: "applicant",
        workflowKey,
        workflowVersion,
      },
    });
  }
  return participantIds;
}

const SUBMIT_REQUIRED_FIELDS = {
  expense: [
    "title",
    "expense_type",
    "total_original_amount",
    "total_cny_amount",
    "reimbursable_cny_amount",
  ],
  invoice: [
    "invoice_title",
    "request_type",
    "partner_id",
    "seller_name",
    "buyer_name",
    "invoice_type",
    "invoice_content",
    "total_amount",
  ],
  invoice_application: [
    "application_title",
    "customer_name_snapshot",
    "seller_name",
    "buyer_name",
    "invoice_type",
    "invoice_content",
    "requested_total_amount",
  ],
  contract: [
    "contract_name",
    "contract_type",
    "payment_requirement",
    "our_role",
    "partner_id",
    "amount",
  ],
  crm_contract: ["title", "contract_no", "company_id", "amount", "currency"],
  payment: ["title", "payment_type", "partner_id", "amount"],
  salary_payment: ["title", "payroll_month", "amount", "expected_pay_date"],
  travel: [
    "title",
    "travel_type",
    "trip_region",
    "destination_city",
    "start_date",
    "end_date",
    "estimated_amount",
    "hotel_needed",
  ],
};

function isBlank(value) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  );
}

function getSubmitRequiredFields(bizType, record) {
  const fields = [...(SUBMIT_REQUIRED_FIELDS[bizType] || [])];
  if (bizType === "expense" && record.expense_type === "travel") {
    fields.push("travel_type");
  }
  return fields;
}

function assertSubmitComplete(bizType, record) {
  const missing = getSubmitRequiredFields(bizType, record).filter((field) =>
    isBlank(record[field]),
  );
  if (missing.length) {
    throw new Error(`SUBMIT_REQUIRED_MISSING:${bizType}:${missing.join(",")}`);
  }

  if (
    bizType === "travel" &&
    record.start_date &&
    record.end_date &&
    new Date(record.end_date).getTime() < new Date(record.start_date).getTime()
  ) {
    throw new Error(
      "SUBMIT_INVALID_DATE_RANGE:travel:end_date_before_start_date",
    );
  }

  if (bizType === "invoice" && Number(record.total_amount) <= 0) {
    throw new Error("SUBMIT_INVALID_AMOUNT:invoice:total_amount");
  }
  if (
    bizType === "invoice_application" &&
    Number(record.requested_total_amount) <= 0
  ) {
    throw new Error(
      "SUBMIT_INVALID_AMOUNT:invoice_application:requested_total_amount",
    );
  }
  if (bizType === "salary_payment" && Number(record.amount) <= 0) {
    throw new Error("SUBMIT_INVALID_AMOUNT:salary_payment:amount");
  }
  if (bizType === "crm_contract" && Number(record.amount) <= 0) {
    throw new Error("SUBMIT_INVALID_AMOUNT:crm_contract:amount");
  }
  if (
    bizType === "salary_payment" &&
    record.payroll_month &&
    Number(String(record.payroll_month).slice(8, 10)) !== 1
  ) {
    throw new Error("SUBMIT_INVALID_PAYROLL_MONTH:salary_payment");
  }
}

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

async function assertRequiredAttachment(
  record,
  map,
  context,
  bizType,
  attachmentType,
) {
  const attachmentCode = map.DATASET_CODES?.attachment;
  const attachmentModel =
    context.client.models[`dataset_${attachmentCode}`];
  if (!attachmentCode || !attachmentModel?.filter) {
    throw new Error("MODEL_MISSING:attachment");
  }
  const response = await attachmentModel.filter({
    where: {
      biz_type: { $eq: bizType },
      biz_id: { $eq: Number(record.id) },
      attachment_type: { $eq: attachmentType },
    },
    select: ["id", "file_path"],
    currentPage: 1,
    pageSize: 20,
  });
  const hasUsableAttachment = rowsOf(response).some(
    (attachment) => !isBlank(attachment.file_path),
  );
  if (!hasUsableAttachment) {
    throw new Error(
      `SUBMIT_REQUIRED_MISSING:${bizType}:${attachmentType}`,
    );
  }
  return rowsOf(response).filter(
    (attachment) => !isBlank(attachment.file_path),
  );
}

async function assertExpenseInvoiceAttachments(
  record,
  map,
  context,
  attachments,
) {
  const itemCode = map.DATASET_CODES?.expenseItem;
  const linkCode = map.DATASET_CODES?.bizInvoiceLink;
  const invoiceCode = map.DATASET_CODES?.invoiceRecord;
  const itemModel = context.client.models[`dataset_${itemCode}`];
  const linkModel = context.client.models[`dataset_${linkCode}`];
  const invoiceModel = context.client.models[`dataset_${invoiceCode}`];
  if (!itemCode || !itemModel?.filter) {
    throw new Error("MODEL_MISSING:expenseItem");
  }
  if (!linkCode || !linkModel?.filter) {
    throw new Error("MODEL_MISSING:bizInvoiceLink");
  }
  if (!invoiceCode || !invoiceModel?.filter) {
    throw new Error("MODEL_MISSING:invoiceRecord");
  }

  const itemResponse = await itemModel.filter({
    where: { expense_id: { $eq: Number(record.id) } },
    select: ["id"],
    orderBy: [{ id: "asc" }],
    currentPage: 1,
    pageSize: 200,
  });
  const items = rowsOf(itemResponse);
  if (!items.length) {
    throw new Error("SUBMIT_REQUIRED_MISSING:expense:items");
  }

  const itemIds = items.map((item) => Number(item.id));
  const linkResponse = await linkModel.filter({
    where: {
      biz_type: { $eq: "expense_item" },
      biz_id: { $in: itemIds },
      relation_type: { $eq: "actual" },
    },
    select: ["biz_id", "invoice_id"],
    currentPage: 1,
    pageSize: 500,
  });
  const links = rowsOf(linkResponse);
  const linksByItem = new Map();
  for (const link of links) {
    const itemId = Number(link.biz_id);
    if (!linksByItem.has(itemId)) linksByItem.set(itemId, []);
    linksByItem.get(itemId).push(link);
  }
  items.forEach((item, index) => {
    if (!linksByItem.get(Number(item.id))?.length) {
      throw new Error(
        `SUBMIT_REQUIRED_MISSING:expense:items[${index}].invoices`,
      );
    }
  });

  const invoiceIds = [
    ...new Set(links.map((link) => Number(link.invoice_id)).filter(Boolean)),
  ];
  if (!invoiceIds.length) {
    throw new Error("SUBMIT_REQUIRED_MISSING:expense:invoices");
  }
  const invoiceResponse = await invoiceModel.filter({
    where: { id: { $in: invoiceIds } },
    select: ["id", "invoice_no", "file_path"],
    currentPage: 1,
    pageSize: Math.min(500, invoiceIds.length),
  });
  const invoicesById = new Map(
    rowsOf(invoiceResponse).map((invoice) => [Number(invoice.id), invoice]),
  );
  const attachmentPaths = new Set(
    (attachments || []).map((attachment) => String(attachment.file_path).trim()),
  );

  for (const [index, link] of links.entries()) {
    const invoice = invoicesById.get(Number(link.invoice_id));
    if (!invoice) {
      throw new Error(
        `SUBMIT_REQUIRED_MISSING:expense:invoices[${index}].record`,
      );
    }
    const invoiceLabel = String(invoice.invoice_no || `invoices[${index}]`);
    const filePath = String(invoice.file_path || "").trim();
    if (!filePath) {
      throw new Error(
        `SUBMIT_REQUIRED_MISSING:expense:invoice_file:${invoiceLabel}`,
      );
    }
    if (!attachmentPaths.has(filePath)) {
      throw new Error(
        `SUBMIT_CONFLICT:expense:invoice_attachment:${invoiceLabel}`,
      );
    }
  }
}

async function assertSalaryPaymentAttachment(record, map, context) {
  const attachmentModel =
    context.client.models[`dataset_${map.DATASET_CODES.attachment}`];
  if (!attachmentModel?.filter) {
    throw new Error("MODEL_MISSING:attachment");
  }
  const response = await attachmentModel.filter({
    where: {
      biz_type: { $eq: "salary_payment" },
      biz_id: { $eq: Number(record.id) },
      attachment_type: { $eq: "payroll_sheet" },
    },
    select: ["id"],
    currentPage: 1,
    pageSize: 1,
  });
  if (!rowsOf(response).length) {
    throw new Error("SUBMIT_REQUIRED_MISSING:salary_payment:payroll_sheet");
  }
}

async function assertSalesContractAttachment(record, map, context) {
  const attachmentModel =
    context.client.models[`dataset_${map.DATASET_CODES.attachment}`];
  if (!attachmentModel?.filter) throw new Error("MODEL_MISSING:attachment");
  const response = await attachmentModel.filter({
    where: {
      biz_type: { $eq: "crm_contract" },
      biz_id: { $eq: Number(record.id) },
      attachment_type: { $eq: "contract_file" },
    },
    select: ["id"],
    currentPage: 1,
    pageSize: 1,
  });
  if (!rowsOf(response).length) {
    throw new Error("SUBMIT_REQUIRED_MISSING:crm_contract:contract_file");
  }
}

async function assertContractPaymentRequirement(record, map, context) {
  const requirement = String(record.payment_requirement || "unknown");
  if (!new Set(["required", "not_required"]).has(requirement)) {
    throw new Error("SUBMIT_INVALID_PAYMENT_REQUIREMENT:contract");
  }
  const planCode = map.DATASET_CODES.contractPaymentPlan;
  const planModel = context.client.models[`dataset_${planCode}`];
  if (!planCode || !planModel?.filter) {
    throw new Error("MODEL_MISSING:contractPaymentPlan");
  }
  const response = await planModel.filter({
    where: { contract_id: { $eq: Number(record.id) } },
    select: ["id", "status"],
    currentPage: 1,
    pageSize: 200,
  });
  const activePlans = rowsOf(response).filter(
    (plan) => !["cancelled", "not_required"].includes(String(plan.status)),
  );
  if (requirement === "required" && !activePlans.length) {
    throw new Error("SUBMIT_REQUIRED_MISSING:contract:payment_plans");
  }
  if (requirement === "not_required" && activePlans.length) {
    throw new Error("SUBMIT_CONFLICT:contract:payment_not_required_has_plans");
  }
}

async function assertSalaryPaymentItems(record, map, context) {
  const itemCode = map.DATASET_CODES.salaryPaymentItem;
  const itemModel = context.client.models[`dataset_${itemCode}`];
  if (!itemCode || !itemModel?.filter) {
    throw new Error("MODEL_MISSING:salaryPaymentItem");
  }
  const response = await itemModel.filter({
    where: {
      salary_payment_id: { $eq: Number(record.id) },
    },
    select: [
      "id",
      "internal_legal_entity_id",
      "internal_legal_entity_name_snapshot",
      "payment_project",
      "amount",
      "currency",
      "payment_method",
    ],
    currentPage: 1,
    pageSize: 100,
  });
  const items = rowsOf(response);
  if (!items.length) {
    throw new Error("SUBMIT_REQUIRED_MISSING:salary_payment:items");
  }
  const entityIds = new Set();
  let amountInCents = 0;
  for (const [index, item] of items.entries()) {
    if (
      !Number(item.internal_legal_entity_id) ||
      isBlank(item.internal_legal_entity_name_snapshot) ||
      isBlank(item.payment_project) ||
      isBlank(item.payment_method)
    ) {
      throw new Error(`SUBMIT_REQUIRED_MISSING:salary_payment:items[${index}]`);
    }
    const entityId = Number(item.internal_legal_entity_id);
    if (entityIds.has(entityId)) {
      throw new Error("SUBMIT_DUPLICATED:salary_payment:internal_legal_entity");
    }
    entityIds.add(entityId);
    if (String(item.currency || "").toUpperCase() !== "CNY") {
      throw new Error(`SUBMIT_INVALID_CURRENCY:salary_payment:items[${index}]`);
    }
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`SUBMIT_INVALID_AMOUNT:salary_payment:items[${index}]`);
    }
    amountInCents += Math.round(amount * 100);
  }
  if (amountInCents !== Math.round(Number(record.amount) * 100)) {
    throw new Error("SUBMIT_AMOUNT_MISMATCH:salary_payment");
  }
}

export default async function cpoSubmitApplication(params, context) {
  const { bizType, bizId, comment = "" } = params || {};
  if (!bizType || bizId === undefined || bizId === null) {
    throw new Error("INVALID_PARAMS:bizType and bizId are required");
  }
  const numericBizId = normalizeBizId(bizId);
  const bff = context.client.bff;

  // 1. 状态机配置 + 业务元信息
  const [workflowConfig, map] = await Promise.all([
    bff.execute({ scriptName: "cpoWorkflowConfig", params: {} }),
    bff.execute({ scriptName: "cpoDatasetMap", params: {} }),
  ]);
  const meta = map.BIZ_TYPE_TO_DATASET[bizType];
  if (!meta) throw new Error(`INVALID_BIZ_TYPE:${bizType}`);

  // 2. 当前操作人 + 主单
  const [actor, { record, summary }] = await Promise.all([
    bff.execute({ scriptName: "cpoCurrentActor", params: {} }),
    bff.execute({
      scriptName: "cpoBizResolver",
      params: { bizType, bizId: numericBizId, meta },
    }),
  ]);
  const currentStatus = record[meta.statusField];
  if (
    bizType === "crm_contract" &&
    Number(record[meta.workflowManagedField || "workflow_managed"]) !== 1
  ) {
    throw new Error("WORKFLOW_NOT_MANAGED:crm_contract");
  }
  if (
    record.applicant_user_id &&
    String(record.applicant_user_id) !== String(actor.userId)
  ) {
    throw new Error(`APPLICANT_MISMATCH:${bizType}:${numericBizId}`);
  }
  const scenario = await resolveScenario(bff, bizType, record);
  if (scenario?.scenario?.executionMode !== "workflow") {
    throw new Error(
      `WORKFLOW_NOT_REQUIRED:${scenario?.workflowKey || bizType}`,
    );
  }
  const workflowKey = scenario.workflowKey;
  const definition =
    workflowConfig.WORKFLOW_CONFIG_BY_KEY?.[workflowKey] ||
    workflowConfig.WORKFLOW_CONFIG?.[bizType];
  const workflowVersion = Number(definition?.versionNo) || 1;
  const rule = definition?.actions?.submit;
  if (!rule || !workflowVersion) {
    throw new Error(`ACTION_NOT_ALLOWED:${workflowKey}:submit`);
  }
  assertNextAssignee(workflowKey, rule);

  if (!rule.from.includes(currentStatus)) {
    throw new Error(
      `STATUS_TRANSITION_INVALID:${bizType}:${currentStatus}:submit`,
    );
  }

  // 平台审批流守卫：主单数据集绑定平台流程后，CREATE 会被平台拦截并自动发起
  // 审批（主单带 process_instance_id，由 cpoSaveDraft 建单时触发）。此时不再走
  // legacy 状态机建待办任务，仅把业务状态推进到 rule.to；后续审批动作由平台
  // Flowable 流程驱动（flow_status/instance_status 由平台回写）。
  if (record.process_instance_id) {
    const platformNow = mysqlNow();
    const platformUpdate = { id: numericBizId, [meta.statusField]: rule.to };
    if (meta.hasSubmittedAt && !record.submitted_at) {
      platformUpdate.submitted_at = platformNow;
    }
    if (bizType === "payment" || bizType === "salary_payment") {
      platformUpdate.last_action_at = platformNow;
    }
    await context.client.models[meta.modelKey].update(platformUpdate);
    const platformRefreshed = await bff.execute({
      scriptName: "cpoBizResolver",
      params: { bizType, bizId: numericBizId, meta },
    });
    return {
      bizType,
      bizId: numericBizId,
      action: "submit",
      status: platformRefreshed.summary.status,
      currentTaskId: null,
      nextTaskId: null,
      ccParticipantIds: [],
      summary: platformRefreshed.summary,
      workflowKey,
      workflowVersion,
      platformFlow: true,
      processInstanceId: record.process_instance_id,
    };
  }

  assertSubmitComplete(bizType, record);
  if (bizType === "expense") {
    const attachments = await assertRequiredAttachment(
      record,
      map,
      context,
      "expense",
      "approval_material",
    );
    await assertExpenseInvoiceAttachments(record, map, context, attachments);
  }
  if (bizType === "contract") {
    await assertRequiredAttachment(
      record,
      map,
      context,
      "contract",
      "contract_file",
    );
    await assertContractPaymentRequirement(record, map, context);
  }
  if (bizType === "salary_payment") {
    await Promise.all([
      assertSalaryPaymentAttachment(record, map, context),
      assertSalaryPaymentItems(record, map, context),
    ]);
  }
  if (bizType === "crm_contract") {
    await assertSalesContractAttachment(record, map, context);
  }

  // 报销提交必须经过统一发票查重守卫。Web 表单、业务 Skill 和其它调用方
  // 都只能通过本服务端入口提交，避免各端自行实现后出现规则漂移。
  if (bizType === "expense") {
    await bff.execute({
      scriptName: "cpoInvoiceDuplicateGuard",
      params: { expenseId: numericBizId, assertUnique: true },
    });
  }

  // 3. 先创建首条审核任务。任务创建失败时主单仍保持原状态，避免出现
  // “主单已提交但没有待办”的半提交数据。
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
        title:
          rule.nextWorkflowStepName ||
          `${bizType}-${numericBizId}-${rule.nextTaskType}`,
        assigneeUserId: rule.nextAssigneeUserId || "",
        assigneeName: rule.nextAssigneeName || "",
        assigneeRole: rule.nextAssigneeRole || "",
        comment,
      },
    });
    nextTaskId = created.taskId;
  }

  // 4. 更新主单（updated_at 由平台自动注入；自定义 DATETIME 字段使用与平台同格式）
  // mysqlNow 同 cpoAdvanceWorkflow，避免与平台 updated_at 格式混用触发 SQL-530
  const now = mysqlNow();
  const updateFields = { id: numericBizId, [meta.statusField]: rule.to };
  if (meta.hasSubmittedAt && !record.submitted_at) {
    updateFields.submitted_at = now;
  }
  if (bizType === "payment" || bizType === "salary_payment") {
    updateFields.last_action_at = now;
  }
  try {
    await context.client.models[meta.modelKey].update(updateFields);
  } catch (error) {
    if (nextTaskId) {
      await bff.execute({
        scriptName: "cpoTaskService",
        params: {
          op: "cancelTask",
          taskId: nextTaskId,
          comment: "主单提交失败，系统自动取消待办",
        },
      });
    }
    throw error;
  }

  // 5. 写操作流水
  const actionRecord = await bff.execute({
    scriptName: "cpoActionRecorder",
    params: {
      bizType,
      bizId: numericBizId,
      action: "submit",
      fromStatus: currentStatus,
      toStatus: rule.to,
      comment,
      actorUserId: actor.userId,
      actorName: actor.userName,
      actorRole: "applicant",
      workflowKey,
      workflowVersion,
    },
  });

  const ccParticipantIds = await grantCcSteps({
    steps: rule.ccSteps,
    bizType,
    bizId: numericBizId,
    actor,
    status: rule.to,
    workflowKey,
    workflowVersion,
    context,
  });

  // 6. 重读主单摘要返回
  const refreshed = await bff.execute({
    scriptName: "cpoBizResolver",
    params: { bizType, bizId: numericBizId, meta },
  });

  // 业务状态、待办、流水和抄送均成功后再发送外部通知；通知失败不得回滚审批。
  const notification = await sendWorkflowNotification(bff, {
    eventId: actionRecord?.actionRecordId,
    eventType: nextTaskId ? "TASK_ASSIGNED" : "WORKFLOW_COMPLETED",
    bizType,
    bizId: numericBizId,
    action: "submit",
    fromStatus: currentStatus,
    toStatus: refreshed.summary.status || rule.to,
    comment,
    summary: refreshed.summary,
    nextTask: nextTaskId
      ? {
          taskId: nextTaskId,
          taskType: rule.nextTaskType,
          stepName: rule.nextWorkflowStepName || "待处理任务",
          assigneeUserId: rule.nextAssigneeUserId || "",
          assigneeName: rule.nextAssigneeName || "",
        }
      : null,
    actor: {
      userId: actor.userId || "",
      name: actor.userName || actor.displayName || "",
    },
  });

  return {
    bizType,
    bizId: numericBizId,
    action: "submit",
    status: refreshed.summary.status,
    currentTaskId: null,
    nextTaskId,
    ccParticipantIds,
    summary: refreshed.summary,
    notification,
    workflowKey,
    workflowVersion,
  };
}
