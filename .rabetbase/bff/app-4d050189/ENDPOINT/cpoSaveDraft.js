/**
 * CPO 草稿保存入口。
 *
 * [脚本描述] 统一保存 CPO 主单草稿，过滤保护字段，限制仅 draft/rejected 可编辑
 * [接口路径] POST /api/endpoint/app-4d050189/cpoSaveDraft
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * {
 *   "bizType": "expense|invoice|contract|payment|travel",
 *   "bizId": 123,
 *   "values": { "业务字段": "字段值" },
 *   "paymentAllocations": [
 *     { "payment_id": 456, "amount_used": 5500 }
 *   ],
 *   "attachments": [
 *     {
 *       "fileName": "invoice.pdf",
 *       "filePath": "20260807/invoice.pdf",
 *       "fileType": "application/pdf"
 *     }
 *   ],
 *   "items": [
 *     {
 *       "description": "机票报销",
 *       "cny_amount": 1000,
 *       "reimbursable_cny_amount": 500,
 *       "invoices": [
 *         {
 *           "invoice_no": "26337000000473045513",
 *           "seller_name": "服务商",
 *           "total_amount": 1000,
 *           "file_path": "20260721/example.pdf"
 *         }
 *       ],
 *       "remark": "对应发票 xxx.pdf"
 *     }
 *   ]
 * }
 *
 * [返回数据结构]
 * { bizType, bizId, status, mode, expenseItems?, invoiceResolution? }
 */

const EDITABLE_STATUSES = new Set(["draft", "rejected"]);
const ADMIN_ROLES = new Set([
  "admin",
  "administrator",
  "super_admin",
  "cpo_admin",
  "workflow_admin",
]);

const BIZ_FIELD_WHITELIST = {
  expense: [
    "expense_type",
    "travel_type",
    "title",
    "total_original_amount",
    "total_cny_amount",
    "reimbursable_cny_amount",
    "payout_currency",
    "remark",
  ],
  invoice: [
    "invoice_title",
    "request_type",
    "invoice_direction",
    "invoice_purpose",
    "partner_id",
    "partner_source",
    "partner_name_snapshot",
    "contract_id",
    "invoice_no",
    "invoice_date",
    "seller_name",
    "buyer_name",
    "buyer_tax_no",
    "buyer_address_phone",
    "buyer_bank_account",
    "amount",
    "tax_rate",
    "tax_amount",
    "total_amount",
    "currency",
    "invoice_region",
    "invoice_type",
    "invoice_content",
    "invoice_medium",
    "is_mainland_compliant",
    "category",
    "file_path",
    "receiver_name",
    "receiver_phone",
    "receiver_email",
    "remark",
  ],
  invoice_application: [
    "application_title",
    "request_type",
    "crm_company_id",
    "customer_name_snapshot",
    "crm_contract_id",
    "contract_title_snapshot",
    "seller_name",
    "buyer_name",
    "buyer_tax_no",
    "buyer_address_phone",
    "buyer_bank_account",
    "requested_amount",
    "requested_tax_amount",
    "requested_total_amount",
    "currency",
    "tax_rate",
    "invoice_type",
    "invoice_content",
    "invoice_medium",
    "receiver_name",
    "receiver_phone",
    "receiver_email",
    "payment_condition_snapshot",
    "remark",
  ],
  contract: [
    "contract_name",
    "direction",
    "contract_type",
    "payment_requirement",
    "our_role",
    "partner_id",
    "amount",
    "currency",
    "start_date",
    "end_date",
    "liaison_user_id",
    "liaison_name_snapshot",
    "remark",
    "contract_assessment",
  ],
  payment: [
    "partner_id",
    "contract_id",
    "payment_plan_id",
    "payment_type",
    "title",
    "amount",
    "planned_amount_snapshot",
    "currency",
    "payment_phase_no",
    "payment_phase_name",
    "total_phase_count",
    "phase_trigger_condition",
    "liaison_user_id",
    "liaison_name_snapshot",
    "expected_pay_date",
    "planned_pay_date_snapshot",
    "plan_variance_reason",
    "bank_account_snapshot",
    "remark",
  ],
  salary_payment: ["title", "payroll_month", "expected_pay_date", "remark"],
  travel: [
    "title",
    "travel_type",
    "trip_region",
    "origin_city",
    "destination_city",
    "start_date",
    "end_date",
    "travel_reason",
    "estimated_amount",
    "currency",
    "transport_type",
    "hotel_needed",
    "partner_id",
    "project_name",
    "companions_json",
    "remark",
  ],
};

const CREATE_DEFAULTS = {
  expense: {
    total_original_amount: 0,
    total_cny_amount: 0,
    reimbursable_cny_amount: 0,
    payout_currency: "CNY",
    bank_status: "not_submitted",
    status: "draft",
  },
  invoice: {
    currency: "CNY",
    request_type: "customer_invoice",
    partner_source: "manual",
    invoice_region: "mainland_china",
    invoice_type: "vat_normal",
    invoice_medium: "electronic",
    tax_rate: 0,
    is_mainland_compliant: 1,
    status: "draft",
  },
  invoice_application: {
    request_type: "customer_invoice",
    requested_amount: 0,
    requested_tax_amount: 0,
    requested_total_amount: 0,
    currency: "CNY",
    tax_rate: 0,
    invoice_type: "vat_normal",
    invoice_medium: "electronic",
    status: "draft",
  },
  contract: {
    currency: "CNY",
    payment_requirement: "unknown",
    lifecycle_status: "pending_signature",
    status: "draft",
  },
  payment: {
    amount: 0,
    currency: "CNY",
    bank_status: "not_submitted",
    status: "draft",
  },
  salary_payment: {
    amount: 0,
    currency: "CNY",
    bank_status: "not_submitted",
    status: "draft",
  },
  travel: {
    currency: "CNY",
    travel_type: "business",
    trip_region: "domestic",
    estimated_amount: 0,
    hotel_needed: 0,
    status: "draft",
  },
};

const EXPENSE_ITEM_FIELDS = [
  "occurred_date",
  "category",
  "description",
  "original_currency",
  "original_amount",
  "exchange_rate_to_cny",
  "cny_amount",
  "cabin_class",
  "reimburse_ratio",
  "reimbursable_cny_amount",
  "invoice_id",
  "offset_invoice_id",
  "compliance_status",
  "remark",
];

const SALARY_PAYMENT_ITEM_FIELDS = [
  "internal_legal_entity_id",
  "internal_legal_entity_name_snapshot",
  "payment_project",
  "employee_count",
  "amount",
  "currency",
  "payment_method",
  "sort_no",
  "remark",
];

function normalizeBizId(value) {
  if (value === undefined || value === null || value === "") return null;
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

function pickBusinessFields(bizType, values) {
  const whitelist = BIZ_FIELD_WHITELIST[bizType];
  if (!whitelist) throw new Error(`INVALID_BIZ_TYPE:${bizType}`);

  const payload = {};
  for (const field of whitelist) {
    if (Object.prototype.hasOwnProperty.call(values, field)) {
      const value = values[field];
      if (value !== undefined) payload[field] = value;
    }
  }
  return payload;
}

function readCreatedId(result) {
  if (typeof result === "number") return result;
  const candidate =
    result?.id ??
    result?.result?.id ??
    result?.data?.id ??
    result?.data?.result?.id;
  const numericId = Number(candidate);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new Error("CREATE_RESULT_ID_MISSING");
  }
  return numericId;
}

function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function normalizeNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDateText(value) {
  if (value === undefined || value === null || value === "") return "";
  return String(value).slice(0, 10);
}

function todayDateText() {
  return new Date().toISOString().slice(0, 10);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function normalizeApplicationAttachments(value, bizType) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error("INVALID_PARAMS:attachments must be an array");
  }
  if (value.length > 20) {
    throw new Error(`ATTACHMENT_LIMIT_EXCEEDED:${bizType}:20`);
  }
  return value.map((file, index) => {
    const fileName = String(file?.fileName || file?.file_name || "").trim();
    const filePath = String(file?.filePath || file?.file_path || "").trim();
    if (!fileName || !filePath) {
      throw new Error(`ATTACHMENT_INVALID:${bizType}:${index}`);
    }
    const id = Number(file?.id);
    return {
      ...(Number.isFinite(id) && id > 0 ? { id } : {}),
      fileName,
      filePath,
      fileType: String(file?.fileType || file?.file_type || "").trim(),
      sourceDir: String(file?.sourceDir || file?.source_dir || "").trim(),
    };
  });
}

