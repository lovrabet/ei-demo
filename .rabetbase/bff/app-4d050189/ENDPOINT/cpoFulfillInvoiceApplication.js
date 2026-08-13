/**
 * 销项开票申请履约入口。
 *
 * [脚本描述] 将审批后的销项开票申请与一张或多张真实销项发票按金额关联，并重算申请完成状态
 * [接口路径] POST /api/endpoint/app-4d050189/cpoFulfillInvoiceApplication
 *
 * [HTTP 请求体参数]
 * { "op":"fulfill|cancel", "invoiceApplicationId":1, "invoiceId":2, "amount":9500, "fulfillmentId":3, "remark":"" }
 */

const APPLICATION_ALLOWED_STATUSES = new Set(["reviewed", "completed"]);
const INVOICE_INACTIVE_STATUSES = new Set(["rejected", "cancelled", "invalid"]);

function mysqlNow() {
  const chinaTimeOffsetMs = 8 * 60 * 60 * 1000;
  return new Date(Date.now() + chinaTimeOffsetMs)
    .toISOString()
    .replace("T", " ")
    .slice(0, 23);
}

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
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

function assertOperator(application, invoice, actor) {
  const actorUserId = text(actor?.userId);
  if (!actorUserId) throw new Error("CPO_ACTOR_MISSING");
  if (actorIsAdmin(actor)) return;
  if (
    [application?.applicant_user_id, invoice?.applicant_user_id]
      .map(text)
      .includes(actorUserId)
  ) {
    return;
  }
  throw new Error("INVOICE_FULFILLMENT_FORBIDDEN");
}

function positiveId(value, field) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0)
    throw new Error(`INVALID_PARAMS:${field}`);
  return id;
}

function amountOf(value) {
  const amount = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("INVALID_AMOUNT:amount");
  }
  return amount;
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

async function loadModels(context) {
  const [map, actor] = await Promise.all([
    context.client.bff.execute({
      scriptName: "cpoDatasetMap",
      params: {},
    }),
    context.client.bff.execute({
      scriptName: "cpoCurrentActor",
      params: {},
    }),
  ]);
  const C = map.DATASET_CODES;
  const models = context.client.models;
  return {
    actor,
    application: modelOf(models, C.invoiceApplication, "invoiceApplication", [
      "getOne",
      "update",
    ]),
    invoice: modelOf(models, C.invoiceRecord, "invoiceRecord", ["getOne"]),
    fulfillment: modelOf(
      models,
      C.invoiceApplicationFulfillment,
      "invoiceApplicationFulfillment",
      ["filter", "create", "update"],
    ),
  };
}

async function refreshApplication(application, models) {
  const response = await models.fulfillment.filter({
    where: {
      invoice_application_id: { $eq: Number(application.id) },
      relation_status: { $eq: "active" },
    },
    select: ["fulfilled_amount"],
    currentPage: 1,
    pageSize: 5000,
  });
  const fulfilledAmount = rowsOf(response).reduce(
    (sum, row) => sum + Number(row.fulfilled_amount || 0),
    0,
  );
  const requestedAmount = Number(application.requested_total_amount || 0);
  const status =
    requestedAmount > 0 && fulfilledAmount + 0.001 >= requestedAmount
      ? "completed"
      : "reviewed";
  await models.application.update({
    id: Number(application.id),
    status,
    completed_at:
      status === "completed"
        ? mysqlNow()
        : null,
  });
  return {
    fulfilledAmount,
    unfulfilledAmount: Math.max(requestedAmount - fulfilledAmount, 0),
    status,
  };
}

