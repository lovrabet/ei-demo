/**
 * 创建法务协议草稿。
 *
 * [脚本描述] 写入 legal_agreement、legal_agreement_party、legal_document、legal_status_log。
 * [接口路径] POST /api/endpoint/app-4d050189/cpo_create_legal_agreement_draft
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * {
 *   "dryRun": true,
 *   "agreement": "legal_agreement 创建字段",
 *   "parties": "legal_agreement_party 创建字段数组，不含 agreement_id",
 *   "document": "legal_document 创建字段，不含 agreement_id",
 *   "statusLog": "legal_status_log 创建字段，不含 agreement_id",
 *   "snapshot": "前端生成的协议快照，可选"
 * }
 *
 * [返回数据结构]
 * {
 *   "agreementId": 1,
 *   "agreementNo": "YT-NDA-2026-11",
 *   "documentId": 2,
 *   "partyIds": [3, 4],
 *   "statusLogId": 5
 * }
 *
 * @param {Object} params - 请求参数。
 * @param {Object} context - 执行上下文。
 * @returns {Promise<Object>} 创建结果。
 */
export default async function cpo_create_legal_agreement_draft(
  params,
  context,
) {
  const request = normalizeRequest(params || {});
  assertDatasetCodesConfigured();

  if (request.dryRun) {
    const agreementNo =
      request.mode === "CREATE_DRAFT"
        ? await previewNextAgreementNo(
            context,
            request.agreement.agreement_type,
          )
        : request.agreement.agreement_no;
    const documentNo =
      request.mode === "CREATE_DRAFT"
        ? `${agreementNo}-DOC-1`
        : request.document.document_no;
    return {
      dryRun: true,
      mode: request.mode,
      agreementId: request.agreementId,
      agreementNo,
      partyCount: request.parties.length,
      documentId: request.documentId,
      documentNo,
      status: request.statusLog.to_status,
      datasets: DATASETS,
    };
  }

  if (request.mode === "UPDATE_DRAFT") {
    return updateAgreementDraft(context, request);
  }

  return createAgreementDraft(context, request);
}

async function createAgreementDraft(context, request) {
  const agreementType = requireText(
    request.agreement.agreement_type,
    "agreement.agreement_type",
  );
  const agreementPayload = removeUndefined({ ...request.agreement });
  delete agreementPayload.agreement_no;

  const { agreementId, agreementNo } = await createAgreementWithGeneratedNo(
    context,
    agreementPayload,
    agreementType,
  );
  const documentNo = `${agreementNo}-DOC-1`;
  const documentPayload = normalizeCreateDocumentPayload(
    request.document,
    agreementNo,
    documentNo,
  );
  const partyIds = await createParties(context, agreementId, request.parties);
  const documentId = await createDocument(
    context,
    agreementId,
    documentPayload,
  );
  const statusLogId = await createStatusLog(
    context,
    agreementId,
    request.statusLog,
  );

  await context.client.models[DATASETS.agreement].update({
    id: agreementId,
    current_document_id: documentId,
  });

  return {
    agreementId,
    agreementNo,
    documentNo,
    documentId,
    partyIds,
    statusLogId,
  };
}

async function updateAgreementDraft(context, request) {
  try {
    await context.client.models[DATASETS.agreement].update({
      id: request.agreementId,
      ...removeUndefined(request.agreement),
    });
  } catch (e) {
    throw annotateError(e, "STEP_1_agreement_update", {
      id: request.agreementId,
      payload: removeUndefined(request.agreement),
    });
  }
  let partyIds;
  try {
    partyIds = await upsertParties(
      context,
      request.agreementId,
      request.parties,
    );
  } catch (e) {
    throw annotateError(e, "STEP_2_parties_upsert", {
      count: request.parties.length,
      parties: request.parties,
    });
  }
  let documentId;
  try {
    documentId = await upsertDocument(
      context,
      request.agreementId,
      request.documentId,
      request.document,
    );
  } catch (e) {
    throw annotateError(e, "STEP_3_document_upsert", {
      documentId: request.documentId,
      document: request.document,
    });
  }
  let statusLogId;
  try {
    statusLogId = await createStatusLog(
      context,
      request.agreementId,
      request.statusLog,
    );
  } catch (e) {
    throw annotateError(e, "STEP_4_statusLog_create", {
      statusLog: request.statusLog,
    });
  }
  try {
    await context.client.models[DATASETS.agreement].update({
      id: request.agreementId,
      current_document_id: documentId,
    });
  } catch (e) {
    throw annotateError(e, "STEP_5_current_document_id", {
      documentId,
    });
  }

  return {
    agreementId: normalizeReturnedId(request.agreementId),
    agreementNo: request.agreement.agreement_no,
    documentId,
    partyIds,
    statusLogId,
  };
}

