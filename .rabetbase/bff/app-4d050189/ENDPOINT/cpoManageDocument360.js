/**
 * 单据 360 关系与经营分类维护端点。
 *
 * [脚本名称] cpoManageDocument360
 * [脚本类型] ENDPOINT
 * [接口路径] POST /api/endpoint/app-4d050189/cpoManageDocument360
 */
const ADMIN_ROLES = new Set([
  "admin",
  "administrator",
  "super_admin",
  "cpo_admin",
  "workflow_admin",
]);

const CONTRACT_LIFECYCLE_STATUSES = new Set([
  "pending_signature",
  "signed",
  "in_progress",
  "completed",
]);

const INVOICE_DIRECTIONS = new Set(["incoming", "outgoing"]);
const INVOICE_PURPOSES = new Set([
  "reimbursement",
  "procurement",
  "contract_payment",
  "customer_billing",
  "other",
]);

const CONTRACT_RELATION_RULES = {
  originates_from_quote: "quote",
  covered_by_nda: "legal_agreement",
  serves_customer: "crm_customer",
};

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

function businessTitle(record, fields) {
  for (const field of fields) {
    const value = text(record?.[field]);
    if (value) return value;
  }
  return "关联对象标题缺失";
}

function positiveId(value, field) {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) {
    throw new Error(`INVALID_PARAMS:${field}`);
  }
  return result;
}

function money(value, field) {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) {
    throw new Error(`INVALID_PARAMS:${field}`);
  }
  return Math.round((result + Number.EPSILON) * 100) / 100;
}

function normalizeRoles(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) =>
      typeof item === "string"
        ? item
        : item?.code || item?.name || item?.value || item?.roleCode,
    )
    .map((item) => text(item).toLowerCase())
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

async function requireRecord(model, id, name) {
  if (!model?.getOne) throw new Error(`MODEL_MISSING:${name}`);
  const record = await model.getOne({ id });
  if (!record?.id) {
    throw new Error(`${name.toUpperCase()}_NOT_FOUND:${id}`);
  }
  return record;
}

async function recordAction({
  context,
  bizType,
  bizId,
  action,
  status,
  comment,
  actor,
}) {
  await context.client.bff.execute({
    scriptName: "cpoActionRecorder",
    params: {
      bizType,
      bizId,
      action,
      fromStatus: status || "",
      toStatus: status || "",
      comment,
      actorUserId: text(actor?.userId),
      actorName: text(actor?.userName),
      actorRole: "admin",
    },
  });
}

async function updateContractLifecycle(params, context, map, actor) {
  const contractId = positiveId(params?.bizId, "bizId");
  const lifecycleStatus = text(params?.lifecycleStatus);
  if (!CONTRACT_LIFECYCLE_STATUSES.has(lifecycleStatus)) {
    throw new Error(`CONTRACT_LIFECYCLE_STATUS_INVALID:${lifecycleStatus}`);
  }
  const model =
    context.client.models[`dataset_${map.DATASET_CODES.contractApplication}`];
  const record = await requireRecord(model, contractId, "contract");
  await model.update({
    id: contractId,
    lifecycle_status: lifecycleStatus,
    lifecycle_updated_at: new Date().toISOString(),
  });
  await recordAction({
    context,
    bizType: "contract",
    bizId: contractId,
    action: "update_lifecycle",
    status: record.status,
    comment: `合同履约状态调整为 ${lifecycleStatus}`,
    actor,
  });
  return { bizType: "contract", bizId: contractId, lifecycleStatus };
}

