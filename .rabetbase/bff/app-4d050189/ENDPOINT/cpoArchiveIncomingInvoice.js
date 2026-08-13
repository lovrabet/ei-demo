/**
 * 进项发票直接归档。
 *
 * [脚本描述] 校验对方开具发票的必要字段、附件和重复票号后直接归档，不进入申请审批流
 * [接口路径] POST /api/endpoint/app-4d050189/cpoArchiveIncomingInvoice
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * { "invoiceId": 123 }
 *
 * [返回数据结构]
 * { "bizType": "invoice", "bizId": 123, "status": "reviewed" }
 */

const ADMIN_ROLES = new Set([
  "admin",
  "administrator",
  "super_admin",
  "cpo_admin",
  "workflow_admin",
]);
const ARCHIVABLE_STATUSES = new Set(["draft", "rejected"]);

function optionalText(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function positiveId(value, fieldName) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`INVALID_PARAMS:${fieldName} must be a positive integer`);
  }
  return id;
}

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

function normalizeRoles(roleLike) {
  const values = Array.isArray(roleLike) ? roleLike : [roleLike];
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

function assertRecordOwner(record, actor) {
  if (actorIsAdmin(actor)) return;
  const actorUserId = optionalText(actor?.userId);
  const applicantUserId = optionalText(record?.applicant_user_id);
  if (!actorUserId) throw new Error("CPO_ACTOR_MISSING");
  if (applicantUserId && applicantUserId !== actorUserId) {
    throw new Error("INCOMING_INVOICE_ARCHIVE_FORBIDDEN");
  }
}

function assertIncomingInvoiceComplete(record) {
  if (optionalText(record.invoice_direction) !== "incoming") {
    throw new Error("INCOMING_INVOICE_DIRECTION_REQUIRED");
  }
  const requiredFields = [
    "invoice_no",
    "invoice_date",
    "seller_name",
    "buyer_name",
    "invoice_type",
  ];
  const missing = requiredFields.filter(
    (field) => !optionalText(record[field]),
  );
  if (missing.length) {
    throw new Error(`INCOMING_INVOICE_REQUIRED_MISSING:${missing.join(",")}`);
  }
  if (
    !Number.isFinite(Number(record.total_amount)) ||
    Number(record.total_amount) <= 0
  ) {
    throw new Error("INCOMING_INVOICE_TOTAL_AMOUNT_REQUIRED");
  }
}

export default async function cpoArchiveIncomingInvoice(params, context) {
  const invoiceId = positiveId(params?.invoiceId, "invoiceId");
  const bff = context.client.bff;
  const [actor, map] = await Promise.all([
    bff.execute({ scriptName: "cpoCurrentActor", params: {} }),
    bff.execute({ scriptName: "cpoDatasetMap", params: {} }),
  ]);
  const invoiceCode = map.DATASET_CODES?.invoiceRecord;
  const attachmentCode = map.DATASET_CODES?.attachment;
  if (!invoiceCode) throw new Error("DATASET_CODE_MISSING:invoiceRecord");
  if (!attachmentCode) throw new Error("DATASET_CODE_MISSING:attachment");

  const invoiceModel = context.client.models[`dataset_${invoiceCode}`];
  const attachmentModel = context.client.models[`dataset_${attachmentCode}`];
  if (!invoiceModel?.getOne || !invoiceModel?.update) {
    throw new Error("MODEL_MISSING:invoiceRecord");
  }
  if (!attachmentModel?.filter) throw new Error("MODEL_MISSING:attachment");

  const record = await invoiceModel.getOne({ id: invoiceId });
  if (!record?.id) {
    throw new Error("INCOMING_INVOICE_NOT_FOUND");
  }
  assertRecordOwner(record, actor);
  assertIncomingInvoiceComplete(record);

  const currentStatus = optionalText(record.status);
  if (currentStatus === "reviewed") {
    return { bizType: "invoice", bizId: invoiceId, status: "reviewed" };
  }
  if (!ARCHIVABLE_STATUSES.has(currentStatus)) {
    throw new Error(`INCOMING_INVOICE_STATUS_LOCKED:${currentStatus}`);
  }

  try {
    await bff.execute({
      scriptName: "cpoInvoiceDuplicateGuard",
      params: {
        invoiceNos: [optionalText(record.invoice_no)],
        assertUnique: true,
      },
    });
  } catch (error) {
    if (optionalText(error?.message).includes("DUPLICATE_INVOICE")) {
      throw new Error(
        `INCOMING_INVOICE_DUPLICATE:${optionalText(record.invoice_no)}`,
      );
    }
    throw error;
  }

  const attachmentResponse = await attachmentModel.filter({
    where: {
      biz_type: { $eq: "invoice" },
      biz_id: { $eq: invoiceId },
      attachment_type: { $eq: "invoice" },
    },
    select: ["id", "file_name", "file_path"],
    currentPage: 1,
    pageSize: 20,
  });
  if (
    !rowsOf(attachmentResponse).some((item) => optionalText(item.file_path))
  ) {
    throw new Error("INCOMING_INVOICE_ATTACHMENT_REQUIRED");
  }

  const invoiceTitle =
    optionalText(record.invoice_title) ||
    [optionalText(record.seller_name), optionalText(record.invoice_no)]
      .filter(Boolean)
      .join(" - ");
  await invoiceModel.update({
    id: invoiceId,
    status: "reviewed",
    request_type: "service_provider_invoice",
    invoice_direction: "incoming",
    ...(invoiceTitle ? { invoice_title: invoiceTitle } : {}),
  });
  await bff.execute({
    scriptName: "cpoActionRecorder",
    params: {
      bizType: "invoice",
      bizId: invoiceId,
      action: "archive",
      fromStatus: currentStatus,
      toStatus: "reviewed",
      comment: invoiceTitle ? `归档进项发票：${invoiceTitle}` : "归档进项发票",
      actorUserId: actor?.userId || "",
      actorName: actor?.userName || "",
      actorRole: "applicant",
    },
  });

  return { bizType: "invoice", bizId: invoiceId, status: "reviewed" };
}