async function syncApplicationAttachments({
  bizId,
  bizType,
  attachmentType,
  attachments,
  uploadedBy,
  datasetMap,
  context,
}) {
  if (attachments === undefined) return undefined;
  const attachmentCode = datasetMap?.DATASET_CODES?.attachment;
  const model = context.client.models[`dataset_${attachmentCode}`];
  if (!attachmentCode || !model?.filter || !model?.create || !model?.update) {
    throw new Error("MODEL_MISSING:attachment");
  }

  const response = await model.filter({
    where: {
      biz_type: { $eq: bizType },
      biz_id: { $eq: Number(bizId) },
      attachment_type: { $eq: attachmentType },
    },
    currentPage: 1,
    pageSize: 100,
  });
  const existingRows = readRows(response);
  const existingById = new Map(
    existingRows.map((row) => [Number(row.id), row]),
  );
  const existingByPath = new Map(
    existingRows
      .filter((row) => optionalText(row.file_path))
      .map((row) => [optionalText(row.file_path), row]),
  );
  const retainedIds = new Set();
  const saved = [];

  for (const file of attachments) {
    if (file.id) {
      const existing = existingById.get(Number(file.id));
      if (!existing) {
        throw new Error(`ATTACHMENT_OWNER_MISMATCH:${bizType}:${file.id}`);
      }
      retainedIds.add(Number(file.id));
      saved.push({
        id: Number(file.id),
        fileName: existing.file_name,
        filePath: existing.file_path,
        fileType: existing.file_type || "",
        sourceDir: existing.source_dir || "",
      });
      continue;
    }

    const existing = existingByPath.get(file.filePath);
    if (existing) {
      retainedIds.add(Number(existing.id));
      saved.push({
        id: Number(existing.id),
        fileName: existing.file_name,
        filePath: existing.file_path,
        fileType: existing.file_type || "",
        sourceDir: existing.source_dir || "",
      });
      continue;
    }

    const createdId = readCreatedId(
      await model.create({
        biz_type: bizType,
        biz_id: Number(bizId),
        attachment_type: attachmentType,
        file_name: file.fileName,
        file_path: file.filePath,
        file_type: file.fileType || null,
        source_dir: file.sourceDir || null,
        uploaded_by: String(uploadedBy || "").trim() || null,
      }),
    );
    retainedIds.add(createdId);
    saved.push({ id: createdId, ...file });
  }

  for (const existing of existingRows) {
    const id = Number(existing.id);
    if (!retainedIds.has(id)) {
      if (!model?.delete) throw new Error("MODEL_DELETE_MISSING:attachment");
      await model.delete({ id });
    }
  }
  return saved;
}

async function resolveSalaryPaymentEntity(businessFields, datasetMap, context) {
  const entityId = Number(businessFields.internal_legal_entity_id);
  if (!Number.isFinite(entityId) || entityId <= 0) {
    return businessFields;
  }
  const entityCode = datasetMap?.DATASET_CODES?.internalLegalEntity;
  const model = context.client.models[`dataset_${entityCode}`];
  if (!entityCode || !model?.getOne) {
    throw new Error("MODEL_MISSING:internal_legal_entity");
  }
  const entity = await model.getOne({ id: entityId });
  if (!entity?.id || String(entity.status || "").toUpperCase() !== "ACTIVE") {
    throw new Error(`INTERNAL_LEGAL_ENTITY_NOT_FOUND:${entityId}`);
  }
  return {
    ...businessFields,
    internal_legal_entity_id: Number(entity.id),
    internal_legal_entity_name_snapshot: String(
      entity.entity_name || "",
    ).trim(),
  };
}

function normalizeSalaryPaymentItems(items) {
  if (items === undefined) return null;
  if (!Array.isArray(items)) {
    throw new Error("INVALID_PARAMS:items must be an array");
  }
  if (items.length > 20) {
    throw new Error("SALARY_PAYMENT_ITEM_LIMIT_EXCEEDED:20");
  }

  const normalized = items.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`INVALID_PARAMS:items[${index}] must be an object`);
    }
    const entityId = Number(item.internal_legal_entity_id);
    const amount = roundMoney(normalizeNumber(item.amount, 0));
    const employeeCount =
      item.employee_count === undefined ||
      item.employee_count === null ||
      item.employee_count === ""
        ? null
        : Number(item.employee_count);
    const paymentProject = optionalText(item.payment_project);
    const currency = optionalText(item.currency || "CNY").toUpperCase();
    const paymentMethod = optionalText(
      item.payment_method || "bank_transfer",
    ).toLowerCase();

    if (!Number.isFinite(entityId) || entityId <= 0) {
      throw new Error(
        `INVALID_PARAMS:items[${index}].internal_legal_entity_id`,
      );
    }
    if (!paymentProject) {
      throw new Error(`INVALID_PARAMS:items[${index}].payment_project`);
    }
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(`INVALID_PARAMS:items[${index}].amount`);
    }
    if (
      employeeCount !== null &&
      (!Number.isInteger(employeeCount) || employeeCount < 0)
    ) {
      throw new Error(`INVALID_PARAMS:items[${index}].employee_count`);
    }
    if (currency !== "CNY") {
      throw new Error(`INVALID_PARAMS:items[${index}].currency`);
    }
    if (!["bank_card", "bank_transfer", "other"].includes(paymentMethod)) {
      throw new Error(`INVALID_PARAMS:items[${index}].payment_method`);
    }

    return {
      __itemId: normalizePositiveId(item.id, `items[${index}].id`),
      internal_legal_entity_id: entityId,
      internal_legal_entity_name_snapshot: "",
      payment_project: paymentProject,
      employee_count: employeeCount,
      amount,
      currency,
      payment_method: paymentMethod,
      sort_no: index + 1,
      remark: optionalText(item.remark),
    };
  });

  const entityIds = normalized.map((item) => item.internal_legal_entity_id);
  if (new Set(entityIds).size !== entityIds.length) {
    throw new Error("SALARY_PAYMENT_ENTITY_DUPLICATED");
  }
  return normalized;
}

async function resolveSalaryPaymentItems(items, datasetMap, context) {
  if (!Array.isArray(items)) return items;
  const entityCode = datasetMap?.DATASET_CODES?.internalLegalEntity;
  const model = context.client.models[`dataset_${entityCode}`];
  if (!entityCode || !model?.getOne) {
    throw new Error("MODEL_MISSING:internal_legal_entity");
  }

  return Promise.all(
    items.map(async (item) => {
      const entity = await model.getOne({
        id: item.internal_legal_entity_id,
      });
      if (
        !entity?.id ||
        String(entity.status || "").toUpperCase() !== "ACTIVE"
      ) {
        throw new Error(
          `INTERNAL_LEGAL_ENTITY_NOT_FOUND:${item.internal_legal_entity_id}`,
        );
      }
      return {
        ...item,
        internal_legal_entity_id: Number(entity.id),
        internal_legal_entity_name_snapshot: String(
          entity.entity_name || "",
        ).trim(),
      };
    }),
  );
}

function summarizeSalaryPaymentItems(items) {
  if (!Array.isArray(items)) return null;
  return {
    amount: roundMoney(
      items.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    ),
    currency: "CNY",
    employee_count: items.reduce(
      (sum, item) => sum + Number(item.employee_count || 0),
      0,
    ),
  };
}

function pickSalaryPaymentItemFields(item) {
  const payload = {};
  for (const field of SALARY_PAYMENT_ITEM_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(item, field)) {
      const value = item[field];
      if (value !== undefined) payload[field] = value;
    }
  }
  return payload;
}

function normalizeInvoiceRef(ref, relationType, fieldName) {
  const source =
    typeof ref === "number" || typeof ref === "string"
      ? { invoice_id: ref }
      : ref;
  if (!source || typeof source !== "object") {
    throw new Error(
      `INVALID_PARAMS:${fieldName} must be an invoice id or object`,
    );
  }

  const invoiceId = normalizePositiveId(
    source.invoice_id ?? source.invoiceId ?? source.id,
    `${fieldName}.invoice_id`,
  );
  const invoiceNo = optionalText(source.invoice_no ?? source.invoiceNo);
  if (!invoiceId && !invoiceNo) {
    throw new Error(
      `INVALID_PARAMS:${fieldName} requires invoice_id or invoice_no`,
    );
  }

  const amountUsedInput =
    source.amount_used ??
    source.amountUsed ??
    source.total_amount ??
    source.totalAmount;
  const amountUsed =
    amountUsedInput === undefined ||
    amountUsedInput === null ||
    amountUsedInput === ""
      ? null
      : roundMoney(normalizeNumber(amountUsedInput, NaN));
  if (amountUsed !== null && (!Number.isFinite(amountUsed) || amountUsed < 0)) {
    throw new Error(
      `INVALID_PARAMS:${fieldName}.amount_used must be non-negative`,
    );
  }

  const sellerName = optionalText(source.seller_name ?? source.sellerName);
  const partnerId = normalizePositiveId(
    source.partner_id ?? source.partnerId,
    `${fieldName}.partner_id`,
  );

  return {
    invoiceId,
    invoiceNo,
    relationType,
    amountUsed,
    invoiceData: {
      invoice_no: invoiceNo,
      invoice_date: normalizeDateText(
        source.invoice_date ?? source.invoiceDate,
      ),
      seller_name: sellerName,
      partner_id: partnerId,
      partner_source: partnerId ? "business_partner" : "manual",
      partner_name_snapshot:
        optionalText(
          source.partner_name_snapshot ?? source.partnerNameSnapshot,
        ) || sellerName,
      buyer_name: optionalText(source.buyer_name ?? source.buyerName),
      amount: source.amount,
      tax_amount: source.tax_amount ?? source.taxAmount,
      total_amount: source.total_amount ?? source.totalAmount,
      currency: optionalText(source.currency),
      invoice_region: optionalText(
        source.invoice_region ?? source.invoiceRegion,
      ),
      invoice_type: optionalText(source.invoice_type ?? source.invoiceType),
      is_mainland_compliant:
        source.is_mainland_compliant ?? source.isMainlandCompliant,
      category: optionalText(source.category),
      file_path: optionalText(source.file_path ?? source.filePath),
      invoice_medium: optionalText(
        source.invoice_medium ?? source.invoiceMedium,
      ),
      tax_rate: source.tax_rate ?? source.taxRate,
      remark: optionalText(source.remark),
    },
  };
}