function annotateError(error, step, detail) {
  const base = error && error.message ? error.message : String(error);
  // Dump the full error object so we can see any field-path / errorBody.
  let errorDump = "";
  try {
    const props = {};
    if (error && typeof error === "object") {
      for (const k of Object.keys(error)) {
        props[k] = error[k];
      }
      // Common LovrabetError envelope fields
      for (const k of [
        "errorCode",
        "errorType",
        "errorMsg",
        "status",
        "detail",
        "errorBody",
        "response",
        "data",
        "body",
        "fields",
        "field",
        "paramName",
        "columnName",
        "message",
        "stack",
      ]) {
        if (error[k] !== undefined) props[k] = error[k];
      }
    }
    errorDump = JSON.stringify(props).slice(0, 1500);
  } catch {
    errorDump = String(error);
  }
  const wrapped = new Error(
    `[legal_update ${step}] ${base} | detail=${JSON.stringify(detail).slice(0, 600)} | errorDump=${errorDump}`,
  );
  if (error) {
    wrapped.cause = error;
  }
  return wrapped;
}

const DATASETS = {
  agreement: "dataset_afcc8ccb0815418397fcbb5b5682a0c2", // 数据集: 法务协议 | 数据表: legal_agreement
  party: "dataset_417122aa7cee4ea78b9acce9c970181c", // 数据集: 协议签署方 | 数据表: legal_agreement_party
  document: "dataset_defbf75aee5443768f84debff00a2aa3", // 数据集: 法务协议文档 | 数据表: legal_document
  statusLog: "dataset_a2c634ae7c9542c38f0982404dd4b34d", // 数据集: 法务状态日志 | 数据表: legal_status_log
};

const REQUIRED_AGREEMENT_FIELDS_CREATE = [
  "agreement_type",
  "agreement_title",
  "status",
];

const REQUIRED_AGREEMENT_FIELDS_UPDATE = [
  "agreement_no",
  "agreement_type",
  "agreement_title",
  "status",
];

const AGREEMENT_NO_PREFIX = "YT";

function normalizeRequest(params) {
  const mode =
    params.mode === "UPDATE_DRAFT" || params.agreementId
      ? "UPDATE_DRAFT"
      : "CREATE_DRAFT";
  const agreement = params.agreement || {};
  const parties = Array.isArray(params.parties) ? params.parties : [];
  const document = params.document || {};
  const statusLog = params.statusLog || {};
  const requiredAgreementFields =
    mode === "UPDATE_DRAFT"
      ? REQUIRED_AGREEMENT_FIELDS_UPDATE
      : REQUIRED_AGREEMENT_FIELDS_CREATE;

  for (const fieldName of requiredAgreementFields) {
    requireText(agreement[fieldName], `agreement.${fieldName}`);
  }
  if (parties.length < 2) {
    throw new Error("parties 至少需要包含甲方和乙方");
  }
  requireText(document.document_title, "document.document_title");
  if (mode === "UPDATE_DRAFT") {
    requireText(document.document_no, "document.document_no");
  }
  requireText(statusLog.to_status, "statusLog.to_status");
  requireText(statusLog.action_code, "statusLog.action_code");
  if (mode === "UPDATE_DRAFT") {
    requireId(params.agreementId, "agreementId");
  }

  return {
    mode,
    agreementId: params.agreementId,
    documentId: params.documentId,
    agreement,
    parties,
    document,
    statusLog,
    dryRun: params.dryRun === true,
  };
}

