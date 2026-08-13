/**
 * 业务详情聚合查询：主单 + 任务 + 操作流水 + 附件 + 业务明细与关联摘要。
 *
 * [脚本描述] 按 biz_type+biz_id 聚合详情，并补充报销明细、合作方、合同与银行回单摘要
 * [接口路径] POST /api/endpoint/app-4d050189/cpoGetBizTimeline
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * { "bizType": "expense|invoice|contract|payment|travel", "bizId": 123 }
 *
 * [返回数据结构]
 * { biz, summary, tasks[], actions[], workflowPlan[], currentTask, availableActions[], canAct, attachments[], invoiceLinks[], expenseItems[], contractPaymentPlans[], related }
 */
function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

const INTERNAL_PRINT_AUDIT_ACTIONS = new Set([
  "print_summary_requested",
  "print_full_requested",
  "print_confirmed",
  "print_confirmation_revoked",
]);

function optionalText(value) {
  return String(value ?? "").trim();
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
      scenario: { executionMode: "workflow", label: "" },
    };
  }
}

function timestampOf(value) {
  if (!value) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const timestamp = new Date(String(value).replace(" ", "T")).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function selectCurrentTask(tasks) {
  return [...tasks]
    .filter((task) => task.status === "pending")
    .sort(
      (left, right) =>
        timestampOf(right.created_at) - timestampOf(left.created_at),
    )[0];
}

function buildWorkflowPlan(steps, tasks, actions, participants) {
  const conclusionByTaskId = new Map();
  const stepByNo = new Map(
    (steps || []).map((step) => [Number(step.stepNo), step]),
  );
  const completedTaskEntries = [...tasks]
    .filter((task) => task.status === "done")
    .map((task) => ({
      task,
      step: stepByNo.get(Number(task.workflow_step_no)),
    }))
    .filter(({ step }) => step && step.nodeType !== "cc")
    .sort(
      (left, right) =>
        timestampOf(left.task.completed_at || left.task.updated_at) -
        timestampOf(right.task.completed_at || right.task.updated_at),
    );
  const workflowActions = [...actions].sort(
    (left, right) =>
      timestampOf(left.created_at) - timestampOf(right.created_at),
  );
  const usedActionIndexes = new Set();
  for (const { task, step } of completedTaskEntries) {
    const actionCodes = new Set(
      [step.passAction, step.rejectAction].filter(Boolean),
    );
    const actionIndex = workflowActions.findIndex(
      (action, index) =>
        !usedActionIndexes.has(index) && actionCodes.has(action.action),
    );
    if (actionIndex < 0) continue;
    usedActionIndexes.add(actionIndex);
    conclusionByTaskId.set(Number(task.id), workflowActions[actionIndex]);
  }

  return (steps || []).map((step) => {
    if (step.nodeType === "cc") {
      const participant = (participants || []).find(
        (item) =>
          Number(item.workflow_step_no) === Number(step.stepNo) &&
          optionalText(item.participant_user_id) ===
            optionalText(step.assigneeUserId),
      );
      return {
        stepNo: step.stepNo,
        stepName: step.stepName,
        nodeType: "cc",
        taskType: "cc",
        assigneeUserId: step.assigneeUserId,
        assigneeName: step.assigneeName,
        assigneeRole: "cc",
        state: participant ? "notified" : "upcoming",
        taskId: null,
        taskStatus: participant ? "notified" : "",
        startedAt: participant?.granted_at || null,
        completedAt: participant?.granted_at || null,
        conclusion: participant
          ? {
              action: "cc_notify",
              actorUserId: participant.granted_by_user_id,
              actorName: participant.granted_by_name_snapshot,
              comment: `已抄送给${participant.participant_name_snapshot || participant.participant_user_id}`,
              createdAt: participant.granted_at,
            }
          : null,
        attempts: participant ? 1 : 0,
      };
    }
    const stepTasks = tasks
      .filter((task) => Number(task.workflow_step_no) === Number(step.stepNo))
      .sort(
        (left, right) =>
          timestampOf(left.created_at) - timestampOf(right.created_at),
      );
    const latestTask = stepTasks[stepTasks.length - 1];
    const conclusion = latestTask
      ? conclusionByTaskId.get(Number(latestTask.id))
      : undefined;
    let state = "upcoming";
    if (latestTask?.status === "pending") state = "current";
    if (latestTask?.status === "done") {
      state = conclusion?.action === "review_reject" ? "rejected" : "completed";
    }
    if (latestTask?.status === "cancelled") state = "cancelled";

    return {
      stepNo: step.stepNo,
      stepName: step.stepName,
      nodeType: step.nodeType || "approval",
      taskType: step.taskType,
      assigneeUserId: step.assigneeUserId,
      assigneeName: step.assigneeName,
      assigneeRole: step.assigneeRole,
      state,
      taskId: latestTask?.id || null,
      taskStatus: latestTask?.status || "",
      startedAt: latestTask?.created_at || null,
      completedAt: latestTask?.completed_at || null,
      conclusion: conclusion
        ? {
            action: conclusion.action,
            actorUserId: conclusion.actor_user_id,
            actorName: conclusion.actor_name_snapshot,
            comment: conclusion.comment,
            createdAt: conclusion.created_at,
          }
        : null,
      attempts: stepTasks.length,
    };
  });
}

const ADMIN_ROLES = new Set([
  "admin",
  "administrator",
  "super_admin",
  "cpo_admin",
  "workflow_admin",
]);

function normalizeRoles(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) =>
      typeof item === "string"
        ? item
        : item?.code || item?.name || item?.value || item?.roleCode,
    )
    .map((item) => optionalText(item).toLowerCase())
    .filter(Boolean);
}