function normalizeInvoicePaymentAllocations(value) {
  if (value === undefined) return null;
  if (!Array.isArray(value)) {
    throw new Error("INVALID_PARAMS:paymentAllocations must be an array");
  }
  const paymentIds = new Set();
  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(
        `INVALID_PARAMS:paymentAllocations[${index}] must be an object`,
      );
    }
    const paymentId = normalizePositiveId(
      item.payment_id ?? item.paymentId ?? item.id,
      `paymentAllocations[${index}].payment_id`,
    );
    if (!paymentId) {
      throw new Error(
        `INVALID_PARAMS:paymentAllocations[${index}].payment_id is required`,
      );
    }
    if (paymentIds.has(paymentId)) {
      throw new Error(`INVOICE_PAYMENT_DUPLICATED:${paymentId}`);
    }
    paymentIds.add(paymentId);
    const amountUsed = roundMoney(
      normalizeNumber(item.amount_used ?? item.amountUsed, NaN),
    );
    if (!Number.isFinite(amountUsed) || amountUsed <= 0) {
      throw new Error(
        `INVALID_PARAMS:paymentAllocations[${index}].amount_used must be positive`,
      );
    }
    return { paymentId, amountUsed };
  });
}

function normalizeInvoiceRefs(item, index) {
  const refs = [];
  let provided = false;
  const addMany = (value, relationType, fieldName) => {
    provided = true;
    if (value === undefined || value === null) return;
    const list = Array.isArray(value) ? value : [value];
    list.forEach((ref, refIndex) => {
      refs.push(
        normalizeInvoiceRef(ref, relationType, `${fieldName}[${refIndex}]`),
      );
    });
  };

  if (hasOwn(item, "invoices"))
    addMany(item.invoices, "actual", `items[${index}].invoices`);
  if (hasOwn(item, "invoice_refs"))
    addMany(item.invoice_refs, "actual", `items[${index}].invoice_refs`);
  if (hasOwn(item, "invoice_ids"))
    addMany(item.invoice_ids, "actual", `items[${index}].invoice_ids`);
  if (hasOwn(item, "invoice_id"))
    addMany(item.invoice_id, "actual", `items[${index}].invoice_id`);
  if (hasOwn(item, "offset_invoices")) {
    addMany(item.offset_invoices, "offset", `items[${index}].offset_invoices`);
  }
  if (hasOwn(item, "offset_invoice_id")) {
    addMany(
      item.offset_invoice_id,
      "offset",
      `items[${index}].offset_invoice_id`,
    );
  }

  if (!provided) {
    const invoiceNos = [
      ...new Set(optionalText(item.remark).match(/[0-9]{20}/g) || []),
    ];
    if (invoiceNos.length) {
      provided = true;
      invoiceNos.forEach((invoiceNo, refIndex) => {
        refs.push(
          normalizeInvoiceRef(
            { invoice_no: invoiceNo },
            "actual",
            `items[${index}].remarkInvoiceNos[${refIndex}]`,
          ),
        );
      });
    }
  }

  const seen = new Set();
  return {
    provided,
    refs: refs.filter((ref) => {
      const key = `${ref.relationType}:${ref.invoiceId || `no:${ref.invoiceNo}`}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
}

function normalizeExpenseItems(items) {
  if (items === undefined) return null;
  if (items === null) return [];
  if (!Array.isArray(items)) {
    throw new Error("INVALID_PARAMS:items must be an array");
  }

  return items
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const description = optionalText(
        item.description || item.expense_item || item.item_name,
      );
      const category = optionalText(item.category || "other").toLowerCase();
      const occurredDate =
        normalizeDateText(item.occurred_date) || todayDateText();
      const originalCurrency = optionalText(
        item.original_currency || "CNY",
      ).toUpperCase();
      const exchangeRate = normalizeNumber(item.exchange_rate_to_cny, 1) || 1;
      const originalAmount = roundMoney(
        normalizeNumber(
          item.original_amount,
          item.cny_amount ?? item.invoice_amount ?? item.amount,
        ),
      );
      const cnyAmount = roundMoney(
        normalizeNumber(
          item.cny_amount ?? item.invoice_amount ?? item.amount,
          originalAmount * exchangeRate,
        ),
      );
      const reimbursableInput =
        item.reimbursable_cny_amount ??
        item.actual_reimbursable_amount ??
        item.actual_amount ??
        item.reimburse_amount;
      const hasExplicitReimbursable =
        reimbursableInput !== undefined &&
        reimbursableInput !== null &&
        reimbursableInput !== "";
      const inputRatio = normalizeNumber(item.reimburse_ratio, NaN);
      const reimbursableAmount = roundMoney(
        hasExplicitReimbursable
          ? normalizeNumber(reimbursableInput)
          : Number.isFinite(inputRatio)
            ? cnyAmount * inputRatio
            : cnyAmount,
      );
      const reimburseRatio =
        cnyAmount > 0
          ? Math.round((reimbursableAmount / cnyAmount) * 10000) / 10000
          : 1;
      const itemId = normalizePositiveId(item.id, `items[${index}].id`);
      const normalizedRefs = normalizeInvoiceRefs(item, index);
      const payload = {
        __itemId: itemId,
        __invoiceRefsProvided: normalizedRefs.provided,
        __invoiceRefs: normalizedRefs.refs,
        occurred_date: occurredDate,
        category,
        description,
        original_currency: originalCurrency,
        original_amount: originalAmount,
        exchange_rate_to_cny: exchangeRate,
        cny_amount: cnyAmount,
        cabin_class: null,
        reimburse_ratio: reimburseRatio,
        reimbursable_cny_amount: reimbursableAmount,
        compliance_status: optionalText(
          item.compliance_status || "pending_review",
        ),
        remark: optionalText(item.remark),
      };

      if (!payload.description && !payload.cny_amount) return null;
      if (!Number.isFinite(payload.cny_amount) || payload.cny_amount < 0) {
        throw new Error(
          `INVALID_PARAMS:items[${index}].cny_amount must be a non-negative number`,
        );
      }
      if (
        !Number.isFinite(payload.reimbursable_cny_amount) ||
        payload.reimbursable_cny_amount < 0
      ) {
        throw new Error(
          `INVALID_PARAMS:items[${index}].reimbursable_cny_amount must be a non-negative number`,
        );
      }
      return payload;
    })
    .filter(Boolean);
}

function summarizeExpenseItems(items) {
  if (!Array.isArray(items)) return null;
  return items.reduce(
    (summary, item) => ({
      total_original_amount: roundMoney(
        summary.total_original_amount + normalizeNumber(item.cny_amount),
      ),
      total_cny_amount: roundMoney(
        summary.total_cny_amount + normalizeNumber(item.cny_amount),
      ),
      reimbursable_cny_amount: roundMoney(
        summary.reimbursable_cny_amount +
          normalizeNumber(item.reimbursable_cny_amount),
      ),
    }),
    {
      total_original_amount: 0,
      total_cny_amount: 0,
      reimbursable_cny_amount: 0,
    },
  );
}

function optionalText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeRoles(roleLike) {
  if (Array.isArray(roleLike)) {
    return roleLike
      .map((item) =>
        typeof item === "string"
          ? item
          : item?.code || item?.name || item?.value || item?.roleCode,
      )
      .map((role) => optionalText(role).toLowerCase())
      .filter(Boolean);
  }
  const role = optionalText(roleLike).toLowerCase();
  return role ? [role] : [];
}

function actorIsAdmin(actor, context) {
  const userInfo = context?.userInfo || {};
  if (
    actor?.isAdmin === true ||
    userInfo.isAdmin === true ||
    userInfo.admin === true ||
    userInfo.is_super_admin === true
  ) {
    return true;
  }
  const roles = [
    ...normalizeRoles(actor?.roles),
    ...normalizeRoles(userInfo.roles),
    ...normalizeRoles(userInfo.roleList),
    ...normalizeRoles(userInfo.roleCodes),
    ...normalizeRoles(userInfo.role),
  ];
  return roles.some((role) => ADMIN_ROLES.has(role));
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

function normalizePositiveId(value, fieldName) {
  if (value === undefined || value === null || value === "") return null;
  const numericId = Number(value);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new Error(`INVALID_PARAMS:${fieldName} must be a positive number`);
  }
  return numericId;
}

async function resolvePaymentPlan({ values, paymentId, datasetMap, context }) {
  const planId = normalizePositiveId(values.payment_plan_id, "payment_plan_id");
  if (!planId) return null;
  const planCode = datasetMap.DATASET_CODES?.contractPaymentPlan;
  if (!planCode) throw new Error("DATASET_CODE_MISSING:contractPaymentPlan");
  const planModel = context.client.models[`dataset_${planCode}`];
  const paymentCode = datasetMap.DATASET_CODES?.paymentApplication;
  const paymentModel = context.client.models[`dataset_${paymentCode}`];
  if (!planModel?.getOne || !planModel?.filter) {
    throw new Error(`MODEL_MISSING:dataset_${planCode}`);
  }
  if (!paymentCode || !paymentModel?.filter) {
    throw new Error("MODEL_MISSING:paymentApplication");
  }
  const plan = await planModel.getOne({ id: planId });
  if (!plan?.id) {
    throw new Error(`PAYMENT_PLAN_NOT_FOUND:${planId}`);
  }
  const requestedContractId = normalizePositiveId(
    values.contract_id,
    "contract_id",
  );
  if (
    requestedContractId &&
    Number(plan.contract_id) !== Number(requestedContractId)
  ) {
    throw new Error(
      `PAYMENT_PLAN_CONTRACT_MISMATCH:${planId}:${requestedContractId}`,
    );
  }
  const planStatus = optionalText(plan.status);
  if (["not_required", "cancelled"].includes(planStatus)) {
    throw new Error(`PAYMENT_PLAN_STATUS_INVALID:${planId}:${planStatus}`);
  }
  const [planResponse, paymentResponse] = await Promise.all([
    planModel.filter({
      where: {
        contract_id: { $eq: Number(plan.contract_id) },
      },
      select: ["id"],
      currentPage: 1,
      pageSize: 200,
    }),
    paymentModel.filter({
      where: { payment_plan_id: { $eq: planId } },
      select: ["id", "amount", "status", "bank_status"],
      currentPage: 1,
      pageSize: 1000,
    }),
  ]);
  const otherApplicationAmount = readRows(paymentResponse)
    .filter(
      (payment) =>
        Number(payment.id) !== Number(paymentId) &&
        !["cancelled", "rejected"].includes(optionalText(payment.status)),
    )
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const requestedAmount = hasOwn(values, "amount")
    ? Number(values.amount) || 0
    : Number(plan.planned_amount) || 0;
  if (
    otherApplicationAmount +
      requestedAmount -
      Number(plan.planned_amount || 0) >
      0.001 &&
    !optionalText(values.plan_variance_reason)
  ) {
    throw new Error("PAYMENT_PLAN_TOTAL_VARIANCE_REASON_REQUIRED");
  }
  return {
    plan,
    planModel,
    totalPhaseCount: readRows(planResponse).length,
    otherApplicationAmount,
  };
}

function applyPaymentPlanFields(businessFields, values, resolvedPlan) {
  if (!resolvedPlan) return;
  const { plan, totalPhaseCount } = resolvedPlan;
  const valueOrDefault = (field, defaultValue) =>
    hasOwn(values, field) ? values[field] : defaultValue;
  const hasPlanDataChanges =
    Number(valueOrDefault("payment_phase_no", plan.phase_no)) !==
      Number(plan.phase_no) ||
    optionalText(valueOrDefault("payment_phase_name", plan.phase_name)) !==
      optionalText(plan.phase_name) ||
    Number(valueOrDefault("total_phase_count", totalPhaseCount)) !==
      Number(totalPhaseCount) ||
    optionalText(
      valueOrDefault("phase_trigger_condition", plan.trigger_condition),
    ) !== optionalText(plan.trigger_condition) ||
    roundMoney(valueOrDefault("amount", plan.planned_amount)) !==
      roundMoney(plan.planned_amount) ||
    optionalText(
      valueOrDefault("currency", plan.currency || "CNY"),
    ).toUpperCase() !== optionalText(plan.currency || "CNY").toUpperCase() ||
    normalizeDateText(
      valueOrDefault("expected_pay_date", plan.planned_pay_date),
    ) !== normalizeDateText(plan.planned_pay_date);
  if (hasPlanDataChanges && !optionalText(values.plan_variance_reason)) {
    throw new Error("PAYMENT_PLAN_VARIANCE_REASON_REQUIRED");
  }
  Object.assign(businessFields, {
    contract_id: Number(plan.contract_id),
    payment_plan_id: Number(plan.id),
    planned_amount_snapshot: Number(plan.planned_amount),
    planned_pay_date_snapshot: plan.planned_pay_date || null,
  });
  const editablePlanDefaults = {
    payment_phase_no: Number(plan.phase_no),
    payment_phase_name: plan.phase_name || null,
    total_phase_count: totalPhaseCount,
    phase_trigger_condition: plan.trigger_condition || null,
  };
  Object.entries(editablePlanDefaults).forEach(([field, defaultValue]) => {
    if (!Object.prototype.hasOwnProperty.call(values, field)) {
      businessFields[field] = defaultValue;
    }
  });
  if (!Object.prototype.hasOwnProperty.call(values, "amount")) {
    businessFields.amount = Number(plan.planned_amount);
  }
  if (!Object.prototype.hasOwnProperty.call(values, "currency")) {
    businessFields.currency = plan.currency || "CNY";
  }
  if (!Object.prototype.hasOwnProperty.call(values, "expected_pay_date")) {
    businessFields.expected_pay_date = plan.planned_pay_date || null;
  }
}

async function syncPaymentPlanLink({
  existingPayment,
  resolvedPlan,
  paymentId,
  datasetMap,
  context,
}) {
  const oldPlanId = Number(existingPayment?.payment_plan_id) || 0;
  const newPlanId = Number(resolvedPlan?.plan?.id) || 0;
  if (!oldPlanId && !newPlanId) return;
  await context.client.bff.execute({
    scriptName: "cpoPaymentPlanSummary",
    params: {
      planIds: [...new Set([oldPlanId, newPlanId].filter(Boolean))],
    },
  });
}

function normalizeRelations(relations) {
  if (relations === undefined) return null;
  if (relations === null) return [];
  if (!Array.isArray(relations)) {
    throw new Error("INVALID_PARAMS:relations must be an array");
  }

  return relations
    .map((relation) => {
      const relationType = optionalText(
        relation?.relationType || relation?.relation_type,
      );
      const targetBizType = optionalText(
        relation?.targetBizType || relation?.target_biz_type,
      );
      const targetBizId = normalizePositiveId(
        relation?.targetBizId ?? relation?.target_biz_id,
        "targetBizId",
      );
      if (!relationType && !targetBizType && !targetBizId) return null;
      if (!relationType || !targetBizType || !targetBizId) {
        throw new Error(
          "INVALID_PARAMS:relation requires relationType,targetBizType,targetBizId",
        );
      }
      return { relationType, targetBizType, targetBizId };
    })
    .filter(Boolean);
}

const RELATION_RULES = {
  invoice: {
    bills_crm_contract: {
      targetBizType: "crm_contract",
      targetStatus: null,
      isSourceAllowed: (record) => record?.invoice_direction === "outgoing",
    },
  },
  invoice_application: {
    bills_crm_contract: {
      targetBizType: "crm_contract",
      targetStatus: null,
      isSourceAllowed: () => true,
    },
  },
  expense: {
    reimburses_travel: {
      targetBizType: "travel",
      targetStatus: "reviewed",
      isSourceAllowed: (record) => record?.expense_type === "travel",
    },
  },
};

function getSupportedRelationTypes(bizType) {
  return Object.keys(RELATION_RULES[bizType] || {});
}

function getRelationRule(bizType, relationType) {
  const rule = RELATION_RULES[bizType]?.[relationType];
  if (!rule) {
    throw new Error(`RELATION_RULE_UNSUPPORTED:${bizType}:${relationType}`);
  }
  return rule;
}

async function assertRequestedRelationsAllowed({
  bizType,
  sourceRecord,
  relations,
  actor,
  datasetMap,
  context,
}) {
  if (relations === null) return;
  const isAdmin = actorIsAdmin(actor, context);

  for (const relation of relations) {
    const rule = getRelationRule(bizType, relation.relationType);
    if (relation.targetBizType !== rule.targetBizType) {
      throw new Error(
        `RELATION_TARGET_TYPE_INVALID:${relation.relationType}:${relation.targetBizType}`,
      );
    }
    if (!rule.isSourceAllowed(sourceRecord)) {
      throw new Error(
        `RELATION_SOURCE_NOT_ALLOWED:${bizType}:${relation.relationType}`,
      );
    }

    const targetMeta = datasetMap.BIZ_TYPE_TO_DATASET[relation.targetBizType];
    if (!targetMeta?.modelKey) {
      throw new Error(`RELATION_TARGET_META_MISSING:${relation.targetBizType}`);
    }
    const targetModel = context.client.models[targetMeta.modelKey];
    if (!targetModel?.getOne) {
      throw new Error(`MODEL_MISSING:${targetMeta.modelKey}`);
    }
    const targetRecord = await targetModel.getOne({ id: relation.targetBizId });
    if (!targetRecord?.id) {
      throw new Error(
        `RELATION_TARGET_NOT_FOUND:${relation.relationType}:${relation.targetBizType}:${relation.targetBizId}`,
      );
    }
    const targetStatus = targetRecord[targetMeta.statusField || "status"];
    if (rule.targetStatus && targetStatus !== rule.targetStatus) {
      throw new Error(
        `RELATION_TARGET_STATUS_INVALID:${relation.relationType}:${relation.targetBizType}:${relation.targetBizId}:${targetStatus || ""}`,
      );
    }
    if (
      !isAdmin &&
      targetRecord.applicant_user_id &&
      actor.userId &&
      targetRecord.applicant_user_id !== actor.userId
    ) {
      throw new Error(
        `RELATION_TARGET_OWNER_MISMATCH:${relation.relationType}:${relation.targetBizType}:${relation.targetBizId}`,
      );
    }
  }
}

function relationKey(relation) {
  return [
    relation.relation_type || relation.relationType,
    relation.target_biz_type || relation.targetBizType,
    Number(relation.target_biz_id ?? relation.targetBizId),
  ].join(":");
}

async function syncBusinessRelations({
  bizType,
  bizId,
  relations,
  actor,
  datasetMap,
  context,
}) {
  if (relations === null) return;

  const supportedRelationTypes = getSupportedRelationTypes(bizType);
  if (!supportedRelationTypes.length && relations.length) {
    throw new Error(
      `RELATION_RULE_UNSUPPORTED:${bizType}:${relations[0].relationType}`,
    );
  }
  if (!supportedRelationTypes.length) return;

  const relationCode = datasetMap.DATASET_CODES?.bizRelation;
  if (!relationCode) throw new Error("DATASET_CODE_MISSING:bizRelation");
  const relationModel = context.client.models[`dataset_${relationCode}`];
  if (
    !relationModel?.filter ||
    !relationModel?.create ||
    !relationModel?.update
  ) {
    throw new Error(`MODEL_MISSING:dataset_${relationCode}`);
  }

  const existingResponse = await relationModel.filter({
    where: {
      source_biz_type: { $eq: bizType },
      source_biz_id: { $eq: Number(bizId) },
      relation_type: { $in: supportedRelationTypes },
    },
    currentPage: 1,
    pageSize: 100,
  });
  const existingRows = readRows(existingResponse);
  const requestedKeys = new Set(relations.map(relationKey));

  await Promise.all(
    existingRows
      .filter((row) => row.relation_status === "active")
      .filter((row) => !requestedKeys.has(relationKey(row)))
      .map((row) =>
        relationModel.update({
          id: row.id,
          relation_status: "cancelled",
        }),
      ),
  );

  for (const relation of relations) {
    const key = relationKey(relation);
    const existing = existingRows.find((row) => relationKey(row) === key);
    if (existing) {
      const restorePayload = { id: existing.id };
      if (existing.relation_status !== "active") {
        restorePayload.relation_status = "active";
      }
      if (Object.keys(restorePayload).length > 1) {
        await relationModel.update(restorePayload);
      }
      continue;
    }

    await relationModel.create({
      source_biz_type: bizType,
      source_biz_id: Number(bizId),
      target_biz_type: relation.targetBizType,
      target_biz_id: relation.targetBizId,
      relation_type: relation.relationType,
      relation_status: "active",
      created_by_user_id: actor.userId || "",
      created_by_name_snapshot: actor.userName || "",
    });
  }
}

function pickExpenseItemFields(item) {
  const payload = {};
  for (const field of EXPENSE_ITEM_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(item, field)) {
      const value = item[field];
      if (value !== undefined) payload[field] = value;
    }
  }
  return payload;
}

function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(
      ([, value]) => value !== undefined && value !== "",
    ),
  );
}

async function resolveExpenseInvoiceRefs({
  items,
  actor,
  datasetMap,
  context,
}) {
  if (!Array.isArray(items)) return { items, invoiceResolution: [] };
  const allRefs = items.flatMap((item) => item.__invoiceRefs || []);
  if (!allRefs.length) return { items, invoiceResolution: [] };
  const invoiceCode = datasetMap.DATASET_CODES?.invoiceRecord;
  if (!invoiceCode) throw new Error("DATASET_CODE_MISSING:invoiceRecord");
  const invoiceModel = context.client.models[`dataset_${invoiceCode}`];
  if (!invoiceModel?.filter || !invoiceModel?.create) {
    throw new Error(`MODEL_MISSING:dataset_${invoiceCode}`);
  }

  const ids = [...new Set(allRefs.map((ref) => ref.invoiceId).filter(Boolean))];
  const invoiceNos = [
    ...new Set(allRefs.map((ref) => ref.invoiceNo).filter(Boolean)),
  ];
  const [byIdResponse, byNoResponse] = await Promise.all([
    ids.length
      ? invoiceModel.filter({
          where: { id: { $in: ids } },
          currentPage: 1,
          pageSize: Math.min(200, ids.length),
        })
      : Promise.resolve({ tableData: [] }),
    invoiceNos.length
      ? invoiceModel.filter({
          where: { invoice_no: { $in: invoiceNos } },
          currentPage: 1,
          pageSize: Math.min(200, invoiceNos.length * 2),
        })
      : Promise.resolve({ tableData: [] }),
  ]);
  const rowsById = new Map(
    readRows(byIdResponse).map((row) => [Number(row.id), row]),
  );
  const rowsByNo = new Map();
  for (const row of readRows(byNoResponse)) {
    const invoiceNo = optionalText(row.invoice_no);
    if (!rowsByNo.has(invoiceNo)) rowsByNo.set(invoiceNo, []);
    rowsByNo.get(invoiceNo).push(row);
  }

  const invoiceResolution = [];
  for (const [itemIndex, item] of items.entries()) {
    const resolvedRefs = [];
    for (const [refIndex, ref] of (item.__invoiceRefs || []).entries()) {
      let invoice = ref.invoiceId ? rowsById.get(Number(ref.invoiceId)) : null;
      if (ref.invoiceId && !invoice) {
        throw new Error(
          `INVOICE_NOT_FOUND:items[${itemIndex}]:${ref.invoiceId}`,
        );
      }
      if (invoice && ["invalid", "cancelled"].includes(invoice.status)) {
        throw new Error(
          `INVOICE_STATUS_INVALID:items[${itemIndex}]:${invoice.id}:${invoice.status}`,
        );
      }
      if (
        invoice &&
        ref.invoiceNo &&
        optionalText(invoice.invoice_no) !== ref.invoiceNo
      ) {
        throw new Error(
          `INVOICE_ID_NO_MISMATCH:items[${itemIndex}]:${invoice.id}:${ref.invoiceNo}`,
        );
      }

      if (!invoice) {
        const matches = rowsByNo.get(ref.invoiceNo) || [];
        if (matches.length > 1) {
          throw new Error(
            `INVOICE_MATCH_AMBIGUOUS:items[${itemIndex}]:${ref.invoiceNo}`,
          );
        }
        invoice = matches[0] || null;
      }

      let resolution = "linked";
      if (!invoice) {
        if (
          (item.__invoiceRefs || []).length > 1 &&
          ref.amountUsed === null &&
          (ref.invoiceData.total_amount === undefined ||
            ref.invoiceData.total_amount === null ||
            ref.invoiceData.total_amount === "")
        ) {
          throw new Error(
            `INVOICE_AMOUNT_REQUIRED:items[${itemIndex}]:${ref.invoiceNo}`,
          );
        }
        const totalAmount = roundMoney(
          normalizeNumber(
            ref.invoiceData.total_amount,
            ref.amountUsed ?? item.cny_amount,
          ),
        );
        const taxAmount = roundMoney(
          normalizeNumber(ref.invoiceData.tax_amount, 0),
        );
        const amount = roundMoney(
          normalizeNumber(
            ref.invoiceData.amount,
            Math.max(0, totalAmount - taxAmount),
          ),
        );
        const createPayload = compactObject({
          invoice_title: `报销票据 ${ref.invoiceNo}`,
          request_type: "service_provider_invoice",
          invoice_direction: "incoming",
          invoice_purpose: "reimbursement",
          partner_id: ref.invoiceData.partner_id,
          partner_source: ref.invoiceData.partner_source,
          partner_name_snapshot: ref.invoiceData.partner_name_snapshot,
          invoice_no: ref.invoiceNo,
          invoice_date: ref.invoiceData.invoice_date || item.occurred_date,
          seller_name: ref.invoiceData.seller_name,
          buyer_name: ref.invoiceData.buyer_name,
          amount,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          currency: ref.invoiceData.currency || "CNY",
          invoice_region: ref.invoiceData.invoice_region || "mainland_china",
          invoice_type: ref.invoiceData.invoice_type || "other",
          is_mainland_compliant:
            ref.invoiceData.is_mainland_compliant === undefined
              ? 1
              : Number(ref.invoiceData.is_mainland_compliant),
          category: ref.invoiceData.category || item.category,
          file_path: ref.invoiceData.file_path,
          invoice_medium: ref.invoiceData.invoice_medium || "electronic",
          tax_rate: normalizeNumber(ref.invoiceData.tax_rate, 0),
          status: "draft",
          applicant_user_id: actor.userId || "",
          applicant_name_snapshot: actor.userName || "",
          remark:
            ref.invoiceData.remark ||
            "由报销保存入口自动建立台账；税额及合规字段请在审核时复核",
        });
        const createdId = readCreatedId(
          await invoiceModel.create(createPayload),
        );
        invoice = { id: createdId, ...createPayload };
        rowsById.set(createdId, invoice);
        rowsByNo.set(ref.invoiceNo, [invoice]);
        resolution = "created";
      }

      const amountUsed =
        ref.amountUsed === null
          ? roundMoney(normalizeNumber(invoice.total_amount, item.cny_amount))
          : ref.amountUsed;
      const resolved = {
        ...ref,
        invoiceId: Number(invoice.id),
        invoiceNo: optionalText(invoice.invoice_no) || ref.invoiceNo,
        amountUsed,
      };
      resolvedRefs.push(resolved);
      invoiceResolution.push({
        itemIndex,
        refIndex,
        relationType: ref.relationType,
        invoiceId: resolved.invoiceId,
        invoiceNo: resolved.invoiceNo,
        resolution,
      });
    }

    const uniqueResolvedRefs = [];
    const seenResolved = new Set();
    for (const ref of resolvedRefs) {
      const key = `${ref.relationType}:${ref.invoiceId}`;
      if (seenResolved.has(key)) continue;
      seenResolved.add(key);
      uniqueResolvedRefs.push(ref);
    }
    item.__invoiceRefs = uniqueResolvedRefs;
    const actual = uniqueResolvedRefs.find(
      (ref) => ref.relationType === "actual",
    );
    const offset = uniqueResolvedRefs.find(
      (ref) => ref.relationType === "offset",
    );
    if (item.__invoiceRefsProvided) {
      item.invoice_id = actual?.invoiceId ?? null;
      item.offset_invoice_id = offset?.invoiceId ?? null;
    }
  }

  return { items, invoiceResolution };
}

async function syncExpenseItems({ bizId, items, datasetMap, context }) {
  if (items === null) return;
  const expenseItemCode = datasetMap.DATASET_CODES?.expenseItem;
  if (!expenseItemCode) throw new Error("DATASET_CODE_MISSING:expenseItem");
  const itemModel = context.client.models[`dataset_${expenseItemCode}`];
  if (!itemModel?.filter || !itemModel?.create || !itemModel?.update) {
    throw new Error(`MODEL_MISSING:dataset_${expenseItemCode}`);
  }

  const existingResponse = await itemModel.filter({
    where: { expense_id: { $eq: Number(bizId) } },
    select: ["id", "invoice_id", "offset_invoice_id"],
    currentPage: 1,
    pageSize: 200,
  });
  const existingRows = readRows(existingResponse);
  const existingById = new Map(
    existingRows.map((row) => [Number(row.id), row]),
  );
  const savedItems = [];
  for (const item of items) {
    const requestedId = Number(item.__itemId) || 0;
    if (requestedId) {
      if (!existingById.has(requestedId)) {
        throw new Error(`EXPENSE_ITEM_NOT_FOUND:${bizId}:${requestedId}`);
      }
      await itemModel.update({
        id: requestedId,
        ...pickExpenseItemFields(item),
      });
      savedItems.push({ ...item, id: requestedId, __wasNew: false });
      continue;
    }
    const createdId = readCreatedId(
      await itemModel.create({
        expense_id: Number(bizId),
        ...pickExpenseItemFields(item),
      }),
    );
    savedItems.push({ ...item, id: createdId, __wasNew: true });
  }

  const savedIds = new Set(savedItems.map((item) => Number(item.id)));
  const deletedItemIds = existingRows
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && !savedIds.has(id));
  if (deletedItemIds.length) {
    if (!itemModel?.delete) {
      throw new Error(`MODEL_DELETE_MISSING:dataset_${expenseItemCode}`);
    }
    await Promise.all(deletedItemIds.map((id) => itemModel.delete({ id })));
  }
  return { savedItems, deletedItemIds };
}

async function syncSalaryPaymentItems({ bizId, items, datasetMap, context }) {
  if (items === null) return undefined;
  const itemCode = datasetMap.DATASET_CODES?.salaryPaymentItem;
  if (!itemCode) throw new Error("DATASET_CODE_MISSING:salaryPaymentItem");
  const itemModel = context.client.models[`dataset_${itemCode}`];
  if (!itemModel?.filter || !itemModel?.create || !itemModel?.update) {
    throw new Error(`MODEL_MISSING:dataset_${itemCode}`);
  }

  const existingResponse = await itemModel.filter({
    where: {
      salary_payment_id: { $eq: Number(bizId) },
    },
    select: ["id"],
    currentPage: 1,
    pageSize: 100,
  });
  const existingRows = readRows(existingResponse);
  const existingIds = new Set(existingRows.map((row) => Number(row.id)));
  const savedItems = [];

  for (const item of items) {
    const requestedId = Number(item.__itemId) || 0;
    if (requestedId) {
      if (!existingIds.has(requestedId)) {
        throw new Error(
          `SALARY_PAYMENT_ITEM_NOT_FOUND:${bizId}:${requestedId}`,
        );
      }
      await itemModel.update({
        id: requestedId,
        ...pickSalaryPaymentItemFields(item),
      });
      savedItems.push({ ...item, id: requestedId });
      continue;
    }
    const createdId = readCreatedId(
      await itemModel.create({
        salary_payment_id: Number(bizId),
        ...pickSalaryPaymentItemFields(item),
      }),
    );
    savedItems.push({ ...item, id: createdId });
  }

  const savedIds = new Set(savedItems.map((item) => Number(item.id)));
  const deletedItemIds = existingRows
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && !savedIds.has(id));
  if (deletedItemIds.length) {
    if (!itemModel?.delete) {
      throw new Error(`MODEL_DELETE_MISSING:dataset_${itemCode}`);
    }
    await Promise.all(deletedItemIds.map((id) => itemModel.delete({ id })));
  }
  return { savedItems, deletedItemIds };
}

async function syncExpenseInvoiceLinks({
  savedItems,
  deletedItemIds,
  datasetMap,
  context,
}) {
  const linkCode = datasetMap.DATASET_CODES?.bizInvoiceLink;
  if (!linkCode) throw new Error("DATASET_CODE_MISSING:bizInvoiceLink");
  const linkModel = context.client.models[`dataset_${linkCode}`];
  if (!linkModel?.filter || !linkModel?.create || !linkModel?.update) {
    throw new Error(`MODEL_MISSING:dataset_${linkCode}`);
  }

  const itemIds = [
    ...new Set([
      ...savedItems.map((item) => Number(item.id)),
      ...(deletedItemIds || []).map(Number),
    ]),
  ].filter((id) => Number.isFinite(id) && id > 0);
  if (!itemIds.length) return;
  const existingResponse = await linkModel.filter({
    where: {
      biz_type: { $eq: "expense_item" },
      biz_id: { $in: itemIds },
    },
    currentPage: 1,
    pageSize: 500,
    orderBy: [{ id: "desc" }],
  });
  const existingRows = readRows(existingResponse);
  const existingByKey = new Map();
  for (const row of existingRows) {
    const key = `${Number(row.biz_id)}:${row.relation_type}:${Number(row.invoice_id)}`;
    const current = existingByKey.get(key);
    if (!current) {
      existingByKey.set(key, row);
    }
  }
  const managedItemIds = new Set([
    ...(deletedItemIds || []).map(Number),
    ...savedItems
      .filter((item) => item.__wasNew || item.__invoiceRefsProvided)
      .map((item) => Number(item.id)),
  ]);
  const desired = [];
  for (const item of savedItems) {
    if (!managedItemIds.has(Number(item.id))) continue;
    for (const ref of item.__invoiceRefs || []) {
      desired.push({
        invoice_id: Number(ref.invoiceId),
        biz_type: "expense_item",
        biz_id: Number(item.id),
        relation_type: ref.relationType,
        amount_used: ref.amountUsed,
      });
    }
  }
  const desiredKeys = new Set(
    desired.map(
      (row) => `${row.biz_id}:${row.relation_type}:${row.invoice_id}`,
    ),
  );

  const obsoleteLinks = existingRows
    .filter((row) => managedItemIds.has(Number(row.biz_id)))
    .filter(
      (row) =>
        !desiredKeys.has(
          `${Number(row.biz_id)}:${row.relation_type}:${Number(row.invoice_id)}`,
        ),
    );
  if (obsoleteLinks.length) {
    if (!linkModel?.delete) {
      throw new Error(`MODEL_DELETE_MISSING:dataset_${linkCode}`);
    }
    await Promise.all(
      obsoleteLinks.map((row) => linkModel.delete({ id: row.id })),
    );
  }

  for (const row of desired) {
    const key = `${row.biz_id}:${row.relation_type}:${row.invoice_id}`;
    const existing = existingByKey.get(key);
    if (existing) {
      const updatePayload = { id: existing.id };
      if (roundMoney(existing.amount_used) !== roundMoney(row.amount_used)) {
        updatePayload.amount_used = row.amount_used;
      }
      if (Object.keys(updatePayload).length > 1) {
        await linkModel.update(updatePayload);
      }
      continue;
    }
    await linkModel.create(row);
  }
}

async function syncInvoicePaymentAllocations({
  invoiceId,
  invoiceRecord,
  allocations,
  datasetMap,
  context,
  validateOnly = false,
}) {
  if (allocations === null) return null;
  const paymentCode = datasetMap.DATASET_CODES?.paymentApplication;
  const linkCode = datasetMap.DATASET_CODES?.bizInvoiceLink;
  if (!paymentCode) throw new Error("DATASET_CODE_MISSING:paymentApplication");
  if (!linkCode) throw new Error("DATASET_CODE_MISSING:bizInvoiceLink");
  const paymentModel = context.client.models[`dataset_${paymentCode}`];
  const linkModel = context.client.models[`dataset_${linkCode}`];
  if (!paymentModel?.filter) {
    throw new Error(`MODEL_MISSING:dataset_${paymentCode}`);
  }
  if (!linkModel?.filter || !linkModel?.create || !linkModel?.update) {
    throw new Error(`MODEL_MISSING:dataset_${linkCode}`);
  }

  const paymentIds = allocations.map((item) => item.paymentId);
  if (allocations.length) {
    if (optionalText(invoiceRecord.invoice_direction) !== "incoming") {
      throw new Error("INVOICE_PAYMENT_DIRECTION_INVALID");
    }
    if (!normalizePositiveId(invoiceRecord.contract_id, "contract_id")) {
      throw new Error("INVOICE_PAYMENT_CONTRACT_REQUIRED");
    }
  }

  const [paymentResponse, invoiceLinkResponse, paymentLinkResponse] =
    await Promise.all([
      paymentIds.length
        ? paymentModel.filter({
            where: {
              id: { $in: paymentIds },
            },
            currentPage: 1,
            pageSize: Math.min(paymentIds.length, 200),
          })
        : Promise.resolve({ tableData: [] }),
      invoiceId
        ? linkModel.filter({
            where: {
              invoice_id: { $eq: invoiceId },
            },
            currentPage: 1,
            pageSize: 500,
            orderBy: [{ id: "desc" }],
          })
        : Promise.resolve({ tableData: [] }),
      paymentIds.length
        ? linkModel.filter({
            where: {
              biz_type: { $eq: "payment" },
              biz_id: { $in: paymentIds },
            },
            currentPage: 1,
            pageSize: 1000,
          })
        : Promise.resolve({ tableData: [] }),
    ]);

  const payments = readRows(paymentResponse);
  const paymentById = new Map(
    payments.map((payment) => [Number(payment.id), payment]),
  );
  const contractId = Number(invoiceRecord.contract_id);
  for (const allocation of allocations) {
    const payment = paymentById.get(allocation.paymentId);
    if (!payment) {
      throw new Error(`INVOICE_PAYMENT_NOT_FOUND:${allocation.paymentId}`);
    }
    if (Number(payment.contract_id) !== contractId) {
      throw new Error(
        `INVOICE_PAYMENT_CONTRACT_MISMATCH:${allocation.paymentId}`,
      );
    }
    if (["cancelled", "rejected"].includes(optionalText(payment.status))) {
      throw new Error(`INVOICE_PAYMENT_STATUS_INVALID:${payment.status}`);
    }
  }

  const allInvoiceLinks = readRows(invoiceLinkResponse);
  const existingRows = allInvoiceLinks.filter(
    (row) =>
      optionalText(row.biz_type) === "payment" &&
      optionalText(row.relation_type) === "payment_coverage",
  );
  const activeExistingRows = existingRows;
  const desiredByPayment = new Map(
    allocations.map((item) => [item.paymentId, item]),
  );
  const otherInvoiceAllocation = readRows(paymentLinkResponse)
    .filter(
      (row) =>
        !(
          Number(row.invoice_id) === invoiceId &&
          optionalText(row.relation_type) === "payment_coverage"
        ),
    )
    .reduce((result, row) => {
      const paymentId = Number(row.biz_id);
      result.set(
        paymentId,
        (result.get(paymentId) || 0) + (Number(row.amount_used) || 0),
      );
      return result;
    }, new Map());

  const desiredTotal = roundMoney(
    allocations.reduce((sum, item) => sum + item.amountUsed, 0),
  );
  const allocatedToOtherBusiness = allInvoiceLinks
    .filter(
      (row) =>
        !(
          optionalText(row.biz_type) === "payment" &&
          optionalText(row.relation_type) === "payment_coverage"
        ),
    )
    .reduce((sum, row) => sum + (Number(row.amount_used) || 0), 0);
  if (
    desiredTotal +
      allocatedToOtherBusiness -
      Number(invoiceRecord.total_amount || 0) >
    0.001
  ) {
    throw new Error("INVOICE_ALLOCATION_EXCEEDS_TOTAL");
  }
  for (const allocation of allocations) {
    const payment = paymentById.get(allocation.paymentId);
    const available =
      Number(payment.amount || 0) -
      (otherInvoiceAllocation.get(allocation.paymentId) || 0);
    if (allocation.amountUsed - available > 0.001) {
      throw new Error(
        `PAYMENT_ALLOCATION_EXCEEDS_AVAILABLE:${allocation.paymentId}:${available.toFixed(2)}`,
      );
    }
  }

  if (validateOnly) return { saved: [], totalAmount: desiredTotal };

  const obsoleteLinks = activeExistingRows.filter(
    (row) => !desiredByPayment.has(Number(row.biz_id)),
  );
  if (obsoleteLinks.length) {
    if (!linkModel?.delete) {
      throw new Error(`MODEL_DELETE_MISSING:dataset_${linkCode}`);
    }
    await Promise.all(
      obsoleteLinks.map((row) => linkModel.delete({ id: row.id })),
    );
  }

  const saved = [];
  for (const allocation of allocations) {
    const candidates = existingRows.filter(
      (row) => Number(row.biz_id) === allocation.paymentId,
    );
    const existing = candidates[0];
    const payload = {
      invoice_id: invoiceId,
      biz_type: "payment",
      biz_id: allocation.paymentId,
      relation_type: "payment_coverage",
      amount_used: allocation.amountUsed,
    };
    if (existing?.id) {
      await linkModel.update({ id: existing.id, ...payload });
      saved.push({ linkId: Number(existing.id), ...allocation });
    } else {
      const createdId = readCreatedId(await linkModel.create(payload));
      saved.push({ linkId: createdId, ...allocation });
    }
  }
  const affectedPaymentIds = [
    ...new Set([
      ...paymentIds,
      ...obsoleteLinks.map((row) => Number(row.biz_id)).filter(Boolean),
    ]),
  ];
  if (affectedPaymentIds.length) {
    await context.client.bff.execute({
      scriptName: "cpoInvoiceCoverage",
      params: { paymentIds: affectedPaymentIds },
    });
  }
  return { saved, totalAmount: desiredTotal };
}

export default async function cpoSaveDraft(params, context) {
  const { bizType, values = {} } = params || {};
  if (!bizType || !values || typeof values !== "object") {
    throw new Error("INVALID_PARAMS:bizType and values are required");
  }

  const numericBizId = normalizeBizId(params.bizId ?? params.id);
  const bff = context.client.bff;
  const [datasetMap, actor] = await Promise.all([
    bff.execute({ scriptName: "cpoDatasetMap", params: {} }),
    bff.execute({ scriptName: "cpoCurrentActor", params: {} }),
  ]);
  const { BIZ_TYPE_TO_DATASET } = datasetMap;
  const meta = BIZ_TYPE_TO_DATASET[bizType];
  if (!meta) throw new Error(`INVALID_BIZ_TYPE:${bizType}`);
  if (
    params.items !== undefined &&
    !["expense", "salary_payment"].includes(bizType)
  ) {
    throw new Error(`ITEMS_UNSUPPORTED:${bizType}`);
  }
  if (params.paymentAllocations !== undefined && bizType !== "invoice") {
    throw new Error(`PAYMENT_ALLOCATIONS_UNSUPPORTED:${bizType}`);
  }

  const model = context.client.models[meta.modelKey];
  if (!model) throw new Error(`MODEL_MISSING:${meta.modelKey}`);

  let expenseItems =
    bizType === "expense" ? normalizeExpenseItems(params.items) : null;
  let salaryPaymentItems =
    bizType === "salary_payment"
      ? normalizeSalaryPaymentItems(params.items)
      : null;
  let invoiceResolution = [];
  let businessFields = pickBusinessFields(bizType, values);
  const invoicePaymentAllocations =
    bizType === "invoice"
      ? normalizeInvoicePaymentAllocations(params.paymentAllocations)
      : null;
  if (invoicePaymentAllocations?.length) {
    businessFields.invoice_purpose = "contract_payment";
  }
  const resolvedPaymentPlan =
    bizType === "payment"
      ? await resolvePaymentPlan({
          values,
          paymentId: numericBizId,
          datasetMap,
          context,
        })
      : null;
  applyPaymentPlanFields(businessFields, values, resolvedPaymentPlan);
  if (salaryPaymentItems !== null) {
    salaryPaymentItems = await resolveSalaryPaymentItems(
      salaryPaymentItems,
      datasetMap,
      context,
    );
  }
  const expenseSummary = summarizeExpenseItems(expenseItems);
  if (expenseSummary) {
    Object.assign(businessFields, expenseSummary);
  }
  const salaryPaymentSummary = summarizeSalaryPaymentItems(salaryPaymentItems);
  if (salaryPaymentSummary) {
    Object.assign(businessFields, salaryPaymentSummary);
  }
  const relationPayload = normalizeRelations(params.relations);
  const applicationAttachments =
    ["expense", "salary_payment"].includes(bizType)
      ? normalizeApplicationAttachments(params.attachments, bizType)
      : undefined;
  if (
    params.attachments !== undefined &&
    !["expense", "salary_payment"].includes(bizType)
  ) {
    throw new Error(`ATTACHMENTS_UNSUPPORTED:${bizType}`);
  }
  const applicationAttachmentType =
    bizType === "expense"
      ? "approval_material"
      : bizType === "salary_payment"
        ? "payroll_sheet"
        : "";

  if (!numericBizId) {
    if (bizType === "expense" && expenseItems !== null) {
      const resolved = await resolveExpenseInvoiceRefs({
        items: expenseItems,
        actor,
        datasetMap,
        context,
      });
      expenseItems = resolved.items;
      invoiceResolution = resolved.invoiceResolution;
    }
    const createPayload = {
      ...(CREATE_DEFAULTS[bizType] || {}),
      ...businessFields,
      applicant_user_id: actor.userId || "",
      applicant_name_snapshot: actor.userName || "",
      status: "draft",
    };
    await assertRequestedRelationsAllowed({
      bizType,
      sourceRecord: createPayload,
      relations: relationPayload,
      actor,
      datasetMap,
      context,
    });
    await syncInvoicePaymentAllocations({
      invoiceId: null,
      invoiceRecord: createPayload,
      allocations: invoicePaymentAllocations,
      datasetMap,
      context,
      validateOnly: true,
    });
    const createdId = readCreatedId(await model.create(createPayload));
    const syncedInvoicePaymentAllocations = await syncInvoicePaymentAllocations(
      {
        invoiceId: createdId,
        invoiceRecord: createPayload,
        allocations: invoicePaymentAllocations,
        datasetMap,
        context,
      },
    );
    await syncPaymentPlanLink({
      existingPayment: null,
      resolvedPlan: resolvedPaymentPlan,
      paymentId: createdId,
      datasetMap,
      context,
    });
    const syncedItems = await syncExpenseItems({
      bizId: createdId,
      items: expenseItems,
      datasetMap,
      context,
    });
    const syncedSalaryPaymentItems = await syncSalaryPaymentItems({
      bizId: createdId,
      items: salaryPaymentItems,
      datasetMap,
      context,
    });
    if (syncedItems) {
      await syncExpenseInvoiceLinks({
        ...syncedItems,
        datasetMap,
        context,
      });
    }
    await syncBusinessRelations({
      bizType,
      bizId: createdId,
      relations: relationPayload,
      actor,
      datasetMap,
      context,
    });
    const syncedAttachments = await syncApplicationAttachments({
      bizId: createdId,
      bizType,
      attachmentType: applicationAttachmentType,
      attachments: applicationAttachments,
      uploadedBy: actor.userName,
      datasetMap,
      context,
    });
    return {
      bizType,
      bizId: createdId,
      status: "draft",
      mode: "create",
      ...(expenseSummary ? { expenseSummary } : {}),
      ...(syncedItems
        ? {
            expenseItems: syncedItems.savedItems.map((item) => ({
              id: item.id,
            })),
            invoiceResolution,
          }
        : {}),
      ...(syncedSalaryPaymentItems
        ? {
            salaryItems: syncedSalaryPaymentItems.savedItems.map((item) => ({
              id: item.id,
            })),
          }
        : {}),
      ...(syncedAttachments ? { attachments: syncedAttachments } : {}),
      ...(syncedInvoicePaymentAllocations
        ? { paymentAllocations: syncedInvoicePaymentAllocations }
        : {}),
    };
  }

  const existing = await model.getOne({ id: numericBizId });
  if (!existing?.id) {
    throw new Error(`DRAFT_NOT_FOUND:${bizType}:${numericBizId}`);
  }

  const currentStatus = existing[meta.statusField || "status"];
  const isAdmin = actorIsAdmin(actor, context);
  if (!isAdmin && !EDITABLE_STATUSES.has(currentStatus)) {
    throw new Error(`DRAFT_STATUS_LOCKED:${bizType}:${currentStatus}`);
  }

  if (
    !isAdmin &&
    existing.applicant_user_id &&
    actor.userId &&
    existing.applicant_user_id !== actor.userId
  ) {
    throw new Error(`DRAFT_OWNER_MISMATCH:${bizType}:${numericBizId}`);
  }

  if (bizType === "expense" && expenseItems !== null) {
    const resolved = await resolveExpenseInvoiceRefs({
      items: expenseItems,
      actor,
      datasetMap,
      context,
    });
    expenseItems = resolved.items;
    invoiceResolution = resolved.invoiceResolution;
  }

  const updatePayload = { id: numericBizId, ...businessFields };
  if (!existing.applicant_user_id && actor.userId) {
    updatePayload.applicant_user_id = actor.userId;
    updatePayload.applicant_name_snapshot = actor.userName || "";
  }
  const sourceRecord = { ...existing, ...updatePayload };
  await assertRequestedRelationsAllowed({
    bizType,
    sourceRecord,
    relations: relationPayload,
    actor,
    datasetMap,
    context,
  });
  await syncInvoicePaymentAllocations({
    invoiceId: numericBizId,
    invoiceRecord: sourceRecord,
    allocations: invoicePaymentAllocations,
    datasetMap,
    context,
    validateOnly: true,
  });
  await model.update(updatePayload);
  const syncedInvoicePaymentAllocations = await syncInvoicePaymentAllocations({
    invoiceId: numericBizId,
    invoiceRecord: sourceRecord,
    allocations: invoicePaymentAllocations,
    datasetMap,
    context,
  });
  if (bizType === "payment") {
    await syncPaymentPlanLink({
      existingPayment: existing,
      resolvedPlan: resolvedPaymentPlan,
      paymentId: numericBizId,
      datasetMap,
      context,
    });
  }
  const syncedItems = await syncExpenseItems({
    bizId: numericBizId,
    items: expenseItems,
    datasetMap,
    context,
  });
  const syncedSalaryPaymentItems = await syncSalaryPaymentItems({
    bizId: numericBizId,
    items: salaryPaymentItems,
    datasetMap,
    context,
  });
  if (syncedItems) {
    await syncExpenseInvoiceLinks({
      ...syncedItems,
      datasetMap,
      context,
    });
  }
  await syncBusinessRelations({
    bizType,
    bizId: numericBizId,
    relations: relationPayload,
    actor,
    datasetMap,
    context,
  });
  const syncedAttachments = await syncApplicationAttachments({
    bizId: numericBizId,
    bizType,
    attachmentType: applicationAttachmentType,
    attachments: applicationAttachments,
    uploadedBy: actor.userName,
    datasetMap,
    context,
  });

  return {
    bizType,
    bizId: numericBizId,
    status: currentStatus,
    mode: "update",
    ...(expenseSummary ? { expenseSummary } : {}),
    ...(syncedItems
      ? {
          expenseItems: syncedItems.savedItems.map((item) => ({ id: item.id })),
          invoiceResolution,
        }
      : {}),
    ...(syncedSalaryPaymentItems
      ? {
          salaryItems: syncedSalaryPaymentItems.savedItems.map((item) => ({
            id: item.id,
          })),
        }
      : {}),
    ...(syncedAttachments ? { attachments: syncedAttachments } : {}),
    ...(syncedInvoicePaymentAllocations
      ? { paymentAllocations: syncedInvoicePaymentAllocations }
      : {}),
  };
}