async function createAgreement(context, payload) {
  const agreementId = await context.client.models[DATASETS.agreement].create(
    removeUndefined(payload),
  );
  return requireCreatedId(agreementId, "协议主表");
}

async function createParties(context, agreementId, parties) {
  const partyIds = [];
  for (const party of parties) {
    const partyId = await context.client.models[DATASETS.party].create(
      removeUndefined(
        stripInternalFields({
          ...normalizePartyPayload(party),
          agreement_id: agreementId,
        }),
      ),
    );
    partyIds.push(requireCreatedId(partyId, "协议签署方"));
  }
  return partyIds;
}

async function upsertParties(context, agreementId, parties) {
  const partyIds = [];
  for (const party of parties) {
    const payload = removeUndefined(
      stripInternalFields({
        ...normalizePartyPayload(party),
        agreement_id: agreementId,
      }),
    );
    if (party?.id !== undefined && party?.id !== null && party?.id !== "") {
      await context.client.models[DATASETS.party].update({
        id: party.id,
        ...payload,
      });
      partyIds.push(normalizeReturnedId(party.id));
      continue;
    }

    const partyId = await context.client.models[DATASETS.party].create(payload);
    partyIds.push(requireCreatedId(partyId, "协议签署方"));
  }
  return partyIds;
}

async function createDocument(context, agreementId, document) {
  const documentId = await context.client.models[DATASETS.document].create(
    removeUndefined(
      stripInternalFields({
        ...document,
        agreement_id: agreementId,
      }),
    ),
  );
  return requireCreatedId(documentId, "协议文档");
}

async function upsertDocument(context, agreementId, documentId, document) {
  const payload = removeUndefined(
    stripInternalFields({
      ...document,
      agreement_id: agreementId,
    }),
  );
  if (documentId !== undefined && documentId !== null && documentId !== "") {
    await context.client.models[DATASETS.document].update({
      id: documentId,
      ...payload,
    });
    return normalizeReturnedId(documentId);
  }
  return createDocument(context, agreementId, document);
}

async function createStatusLog(context, agreementId, statusLog) {
  const statusLogId = await context.client.models[DATASETS.statusLog].create(
    removeUndefined({
      ...statusLog,
      agreement_id: agreementId,
    }),
  );
  return requireCreatedId(statusLogId, "状态日志");
}

function normalizePartyPayload(party) {
  return {
    ...party,
    is_primary_counterparty: normalizeBitSelectValue(
      party?.is_primary_counterparty,
    ),
  };
}

// BIT columns must be written as numeric 1/0. The SELECT option value "b'1'"
// is accepted by .create() but rejected by .update() (PARAM_TYPE_INVALID /
// SQL error 531), so we normalize every truthy/option form to 1, else 0.
function normalizeBitSelectValue(value) {
  if (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true" ||
    value === "b'1'"
  ) {
    return 1;
  }
  return 0;
}

function removeUndefined(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(
      ([, fieldValue]) => fieldValue !== undefined,
    ),
  );
}

function stripInternalFields(value) {
  const { id: _id, ...rest } = value || {};
  return rest;
}

function requireText(value, fieldName) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${fieldName} 不能为空`);
  }
  return text;
}

function requireId(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${fieldName} 不能为空`);
  }
  return value;
}

