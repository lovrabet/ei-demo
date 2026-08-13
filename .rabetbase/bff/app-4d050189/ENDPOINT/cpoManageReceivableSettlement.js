/**
 * 应收合同的发票与回款核销入口。
 *
 * [脚本描述] 将真实销项发票、客户回款按金额分摊至 CRM 收款计划，并以分摊事实重算计划汇总
 * [接口路径] POST /api/endpoint/app-4d050189/cpoManageReceivableSettlement
 *
 * [HTTP 请求体参数]
 * {
 *   "op": "allocateInvoice|cancelInvoiceAllocation|allocateReceipt|cancelReceiptAllocation",
 *   "crmContractId": 1,
 *   "receivablePlanId": 2,
 *   "invoiceId": 3,
 *   "receiptId": 4,
 *   "allocationId": 5,
 *   "amount": 9500,
 *   "remark": "一期 5500、二期 4000"
 * }
 */

const INACTIVE_STATUSES = new Set(["cancelled", "rejected", "invalid"]);
const MANAGER_CATEGORIES = [
  "workflow_admin_user",
  "application_read_all_user",
];

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

function positiveId(value, field) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`INVALID_PARAMS:${field}`);
  }
  return id;
}

function money(value, field) {
  const amount = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`INVALID_AMOUNT:${field}`);
  }
  return amount;
}

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function actorIsAdmin(actor) {
  if (actor?.isAdmin === true || actor?.raw?.isAdmin === true) return true;
  const roles = Array.isArray(actor?.roles) ? actor.roles : [actor?.roles];
  return roles.some((role) =>
    ["admin", "administrator", "super_admin", "cpo_admin"].includes(
      text(
        typeof role === "string"
          ? role
          : role?.code || role?.name || role?.value || role?.roleCode,
      ).toLowerCase(),
    ),
  );
}

function assertManagerAccess(contract, models) {
  const actorUserId = text(models.actor?.userId);
  if (!actorUserId) throw new Error("CPO_ACTOR_MISSING");
  if (actorIsAdmin(models.actor)) return;
  if (
    [contract?.applicant_user_id, contract?.owner_user_id]
      .map(text)
      .includes(actorUserId)
  ) {
    return;
  }
  const configured = MANAGER_CATEGORIES.some((category) =>
    Object.prototype.hasOwnProperty.call(
      models.dictionary?.[category] || {},
      actorUserId,
    ),
  );
  if (!configured) throw new Error("RECEIVABLE_SETTLEMENT_ACCESS_REQUIRED");
}

function createdId(result) {
  return positiveId(
    typeof result === "number"
      ? result
      : (result?.id ?? result?.data?.id ?? result?.result?.id),
    "createdId",
  );
}

function modelOf(models, code, label, methods) {
  const model = models[`dataset_${code}`];
  if (!code || !model || methods.some((method) => !model[method])) {
    throw new Error(`MODEL_MISSING:${label}`);
  }
  return model;
}

async function loadContext(params, context) {
  const [map, actor, dictionary] = await Promise.all([
    context.client.bff.execute({
      scriptName: "cpoDatasetMap",
      params: {},
    }),
    context.client.bff.execute({
      scriptName: "cpoCurrentActor",
      params: {},
    }),
    context.client.bff.execute({
      scriptName: "cpoDictionary",
      params: {},
    }),
  ]);
  const C = map.DATASET_CODES;
  const models = context.client.models;
  return {
    C,
    actor,
    dictionary,
    contractModel: modelOf(models, C.crmContract, "crmContract", ["getOne"]),
    planModel: modelOf(models, C.crmReceivablePlan, "crmReceivablePlan", [
      "getOne",
      "update",
    ]),
    invoiceModel: modelOf(models, C.invoiceRecord, "invoiceRecord", ["getOne"]),
    invoiceAllocationModel: modelOf(
      models,
      C.receivableInvoiceAllocation,
      "receivableInvoiceAllocation",
      ["filter", "create", "update"],
    ),
    receiptModel: modelOf(models, C.customerReceipt, "customerReceipt", [
      "getOne",
    ]),
    receiptAllocationModel: modelOf(
      models,
      C.customerReceiptAllocation,
      "customerReceiptAllocation",
      ["filter", "create", "update", "delete"],
    ),
  };
}