function actorIsAdmin(actor) {
  const raw = actor?.raw || {};
  if (
    raw.isAdmin === true ||
    raw.admin === true ||
    raw.is_super_admin === true
  ) {
    return true;
  }
  return normalizeRoles(actor?.roles).some((role) => ADMIN_ROLES.has(role));
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

function availableActionsFor(
  currentTask,
  transitions,
  actor,
  record,
  canOverrideAssignment,
  paymentPlan,
  statusField = "status",
) {
  const status = optionalText(record?.[statusField]);
  const hasPendingTask = currentTask?.status === "pending";
  const currentStepNo = Number(currentTask?.workflow_step_no) || 0;
  const actorUserId = optionalText(actor?.userId);
  const applicantUserId = optionalText(record?.applicant_user_id);
  const isAssignee =
    hasPendingTask &&
    actorUserId &&
    optionalText(currentTask?.assignee_user_id) === actorUserId;
  const isConfiguredAssignee = (transition) =>
    !hasPendingTask &&
    actorUserId &&
    optionalText(transition?.currentAssigneeUserId) === actorUserId;

  const actorHasDirectPermission = (scope, transition) => {
    if (scope === "manager") return false;
    if (scope === "applicant") return actorUserId === applicantUserId;
    if (scope === "applicant_or_manager") {
      return actorUserId === applicantUserId;
    }
    return isAssignee || isConfiguredAssignee(transition);
  };

  const actorAllowed = (scope, transition) =>
    actorHasDirectPermission(scope, transition) || canOverrideAssignment;

  const conditionAllowed = (condition) => {
    if (!condition) return true;
    if (condition === "payment_plan_paid") {
      return optionalText(paymentPlan?.status) === "paid";
    }
    return false;
  };

  const result = [];
  const seen = new Set();
  for (const transition of transitions || []) {
    if (transition.fromStatus !== status) continue;
    if (hasPendingTask) {
      if (
        transition.currentStepNo !== 0 &&
        Number(transition.currentStepNo) !== currentStepNo
      ) {
        continue;
      }
      if (
        transition.currentTaskType &&
        transition.currentTaskType !== optionalText(currentTask?.task_type)
      ) {
        continue;
      }
      if (!transition.currentStepNo && !transition.currentTaskType) continue;
    } else if (!transition.manualAllowed) {
      continue;
    }
    if (!actorAllowed(transition.actorScope, transition)) continue;
    if (!conditionAllowed(transition.visibleCondition)) continue;
    if (seen.has(transition.action)) continue;
    seen.add(transition.action);
    const adminOverride = Boolean(
      canOverrideAssignment &&
      !actorHasDirectPermission(transition.actorScope, transition),
    );
    result.push({
      action: transition.action,
      label: transition.label,
      danger: Boolean(transition.danger),
      commentRequired: Boolean(transition.commentRequired),
      ...(adminOverride
        ? {
            adminOverride: true,
            adminOverrideReason:
              "当前不是你的操作节点，但因应用管理员权限可见并可操作。",
          }
        : {}),
    });
  }
  return result;
}

function positiveId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function numberOf(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sumBy(rows, field) {
  return rows.reduce((sum, row) => sum + numberOf(row?.[field]), 0);
}

function relatedDocument({
  bizType,
  record,
  relationType,
  titleField = "title",
  amountField = "amount",
  currencyField = "currency",
  subtitle,
  relationId,
  details,
  externalPath,
}) {
  const bizId = positiveId(record?.id);
  if (!bizId) return undefined;
  const title =
    optionalText(record?.[titleField]) ||
    optionalText(record?.title) ||
    optionalText(record?.contract_name) ||
    optionalText(record?.invoice_title) ||
    optionalText(record?.invoice_no) ||
    optionalText(record?.seller_name) ||
    optionalText(record?.partner_name_snapshot);
  if (!title) return undefined;
  return {
    key: `${bizType}:${bizId}:${relationType}`,
    bizType,
    bizId,
    relationType,
    title,
    amount: numberOf(record?.[amountField]),
    currency: optionalText(record?.[currencyField]) || "CNY",
    status: optionalText(record?.status),
    subtitle: optionalText(subtitle),
    ...(positiveId(relationId) ? { relationId: positiveId(relationId) } : {}),
    ...(details ? { details } : {}),
    ...(externalPath ? { externalPath } : {}),
  };
}

async function getOptional(model, id) {
  const numericId = positiveId(id);
  if (!numericId || !model?.getOne) return undefined;
  try {
    const record = await model.getOne({ id: numericId });
    return record?.id ? record : undefined;
  } catch {
    return undefined;
  }
}

function portfolioItem({
  bizType,
  record,
  titleField,
  amountField = "amount",
  currencyField = "currency",
  dateField,
  subtitle,
  matchBasis = "partner_id",
  details,
}) {
  const bizId = positiveId(record?.id);
  if (!bizId) return undefined;
  const title =
    optionalText(record?.[titleField]) ||
    optionalText(record?.title) ||
    optionalText(record?.contract_name) ||
    optionalText(record?.invoice_title) ||
    optionalText(record?.invoice_no);
  if (!title) return undefined;
  const applicationTypes = new Set([
    "contract",
    "payment",
    "invoice",
    "invoice_application",
    "expense",
    "salary_payment",
    "travel",
  ]);
  return {
    key: `${bizType}:${bizId}`,
    bizType,
    bizId,
    title,
    amount: numberOf(record?.[amountField]),
    currency: optionalText(record?.[currencyField]) || "CNY",
    status: optionalText(
      bizType === "contract"
        ? record?.lifecycle_status || record?.status
        : record?.status,
    ),
    date:
      record?.[dateField] ||
      record?.submitted_at ||
      record?.updated_at ||
      record?.created_at ||
      "",
    subtitle: optionalText(subtitle),
    matchBasis,
    details: details || {},
    externalPath: applicationTypes.has(bizType)
      ? `/application-detail/${bizType}/${bizId}`
      : bizType === "quote"
        ? `/quotation/records/${bizId}`
        : "",
  };
}

async function buildCounterpartyPortfolio({ models, codes, partner }) {
  const partnerId = positiveId(partner?.id);
  const partnerName = optionalText(partner?.name);
  if (!partnerId || !partnerName) return undefined;
  const requiredModels = [
    codes.contractApplication,
    codes.paymentApplication,
    codes.invoiceRecord,
    codes.quoteCustomer,
    codes.quoteHeader,
    codes.bizInvoiceLink,
    codes.bizRelation,
  ].map((code) => models[`dataset_${code}`]);
  if (requiredModels.some((model) => typeof model?.filter !== "function")) {
    return undefined;
  }

  const [
    contractsResponse,
    paymentsResponse,
    invoicesResponse,
    customersResponse,
  ] = await Promise.all([
    models[`dataset_${codes.contractApplication}`].filter({
      where: { partner_id: { $eq: partnerId } },
      currentPage: 1,
      pageSize: 500,
      orderBy: [{ updated_at: "desc" }, { id: "desc" }],
    }),
    models[`dataset_${codes.paymentApplication}`].filter({
      where: { partner_id: { $eq: partnerId } },
      currentPage: 1,
      pageSize: 500,
      orderBy: [{ updated_at: "desc" }, { id: "desc" }],
    }),
    models[`dataset_${codes.invoiceRecord}`].filter({
      where: { partner_id: { $eq: partnerId } },
      currentPage: 1,
      pageSize: 500,
      orderBy: [{ invoice_date: "desc" }, { id: "desc" }],
    }),
    models[`dataset_${codes.quoteCustomer}`].filter({
      where: { customer_name: { $eq: partnerName } },
      currentPage: 1,
      pageSize: 100,
    }),
  ]);
  const contractRows = rowsOf(contractsResponse);
  const paymentRows = rowsOf(paymentsResponse);
  const invoiceRows = rowsOf(invoicesResponse);
  const contractIds = contractRows
    .map((contract) => positiveId(contract.id))
    .filter(Boolean);
  const relationResponse = contractIds.length
    ? await models[`dataset_${codes.bizRelation}`].filter({
        where: {
          source_biz_type: { $eq: "contract" },
          source_biz_id: { $in: contractIds },
          relation_status: { $eq: "active" },
        },
        currentPage: 1,
        pageSize: 500,
      })
    : { tableData: [] };
  const relationRows = rowsOf(relationResponse);
  const relatedQuoteIds = relationRows
    .filter((relation) => optionalText(relation.target_biz_type) === "quote")
    .map((relation) => positiveId(relation.target_biz_id))
    .filter(Boolean);
  const relatedCustomerIds = relationRows
    .filter((relation) =>
      ["crm_customer", "quote_customer"].includes(
        optionalText(relation.target_biz_type),
      ),
    )
    .map((relation) => positiveId(relation.target_biz_id))
    .filter(Boolean);
  const customerIds = [
    ...new Set([
      ...rowsOf(customersResponse)
        .map((customer) => positiveId(customer.id))
        .filter(Boolean),
      ...relatedCustomerIds,
    ]),
  ];
  const quoteBranches = [
    ...(relatedQuoteIds.length ? [{ id: { $in: relatedQuoteIds } }] : []),
    ...(customerIds.length ? [{ customer_id: { $in: customerIds } }] : []),
  ];
  const quoteResponse = quoteBranches.length
    ? await models[`dataset_${codes.quoteHeader}`].filter({
        where:
          quoteBranches.length === 1
            ? quoteBranches[0]
            : { $or: quoteBranches },
        currentPage: 1,
        pageSize: 500,
        orderBy: [{ quote_date: "desc" }, { id: "desc" }],
      })
    : { tableData: [] };
  const quoteRows = rowsOf(quoteResponse);
  const invoiceIds = invoiceRows
    .map((invoice) => positiveId(invoice.id))
    .filter(Boolean);
  const invoiceLinkResponse = invoiceIds.length
    ? await models[`dataset_${codes.bizInvoiceLink}`].filter({
        where: {
          invoice_id: { $in: invoiceIds },
        },
        currentPage: 1,
        pageSize: 1000,
      })
    : { tableData: [] };
  const allocatedByInvoiceId = new Map();
  for (const link of rowsOf(invoiceLinkResponse)) {
    const invoiceId = positiveId(link.invoice_id);
    allocatedByInvoiceId.set(
      invoiceId,
      numberOf(allocatedByInvoiceId.get(invoiceId)) +
        numberOf(link.amount_used),
    );
  }
  const contracts = contractRows
    .map((contract) =>
      portfolioItem({
        bizType: "contract",
        record: contract,
        titleField: "contract_name",
        dateField: "start_date",
        subtitle:
          optionalText(contract.contract_no) ||
          optionalText(contract.contract_type),
        details: {
          合同编号: contract.contract_no || "",
          合同方向: contract.contract_direction || contract.our_role || "",
          履约状态: contract.lifecycle_status || "",
          有效期:
            contract.start_date || contract.end_date
              ? `${contract.start_date || ""} 至 ${contract.end_date || ""}`
              : "",
        },
      }),
    )
    .filter(Boolean);
  const payments = paymentRows
    .map((payment) =>
      portfolioItem({
        bizType: "payment",
        record: payment,
        titleField: "title",
        dateField: "actual_paid_at",
        subtitle: [
          optionalText(payment.payment_phase_name),
          optionalText(payment.bank_status),
        ]
          .filter(Boolean)
          .join(" · "),
        details: {
          付款期次: payment.payment_phase_name || "",
          银行状态: payment.bank_status || "",
          实际付款日: payment.actual_paid_at || "",
        },
      }),
    )
    .filter(Boolean);
  const invoices = invoiceRows
    .map((invoice) => {
      const allocatedAmount = numberOf(
        allocatedByInvoiceId.get(positiveId(invoice.id)),
      );
      const totalAmount = numberOf(invoice.total_amount);
      return portfolioItem({
        bizType: "invoice",
        record: invoice,
        titleField: "invoice_title",
        amountField: "total_amount",
        dateField: "invoice_date",
        subtitle: [
          optionalText(invoice.invoice_no),
          optionalText(invoice.invoice_direction),
          optionalText(invoice.invoice_purpose),
        ]
          .filter(Boolean)
          .join(" · "),
        details: {
          发票号码: invoice.invoice_no || "",
          发票方向: invoice.invoice_direction || "",
          发票用途: invoice.invoice_purpose || "",
          已分摊: allocatedAmount,
          未分摊: Math.max(totalAmount - allocatedAmount, 0),
        },
      });
    })
    .filter(Boolean);
  const quotes = quoteRows
    .map((quote) =>
      portfolioItem({
        bizType: "quote",
        record: quote,
        titleField: "quote_title",
        amountField: "total_amount",
        currencyField: "currency_code",
        dateField: "quote_date",
        subtitle: optionalText(quote.quote_no),
        matchBasis: relatedQuoteIds.includes(positiveId(quote.id))
          ? "explicit_business_relation"
          : "exact_customer_name",
        details: {
          报价编号: quote.quote_no || "",
          报价日期: quote.quote_date || "",
          有效期至: quote.valid_until || "",
        },
      }),
    )
    .filter(Boolean);
  const validStatuses = (row) =>
    !["cancelled", "invalid", "rejected"].includes(optionalText(row.status));
  const validContracts = contractRows.filter(validStatuses);
  const validPayments = paymentRows.filter(validStatuses);
  const validInvoices = invoiceRows.filter(validStatuses);
  const invoiceAmount = sumBy(validInvoices, "total_amount");
  const allocatedInvoiceAmount = validInvoices.reduce(
    (sum, invoice) =>
      sum + numberOf(allocatedByInvoiceId.get(positiveId(invoice.id))),
    0,
  );

  return {
    partner: {
      id: partnerId,
      name: partnerName,
      type: optionalText(partner.partner_type),
      status: optionalText(partner.status),
      contactName: optionalText(partner.contact_name),
      contactPhone: optionalText(partner.contact_phone),
      source: optionalText(partner.partner_source),
    },
    summary: {
      contractCount: contracts.length,
      quoteCount: quotes.length,
      paymentCount: payments.length,
      invoiceCount: invoices.length,
      contractAmount: sumBy(validContracts, "amount"),
      paymentAmount: sumBy(validPayments, "amount"),
      invoiceAmount,
      invoiceUnallocatedAmount: Math.max(
        invoiceAmount - allocatedInvoiceAmount,
        0,
      ),
    },
    groups: { contracts, quotes, payments, invoices },
    matchNote:
      relatedQuoteIds.length || relatedCustomerIds.length
        ? "合同、付款和发票按商业伙伴 ID 聚合；报价优先使用合同业务关系，并补充客户名称精确匹配。"
        : quoteRows.length
          ? "合同、付款和发票按商业伙伴 ID 聚合；报价按客户名称精确匹配。"
          : "合同、付款和发票按商业伙伴 ID 聚合；暂未匹配到同名报价客户。",
  };
}

function labelOf(dict, category, code) {
  return dict?.[category]?.[code] ?? code;
}

function fileNameOf(path) {
  const value = String(path || "").trim();
  if (!value) return "";
  const fileName = value.split(/[\\/]/).pop() || value;
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
}

function attachmentForInvoice(invoice, attachments) {
  const invoicePath = String(invoice?.file_path || "").trim();
  if (!invoicePath) return undefined;
  const invoiceFileName = fileNameOf(invoicePath);

  return attachments.find((attachment) => {
    const attachmentPath = String(attachment?.file_path || "").trim();
    const attachmentFileName = String(attachment?.file_name || "").trim();
    const storedFileName = fileNameOf(attachmentPath);
    return (
      attachmentPath === invoicePath ||
      attachmentFileName === invoicePath ||
      attachmentFileName === invoiceFileName ||
      storedFileName === invoiceFileName ||
      storedFileName.endsWith(`-${invoiceFileName}`)
    );
  });
}

function enrichRecordLabels(record, dict, statusField = "status") {
  return {
    ...record,
    contract_type_label: labelOf(dict, "contract_type", record.contract_type),
    our_role_label: labelOf(dict, "our_role", record.our_role),
    payment_type_label: labelOf(dict, "payment_type", record.payment_type),
    expense_type_label: labelOf(dict, "expense_type", record.expense_type),
    travel_type_label: labelOf(dict, "travel_type", record.travel_type),
    invoice_type_label: labelOf(dict, "invoice_type", record.invoice_type),
    invoice_region_label: labelOf(
      dict,
      "invoice_region",
      record.invoice_region,
    ),
    invoice_medium_label: labelOf(
      dict,
      "invoice_medium",
      record.invoice_medium,
    ),
    request_type_label: labelOf(dict, "request_type", record.request_type),
    partner_source_label: labelOf(
      dict,
      "partner_source",
      record.partner_source,
    ),
    status_label:
      labelOf(dict, "status", record[statusField]) ||
      optionalText(record[statusField]),
    bank_status_label: labelOf(dict, "bank_status", record.bank_status),
  };
}

export default async function cpoGetBizTimeline(params, context) {
  const { bizType, bizId } = params || {};
  const numericBizId = positiveId(bizId);
  if (!bizType || !numericBizId) {
    throw new Error("INVALID_PARAMS:bizType and positive bizId are required");
  }
  const map = await context.client.bff.execute({
    scriptName: "cpoDatasetMap",
    params: {},
  });
  const meta = map.BIZ_TYPE_TO_DATASET[bizType];
  if (!meta) throw new Error(`INVALID_BIZ_TYPE:${bizType}`);

  const [{ record, summary }, dict, workflow, actor] = await Promise.all([
    context.client.bff.execute({
      scriptName: "cpoBizResolver",
      params: { bizType, bizId: numericBizId, meta },
    }),
    context.client.bff.execute({ scriptName: "cpoDictionary", params: {} }),
    context.client.bff.execute({ scriptName: "cpoWorkflowConfig", params: {} }),
    context.client.bff.execute({ scriptName: "cpoCurrentActor", params: {} }),
  ]);

  await context.client.bff.execute({
    scriptName: "cpoApplicationReadOneGuard",
    params: { bizType, result: record },
  });

  const models = context.client.models;
  const C = map.DATASET_CODES;
  const bizWhere = {
    biz_type: { $eq: bizType },
    biz_id: { $eq: numericBizId },
  };
  const contextContractId =
    bizType === "contract"
      ? numericBizId
      : ["payment", "invoice"].includes(bizType)
        ? positiveId(record.contract_id)
        : 0;

  const expenseItemsPromise =
    bizType === "expense"
      ? models[`dataset_${C.expenseItem}`].filter({
          where: { expense_id: { $eq: numericBizId } },
          currentPage: 1,
          pageSize: 200,
          orderBy: [{ occurred_date: "asc" }, { id: "asc" }],
        })
      : Promise.resolve({ tableData: [] });
  const salaryItemsPromise =
    bizType === "salary_payment"
      ? models[`dataset_${C.salaryPaymentItem}`].filter({
          where: {
            salary_payment_id: { $eq: numericBizId },
          },
          currentPage: 1,
          pageSize: 100,
          orderBy: [{ sort_no: "asc" }, { id: "asc" }],
        })
      : Promise.resolve({ tableData: [] });
  const partnerPromise = ["contract", "payment", "travel", "invoice"].includes(
    bizType,
  )
    ? getOptional(models[`dataset_${C.businessPartner}`], record.partner_id)
    : Promise.resolve(undefined);
  const contractPromise = ["payment", "invoice"].includes(bizType)
    ? getOptional(
        models[`dataset_${C.contractApplication}`],
        record.contract_id,
      )
    : Promise.resolve(undefined);
  const paymentPlanPromise =
    bizType === "payment" && C.contractPaymentPlan
      ? getOptional(
          models[`dataset_${C.contractPaymentPlan}`],
          record.payment_plan_id,
        )
      : Promise.resolve(undefined);
  const contractPaymentPlansPromise =
    contextContractId && C.contractPaymentPlan
      ? models[`dataset_${C.contractPaymentPlan}`].filter({
          where: {
            contract_id: { $eq: contextContractId },
          },
          currentPage: 1,
          pageSize: 100,
          orderBy: [{ phase_no: "asc" }, { id: "asc" }],
        })
      : Promise.resolve({ tableData: [] });
  const contractPaymentsPromise = contextContractId
    ? models[`dataset_${C.paymentApplication}`].filter({
        where: {
          contract_id: { $eq: contextContractId },
        },
        currentPage: 1,
        pageSize: 200,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      })
    : Promise.resolve({ tableData: [] });
  const contractInvoicesPromise = contextContractId
    ? models[`dataset_${C.invoiceRecord}`].filter({
        where: {
          contract_id: { $eq: contextContractId },
        },
        currentPage: 1,
        pageSize: 200,
        orderBy: [{ invoice_date: "desc" }, { id: "desc" }],
      })
    : Promise.resolve({ tableData: [] });
  const outgoingRelationsPromise = models[`dataset_${C.bizRelation}`].filter({
    where: {
      source_biz_type: { $eq: bizType },
      source_biz_id: { $eq: numericBizId },
      relation_status: { $eq: "active" },
    },
    currentPage: 1,
    pageSize: 100,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
  });
  const incomingRelationsPromise = models[`dataset_${C.bizRelation}`].filter({
    where: {
      target_biz_type: { $eq: bizType },
      target_biz_id: { $eq: numericBizId },
      relation_status: { $eq: "active" },
    },
    currentPage: 1,
    pageSize: 100,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
  });
  const bankReceiptPromise = ["payment", "salary_payment", "expense"].includes(
    bizType,
  )
    ? getOptional(
        models[`dataset_${C.attachment}`],
        record.bank_receipt_attachment_id,
      )
    : Promise.resolve(undefined);
  const invoiceApplicationFulfillmentsPromise =
    bizType === "invoice_application" &&
    C.invoiceApplicationFulfillment &&
    models[`dataset_${C.invoiceApplicationFulfillment}`]?.filter
      ? models[`dataset_${C.invoiceApplicationFulfillment}`].filter({
          where: {
            invoice_application_id: { $eq: numericBizId },
            relation_status: { $eq: "active" },
          },
          currentPage: 1,
          pageSize: 500,
          orderBy: [{ created_at: "asc" }, { id: "asc" }],
        })
      : Promise.resolve({ tableData: [] });

  const [
    tasks,
    participants,
    actions,
    attachments,
    directInvoiceLinks,
    expenseItems,
    salaryItems,
    partner,
    contract,
    paymentPlan,
    contractPaymentPlans,
    contractPayments,
    contractInvoices,
    outgoingRelations,
    incomingRelations,
    bankReceipt,
    invoiceApplicationFulfillments,
  ] = await Promise.all([
    models[`dataset_${C.bizTask}`].filter({
      where: bizWhere,
      currentPage: 1,
      pageSize: 100,
      orderBy: [{ created_at: "desc" }],
    }),
    models[`dataset_${C.workflowParticipant}`].filter({
      where: bizWhere,
      currentPage: 1,
      pageSize: 100,
      orderBy: [{ granted_at: "asc" }],
    }),
    models[`dataset_${C.bizActionRecord}`].filter({
      where: bizWhere,
      currentPage: 1,
      pageSize: 100,
      orderBy: [{ created_at: "desc" }],
    }),
    models[`dataset_${C.attachment}`].filter({
      where: bizWhere,
      currentPage: 1,
      pageSize: 100,
      orderBy: [{ created_at: "asc" }],
    }),
    bizType === "expense"
      ? Promise.resolve({ tableData: [] })
      : models[`dataset_${C.bizInvoiceLink}`].filter({
          where:
            bizType === "invoice"
              ? {
                  invoice_id: { $eq: numericBizId },
                }
              : bizWhere,
          currentPage: 1,
          pageSize: 100,
          orderBy: [{ created_at: "desc" }],
        }),
    expenseItemsPromise,
    salaryItemsPromise,
    partnerPromise,
    contractPromise,
    paymentPlanPromise,
    contractPaymentPlansPromise,
    contractPaymentsPromise,
    contractInvoicesPromise,
    outgoingRelationsPromise,
    incomingRelationsPromise,
    bankReceiptPromise,
    invoiceApplicationFulfillmentsPromise,
  ]);

  const attachmentRows = rowsOf(attachments);
  const taskRows = rowsOf(tasks);
  const participantRows = rowsOf(participants);
  const actionRows = rowsOf(actions);
  const visibleActionRows = actionRows.filter(
    (action) => !INTERNAL_PRINT_AUDIT_ACTIONS.has(action?.action),
  );
  const expenseItemRows = rowsOf(expenseItems);
  const salaryItemRows = rowsOf(salaryItems);
  const contractPaymentRows = rowsOf(contractPayments);
  const contractInvoiceRows = rowsOf(contractInvoices);
  const outgoingRelationRows = rowsOf(outgoingRelations);
  const incomingRelationRows = rowsOf(incomingRelations);
  const invoiceApplicationFulfillmentRows = rowsOf(
    invoiceApplicationFulfillments,
  );
  const fulfilledInvoiceIds = [
    ...new Set(
      invoiceApplicationFulfillmentRows
        .map((item) => positiveId(item.invoice_id))
        .filter(Boolean),
    ),
  ];
  const fulfilledInvoiceResponse = fulfilledInvoiceIds.length
    ? await models[`dataset_${C.invoiceRecord}`].filter({
        where: { id: { $in: fulfilledInvoiceIds } },
        currentPage: 1,
        pageSize: Math.min(500, fulfilledInvoiceIds.length),
      })
    : { tableData: [] };
  const fulfilledInvoiceById = new Map(
    rowsOf(fulfilledInvoiceResponse).map((invoice) => [
      Number(invoice.id),
      invoice,
    ]),
  );
  const enrichedInvoiceApplicationFulfillments =
    invoiceApplicationFulfillmentRows.flatMap((relation) => {
      const invoice = fulfilledInvoiceById.get(Number(relation.invoice_id));
      return invoice ? [{ ...relation, invoice }] : [];
    });
  let contractPaymentPlanRows = rowsOf(contractPaymentPlans);
  if (contextContractId && contractPaymentPlanRows.length) {
    const linkedPaymentIds = [
      ...new Set(
        contractPaymentPlanRows
          .map((plan) => positiveId(plan.linked_payment_application_id))
          .filter(Boolean),
      ),
    ];
    const paymentById = new Map(
      contractPaymentRows.map((payment) => [Number(payment.id), payment]),
    );
    const paymentsByPlanId = new Map();
    for (const payment of contractPaymentRows) {
      const planId = positiveId(payment.payment_plan_id);
      if (!planId) continue;
      const planPayments = paymentsByPlanId.get(planId) || [];
      planPayments.push(payment);
      paymentsByPlanId.set(planId, planPayments);
    }
    const missingPaymentIds = linkedPaymentIds.filter(
      (id) => !paymentById.has(id),
    );
    if (missingPaymentIds.length) {
      const linkedPayments = await models[
        `dataset_${C.paymentApplication}`
      ].filter({
        where: {
          id: { $in: missingPaymentIds },
        },
        currentPage: 1,
        pageSize: Math.min(100, missingPaymentIds.length),
      });
      for (const payment of rowsOf(linkedPayments)) {
        paymentById.set(Number(payment.id), payment);
      }
    }
    contractPaymentPlanRows = contractPaymentPlanRows.map((plan) => {
      const legacyPayment = paymentById.get(
        positiveId(plan.linked_payment_application_id),
      );
      const linkedPayments = [
        ...(paymentsByPlanId.get(positiveId(plan.id)) || []),
      ];
      if (
        legacyPayment &&
        !linkedPayments.some(
          (payment) => positiveId(payment.id) === positiveId(legacyPayment.id),
        )
      ) {
        linkedPayments.push(legacyPayment);
      }
      if (!linkedPayments.length) return plan;
      const primaryPayment = legacyPayment || linkedPayments[0];
      return {
        ...plan,
        linked_payment_title: primaryPayment.title,
        linked_payment_amount: primaryPayment.amount,
        linked_payment_currency: primaryPayment.currency,
        linked_payment_status: primaryPayment.status,
        linked_payments: linkedPayments.map((payment) => ({
          id: payment.id,
          title: payment.title,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
        })),
      };
    });
  }
  let contractInvoiceAllocationRows = [];
  let contractAllocatedInvoiceRows = [];
  if (contextContractId && contractPaymentRows.length) {
    const paymentIds = contractPaymentRows
      .map((payment) => positiveId(payment.id))
      .filter(Boolean);
    if (paymentIds.length) {
      const allocationResponse = await models[
        `dataset_${C.bizInvoiceLink}`
      ].filter({
        where: {
          biz_type: { $eq: "payment" },
          biz_id: { $in: [...new Set(paymentIds)] },
        },
        currentPage: 1,
        pageSize: 500,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      });
      contractInvoiceAllocationRows = rowsOf(allocationResponse);
      const allocatedInvoiceIds = [
        ...new Set(
          contractInvoiceAllocationRows
            .map((link) => positiveId(link.invoice_id))
            .filter(Boolean),
        ),
      ];
      if (allocatedInvoiceIds.length) {
        const allocatedInvoiceResponse = await models[
          `dataset_${C.invoiceRecord}`
        ].filter({
          where: {
            id: { $in: allocatedInvoiceIds },
          },
          currentPage: 1,
          pageSize: Math.min(500, allocatedInvoiceIds.length),
        });
        contractAllocatedInvoiceRows = rowsOf(allocatedInvoiceResponse);
      }
    }
  }
  const contractRelatedInvoiceRows = [
    ...new Map(
      [...contractInvoiceRows, ...contractAllocatedInvoiceRows].map(
        (invoice) => [Number(invoice.id), invoice],
      ),
    ).values(),
  ];
  let invoiceLinkRows = rowsOf(directInvoiceLinks);
  if (bizType === "expense" && expenseItemRows.length) {
    const itemIds = expenseItemRows
      .map((item) => positiveId(item.id))
      .filter(Boolean);
    if (itemIds.length) {
      const linkResponse = await models[`dataset_${C.bizInvoiceLink}`].filter({
        where: {
          biz_type: { $eq: "expense_item" },
          biz_id: { $in: itemIds },
        },
        currentPage: 1,
        pageSize: 500,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      });
      invoiceLinkRows = rowsOf(linkResponse);
    }
  }

  // biz_invoice_link 是唯一权威关联。expense_item.invoice_id 只保留作兼容
  // 指针，不能在读取时临时拼成关系；否则已删除或测试数据会再次出现在
  // “关联单据”中，并制造无法打开的链接。缺失关系应通过数据修复补齐。

  const invoiceIds = [
    ...new Set(
      invoiceLinkRows
        .map((link) => positiveId(link.invoice_id))
        .filter(Boolean),
    ),
  ];
  let invoiceById = new Map();
  if (invoiceIds.length) {
    const invoiceResponse = await models[`dataset_${C.invoiceRecord}`].filter({
      where: { id: { $in: invoiceIds } },
      currentPage: 1,
      pageSize: Math.min(500, invoiceIds.length),
    });
    invoiceById = new Map(
      rowsOf(invoiceResponse).map((invoice) => [Number(invoice.id), invoice]),
    );
  }
  const enrichedInvoiceLinks = invoiceLinkRows.flatMap((link) => {
    const persistedInvoice = invoiceById.get(Number(link.invoice_id));
    // 正式关联也可能因历史脏数据指向已逻辑删除发票；这种记录不能展示
    // 为可点击单据，需由数据修复恢复目标发票或释放关联。
    if (!persistedInvoice) return [];
    const invoice = persistedInvoice;
    const attachment = attachmentForInvoice(invoice, attachmentRows);
    const amountUsed =
      numberOf(link.amount_used) || numberOf(invoice?.total_amount);
    return [
      {
        ...link,
        amount_used: amountUsed,
        invoice,
        ...(attachment ? { attachment } : {}),
      },
    ];
  });
  const invoiceUsageDocuments = [];
  const invoiceDerivedContractDocuments = [];
  if (bizType === "invoice") {
    const expenseItemIds = invoiceLinkRows
      .filter((link) => optionalText(link.biz_type) === "expense_item")
      .map((link) => positiveId(link.biz_id))
      .filter(Boolean);
    if (expenseItemIds.length) {
      const usedExpenseItems = await models[`dataset_${C.expenseItem}`].filter({
        where: {
          id: { $in: [...new Set(expenseItemIds)] },
        },
        currentPage: 1,
        pageSize: Math.min(500, expenseItemIds.length),
      });
      const expenseIds = [
        ...new Set(
          rowsOf(usedExpenseItems)
            .map((item) => positiveId(item.expense_id))
            .filter(Boolean),
        ),
      ];
      if (expenseIds.length) {
        const usedExpenses = await models[
          `dataset_${C.expenseApplication}`
        ].filter({
          where: { id: { $in: expenseIds } },
          currentPage: 1,
          pageSize: Math.min(500, expenseIds.length),
        });
        for (const expense of rowsOf(usedExpenses)) {
          const item = relatedDocument({
            bizType: "expense",
            record: expense,
            relationType: "invoice_used_by_expense",
            titleField: "title",
            amountField: "reimbursable_cny_amount",
            currencyField: "payout_currency",
            subtitle: "该发票已用于报销",
          });
          if (item) invoiceUsageDocuments.push(item);
        }
      }
    }
    const paymentIds = invoiceLinkRows
      .filter((link) => optionalText(link.biz_type) === "payment")
      .map((link) => positiveId(link.biz_id))
      .filter(Boolean);
    if (paymentIds.length) {
      const usedPayments = await models[
        `dataset_${C.paymentApplication}`
      ].filter({
        where: {
          id: { $in: [...new Set(paymentIds)] },
        },
        currentPage: 1,
        pageSize: Math.min(500, paymentIds.length),
      });
      const usedPaymentRows = rowsOf(usedPayments);
      for (const payment of usedPaymentRows) {
        const item = relatedDocument({
          bizType: "payment",
          record: payment,
          relationType: "invoice_used_by_payment",
          titleField: "title",
          amountField: "amount",
          currencyField: "currency",
          subtitle: payment.payment_phase_name
            ? `覆盖付款期次：${payment.payment_phase_name}`
            : "该发票已用于付款核销",
        });
        if (item) invoiceUsageDocuments.push(item);
      }
      const derivedContractIds = [
        ...new Set(
          usedPaymentRows
            .map((payment) => positiveId(payment.contract_id))
            .filter(Boolean),
        ),
      ].filter((contractId) => contractId !== contextContractId);
      for (const contractId of derivedContractIds) {
        const derivedContract = await getOptional(
          models[`dataset_${C.contractApplication}`],
          contractId,
        );
        const item = relatedDocument({
          bizType: "contract",
          record: derivedContract,
          relationType: "invoice_contract_via_payment",
          titleField: "contract_name",
          subtitle: "通过关联付款归属的合同",
        });
        if (item) invoiceDerivedContractDocuments.push(item);
      }
    }
  }
  const linksByItemId = new Map();
  if (bizType === "expense") {
    for (const link of enrichedInvoiceLinks) {
      const itemId = Number(link.biz_id);
      if (!linksByItemId.has(itemId)) linksByItemId.set(itemId, []);
      linksByItemId.get(itemId).push(link);
    }
  }
  const enrichedExpenseItems = expenseItemRows.map((item) => ({
    ...item,
    invoice_links: linksByItemId.get(Number(item.id)) || [],
  }));
  const currentTask = selectCurrentTask(taskRows);
  const scenario = await resolveScenario(
    context.client.bff,
    bizType,
    record,
    currentTask,
  );
  const pinnedVersion = Number(scenario.versionNo) || 0;
  const versionedDefinition = pinnedVersion
    ? workflow.WORKFLOW_CONFIG_BY_KEY_VERSION?.[
        `${scenario.workflowKey}@${pinnedVersion}`
      ]
    : workflow.WORKFLOW_CONFIG_BY_KEY?.[scenario.workflowKey];
  const legacySteps = workflow.WORKFLOW_STEPS_BY_TYPE?.[bizType];
  const legacyTransitions = workflow.WORKFLOW_TRANSITIONS_BY_TYPE?.[bizType];
  const definition =
    versionedDefinition ||
    (legacySteps || legacyTransitions
      ? {
          versionNo: 1,
          steps: legacySteps || [],
          transitions: legacyTransitions || [],
        }
      : null);
  const recordUsesWorkflow =
    bizType !== "crm_contract" || Number(record.workflow_managed) === 1;
  const workflowSteps = recordUsesWorkflow ? definition?.steps || [] : [];
  const workflowTransitions = recordUsesWorkflow
    ? definition?.transitions || []
    : [];
  // 流程管理员和平台系统管理员可以代操作；申请单汇总可见用户仅扩大读取范围。
  const canOverrideAssignment = actorCanOverrideAssignment(actor, dict);
  const availableActions = availableActionsFor(
    currentTask,
    workflowTransitions,
    actor,
    record,
    canOverrideAssignment,
    paymentPlan,
    meta.statusField,
  );
  const counterpartyPortfolio = partner
    ? await buildCounterpartyPortfolio({ models, codes: C, partner })
    : undefined;
  const relatedDocuments = [];
  if (bizType === "contract") {
    for (const payment of contractPaymentRows) {
      const item = relatedDocument({
        bizType: "payment",
        record: payment,
        relationType: "contract_payment",
        subtitle: payment.payment_phase_name
          ? `付款期次：${payment.payment_phase_name}`
          : "合同付款",
      });
      if (item) relatedDocuments.push(item);
    }
    for (const invoice of contractRelatedInvoiceRows) {
      const allocatedThroughPayment = contractInvoiceAllocationRows.some(
        (link) => Number(link.invoice_id) === Number(invoice.id),
      );
      const item = relatedDocument({
        bizType: "invoice",
        record: invoice,
        relationType: "contract_invoice",
        titleField: "invoice_title",
        amountField: "total_amount",
        subtitle: invoice.invoice_no
          ? `发票号码：${invoice.invoice_no}`
          : allocatedThroughPayment
            ? "通过合同付款关联"
            : "合同发票",
      });
      if (item) relatedDocuments.push(item);
    }
    for (const relation of outgoingRelationRows) {
      const targetBizType = optionalText(relation.target_biz_type);
      const targetMeta = map.BIZ_TYPE_TO_DATASET[targetBizType];
      const target = await getOptional(
        models[targetMeta?.modelKey],
        relation.target_biz_id,
      );
      if (!target) continue;
      const relationType = optionalText(relation.relation_type);
      const item = relatedDocument({
        bizType: targetBizType,
        record: target,
        relationType,
        titleField: targetMeta?.titleField,
        amountField: targetMeta?.amountField,
        relationId: relation.id,
        subtitle:
          relationType === "originates_from_quote"
            ? "合同来源报价"
            : relationType === "covered_by_nda"
              ? "合同前置保密协议"
              : relationType === "serves_customer"
                ? "合同服务客户"
                : "合同业务关系",
        details: {
          编号:
            target.quote_no ||
            target.agreement_no ||
            target.customer_code ||
            "",
          状态: target.status || "",
          合作方:
            target.primary_party_name_snapshot || target.customer_name || "",
          项目: target.project_name || "",
          有效期:
            target.valid_until ||
            target.effective_date ||
            target.updated_at ||
            "",
        },
        externalPath:
          targetBizType === "quote"
            ? `/quotation/records/${target.id}`
            : targetBizType === "legal_agreement"
              ? "/legal-agreements"
              : "",
      });
      if (item) relatedDocuments.push(item);
    }
  }
  if (bizType === "payment") {
    const contractItem = relatedDocument({
      bizType: "contract",
      record: contract,
      relationType: "payment_contract",
      titleField: "contract_name",
      subtitle: "本次付款关联合同",
    });
    if (contractItem) relatedDocuments.push(contractItem);
    const currentPhaseNo = numberOf(record.payment_phase_no);
    for (const payment of contractPaymentRows
      .filter((item) => Number(item.id) !== numericBizId)
      .sort(
        (left, right) =>
          numberOf(left.payment_phase_no) - numberOf(right.payment_phase_no) ||
          Number(left.id) - Number(right.id),
      )) {
      const phaseNo = numberOf(payment.payment_phase_no);
      const position =
        currentPhaseNo && phaseNo
          ? phaseNo < currentPhaseNo
            ? "此前付款"
            : phaseNo > currentPhaseNo
              ? "后续付款"
              : "同一期次付款"
          : "同合同付款";
      const item = relatedDocument({
        bizType: "payment",
        record: payment,
        relationType:
          position === "此前付款"
            ? "contract_previous_payment"
            : "contract_sibling_payment",
        subtitle: [
          position,
          phaseNo ? `第 ${phaseNo} 期` : "",
          optionalText(payment.payment_phase_name),
        ]
          .filter(Boolean)
          .join(" · "),
      });
      if (item) relatedDocuments.push(item);
    }
    for (const link of enrichedInvoiceLinks) {
      const item = relatedDocument({
        bizType: "invoice",
        record: link.invoice,
        relationType: "payment_invoice",
        titleField: "invoice_title",
        amountField: "total_amount",
        subtitle: link.amount_used
          ? `本次覆盖 ${link.amount_used}`
          : "付款关联发票",
      });
      if (item) relatedDocuments.push(item);
    }
  }
  if (bizType === "invoice") {
    const contractItem = relatedDocument({
      bizType: "contract",
      record: contract,
      relationType: "invoice_contract",
      titleField: "contract_name",
      subtitle: "发票关联合同",
    });
    if (contractItem) relatedDocuments.push(contractItem);
    relatedDocuments.push(...invoiceUsageDocuments);
    relatedDocuments.push(...invoiceDerivedContractDocuments);
  }
  if (bizType === "invoice_application") {
    for (const fulfillment of enrichedInvoiceApplicationFulfillments) {
      const item = relatedDocument({
        bizType: "invoice",
        record: fulfillment.invoice,
        relationType: "invoice_application_fulfillment",
        titleField: "invoice_title",
        amountField: "total_amount",
        subtitle: fulfillment.fulfilled_amount
          ? `本张发票履约 ${fulfillment.fulfilled_amount}`
          : "实际已开具发票",
      });
      if (item) relatedDocuments.push(item);
    }
  }
  // 报销单上的进项发票是票据台账关系，不是独立申请流程单。
  // 它们只通过 invoiceLinks / expenseItems[].invoice_links 展示，不能再
  // 复制进“关联单据”，否则一张报销申请会被误解为拆成多张流程单。
  if (bizType !== "contract") {
    for (const relation of outgoingRelationRows) {
      const targetBizType = optionalText(relation.target_biz_type);
      const targetMeta = map.BIZ_TYPE_TO_DATASET[targetBizType];
      const target = await getOptional(
        models[targetMeta?.modelKey],
        relation.target_biz_id,
      );
      if (!target) continue;
      const item = relatedDocument({
        bizType: targetBizType,
        record: target,
        relationType: optionalText(relation.relation_type),
        titleField: targetMeta?.titleField,
        amountField: targetMeta?.amountField,
        relationId: relation.id,
        subtitle:
          optionalText(relation.relation_type) === "reimburses_travel"
            ? "本次报销对应差旅申请"
            : "当前单据主动关联",
        externalPath: [
          "expense",
          "invoice",
          "invoice_application",
          "contract",
          "payment",
          "salary_payment",
          "travel",
        ].includes(targetBizType)
          ? `/application-detail/${targetBizType}/${target.id}`
          : targetBizType === "crm_contract"
            ? `/receivable-contract-detail/${target.id}`
            : "",
      });
      if (item) relatedDocuments.push(item);
    }
  }
  for (const relation of incomingRelationRows) {
    const sourceBizType = optionalText(relation.source_biz_type);
    const sourceMeta = map.BIZ_TYPE_TO_DATASET[sourceBizType];
    const source = await getOptional(
      models[sourceMeta?.modelKey],
      relation.source_biz_id,
    );
    if (!source) continue;
    const item = relatedDocument({
      bizType: sourceBizType,
      record: source,
      relationType: `reverse_${optionalText(relation.relation_type)}`,
      titleField: sourceMeta?.titleField,
      amountField: sourceMeta?.amountField,
      relationId: relation.id,
      subtitle:
        optionalText(relation.relation_type) === "reimburses_travel"
          ? "该差旅已被报销申请引用"
          : "其他单据关联当前单据",
      externalPath: [
        "expense",
        "invoice",
        "invoice_application",
        "contract",
        "payment",
        "salary_payment",
        "travel",
      ].includes(sourceBizType)
        ? `/application-detail/${sourceBizType}/${source.id}`
        : sourceBizType === "crm_contract"
          ? `/receivable-contract-detail/${source.id}`
          : "",
    });
    if (item) relatedDocuments.push(item);
  }

  const currency =
    optionalText(record.currency || record.payout_currency) || "CNY";
  const metrics = [];
  const risks = [];
  if (bizType === "contract") {
    const plannedAmount = sumBy(contractPaymentPlanRows, "planned_amount");
    const paidAmount = contractPaymentPlanRows.reduce((sum, plan) => {
      if (optionalText(plan.status) !== "paid") return sum;
      return (
        sum +
        (numberOf(plan.actual_paid_amount) || numberOf(plan.planned_amount))
      );
    }, 0);
    const allocatedInvoiceIds = new Set(
      contractInvoiceAllocationRows.map((link) => Number(link.invoice_id)),
    );
    const allocatedInvoiceAmount = sumBy(
      contractInvoiceAllocationRows,
      "amount_used",
    );
    const directOnlyInvoiceAmount = contractRelatedInvoiceRows.reduce(
      (sum, invoice) =>
        allocatedInvoiceIds.has(Number(invoice.id))
          ? sum
          : sum + numberOf(invoice.total_amount),
      0,
    );
    const invoiceAmount = allocatedInvoiceAmount + directOnlyInvoiceAmount;
    const remainingAmount = Math.max(numberOf(record.amount) - paidAmount, 0);
    metrics.push(
      {
        key: "planned",
        label: "计划付款",
        value: plannedAmount,
        format: "money",
        currency,
      },
      {
        key: "paid",
        label: "累计已付",
        value: paidAmount,
        format: "money",
        currency,
        tone: paidAmount > 0 ? "positive" : "neutral",
      },
      {
        key: "invoice",
        label: "已收发票",
        value: invoiceAmount,
        format: "money",
        currency,
      },
      {
        key: "remaining",
        label: "合同待付",
        value: remainingAmount,
        format: "money",
        currency,
      },
    );
    const invoiceGap = Math.max(paidAmount - invoiceAmount, 0);
    if (invoiceGap > 0) {
      risks.push({
        key: "invoice_shortfall",
        level: "warning",
        title: "存在付款欠票",
        description: `累计已付款 ${paidAmount}，合同已关联发票 ${invoiceAmount}，尚缺 ${invoiceGap} 的发票覆盖。`,
      });
    }
    const unlinkedPaymentCount = contractPaymentRows.filter(
      (payment) => !positiveId(payment.payment_plan_id),
    ).length;
    if (unlinkedPaymentCount) {
      risks.push({
        key: "unlinked_payment_plan",
        level: "info",
        title: "存在未归属付款期次的付款",
        description: `${unlinkedPaymentCount} 笔合同付款尚未关联付款计划，期次进度可能不准确。`,
      });
    }
    if (!record.lifecycle_status) {
      risks.push({
        key: "missing_contract_lifecycle",
        level: "info",
        title: "合同履约状态尚未独立维护",
        description:
          "当前仅有审批状态，无法区分待签署、已签署、进行中和已完成。",
      });
    }
  } else if (bizType === "payment") {
    const coveredAmount = enrichedInvoiceLinks.reduce(
      (sum, link) =>
        sum +
        (numberOf(link.amount_used) || numberOf(link.invoice?.total_amount)),
      0,
    );
    const paymentAmount = numberOf(record.amount);
    const invoiceGap = Math.max(paymentAmount - coveredAmount, 0);
    const contractPaidAmount = contractPaymentPlanRows.reduce((sum, plan) => {
      if (optionalText(plan.status) !== "paid") return sum;
      return (
        sum +
        (numberOf(plan.actual_paid_amount) || numberOf(plan.planned_amount))
      );
    }, 0);
    const contractAmount = numberOf(contract?.amount);
    const contractRemainingAmount = Math.max(
      contractAmount - contractPaidAmount,
      0,
    );
    const contractAllocatedInvoiceIds = new Set(
      contractInvoiceAllocationRows.map((link) => Number(link.invoice_id)),
    );
    const contractInvoiceCoveredAmount =
      sumBy(contractInvoiceAllocationRows, "amount_used") +
      contractRelatedInvoiceRows.reduce(
        (sum, invoice) =>
          contractAllocatedInvoiceIds.has(Number(invoice.id))
            ? sum
            : sum + numberOf(invoice.total_amount),
        0,
      );
    metrics.push(
      {
        key: "payment",
        label: "本次付款",
        value: paymentAmount,
        format: "money",
        currency,
      },
      {
        key: "invoiceCovered",
        label: "发票已覆盖",
        value: coveredAmount,
        format: "money",
        currency,
        tone: coveredAmount >= paymentAmount ? "positive" : "neutral",
      },
      {
        key: "invoiceGap",
        label: "待补发票",
        value: invoiceGap,
        format: "money",
        currency,
        tone: invoiceGap > 0 ? "warning" : "positive",
      },
      {
        key: "contractPaid",
        label: "合同累计已付",
        value: contractPaidAmount,
        format: "money",
        currency: optionalText(contract?.currency) || currency,
        tone: contractPaidAmount > 0 ? "positive" : "neutral",
      },
    );
    if (contractAmount > 0) {
      metrics.push({
        key: "contractRemaining",
        label: "合同剩余待付",
        value: contractRemainingAmount,
        format: "money",
        currency: optionalText(contract?.currency) || currency,
      });
    }
    if (invoiceGap > 0) {
      risks.push({
        key: "payment_invoice_shortfall",
        level: "warning",
        title: "本次付款尚未取得足额发票",
        description: `付款金额 ${paymentAmount}，当前发票覆盖 ${coveredAmount}，待补 ${invoiceGap}。`,
      });
    }
    const contractInvoiceGap = Math.max(
      contractPaidAmount - contractInvoiceCoveredAmount,
      0,
    );
    if (contractPaidAmount > 0 && contractInvoiceGap > invoiceGap) {
      risks.push({
        key: "contract_invoice_shortfall",
        level: "warning",
        title: "合同累计付款仍存在欠票",
        description: `合同累计已付 ${contractPaidAmount}，已核销发票 ${contractInvoiceCoveredAmount}，累计待补 ${contractInvoiceGap}。`,
      });
    }
    if (
      paymentPlan?.status === "paid" &&
      optionalText(record.bank_status) !== "paid_confirmed"
    ) {
      risks.push({
        key: "payment_status_mismatch",
        level: "info",
        title: "付款计划与银行状态不一致",
        description:
          "付款计划已标记为已支付，但付款申请尚未确认银行付款，请核对迁移数据或回单。",
      });
    }
  } else if (bizType === "invoice_application") {
    const requestedAmount = numberOf(record.requested_total_amount);
    const fulfilledAmount = sumBy(
      enrichedInvoiceApplicationFulfillments,
      "fulfilled_amount",
    );
    const remainingAmount = Math.max(requestedAmount - fulfilledAmount, 0);
    metrics.push(
      {
        key: "requested",
        label: "申请开票",
        value: requestedAmount,
        format: "money",
        currency,
      },
      {
        key: "fulfilled",
        label: "实际已开",
        value: fulfilledAmount,
        format: "money",
        currency,
        tone: fulfilledAmount > 0 ? "positive" : "neutral",
      },
      {
        key: "remaining",
        label: "待开金额",
        value: remainingAmount,
        format: "money",
        currency,
        tone: remainingAmount > 0 ? "warning" : "positive",
      },
      {
        key: "actualInvoices",
        label: "实际发票",
        value: enrichedInvoiceApplicationFulfillments.length,
        format: "number",
      },
    );
    if (record.status === "reviewed" && remainingAmount > 0) {
      risks.push({
        key: "invoice_application_unfulfilled",
        level: "info",
        title: "开票申请尚未完全履约",
        description: `申请金额 ${requestedAmount}，实际已开 ${fulfilledAmount}，待开 ${remainingAmount}。`,
      });
    }
  } else if (bizType === "invoice") {
    const allocatedAmount = sumBy(invoiceLinkRows, "amount_used");
    const invoiceAmount = numberOf(record.total_amount);
    metrics.push(
      {
        key: "invoice",
        label: "发票金额",
        value: invoiceAmount,
        format: "money",
        currency,
      },
      {
        key: "allocated",
        label: "已分摊",
        value: allocatedAmount,
        format: "money",
        currency,
      },
      {
        key: "unallocated",
        label: "未分摊",
        value: Math.max(invoiceAmount - allocatedAmount, 0),
        format: "money",
        currency,
      },
      {
        key: "usageCount",
        label: "使用单据",
        value: invoiceUsageDocuments.length,
        format: "number",
      },
    );
    if (!record.invoice_direction) {
      risks.push({
        key: "missing_invoice_direction",
        level: "info",
        title: "发票方向尚未标准化",
        description:
          "当前依赖申请类型判断进项或销项，无法稳定汇总供应商发票与客户开票。",
      });
    }
  } else if (bizType === "expense") {
    const invoiceAmount = enrichedInvoiceLinks.reduce(
      (sum, link) =>
        sum +
        (numberOf(link.amount_used) || numberOf(link.invoice?.total_amount)),
      0,
    );
    const reimbursableAmount = numberOf(record.reimbursable_cny_amount);
    metrics.push(
      {
        key: "reimbursable",
        label: "实际报销",
        value: reimbursableAmount,
        format: "money",
        currency: optionalText(record.payout_currency) || "CNY",
      },
      {
        key: "invoice",
        label: "发票覆盖",
        value: invoiceAmount,
        format: "money",
        currency: optionalText(record.payout_currency) || "CNY",
      },
      {
        key: "items",
        label: "报销明细",
        value: enrichedExpenseItems.length,
        format: "number",
      },
      {
        key: "invoices",
        label: "关联发票",
        value: new Set(
          enrichedInvoiceLinks
            .map((link) => positiveId(link.invoice_id))
            .filter(Boolean),
        ).size,
        format: "number",
      },
    );
  }

  return {
    biz: enrichRecordLabels(record, dict, meta.statusField),
    summary,
    tasks: taskRows,
    actions: visibleActionRows,
    workflowDefinition: {
      workflowKey: scenario.workflowKey,
      versionNo: definition?.versionNo || null,
      label: scenario.scenario?.label || "",
      executionMode: recordUsesWorkflow
        ? scenario.scenario?.executionMode || "workflow"
        : "managed",
    },
    workflowPlan: buildWorkflowPlan(
      workflowSteps,
      taskRows,
      visibleActionRows,
      participantRows,
    ),
    participants: participantRows,
    currentTask: currentTask || null,
    availableActions,
    canAct: availableActions.length > 0,
    attachments: attachmentRows,
    invoiceLinks: enrichedInvoiceLinks,
    invoiceFulfillments: enrichedInvoiceApplicationFulfillments,
    expenseItems: enrichedExpenseItems,
    salaryItems: salaryItemRows,
    contractPaymentPlans: contractPaymentPlanRows,
    businessContext: {
      metrics,
      risks,
      relatedDocuments,
      ...(counterpartyPortfolio ? { counterpartyPortfolio } : {}),
    },
    management: {
      canManage: canOverrideAssignment,
      capabilities: canOverrideAssignment
        ? [
            ...(bizType === "contract"
              ? ["contract_lifecycle", "contract_relations"]
              : []),
            ...(["payment", "salary_payment", "expense"].includes(bizType)
              ? ["payment_bank_execution"]
              : []),
            ...(bizType === "payment" ? ["payment_invoice_allocation"] : []),
            ...(bizType === "invoice" ? ["invoice_classification"] : []),
          ]
        : [],
    },
    related: {
      ...(partner ? { partner } : {}),
      ...(contract ? { contract } : {}),
      ...(paymentPlan ? { paymentPlan } : {}),
      ...(bankReceipt ? { bankReceipt } : {}),
    },
  };
}