async function updateInvoiceClassification(params, context, map, actor) {
  const invoiceId = positiveId(params?.bizId, "bizId");
  const invoiceDirection = text(params?.invoiceDirection);
  const invoicePurpose = text(params?.invoicePurpose);
  if (!INVOICE_DIRECTIONS.has(invoiceDirection)) {
    throw new Error(`INVOICE_DIRECTION_INVALID:${invoiceDirection}`);
  }
  if (!INVOICE_PURPOSES.has(invoicePurpose)) {
    throw new Error(`INVOICE_PURPOSE_INVALID:${invoicePurpose}`);
  }
  const model =
    context.client.models[`dataset_${map.DATASET_CODES.invoiceRecord}`];
  const record = await requireRecord(model, invoiceId, "invoice");
  await model.update({
    id: invoiceId,
    invoice_direction: invoiceDirection,
    invoice_purpose: invoicePurpose,
  });
  await recordAction({
    context,
    bizType: "invoice",
    bizId: invoiceId,
    action: "update_invoice_classification",
    status: record.status,
    comment: `发票分类调整为 ${invoiceDirection}/${invoicePurpose}`,
    actor,
  });
  return {
    bizType: "invoice",
    bizId: invoiceId,
    invoiceDirection,
    invoicePurpose,
  };
}

async function allocateInvoice(params, context, map, actor) {
  const paymentId = positiveId(params?.bizId, "bizId");
  const invoiceId = positiveId(params?.invoiceId, "invoiceId");
  const amountUsed = money(params?.amountUsed, "amountUsed");
  const paymentModel =
    context.client.models[`dataset_${map.DATASET_CODES.paymentApplication}`];
  const invoiceModel =
    context.client.models[`dataset_${map.DATASET_CODES.invoiceRecord}`];
  const linkModel =
    context.client.models[`dataset_${map.DATASET_CODES.bizInvoiceLink}`];
  if (!linkModel?.filter || !linkModel?.create || !linkModel?.update) {
    throw new Error("MODEL_MISSING:bizInvoiceLink");
  }
  const [payment, invoice, linkResponse] = await Promise.all([
    requireRecord(paymentModel, paymentId, "payment"),
    requireRecord(invoiceModel, invoiceId, "invoice"),
    linkModel.filter({
      where: { invoice_id: { $eq: invoiceId } },
      currentPage: 1,
      pageSize: 500,
    }),
  ]);
  if (text(invoice.invoice_direction) !== "incoming") {
    throw new Error("PAYMENT_INVOICE_DIRECTION_INVALID");
  }
  if (
    ["reimbursement", "customer_billing"].includes(
      text(invoice.invoice_purpose),
    )
  ) {
    throw new Error(
      `PAYMENT_INVOICE_PURPOSE_INVALID:${invoice.invoice_purpose}`,
    );
  }
  if (["cancelled", "rejected"].includes(text(invoice.status))) {
    throw new Error(`PAYMENT_INVOICE_STATUS_INVALID:${invoice.status}`);
  }
  const paymentContractId = Number(payment.contract_id) || 0;
  const invoiceContractId = Number(invoice.contract_id) || 0;
  if (!paymentContractId) {
    throw new Error("PAYMENT_CONTRACT_REQUIRED");
  }
  if (invoiceContractId && invoiceContractId !== paymentContractId) {
    throw new Error(
      `INVOICE_PAYMENT_CONTRACT_MISMATCH:${invoiceId}:${paymentId}`,
    );
  }
  const links = rowsOf(linkResponse);
  const existing = links.find(
    (link) =>
      text(link.biz_type) === "payment" && Number(link.biz_id) === paymentId,
  );
  const existingAmount =
    existing
      ? Number(existing.amount_used) || 0
      : 0;
  const allocatedToOthers = links
    .filter((link) => Number(link.id) !== Number(existing?.id))
    .reduce((sum, link) => sum + (Number(link.amount_used) || 0), 0);
  const paymentLinks = await linkModel.filter({
    where: {
      biz_type: { $eq: "payment" },
      biz_id: { $eq: paymentId },
    },
    currentPage: 1,
    pageSize: 500,
  });
  const paymentAllocatedToOthers = rowsOf(paymentLinks)
    .filter((link) => Number(link.id) !== Number(existing?.id))
    .reduce((sum, link) => sum + (Number(link.amount_used) || 0), 0);
  const invoiceAvailable =
    Number(invoice.total_amount || 0) - allocatedToOthers;
  const paymentAvailable =
    Number(payment.amount || 0) - paymentAllocatedToOthers;
  if (amountUsed - invoiceAvailable > 0.001) {
    throw new Error(
      `INVOICE_ALLOCATION_EXCEEDS_AVAILABLE:${invoiceAvailable.toFixed(2)}`,
    );
  }
  if (amountUsed - paymentAvailable > 0.001) {
    throw new Error(
      `PAYMENT_ALLOCATION_EXCEEDS_AVAILABLE:${paymentAvailable.toFixed(2)}`,
    );
  }
  const payload = {
    invoice_id: invoiceId,
    biz_type: "payment",
    biz_id: paymentId,
    relation_type: "payment_coverage",
    amount_used: amountUsed,
  };
  let linkId;
  if (existing?.id) {
    linkId = Number(existing.id);
    await linkModel.update({ id: linkId, ...payload });
  } else {
    linkId = Number(await linkModel.create(payload));
  }
  if (
    text(invoice.invoice_purpose) !== "contract_payment" ||
    !invoiceContractId
  ) {
    await invoiceModel.update({
      id: invoiceId,
      invoice_purpose: "contract_payment",
      contract_id: paymentContractId,
    });
  }
  await context.client.bff.execute({
    scriptName: "cpoInvoiceCoverage",
    params: { paymentIds: [paymentId] },
  });
  await recordAction({
    context,
    bizType: "payment",
    bizId: paymentId,
    action: "allocate_invoice",
    status: payment.status,
    comment: `关联发票“${businessTitle(invoice, ["invoice_title", "invoice_no", "seller_name"])}”，核销金额 ${amountUsed}`,
    actor,
  });
  return {
    bizType: "payment",
    bizId: paymentId,
    invoiceId,
    linkId,
    amountUsed,
    replacedAmount: existingAmount,
  };
}