async function assertPlanOwnership(crmContractId, receivablePlanId, models) {
  const [contract, plan] = await Promise.all([
    models.contractModel.getOne({ id: crmContractId }),
    models.planModel.getOne({ id: receivablePlanId }),
  ]);
  if (!contract?.id) throw new Error("RECEIVABLE_CONTRACT_NOT_FOUND");
  if (!plan?.id) throw new Error("RECEIVABLE_PLAN_NOT_FOUND");
  if (Number(plan.contract_id) !== crmContractId) {
    throw new Error("RECEIVABLE_PLAN_CONTRACT_MISMATCH");
  }
  assertManagerAccess(contract, models);
  if (["not_required", "cancelled"].includes(text(plan.status).toLowerCase())) {
    throw new Error(`RECEIVABLE_PLAN_STATUS_LOCKED:${plan.status}`);
  }
  return { contract, plan };
}

async function recalculatePlan(plan, models) {
  const planId = Number(plan.id);
  const [invoiceResponse, receiptResponse] = await Promise.all([
    models.invoiceAllocationModel.filter({
      where: {
        receivable_plan_id: { $eq: planId },
        relation_status: { $eq: "active" },
      },
      select: ["allocated_amount"],
      currentPage: 1,
      pageSize: 5000,
    }),
    models.receiptAllocationModel.filter({
      where: {
        target_biz_type: { $eq: "crm_receivable_plan" },
        target_biz_id: { $eq: planId },
      },
      select: ["allocated_amount"],
      currentPage: 1,
      pageSize: 5000,
    }),
  ]);
  const invoicedAmount = rowsOf(invoiceResponse).reduce(
    (sum, row) => sum + Number(row.allocated_amount || 0),
    0,
  );
  const receivedAmount = rowsOf(receiptResponse).reduce(
    (sum, row) => sum + Number(row.allocated_amount || 0),
    0,
  );
  const plannedAmount = Number(plan.planned_amount || 0);
  let status = "pending";
  if (plannedAmount > 0 && receivedAmount + 0.001 >= plannedAmount) {
    status = "received";
  } else if (receivedAmount > 0) {
    status = "partially_received";
  } else if (invoicedAmount > 0) {
    status = "invoiced";
  }
  await models.planModel.update({
    id: planId,
    invoiced_amount: Math.round(invoicedAmount * 100) / 100,
    received_amount: Math.round(receivedAmount * 100) / 100,
    status,
    updated_by_user_id: text(models.actor?.userId) || null,
    updated_by_name_snapshot: text(models.actor?.userName) || null,
  });
  return { planId, invoicedAmount, receivedAmount, status };
}

async function allocationTotal(model, where, excludingId) {
  const response = await model.filter({
    where,
    select: ["id", "allocated_amount"],
    currentPage: 1,
    pageSize: 5000,
  });
  return rowsOf(response)
    .filter((row) => Number(row.id) !== Number(excludingId))
    .reduce((sum, row) => sum + Number(row.allocated_amount || 0), 0);
}

