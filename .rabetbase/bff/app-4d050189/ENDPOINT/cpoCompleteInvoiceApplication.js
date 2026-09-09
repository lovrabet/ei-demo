/**
 * 已审核开票申请的真实发票登记入口。
 *
 * [脚本描述] 财务上传并确认真实销项发票后，一次完成发票台账、票面附件、申请履约和销售合同关联
 * [接口路径] POST /api/endpoint/app-4d050189/cpoCompleteInvoiceApplication
 */

const APPLICATION_ALLOWED_STATUSES = new Set(["reviewed", "completed"]);
const INVOICE_RESUMABLE_STATUSES = new Set(["draft", "rejected"]);
const INVOICE_USABLE_STATUSES = new Set(["draft", "rejected", "reviewed"]);

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

function positiveId(value, field) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0)
    throw new Error(`INVALID_PARAMS:${field}`);
  return id;
}

function money(value, field) {
  const amount = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`INVALID_AMOUNT:${field}`);
  }
  return amount;
}

function nonNegativeMoney(value, field) {
  const amount = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`INVALID_AMOUNT:${field}`);
  }
  return amount;
}

function assertFinanceAccess(actor) {
  if (!text(actor?.userId)) throw new Error("CPO_ACTOR_MISSING");
  if (actor?.isAdmin === true || actor?.isFinanceAdvisor === true) return;
  throw new Error("INVOICE_APPLICATION_COMPLETION_FORBIDDEN");
}

function modelOf(models, tableName, label, methods) {
  const model = models.byTable(tableName);
  if (!model || methods.some((method) => !model[method])) {
    throw new Error(`MODEL_MISSING:${label}`);
  }
  return model;
}

function createdId(result) {
  return positiveId(
    typeof result === "number"
      ? result
      : (result?.id ?? result?.bizId ?? result?.data?.id ?? result?.result?.id),
    "createdId",
  );
}

async function filterAll(model, query) {
  const result = [];
  for (let currentPage = 1; ; currentPage += 1) {
    const page = rowsOf(
      await model.filter({ ...query, currentPage, pageSize: 100 }),
    );
    result.push(...page);
    if (page.length < 100) return result;
  }
}