async function removeInvoiceAllocation(params, context, map, actor) {
  const linkId = positiveId(params?.linkId, "linkId");
  const linkModel =
    context.client.models[`dataset_${map.DATASET_CODES.bizInvoiceLink}`];
  const link = await requireRecord(linkModel, linkId, "invoice_link");
  if (
    text(link.biz_type) !== "payment" ||
    text(link.relation_type) !== "payment_coverage"
  ) {
    throw new Error("INVOICE_LINK_TYPE_INVALID");
  }
  const invoiceModel =
    context.client.models[`dataset_${map.DATASET_CODES.invoiceRecord}`];
  const invoice = await requireRecord(
    invoiceModel,
    positiveId(link.invoice_id, "invoiceId"),
    "invoice",
  );
  if (!linkModel?.delete) throw new Error("MODEL_MISSING:invoice_link");
  await linkModel.delete({ id: linkId });
  await context.client.bff.execute({
    scriptName: "cpoInvoiceCoverage",
    params: { paymentIds: [Number(link.biz_id)] },
  });
  await recordAction({
    context,
    bizType: "payment",
    bizId: Number(link.biz_id),
    action: "remove_invoice_allocation",
    status: "",
    comment: `解除发票“${businessTitle(invoice, ["invoice_title", "invoice_no", "seller_name"])}”的付款核销`,
    actor,
  });
  return {
    bizType: "payment",
    bizId: Number(link.biz_id),
    invoiceId: Number(link.invoice_id),
    linkId,
    removed: true,
  };
}