async function allocateInvoice(params, models) {
  const crmContractId = positiveId(params.crmContractId, "crmContractId");
  const planId = positiveId(params.receivablePlanId, "receivablePlanId");
  const invoiceId = positiveId(params.invoiceId, "invoiceId");
  const amount = money(params.amount, "amount");
  const { contract, plan } = await assertPlanOwnership(
    crmContractId,
    planId,
    models,
  );
  const invoice = await models.invoiceModel.getOne({ id: invoiceId });
  if (!invoice?.id) throw new Error("OUTGOING_INVOICE_NOT_FOUND");
  if (text(invoice.invoice_direction).toLowerCase() !== "outgoing") {
    throw new Error("INVOICE_DIRECTION_MISMATCH:outgoing");
  }
  if (INACTIVE_STATUSES.has(text(invoice.status).toLowerCase())) {
    throw new Error(`INVOICE_STATUS_LOCKED:${invoice.status}`);
  }
  const existingResponse = await models.invoiceAllocationModel.filter({
    where: {
      invoice_id: { $eq: invoiceId },
      receivable_plan_id: { $eq: planId },
    },
    currentPage: 1,
    pageSize: 20,
  });
  const existing = rowsOf(existingResponse)[0];
  const invoiceAllocated = await allocationTotal(
    models.invoiceAllocationModel,
    { invoice_id: { $eq: invoiceId }, relation_status: { $eq: "active" } },
    existing?.id,
  );
  if (invoiceAllocated + amount > Number(invoice.total_amount || 0) + 0.001) {
    throw new Error("INVOICE_ALLOCATION_EXCEEDS_INVOICE_AMOUNT");
  }
  const planAllocated = await allocationTotal(
    models.invoiceAllocationModel,
    {
      receivable_plan_id: { $eq: planId },
      relation_status: { $eq: "active" },
    },
    existing?.id,
  );
  if (planAllocated + amount > Number(plan.planned_amount || 0) + 0.001) {
    throw new Error("INVOICE_ALLOCATION_EXCEEDS_PLAN_AMOUNT");
  }
  const payload = {
    invoice_id: invoiceId,
    crm_contract_id: crmContractId,
    receivable_plan_id: planId,
    contract_title_snapshot:
      text(contract.title) || text(contract.contract_no) || "关联对象标题缺失",
    plan_title_snapshot:
      text(plan.phase_name) || `第${Number(plan.phase_no) || 1}期收款`,
    allocated_amount: amount,
    currency: text(invoice.currency) || text(plan.currency) || "CNY",
    relation_status: "active",
    remark: text(params.remark) || null,
  };
  let allocationId;
  if (existing?.id) {
    allocationId = Number(existing.id);
    await models.invoiceAllocationModel.update({
      id: allocationId,
      ...payload,
    });
  } else {
    allocationId = createdId(
      await models.invoiceAllocationModel.create(payload),
    );
  }
  return {
    allocationId,
    ...(await recalculatePlan(plan, models)),
  };
}

async function cancelInvoiceAllocation(params, models) {
  const allocationId = positiveId(params.allocationId, "allocationId");
  const response = await models.invoiceAllocationModel.filter({
    where: { id: { $eq: allocationId } },
    currentPage: 1,
    pageSize: 1,
  });
  const allocation = rowsOf(response)[0];
  if (!allocation) throw new Error("INVOICE_ALLOCATION_NOT_FOUND");
  const plan = await models.planModel.getOne({
    id: Number(allocation.receivable_plan_id),
  });
  const contract = await models.contractModel.getOne({
    id: Number(allocation.crm_contract_id),
  });
  if (!contract?.id) throw new Error("RECEIVABLE_CONTRACT_NOT_FOUND");
  assertManagerAccess(contract, models);
  await models.invoiceAllocationModel.update({
    id: allocationId,
    relation_status: "cancelled",
    remark: text(params.remark) || text(allocation.remark) || null,
  });
  return {
    allocationId,
    ...(await recalculatePlan(plan, models)),
  };
}