async function fulfill(params, models) {
  const applicationId = positiveId(
    params.invoiceApplicationId,
    "invoiceApplicationId",
  );
  const invoiceId = positiveId(params.invoiceId, "invoiceId");
  const amount = amountOf(params.amount);
  const [application, invoice] = await Promise.all([
    models.application.getOne({ id: applicationId }),
    models.invoice.getOne({ id: invoiceId }),
  ]);
  if (!application?.id) throw new Error("INVOICE_APPLICATION_NOT_FOUND");
  if (
    !APPLICATION_ALLOWED_STATUSES.has(text(application.status).toLowerCase())
  ) {
    throw new Error(`INVOICE_APPLICATION_STATUS_LOCKED:${application.status}`);
  }
  if (!invoice?.id) throw new Error("OUTGOING_INVOICE_NOT_FOUND");
  assertOperator(application, invoice, models.actor);
  if (text(invoice.invoice_direction).toLowerCase() !== "outgoing") {
    throw new Error("INVOICE_DIRECTION_MISMATCH:outgoing");
  }
  if (INVOICE_INACTIVE_STATUSES.has(text(invoice.status).toLowerCase())) {
    throw new Error(`INVOICE_STATUS_LOCKED:${invoice.status}`);
  }
  const existingResponse = await models.fulfillment.filter({
    where: {
      invoice_application_id: { $eq: applicationId },
      invoice_id: { $eq: invoiceId },
    },
    currentPage: 1,
    pageSize: 20,
  });
  const existing = rowsOf(existingResponse)[0];
  const [applicationRelations, invoiceRelations] = await Promise.all([
    models.fulfillment.filter({
      where: {
        invoice_application_id: { $eq: applicationId },
        relation_status: { $eq: "active" },
      },
      select: ["id", "fulfilled_amount"],
      currentPage: 1,
      pageSize: 5000,
    }),
    models.fulfillment.filter({
      where: {
        invoice_id: { $eq: invoiceId },
        relation_status: { $eq: "active" },
      },
      select: ["id", "fulfilled_amount"],
      currentPage: 1,
      pageSize: 5000,
    }),
  ]);
  const sumExcluding = (rows) =>
    rowsOf(rows)
      .filter((row) => Number(row.id) !== Number(existing?.id))
      .reduce((sum, row) => sum + Number(row.fulfilled_amount || 0), 0);
  if (
    sumExcluding(applicationRelations) + amount >
    Number(application.requested_total_amount || 0) + 0.001
  ) {
    throw new Error("FULFILLMENT_EXCEEDS_APPLICATION_AMOUNT");
  }
  if (
    sumExcluding(invoiceRelations) + amount >
    Number(invoice.total_amount || 0) + 0.001
  ) {
    throw new Error("FULFILLMENT_EXCEEDS_INVOICE_AMOUNT");
  }
  const payload = {
    invoice_application_id: applicationId,
    invoice_id: invoiceId,
    fulfilled_amount: amount,
    relation_status: "active",
    remark: text(params.remark) || null,
  };
  let fulfillmentId;
  if (existing?.id) {
    fulfillmentId = Number(existing.id);
    await models.fulfillment.update({ id: fulfillmentId, ...payload });
  } else {
    fulfillmentId = createdId(await models.fulfillment.create(payload));
  }
  return {
    fulfillmentId,
    invoiceApplicationId: applicationId,
    invoiceId,
    ...(await refreshApplication(application, models)),
  };
}

async function cancel(params, models) {
  const fulfillmentId = positiveId(params.fulfillmentId, "fulfillmentId");
  const response = await models.fulfillment.filter({
    where: { id: { $eq: fulfillmentId } },
    currentPage: 1,
    pageSize: 1,
  });
  const relation = rowsOf(response)[0];
  if (!relation) throw new Error("INVOICE_FULFILLMENT_NOT_FOUND");
  const application = await models.application.getOne({
    id: Number(relation.invoice_application_id),
  });
  const invoice = await models.invoice.getOne({
    id: Number(relation.invoice_id),
  });
  assertOperator(application, invoice, models.actor);
  await models.fulfillment.update({
    id: fulfillmentId,
    relation_status: "cancelled",
    remark: text(params.remark) || text(relation.remark) || null,
  });
  return {
    fulfillmentId,
    invoiceApplicationId: Number(application.id),
    ...(await refreshApplication(application, models)),
  };
}

export default async function cpoFulfillInvoiceApplication(params, context) {
  const models = await loadModels(context);
  const op = text(params?.op);
  if (op === "fulfill") return fulfill(params, models);
  if (op === "cancel") return cancel(params, models);
  throw new Error(`INVALID_PARAMS:op:${op}`);
}
