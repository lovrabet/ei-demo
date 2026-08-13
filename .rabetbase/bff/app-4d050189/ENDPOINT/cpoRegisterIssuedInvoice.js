/**
 * 已开具销项发票登记入口。
 *
 * [脚本描述] 校验真实票号、开票日期和票面文件后，将销项发票草稿登记为已核验台账记录
 * [接口路径] POST /api/endpoint/app-4d050189/cpoRegisterIssuedInvoice
 */

const ARCHIVABLE_STATUSES = new Set(["draft", "rejected"]);

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

function positiveId(value, field) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0)
    throw new Error(`INVALID_PARAMS:${field}`);
  return id;
}

export default async function cpoRegisterIssuedInvoice(params, context) {
  const invoiceId = positiveId(params?.invoiceId, "invoiceId");
  const bff = context.client.bff;
  const [actor, map] = await Promise.all([
    bff.execute({ scriptName: "cpoCurrentActor", params: {} }),
    bff.execute({ scriptName: "cpoDatasetMap", params: {} }),
  ]);
  const C = map.DATASET_CODES;
  const invoiceModel = context.client.models[`dataset_${C.invoiceRecord}`];
  const attachmentModel = context.client.models[`dataset_${C.attachment}`];
  if (!invoiceModel?.getOne || !invoiceModel?.update) {
    throw new Error("MODEL_MISSING:invoiceRecord");
  }
  if (!attachmentModel?.filter) throw new Error("MODEL_MISSING:attachment");

  const record = await invoiceModel.getOne({ id: invoiceId });
  if (!record?.id) throw new Error("OUTGOING_INVOICE_NOT_FOUND");
  if (text(record.invoice_direction) !== "outgoing") {
    throw new Error("OUTGOING_INVOICE_DIRECTION_REQUIRED");
  }
  if (
    record.applicant_user_id &&
    text(record.applicant_user_id) !== text(actor?.userId) &&
    !actor?.isAdmin
  ) {
    throw new Error("OUTGOING_INVOICE_REGISTER_FORBIDDEN");
  }
  const requiredFields = [
    "invoice_no",
    "invoice_date",
    "seller_name",
    "buyer_name",
    "invoice_type",
  ];
  const missing = requiredFields.filter((field) => !text(record[field]));
  if (missing.length) {
    throw new Error(`OUTGOING_INVOICE_REQUIRED_MISSING:${missing.join(",")}`);
  }
  if (Number(record.total_amount) <= 0) {
    throw new Error("OUTGOING_INVOICE_TOTAL_AMOUNT_REQUIRED");
  }
  const currentStatus = text(record.status);
  if (currentStatus === "reviewed") {
    return { bizType: "invoice", bizId: invoiceId, status: "reviewed" };
  }
  if (!ARCHIVABLE_STATUSES.has(currentStatus)) {
    throw new Error(`OUTGOING_INVOICE_STATUS_LOCKED:${currentStatus}`);
  }

  const attachmentResponse = await attachmentModel.filter({
    where: {
      biz_type: { $eq: "invoice" },
      biz_id: { $eq: invoiceId },
      attachment_type: { $eq: "invoice" },
    },
    select: ["id", "file_path"],
    currentPage: 1,
    pageSize: 20,
  });
  if (!rowsOf(attachmentResponse).some((item) => text(item.file_path))) {
    throw new Error("OUTGOING_INVOICE_ATTACHMENT_REQUIRED");
  }

  const duplicateResult = await bff.execute({
    scriptName: "cpoInvoiceDuplicateGuard",
    params: { invoiceNos: [text(record.invoice_no)], assertUnique: false },
  });
  const duplicateLedgerRows = (duplicateResult?.duplicates || []).filter(
    (item) =>
      (item.invoiceIds || []).some((id) => Number(id) !== invoiceId) ||
      (item.conflictingExpenses || []).length,
  );
  if (duplicateLedgerRows.length) {
    throw new Error(`OUTGOING_INVOICE_DUPLICATE:${text(record.invoice_no)}`);
  }

  await invoiceModel.update({
    id: invoiceId,
    status: "reviewed",
    request_type: "customer_invoice",
    invoice_direction: "outgoing",
  });
  await bff.execute({
    scriptName: "cpoActionRecorder",
    params: {
      bizType: "invoice",
      bizId: invoiceId,
      action: "register_issued_invoice",
      fromStatus: currentStatus,
      toStatus: "reviewed",
      comment: `登记已开具销项发票：${text(record.invoice_title) || text(record.invoice_no)}`,
      actorUserId: actor?.userId || "",
      actorName: actor?.userName || "",
      actorRole: "applicant",
    },
  });
  return { bizType: "invoice", bizId: invoiceId, status: "reviewed" };
}