function normalizeInvoice(params) {
  const invoice = params?.invoice || {};
  const normalized = {
    invoice_no: text(invoice.invoiceNo || invoice.invoice_no),
    invoice_date: text(invoice.invoiceDate || invoice.invoice_date),
    seller_name: text(invoice.sellerName || invoice.seller_name),
    buyer_name: text(invoice.buyerName || invoice.buyer_name),
    buyer_tax_no: text(invoice.buyerTaxNo || invoice.buyer_tax_no),
    amount: money(invoice.amount, "invoice.amount"),
    tax_amount: nonNegativeMoney(invoice.taxAmount, "invoice.taxAmount"),
    total_amount: money(invoice.totalAmount, "invoice.totalAmount"),
    tax_rate: Number(invoice.taxRate ?? invoice.tax_rate ?? 0),
    invoice_type: text(invoice.invoiceType || invoice.invoice_type),
    invoice_content: text(invoice.invoiceContent || invoice.invoice_content),
  };
  const required = [
    "invoice_no",
    "invoice_date",
    "seller_name",
    "buyer_name",
    "invoice_type",
    "invoice_content",
  ];
  const missing = required.filter((field) => !normalized[field]);
  if (missing.length)
    throw new Error(`INVOICE_OCR_REQUIRED_MISSING:${missing.join(",")}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.invoice_date)) {
    throw new Error("INVOICE_DATE_INVALID");
  }
  if (!Number.isFinite(normalized.tax_rate) || normalized.tax_rate < 0) {
    throw new Error("INVOICE_TAX_RATE_INVALID");
  }
  if (
    Math.abs(
      normalized.amount + normalized.tax_amount - normalized.total_amount,
    ) > 0.02
  ) {
    throw new Error("INVOICE_AMOUNT_MISMATCH");
  }
  return normalized;
}

function normalizeAttachment(params) {
  const attachment = params?.attachment || {};
  const normalized = {
    file_name: text(attachment.fileName || attachment.file_name),
    file_path: text(attachment.filePath || attachment.file_path),
    file_type:
      text(attachment.fileType || attachment.file_type) || "application/pdf",
    source_dir: text(attachment.sourceDir || attachment.source_dir),
  };
  if (!normalized.file_name || !normalized.file_path) {
    throw new Error("INVOICE_ATTACHMENT_REQUIRED");
  }
  return normalized;
}

function assertMatchesApplication(application, invoice) {
  if (text(application.seller_name) !== invoice.seller_name) {
    throw new Error("INVOICE_SELLER_MISMATCH");
  }
  if (text(application.buyer_name) !== invoice.buyer_name) {
    throw new Error("INVOICE_BUYER_MISMATCH");
  }
  if (
    text(application.buyer_tax_no) &&
    invoice.buyer_tax_no &&
    text(application.buyer_tax_no) !== invoice.buyer_tax_no
  ) {
    throw new Error("INVOICE_BUYER_TAX_NO_MISMATCH");
  }
}

async function loadModels(context) {
  const actor = await context.client.bff.execute({
    scriptName: "cpoCurrentActor",
    params: {},
  });
  const models = context.client.models;
  return {
    actor,
    application: modelOf(models, "invoice_application", "invoiceApplication", [
      "getOne",
      "update",
    ]),
    invoice: modelOf(models, "invoice_record", "invoiceRecord", [
      "filter",
      "getOne",
      "create",
      "update",
    ]),
    fulfillment: modelOf(
      models,
      "invoice_application_fulfillment",
      "invoiceApplicationFulfillment",
      ["filter", "create", "update"],
    ),
    attachment: modelOf(models, "attachment", "attachment", [
      "filter",
      "create",
    ]),
    relation: modelOf(models, "biz_relation", "bizRelation", [
      "filter",
      "create",
      "update",
    ]),
  };
}

async function ensureAttachment(models, invoiceId, attachment) {
  const existing = rowsOf(
    await models.attachment.filter({
      where: {
        biz_type: { $eq: "invoice" },
        biz_id: { $eq: invoiceId },
        attachment_type: { $eq: "invoice" },
        file_path: { $eq: attachment.file_path },
      },
      currentPage: 1,
      pageSize: 20,
    }),
  )[0];
  if (existing) return Number(existing.id);
  return createdId(
    await models.attachment.create({
      biz_type: "invoice",
      biz_id: invoiceId,
      attachment_type: "invoice",
      file_name: attachment.file_name,
      file_path: attachment.file_path,
      file_type: attachment.file_type,
      ...(attachment.source_dir ? { source_dir: attachment.source_dir } : {}),
      uploaded_by: text(models.actor?.userName) || null,
    }),
  );
}

async function copyContractRelation(
  models,
  applicationId,
  invoiceId,
  fallbackContractId,
) {
  const applicationRelation = rowsOf(
    await models.relation.filter({
      where: {
        source_biz_type: { $eq: "invoice_application" },
        source_biz_id: { $eq: applicationId },
        relation_type: { $eq: "bills_crm_contract" },
        relation_status: { $eq: "active" },
      },
      currentPage: 1,
      pageSize: 20,
    }),
  )[0];
  const contractId =
    Number(applicationRelation?.target_biz_id) ||
    Number(fallbackContractId) ||
    0;
  if (!contractId) return null;

  const existing = rowsOf(
    await models.relation.filter({
      where: {
        source_biz_type: { $eq: "invoice" },
        source_biz_id: { $eq: invoiceId },
        relation_type: { $eq: "bills_crm_contract" },
        target_biz_type: { $eq: "crm_contract" },
        target_biz_id: { $eq: contractId },
      },
      currentPage: 1,
      pageSize: 20,
    }),
  )[0];
  if (existing) {
    if (text(existing.relation_status) !== "active") {
      await models.relation.update({
        id: Number(existing.id),
        relation_status: "active",
      });
    }
    return Number(existing.id);
  }
  return createdId(
    await models.relation.create({
      source_biz_type: "invoice",
      source_biz_id: invoiceId,
      target_biz_type: "crm_contract",
      target_biz_id: contractId,
      relation_type: "bills_crm_contract",
      relation_status: "active",
      created_by_user_id: text(models.actor?.userId),
      created_by_name_snapshot: text(models.actor?.userName),
    }),
  );
}

export default async function cpoCompleteInvoiceApplication(params, context) {
  const applicationId = positiveId(
    params?.invoiceApplicationId,
    "invoiceApplicationId",
  );
  const invoice = normalizeInvoice(params);
  const attachment = normalizeAttachment(params);
  const models = await loadModels(context);
  assertFinanceAccess(models.actor);

  const application = await models.application.getOne({ id: applicationId });
  if (!application?.id) throw new Error("INVOICE_APPLICATION_NOT_FOUND");
  if (!APPLICATION_ALLOWED_STATUSES.has(text(application.status))) {
    throw new Error(`INVOICE_APPLICATION_STATUS_LOCKED:${application.status}`);
  }
  assertMatchesApplication(application, invoice);

  const duplicates = rowsOf(
    await models.invoice.filter({
      where: { invoice_no: { $eq: invoice.invoice_no } },
      currentPage: 1,
      pageSize: 20,
    }),
  );
  if (duplicates.length > 1) throw new Error("INVOICE_NUMBER_NOT_UNIQUE");
  const existingInvoice = duplicates[0];
  if (
    existingInvoice &&
    (text(existingInvoice.invoice_direction) !== "outgoing" ||
      money(existingInvoice.total_amount, "existingInvoice.totalAmount") !==
        invoice.total_amount ||
      text(existingInvoice.seller_name) !== invoice.seller_name ||
      text(existingInvoice.buyer_name) !== invoice.buyer_name ||
      !INVOICE_USABLE_STATUSES.has(text(existingInvoice.status)))
  ) {
    throw new Error("OUTGOING_INVOICE_DUPLICATE_CONFLICT");
  }

  const existingInvoiceId = Number(existingInvoice?.id) || 0;
  const [activeApplicationFulfillments, activeInvoiceFulfillments] =
    await Promise.all([
      filterAll(models.fulfillment, {
        where: {
          invoice_application_id: { $eq: applicationId },
          relation_status: { $eq: "active" },
        },
      }),
      existingInvoiceId
        ? filterAll(models.fulfillment, {
            where: {
              invoice_id: { $eq: existingInvoiceId },
              relation_status: { $eq: "active" },
            },
          })
        : [],
    ]);
  const currentPair = activeApplicationFulfillments.find(
    (row) => Number(row.invoice_id) === existingInvoiceId,
  );
  const otherFulfilledAmount = activeApplicationFulfillments
    .filter((row) => Number(row.invoice_id) !== existingInvoiceId)
    .reduce((sum, row) => sum + Number(row.fulfilled_amount || 0), 0);
  if (
    otherFulfilledAmount + invoice.total_amount >
    Number(application.requested_total_amount || 0) + 0.001
  ) {
    throw new Error("FULFILLMENT_EXCEEDS_APPLICATION_AMOUNT");
  }
  const otherInvoiceFulfilledAmount = activeInvoiceFulfillments
    .filter((row) => Number(row.id) !== Number(currentPair?.id))
    .reduce((sum, row) => sum + Number(row.fulfilled_amount || 0), 0);
  if (
    otherInvoiceFulfilledAmount + invoice.total_amount >
    invoice.total_amount + 0.001
  ) {
    throw new Error("FULFILLMENT_EXCEEDS_INVOICE_AMOUNT");
  }

  const draftValues = {
    invoice_title: `${invoice.invoice_no} - ${invoice.buyer_name}`,
    request_type: "customer_invoice",
    invoice_direction: "outgoing",
    invoice_purpose: "customer_billing",
    partner_source: "crm_customer",
    partner_name_snapshot: invoice.buyer_name,
    seller_name: invoice.seller_name,
    buyer_name: invoice.buyer_name,
    buyer_tax_no: invoice.buyer_tax_no,
    amount: invoice.amount,
    tax_rate: invoice.tax_rate,
    tax_amount: invoice.tax_amount,
    total_amount: invoice.total_amount,
    currency: text(application.currency) || "CNY",
    invoice_region: "mainland_china",
    invoice_type: invoice.invoice_type,
    invoice_medium: "electronic",
    invoice_content: invoice.invoice_content,
    invoice_no: invoice.invoice_no,
    invoice_date: invoice.invoice_date,
    file_path: attachment.file_path,
    receiver_name: text(application.receiver_name),
    receiver_phone: text(application.receiver_phone),
    receiver_email: text(application.receiver_email),
    is_mainland_compliant: 1,
    remark: `履约《${text(application.application_title)}》，财务上传真实发票`,
  };

  let invoiceId = existingInvoiceId;
  if (!invoiceId) {
    invoiceId = createdId(
      await models.invoice.create({
        ...draftValues,
        status: "draft",
        applicant_user_id: text(models.actor?.userId),
        applicant_name_snapshot: text(models.actor?.userName),
      }),
    );
  } else if (INVOICE_RESUMABLE_STATUSES.has(text(existingInvoice.status))) {
    await models.invoice.update({ id: invoiceId, ...draftValues });
  }

  const attachmentId = await ensureAttachment(models, invoiceId, attachment);
  const contractRelationId = await copyContractRelation(
    models,
    applicationId,
    invoiceId,
    application.crm_contract_id,
  );
  const duplicateResult = await context.client.bff.execute({
    scriptName: "cpoInvoiceDuplicateGuard",
    params: { invoiceNos: [invoice.invoice_no], assertUnique: false },
  });
  const conflicts = (duplicateResult?.duplicates || []).filter(
    (item) =>
      (item.invoiceIds || []).some((id) => Number(id) !== invoiceId) ||
      (item.conflictingExpenses || []).length,
  );
  if (conflicts.length)
    throw new Error(`OUTGOING_INVOICE_DUPLICATE:${invoice.invoice_no}`);

  const invoiceRecord = await models.invoice.getOne({ id: invoiceId });
  const invoiceFromStatus = text(invoiceRecord?.status);
  if (invoiceFromStatus !== "reviewed") {
    if (!INVOICE_RESUMABLE_STATUSES.has(invoiceFromStatus)) {
      throw new Error(`OUTGOING_INVOICE_STATUS_LOCKED:${invoiceFromStatus}`);
    }
    await models.invoice.update({
      id: invoiceId,
      status: "reviewed",
      request_type: "customer_invoice",
      invoice_direction: "outgoing",
    });
    await context.client.bff.execute({
      scriptName: "cpoActionRecorder",
      params: {
        bizType: "invoice",
        bizId: invoiceId,
        action: "register_issued_invoice",
        fromStatus: invoiceFromStatus,
        toStatus: "reviewed",
        comment: `登记已开具销项发票：${draftValues.invoice_title}`,
        actorUserId: text(models.actor?.userId),
        actorName: text(models.actor?.userName),
        actorRole: "finance",
      },
    });
  }

  const existingFulfillment = rowsOf(
    await models.fulfillment.filter({
      where: {
        invoice_application_id: { $eq: applicationId },
        invoice_id: { $eq: invoiceId },
      },
      currentPage: 1,
      pageSize: 20,
    }),
  )[0];
  const fulfillmentPayload = {
    invoice_application_id: applicationId,
    invoice_id: invoiceId,
    fulfilled_amount: invoice.total_amount,
    relation_status: "active",
    remark: `实际发票已开具，票号 ${invoice.invoice_no}`,
  };
  let fulfillmentId;
  if (existingFulfillment?.id) {
    fulfillmentId = Number(existingFulfillment.id);
    await models.fulfillment.update({
      id: fulfillmentId,
      ...fulfillmentPayload,
    });
  } else {
    fulfillmentId = createdId(
      await models.fulfillment.create(fulfillmentPayload),
    );
  }

  const fulfilledAmount = (
    await filterAll(models.fulfillment, {
      where: {
        invoice_application_id: { $eq: applicationId },
        relation_status: { $eq: "active" },
      },
      select: ["fulfilled_amount"],
    })
  ).reduce((sum, row) => sum + Number(row.fulfilled_amount || 0), 0);
  const requestedAmount = Number(application.requested_total_amount || 0);
  const status =
    requestedAmount > 0 && fulfilledAmount + 0.001 >= requestedAmount
      ? "completed"
      : "reviewed";
  await models.application.update({
    id: applicationId,
    status,
    completed_at: status === "completed" ? mysqlNow() : null,
  });
  await context.client.bff.execute({
    scriptName: "cpoActionRecorder",
    params: {
      bizType: "invoice_application",
      bizId: applicationId,
      action: "fulfill_invoice_application",
      fromStatus: text(application.status),
      toStatus: status,
      comment: `关联实际发票 ${invoice.invoice_no}`,
      actorUserId: text(models.actor?.userId),
      actorName: text(models.actor?.userName),
      actorRole: "finance",
    },
  });

  return {
    invoiceApplicationId: applicationId,
    invoiceId,
    invoiceNo: invoice.invoice_no,
    attachmentId,
    contractRelationId,
    fulfillmentId,
    status,
    fulfilledAmount,
    unfulfilledAmount: Math.max(requestedAmount - fulfilledAmount, 0),
  };
}