async function setContractRelation(params, context, map, actor) {
  const contractId = positiveId(params?.bizId, "bizId");
  const relationType = text(params?.relationType);
  const targetBizType = text(params?.targetBizType);
  const targetBizId = positiveId(params?.targetBizId, "targetBizId");
  if (CONTRACT_RELATION_RULES[relationType] !== targetBizType) {
    throw new Error(
      `CONTRACT_RELATION_INVALID:${relationType}:${targetBizType}`,
    );
  }
  const contractModel =
    context.client.models[`dataset_${map.DATASET_CODES.contractApplication}`];
  const targetMeta = map.BIZ_TYPE_TO_DATASET[targetBizType];
  const targetModel = context.client.models[targetMeta?.modelKey];
  const relationModel =
    context.client.models[`dataset_${map.DATASET_CODES.bizRelation}`];
  if (
    !relationModel?.filter ||
    !relationModel?.create ||
    !relationModel?.update
  ) {
    throw new Error("MODEL_MISSING:bizRelation");
  }
  const [contract, target, existingResponse] = await Promise.all([
    requireRecord(contractModel, contractId, "contract"),
    requireRecord(targetModel, targetBizId, targetBizType),
    relationModel.filter({
      where: {
        source_biz_type: { $eq: "contract" },
        source_biz_id: { $eq: contractId },
        relation_type: { $eq: relationType },
      },
      currentPage: 1,
      pageSize: 100,
    }),
  ]);
  const existingRows = rowsOf(existingResponse);
  await Promise.all(
    existingRows
      .filter(
        (row) =>
          Number(row.target_biz_id) !== targetBizId &&
          text(row.relation_status) === "active",
      )
      .map((row) =>
        relationModel.update({ id: row.id, relation_status: "cancelled" }),
      ),
  );
  const existing = existingRows.find(
    (row) =>
      text(row.target_biz_type) === targetBizType &&
      Number(row.target_biz_id) === targetBizId,
  );
  let relationId;
  if (existing?.id) {
    relationId = Number(existing.id);
    await relationModel.update({
      id: relationId,
      relation_status: "active",
    });
  } else {
    relationId = Number(
      await relationModel.create({
        source_biz_type: "contract",
        source_biz_id: contractId,
        target_biz_type: targetBizType,
        target_biz_id: targetBizId,
        relation_type: relationType,
        relation_status: "active",
        created_by_user_id: text(actor?.userId),
        created_by_name_snapshot: text(actor?.userName),
      }),
    );
  }
  await recordAction({
    context,
    bizType: "contract",
    bizId: contractId,
    action: "set_business_relation",
    status: contract.status,
    comment: `${relationType}：${businessTitle(target, ["quote_title", "quote_no", "agreement_title", "agreement_no", "customer_name", "customer_code"])}`,
    actor,
  });
  return {
    bizType: "contract",
    bizId: contractId,
    relationId,
    relationType,
    targetBizType,
    targetBizId,
  };
}

async function removeContractRelation(params, context, map, actor) {
  const relationId = positiveId(params?.relationId, "relationId");
  const relationModel =
    context.client.models[`dataset_${map.DATASET_CODES.bizRelation}`];
  const relation = await requireRecord(
    relationModel,
    relationId,
    "biz_relation",
  );
  if (text(relation.source_biz_type) !== "contract") {
    throw new Error("CONTRACT_RELATION_SOURCE_INVALID");
  }
  await relationModel.update({
    id: relationId,
    relation_status: "cancelled",
  });
  await recordAction({
    context,
    bizType: "contract",
    bizId: Number(relation.source_biz_id),
    action: "remove_business_relation",
    status: "",
    comment: `解除关系 ${relation.relation_type}`,
    actor,
  });
  return {
    bizType: "contract",
    bizId: Number(relation.source_biz_id),
    relationId,
    removed: true,
  };
}

export default async function cpoManageDocument360(params, context) {
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
  if (!actorIsAdmin(actor)) throw new Error("CPO_ADMIN_REQUIRED");

  const operation = text(params?.operation);
  if (operation === "update_contract_lifecycle") {
    return updateContractLifecycle(params, context, map, actor);
  }
  if (operation === "update_invoice_classification") {
    return updateInvoiceClassification(params, context, map, actor);
  }
  if (operation === "allocate_invoice") {
    return allocateInvoice(params, context, map, actor);
  }
  if (operation === "remove_invoice_allocation") {
    return removeInvoiceAllocation(params, context, map, actor);
  }
  if (operation === "set_contract_relation") {
    return setContractRelation(params, context, map, actor);
  }
  if (operation === "remove_contract_relation") {
    return removeContractRelation(params, context, map, actor);
  }
  throw new Error(`DOCUMENT_360_OPERATION_UNSUPPORTED:${operation}`);
}