function requireCreatedId(value, label) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${label}创建后未返回有效 ID`);
  }
  return normalizeReturnedId(value);
}

function normalizeReturnedId(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : value;
}

function buildAgreementNo(type, sequence, year = new Date().getFullYear()) {
  return `${AGREEMENT_NO_PREFIX}-${type}-${year}-${sequence}`;
}

function parseAgreementNoSequence(agreementNo, type, year) {
  const prefix = `${AGREEMENT_NO_PREFIX}-${type}-${year}-`;
  if (!String(agreementNo || "").startsWith(prefix)) {
    return undefined;
  }
  const tail = String(agreementNo).slice(prefix.length);
  if (!/^\d{1,4}$/.test(tail)) {
    return undefined;
  }
  const sequence = Number(tail);
  return Number.isInteger(sequence) && sequence > 0 ? sequence : undefined;
}

function nextAgreementSequence(
  agreementNos,
  type,
  year = new Date().getFullYear(),
) {
  let maxSequence = 0;
  for (const agreementNo of agreementNos) {
    const sequence = parseAgreementNoSequence(agreementNo, type, year);
    if (sequence !== undefined && sequence > maxSequence) {
      maxSequence = sequence;
    }
  }
  return maxSequence + 1;
}

function readTableData(response) {
  if (Array.isArray(response?.tableData)) {
    return response.tableData;
  }
  if (Array.isArray(response)) {
    return response;
  }
  return [];
}

async function listAgreementNosByType(context, agreementType, year) {
  const prefix = `${AGREEMENT_NO_PREFIX}-${agreementType}-${year}-`;
  const response = await context.client.models[DATASETS.agreement].filter({
    where: {
      agreement_type: { $eq: agreementType },
      agreement_no: { $startWith: prefix },
    },
    select: ["agreement_no"],
    currentPage: 1,
    pageSize: 500,
    orderBy: [{ agreement_no: "desc" }],
  });
  return readTableData(response)
    .map((row) => row?.agreement_no)
    .filter(Boolean);
}

async function previewNextAgreementNo(context, agreementType) {
  const year = new Date().getFullYear();
  const agreementNos = await listAgreementNosByType(
    context,
    agreementType,
    year,
  );
  const sequence = nextAgreementSequence(agreementNos, agreementType, year);
  return buildAgreementNo(agreementType, sequence, year);
}

async function allocateNextAgreementNo(
  context,
  agreementType,
  retryOffset = 0,
) {
  const year = new Date().getFullYear();
  const agreementNos = await listAgreementNosByType(
    context,
    agreementType,
    year,
  );
  const sequence =
    nextAgreementSequence(agreementNos, agreementType, year) + retryOffset;
  return buildAgreementNo(agreementType, sequence, year);
}

async function createAgreementWithGeneratedNo(
  context,
  agreementPayload,
  agreementType,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const agreementNo = await allocateNextAgreementNo(
      context,
      agreementType,
      attempt,
    );
    try {
      const agreementId = await createAgreement(context, {
        ...agreementPayload,
        agreement_no: agreementNo,
      });
      return { agreementId, agreementNo };
    } catch (error) {
      if (attempt < 2 && isDuplicateAgreementNoError(error)) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("协议编号生成失败，请重试");
}

function normalizeCreateDocumentPayload(document, agreementNo, documentNo) {
  const payload = removeUndefined(
    stripInternalFields({
      ...document,
      document_no: documentNo,
    }),
  );

  if (payload.snapshot_json) {
    try {
      const snapshot = JSON.parse(payload.snapshot_json);
      if (snapshot && typeof snapshot === "object") {
        snapshot.header = snapshot.header || {};
        snapshot.header.agreementNo = agreementNo;
        payload.snapshot_json = JSON.stringify(snapshot);
      }
    } catch {
      // Keep original snapshot_json when it is not valid JSON.
    }
  }

  if (payload.rendered_content) {
    payload.rendered_content = patchAgreementNoInHtml(
      payload.rendered_content,
      agreementNo,
    );
  }

  return payload;
}

function patchAgreementNoInHtml(html, agreementNo) {
  const content = String(html || "");
  if (!content) {
    return content;
  }
  if (/(<div>协议编号：)[^<]*(<\/div>)/.test(content)) {
    return content.replace(
      /(<div>协议编号：)[^<]*(<\/div>)/,
      `$1${escapeHtml(agreementNo)}$2`,
    );
  }
  return content;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isDuplicateAgreementNoError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("duplicate") ||
    message.includes("unique") ||
    message.includes("1062") ||
    message.includes("已存在")
  );
}

function assertDatasetCodesConfigured() {
  const placeholders = Object.entries(DATASETS)
    .filter(([, value]) => String(value).startsWith("__"))
    .map(([key]) => key);
  if (placeholders.length > 0) {
    throw new Error(
      `cpo_create_legal_agreement_draft 尚未配置 Dataset code: ${placeholders.join(", ")}`,
    );
  }
}