async function allocateReceipt(params, models) {
  const crmContractId = positiveId(params.crmContractId, "crmContractId");
  const planId = positiveId(params.receivablePlanId, "receivablePlanId");
  const receiptId = positiveId(params.receiptId, "receiptId");
  const amount = money(params.amount, "amount");
  const { plan } = await assertPlanOwnership(crmContractId, planId, models);
  const receipt = await models.receiptModel.getOne({ id: receiptId });
  if (!receipt?.id) throw new Error("CUSTOMER_RECEIPT_NOT_FOUND");
  if (text(receipt.status).toLowerCase() !== "confirmed") {
    throw new Error(`CUSTOMER_RECEIPT_STATUS_LOCKED:${receipt.status}`);
  }
  const sourceAllocationId = params.sourceAllocationId
    ? positiveId(params.sourceAllocationId, "sourceAllocationId")
    : 0;
  const sourceResponse = sourceAllocationId
    ? await models.receiptAllocationModel.filter({
        where: {
          id: { $eq: sourceAllocationId },
          receipt_id: { $eq: receiptId },
        },
        currentPage: 1,
        pageSize: 1,
      })
    : { tableData: [] };
  const sourceAllocation = rowsOf(sourceResponse)[0];
  if (sourceAllocationId && !sourceAllocation) {
    throw new Error("RECEIPT_SOURCE_ALLOCATION_NOT_FOUND");
  }
  const existingResponse = await models.receiptAllocationModel.filter({
    where: {
      receipt_id: { $eq: receiptId },
      target_biz_type: { $eq: "crm_receivable_plan" },
      target_biz_id: { $eq: planId },
    },
    currentPage: 1,
    pageSize: 20,
  });
  const existing = rowsOf(existingResponse)[0];
  if (
    sourceAllocation?.id &&
    existing?.id &&
    Number(sourceAllocation.id) !== Number(existing.id)
  ) {
    throw new Error("RECEIPT_PLAN_ALLOCATION_ALREADY_EXISTS");
  }
  const writableAllocation = sourceAllocation || existing;
  const receiptAllocated = await allocationTotal(
    models.receiptAllocationModel,
    { receipt_id: { $eq: receiptId } },
    writableAllocation?.id,
  );
  if (receiptAllocated + amount > Number(receipt.amount || 0) + 0.001) {
    throw new Error("RECEIPT_ALLOCATION_EXCEEDS_RECEIPT_AMOUNT");
  }
  const planAllocated = await allocationTotal(
    models.receiptAllocationModel,
    {
      target_biz_type: { $eq: "crm_receivable_plan" },
      target_biz_id: { $eq: planId },
    },
    writableAllocation?.id,
  );
  if (planAllocated + amount > Number(plan.planned_amount || 0) + 0.001) {
    throw new Error("RECEIPT_ALLOCATION_EXCEEDS_PLAN_AMOUNT");
  }
  const payload = {
    receipt_id: receiptId,
    target_biz_type: "crm_receivable_plan",
    target_biz_id: planId,
    target_title_snapshot:
      text(plan.phase_name) || `第${Number(plan.phase_no) || 1}期收款`,
    allocated_amount: amount,
    currency: text(receipt.currency) || text(plan.currency) || "CNY",
    remark: text(params.remark) || null,
  };
  let allocationId;
  if (writableAllocation?.id) {
    allocationId = Number(writableAllocation.id);
    await models.receiptAllocationModel.update({
      id: allocationId,
      ...payload,
    });
  } else {
    allocationId = createdId(
      await models.receiptAllocationModel.create(payload),
    );
  }
  const oldPlanId =
    text(sourceAllocation?.target_biz_type) === "crm_receivable_plan"
      ? Number(sourceAllocation.target_biz_id)
      : 0;
  const oldPlan =
    oldPlanId && oldPlanId !== planId
      ? await models.planModel.getOne({ id: oldPlanId })
      : null;
  return {
    allocationId,
    ...(oldPlan?.id
      ? { previousPlan: await recalculatePlan(oldPlan, models) }
      : {}),
    ...(await recalculatePlan(plan, models)),
  };
}

async function cancelReceiptAllocation(params, models) {
  const allocationId = positiveId(params.allocationId, "allocationId");
  const response = await models.receiptAllocationModel.filter({
    where: { id: { $eq: allocationId } },
    currentPage: 1,
    pageSize: 1,
  });
  const allocation = rowsOf(response)[0];
  if (!allocation) throw new Error("RECEIPT_ALLOCATION_NOT_FOUND");
  if (text(allocation.target_biz_type) !== "crm_receivable_plan") {
    throw new Error("RECEIPT_ALLOCATION_TARGET_MISMATCH");
  }
  const plan = await models.planModel.getOne({
    id: Number(allocation.target_biz_id),
  });
  const contract = await models.contractModel.getOne({
    id: Number(plan?.contract_id),
  });
  if (!contract?.id) throw new Error("RECEIVABLE_CONTRACT_NOT_FOUND");
  assertManagerAccess(contract, models);
  await models.receiptAllocationModel.delete({ id: allocationId });
  return {
    allocationId,
    ...(await recalculatePlan(plan, models)),
  };
}

export default async function cpoManageReceivableSettlement(params, context) {
  const op = text(params?.op);
  const models = await loadContext(params || {}, context);
  if (op === "allocateInvoice") return allocateInvoice(params, models);
  if (op === "cancelInvoiceAllocation") {
    return cancelInvoiceAllocation(params, models);
  }
  if (op === "allocateReceipt") return allocateReceipt(params, models);
  if (op === "cancelReceiptAllocation") {
    return cancelReceiptAllocation(params, models);
  }
  throw new Error(`INVALID_PARAMS:op:${op}`);
}
