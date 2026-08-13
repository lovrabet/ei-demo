import { lovrabetClient } from "@/api/client";
import { CURRENT_APP_MODEL_KEYS } from "@/api/model-keys";
import {
  FALLBACK_INTERNAL_LEGAL_ENTITY,
  internalLegalEntityToLegalAgreementParty,
  type InternalLegalEntityOption,
} from "@/features/internal-legal-entities/api";
import { buildWhere } from "@/utils/queries";
import {
  buildLegalAgreementSnapshot,
  renderLegalAgreementHtml,
} from "./document";
import { normalizeLegalAgreementParties } from "./party";
import type {
  LegalAgreementCreateRequest,
  LegalAgreementDetail,
  LegalAgreementDraft,
  LegalAgreementPartyRecord,
  LegalAgreementRecord,
  LegalAgreementUpdateRequest,
  LegalCrmCompanyRecord,
  LegalCrmContactRecord,
  LegalCustomerOption,
  LegalDocumentRecord,
  LegalStatusLogRecord,
} from "./types";

type UnknownRecord = Record<string, any>;

interface LovrabetModel {
  filter(params: UnknownRecord): Promise<UnknownRecord>;
  create(params: UnknownRecord): Promise<UnknownRecord>;
  update(
    id: string | number | (string | number)[],
    data: UnknownRecord,
  ): Promise<UnknownRecord>;
  delete(id: string | number | (string | number)[]): Promise<void>;
}

const CRM_CUSTOMER_OPTION_PAGE_SIZE = 30;

export function buildDefaultLegalAgreementDraft(
  ourEntity: InternalLegalEntityOption = FALLBACK_INTERNAL_LEGAL_ENTITY,
): LegalAgreementDraft {
  return {
    agreementType: "NDA",
    agreementTitle: "商务合作保密协议",
    projectName: "",
    cooperationMatter: "商务洽谈、项目评估、产品试用、技术对接或合同履行",
    agreementDate: todayString(),
    confidentialityYears: 5,
    returnDestroyDays: 10,
    breachPenaltyType: "ACTUAL_LOSS",
    disputeResolutionType: "LITIGATION",
    disputeResolutionOrg: "乙方住所地有管辖权的人民法院",
    parties: [
      {
        partyTitle: "甲方",
        partyRole: "COUNTERPARTY",
        sourceType: "MANUAL",
        companyName: "",
      },
      internalLegalEntityToLegalAgreementParty(ourEntity),
    ],
  };
}

export function customerOptionToCounterparty(
  customer: LegalCustomerOption,
): LegalAgreementDraft["parties"][number] {
  return {
    partyTitle: "甲方",
    partyRole: "COUNTERPARTY",
    sourceType: "CRM_COMPANY",
    crmCompanyId: customer.sourceId,
    crmContactId: customer.contactId,
    companyName: customer.customerName,
    uscc: customer.taxNo,
    legalRep: customer.legalRep,
    address: customer.companyAddress,
    contactName: customer.contactName,
    contactPhone: customer.contactPhone,
    contactEmail: customer.contactEmail,
  };
}

export function normalizeLegalCustomerOptions(
  companies: LegalCrmCompanyRecord[],
  contacts: LegalCrmContactRecord[] = [],
): LegalCustomerOption[] {
  const seen = new Set<string>();
  const primaryContactMap = buildPrimaryContactMap(contacts);
  const options: LegalCustomerOption[] = [];

  for (const company of companies) {
    const customerName = normalizeText(company.name);
    const dedupeKey = customerName.toLocaleLowerCase();
    if (!customerName || seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    const contact = primaryContactMap.get(recordIdKey(company.id));
    options.push({
      source: "CRM_COMPANY",
      sourceId: company.id,
      customerName,
      taxNo: optionalText(company.uscc),
      legalRep: optionalText(company.legal_rep),
      companyAddress: optionalText(company.reg_address),
      contactId: contact?.id,
      contactName: optionalText(contact?.name),
      contactPhone: optionalText(contact?.phone),
      contactEmail: optionalText(contact?.email),
    });
  }

  return options;
}

export function buildLegalAgreementCreateRequest(
  draft: LegalAgreementDraft,
): LegalAgreementCreateRequest {
  validateLegalAgreementDraft(draft);
  const generatedAt = new Date().toISOString();
  return {
    mode: "CREATE_DRAFT",
    ...buildLegalAgreementRequestPayload({
      draft,
      agreementRevision: 1,
      documentRevision: 1,
      generatedAt,
      statusLog: {
        from_status: undefined,
        to_status: "DRAFT",
        action_code: "CREATE",
        action_name: "创建草稿",
        action_note: draft.internalNote,
        payload_json: JSON.stringify({ source: "CREATE_DRAFT" }),
      },
    }),
  };
}

export function buildLegalAgreementUpdateRequest(
  detail: LegalAgreementDetail,
  draft: LegalAgreementDraft,
): LegalAgreementUpdateRequest {
  validateLegalAgreementDraft(draft);
  if (detail.agreement.status !== "DRAFT") {
    throw new Error("只有草稿协议可以修改");
  }

  const generatedAt = new Date().toISOString();
  const currentDocument = getCurrentDocument(detail.documents);
  const agreementNo = detail.agreement.agreement_no;
  const normalizedParties = normalizeLegalAgreementParties(draft.parties);
  // Assign existing party rows to draft slots by position (party_order), NOT by
  // role. legal_agreement_party has a UNIQUE (agreement_id, party_order) index;
  // matching by role can map the COUNTERPARTY/OUR_SIDE draft onto rows whose
  // stored order is reversed, and the BFF's per-row UPDATE then swaps
  // party_order between two rows, transiently violating that unique index
  // (SQL error 531). Position matching keeps each row's party_order stable and
  // simply overwrites its snapshot contents.
  const existingPartyIdsByOrder = [...detail.parties]
    .sort(
      (left, right) =>
        (left.party_order || 0) - (right.party_order || 0) ||
        Number(left.id || 0) - Number(right.id || 0),
    )
    .map((party) => party.id);
  const partyIds = normalizedParties.map((_party, index) =>
    normalizePositiveIntegerId(existingPartyIdsByOrder[index]),
  );
  const request = buildLegalAgreementRequestPayload({
    draft: {
      ...draft,
      parties: normalizedParties,
    },
    agreementNo,
    agreementRevision:
      normalizeOptionalNumber(detail.agreement.revision_no) || 1,
    documentNo: currentDocument?.document_no || `${agreementNo}-DOC-1`,
    documentRevision:
      normalizeOptionalNumber(currentDocument?.document_revision) || 1,
    generatedAt,
    partyIds,
    statusLog: {
      from_status: "DRAFT",
      to_status: "DRAFT",
      action_code: "UPDATE",
      action_name: "更新草稿",
      action_note: draft.internalNote,
      payload_json: JSON.stringify({ agreementNo }),
    },
  });

  return {
    mode: "UPDATE_DRAFT",
    agreementId: normalizePositiveIntegerId(detail.agreement.id),
    documentId: normalizePositiveIntegerId(currentDocument?.id),
    ...request,
  };
}

export function detailToLegalAgreementDraft(
  detail: LegalAgreementDetail,
): LegalAgreementDraft {
  const sortedParties = [...detail.parties].sort(
    (left, right) =>
      (left.party_order || 0) - (right.party_order || 0) ||
      Number(left.id || 0) - Number(right.id || 0),
  );
  const parties = sortedParties.map((party) => ({
    partyTitle: party.party_title,
    partyRole: party.party_role,
    sourceType: party.source_type,
    crmCompanyId: normalizePositiveIntegerId(party.crm_company_id),
    crmContactId: normalizePositiveIntegerId(party.crm_contact_id),
    companyName: party.company_name_snapshot,
    uscc: party.uscc_snapshot,
    legalRep: party.legal_rep_snapshot,
    address: party.address_snapshot,
    contactName: party.contact_name_snapshot,
    contactPhone: party.contact_phone_snapshot,
    contactEmail: party.contact_email_snapshot,
    authorizedRepresentative: party.authorized_representative,
    representativeTitle: party.representative_title,
  }));
  const defaultDraft = buildDefaultLegalAgreementDraft();
  const agreement = detail.agreement;

  return {
    agreementType: agreement.agreement_type || defaultDraft.agreementType,
    agreementTitle: agreement.agreement_title || defaultDraft.agreementTitle,
    projectName: optionalText(agreement.project_name),
    cooperationMatter: optionalText(agreement.cooperation_matter),
    agreementDate: normalizeDateOnly(agreement.agreement_date),
    signedDate: normalizeDateOnly(agreement.signed_date),
    effectiveDate: normalizeDateOnly(agreement.effective_date),
    confidentialityYears:
      normalizeOptionalNumber(agreement.confidentiality_years) ||
      defaultDraft.confidentialityYears,
    returnDestroyDays:
      normalizeOptionalNumber(agreement.return_destroy_days) ||
      defaultDraft.returnDestroyDays,
    breachPenaltyType:
      agreement.breach_penalty_type || defaultDraft.breachPenaltyType,
    breachPenaltyAmount: normalizeOptionalNumber(
      agreement.breach_penalty_amount,
    ),
    breachPenaltyPercent: normalizeOptionalNumber(
      agreement.breach_penalty_percent,
    ),
    disputeResolutionType:
      agreement.dispute_resolution_type || defaultDraft.disputeResolutionType,
    disputeResolutionOrg: optionalText(agreement.dispute_resolution_org),
    disputeResolutionPlace: optionalText(agreement.dispute_resolution_place),
    signingPlace: optionalText(agreement.signing_place),
    externalNote: optionalText(agreement.external_note),
    internalNote: optionalText(agreement.internal_note),
    parties: parties.length >= 2 ? parties : defaultDraft.parties,
  };
}

interface BuildLegalAgreementRequestPayloadOptions {
  draft: LegalAgreementDraft;
  agreementNo?: string;
  agreementRevision: number;
  documentNo?: string;
  documentRevision: number;
  generatedAt: string;
  partyIds?: Array<number | string | undefined>;
  statusLog: Record<string, unknown>;
}

function buildLegalAgreementRequestPayload({
  draft,
  agreementNo,
  agreementRevision,
  documentNo,
  documentRevision,
  generatedAt,
  partyIds = [],
  statusLog,
}: BuildLegalAgreementRequestPayloadOptions): Omit<
  LegalAgreementCreateRequest,
  "mode"
> {
  const parties = normalizeLegalAgreementParties(draft.parties);
  const normalizedDraft = {
    ...draft,
    parties,
  };
  const snapshot = buildLegalAgreementSnapshot({
    agreementNo: agreementNo || "",
    generatedAt,
    draft: normalizedDraft,
  });
  const html = renderLegalAgreementHtml(snapshot);
  const primaryCounterparty = parties.find(
    (party) => party.partyRole === "COUNTERPARTY",
  );
  const primaryCounterpartyIndex = parties.findIndex(
    (party) => party.partyRole === "COUNTERPARTY",
  );

  return {
    agreement: {
      ...(agreementNo ? { agreement_no: agreementNo } : {}),
      revision_no: agreementRevision,
      agreement_type: draft.agreementType,
      agreement_title: draft.agreementTitle,
      status: "DRAFT",
      project_name: optionalText(draft.projectName),
      cooperation_matter: optionalText(draft.cooperationMatter),
      primary_crm_company_id: normalizePositiveIntegerId(
        primaryCounterparty?.crmCompanyId,
      ),
      primary_crm_contact_id: normalizePositiveIntegerId(
        primaryCounterparty?.crmContactId,
      ),
      primary_party_name_snapshot: primaryCounterparty?.companyName,
      agreement_date: toLovrabetDateTime(draft.agreementDate),
      signed_date: toLovrabetDateTime(draft.signedDate),
      effective_date: toLovrabetDateTime(draft.effectiveDate),
      confidentiality_period_type: "FIXED_YEARS",
      confidentiality_years: draft.confidentialityYears || 5,
      return_destroy_days: draft.returnDestroyDays || 10,
      breach_penalty_type: draft.breachPenaltyType,
      breach_penalty_amount: draft.breachPenaltyAmount,
      breach_penalty_percent: draft.breachPenaltyPercent,
      dispute_resolution_type: draft.disputeResolutionType,
      dispute_resolution_org: draft.disputeResolutionOrg,
      dispute_resolution_place: draft.disputeResolutionPlace,
      governing_law: "中华人民共和国法律",
      signing_place: draft.signingPlace,
      external_note: draft.externalNote,
      internal_note: draft.internalNote,
    },
    parties: parties.map((party, index) => ({
      id: partyIds[index],
      party_order: index + 1,
      party_title: party.partyTitle,
      party_role: party.partyRole,
      source_type: party.sourceType,
      crm_company_id: normalizePositiveIntegerId(party.crmCompanyId),
      crm_contact_id: normalizePositiveIntegerId(party.crmContactId),
      company_name_snapshot: party.companyName,
      uscc_snapshot: party.uscc,
      legal_rep_snapshot: party.legalRep,
      address_snapshot: party.address,
      contact_name_snapshot: party.contactName,
      contact_phone_snapshot: party.contactPhone,
      contact_email_snapshot: party.contactEmail,
      authorized_representative: party.authorizedRepresentative,
      representative_title: party.representativeTitle,
      is_primary_counterparty:
        party.partyRole === "COUNTERPARTY" && index === primaryCounterpartyIndex
          ? "b'1'"
          : "b'0'",
    })),
    document: {
      ...(documentNo ? { document_no: documentNo } : {}),
      document_title:
        `${draft.agreementTitle} ${primaryCounterparty?.companyName || ""}`.trim(),
      document_revision: documentRevision,
      file_format: "HTML",
      snapshot_json: JSON.stringify(snapshot),
      rendered_content: html,
      generated_at: formatMysqlDateTime(generatedAt),
    },
    statusLog,
    snapshot,
  };
}

export async function listLegalCustomerOptions(
  keyword?: string,
): Promise<LegalCustomerOption[]> {
  const companyResponse = await getModel(
    CURRENT_APP_MODEL_KEYS.customerCompany,
  ).filter({
    where: buildCrmCustomerSearchWhere(keyword),
    select: ["id", "name", "uscc", "legal_rep", "reg_address", "updated_at"],
    orderBy: [{ updated_at: "desc" }, { id: "desc" }],
    currentPage: 1,
    pageSize: CRM_CUSTOMER_OPTION_PAGE_SIZE,
  });
  const companies = readRows<LegalCrmCompanyRecord>(companyResponse);
  const companyIds = companies.map((company) => recordIdKey(company.id));
  if (!companyIds.length) {
    return [];
  }

  const contactResponse = await getModel(
    CURRENT_APP_MODEL_KEYS.customerContact,
  ).filter({
    where: buildWhere([{ company_id: { $in: companyIds } }]),
    select: ["id", "company_id", "name", "phone", "email", "is_primary"],
    orderBy: [{ is_primary: "desc" }, { updated_at: "desc" }, { id: "desc" }],
    currentPage: 1,
    pageSize: CRM_CUSTOMER_OPTION_PAGE_SIZE * 3,
  });

  return normalizeLegalCustomerOptions(
    companies,
    readRows<LegalCrmContactRecord>(contactResponse),
  );
}

export async function listLegalAgreementRecords(
  pageSize = 100,
): Promise<LegalAgreementRecord[]> {
  const response = await getModel("legalAgreement").filter({
    select: [
      "id",
      "agreement_no",
      "revision_no",
      "agreement_type",
      "agreement_title",
      "status",
      "project_name",
      "cooperation_matter",
      "primary_crm_company_id",
      "primary_party_name_snapshot",
      "agreement_date",
      "signed_date",
      "effective_date",
      "created_at",
      "updated_at",
    ],
    currentPage: 1,
    pageSize,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
  });
  return readRows<LegalAgreementRecord>(response);
}

export async function getLegalAgreementDetail(
  agreementId: number | string,
): Promise<LegalAgreementDetail> {
  const detailWhere = buildWhere([{ id: { $eq: agreementId } }]);
  const relatedWhere = buildWhere([{ agreement_id: { $eq: agreementId } }]);
  const [
    agreementResponse,
    partiesResponse,
    documentsResponse,
    statusLogsResponse,
  ] = await Promise.all([
    getModel("legalAgreement").filter({
      where: detailWhere,
      select: [
        "id",
        "agreement_no",
        "revision_no",
        "agreement_type",
        "agreement_title",
        "status",
        "project_name",
        "cooperation_matter",
        "primary_crm_company_id",
        "primary_crm_contact_id",
        "primary_party_name_snapshot",
        "agreement_date",
        "signed_date",
        "effective_date",
        "confidentiality_years",
        "return_destroy_days",
        "breach_penalty_type",
        "breach_penalty_amount",
        "breach_penalty_percent",
        "dispute_resolution_type",
        "dispute_resolution_org",
        "dispute_resolution_place",
        "governing_law",
        "signing_place",
        "external_note",
        "internal_note",
        "created_at",
        "updated_at",
      ],
      currentPage: 1,
      pageSize: 1,
    }),
    getModel("legalAgreementParty").filter({
      where: relatedWhere,
      select: [
        "id",
        "agreement_id",
        "party_order",
        "party_title",
        "party_role",
        "source_type",
        "crm_company_id",
        "crm_contact_id",
        "company_name_snapshot",
        "uscc_snapshot",
        "legal_rep_snapshot",
        "address_snapshot",
        "contact_name_snapshot",
        "contact_phone_snapshot",
        "contact_email_snapshot",
        "authorized_representative",
        "representative_title",
        "is_primary_counterparty",
        "remark",
      ],
      orderBy: [{ party_order: "asc" }, { id: "asc" }],
      currentPage: 1,
      pageSize: 20,
    }),
    getModel("legalDocument").filter({
      where: relatedWhere,
      select: [
        "id",
        "agreement_id",
        "template_id",
        "document_no",
        "document_title",
        "document_revision",
        "file_format",
        "file_url",
        "file_token",
        "snapshot_json",
        "rendered_content",
        "generated_by",
        "generated_at",
        "created_at",
      ],
      orderBy: [{ document_revision: "desc" }, { id: "desc" }],
      currentPage: 1,
      pageSize: 20,
    }),
    getModel("legalStatusLog").filter({
      where: relatedWhere,
      select: [
        "id",
        "agreement_id",
        "from_status",
        "to_status",
        "action_code",
        "action_name",
        "operator_user_id",
        "operator_name",
        "action_note",
        "created_at",
      ],
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      currentPage: 1,
      pageSize: 50,
    }),
  ]);
  const agreement = readRows<LegalAgreementRecord>(agreementResponse)[0];
  if (!agreement) {
    throw new Error(`未找到法务协议：${agreementId}`);
  }

  return {
    agreement,
    parties: readRows<LegalAgreementPartyRecord>(partiesResponse),
    documents: readRows<LegalDocumentRecord>(documentsResponse),
    statusLogs: readRows<LegalStatusLogRecord>(statusLogsResponse),
  };
}

export async function saveLegalAgreementDraft(
  draft: LegalAgreementDraft,
  detail?: LegalAgreementDetail,
) {
  const request = detail
    ? buildLegalAgreementUpdateRequest(detail, draft)
    : buildLegalAgreementCreateRequest(draft);
  let serialized: string;
  try {
    serialized = JSON.stringify(request);
  } catch {
    serialized = `<unserializable: ${Object.prototype.toString.call(request)}>`;
  }
  if (typeof window !== "undefined") {
    (window as any).__lastLegalSaveRequest = request;
  }
  if (typeof console !== "undefined") {
    console.log(
      `[legal-agreements] saveLegalAgreementDraft mode=${request.mode} payload=${serialized}`,
    );
  }
  const client = lovrabetClient as any;
  try {
    return await client.bff.execute({
      scriptName: "cpo_create_legal_agreement_draft",
      params: request,
    });
  } catch (error: any) {
    if (typeof console !== "undefined") {
      console.error(
        `[legal-agreements] saveLegalAgreementDraft FAILED`,
        error,
        {
          status: error?.status,
          code: error?.code ?? error?.error,
          errorMsg: error?.errorMsg,
          body: error?.errorBody ?? error?.body ?? error?.response ?? null,
        },
      );
    }
    throw error;
  }
}

export function buildCrmCustomerSearchWhere(keyword?: string) {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) {
    return undefined;
  }

  return buildWhere([
    {
      $or: [
        { name: { $contain: normalizedKeyword } },
        { uscc: { $contain: normalizedKeyword } },
      ],
    },
  ]);
}

export function validateLegalAgreementDraft(draft: LegalAgreementDraft) {
  if (!normalizeText(draft.agreementTitle)) {
    throw new Error("请填写协议标题");
  }
  const counterparty = draft.parties.find(
    (party) => party.partyRole === "COUNTERPARTY",
  );
  if (!counterparty || !normalizeText(counterparty.companyName)) {
    throw new Error("请选择或填写合作方");
  }
}

function getModel(modelKey: string): LovrabetModel {
  const models = lovrabetClient.models as Record<string, LovrabetModel>;
  const model = models[modelKey];
  if (!model) {
    throw new Error(`Lovrabet 模型未注册：${modelKey}`);
  }
  return model;
}

function readRows<T = UnknownRecord>(response: UnknownRecord): T[] {
  const rows =
    response.tableData ||
    response.data?.tableData ||
    response.result?.tableData ||
    response.data?.result?.tableData ||
    [];
  return Array.isArray(rows) ? (rows as T[]) : [];
}

function getCurrentDocument(documents: LegalDocumentRecord[]) {
  return [...documents].sort(
    (left, right) =>
      (right.document_revision || 0) - (left.document_revision || 0) ||
      Number(right.id || 0) - Number(left.id || 0),
  )[0];
}

function buildPrimaryContactMap(contacts: LegalCrmContactRecord[]) {
  const map = new Map<string, LegalCrmContactRecord>();

  for (const contact of contacts) {
    const companyId = recordIdKey(contact.company_id);
    if (!companyId) {
      continue;
    }
    const existing = map.get(companyId);
    if (!existing || isPrimaryContact(contact)) {
      map.set(companyId, contact);
    }
  }

  return map;
}

function isPrimaryContact(contact: LegalCrmContactRecord) {
  return (
    contact.is_primary === true ||
    contact.is_primary === 1 ||
    contact.is_primary === "1" ||
    contact.is_primary === "true"
  );
}

function recordIdKey(value: unknown) {
  return String(value ?? "").trim();
}

function optionalText(value: unknown) {
  const text = normalizeText(value);
  return text || undefined;
}

function normalizeOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function normalizePositiveIntegerId(value: unknown) {
  const next = normalizeOptionalNumber(value);
  if (next === undefined || !Number.isInteger(next) || next <= 0) {
    return undefined;
  }
  return next;
}

// Normalizes any date-like string ("YYYY-MM-DD" or "YYYY-MM-DD HH:mm:ss" or
// ISO) to a bare "YYYY-MM-DD" for form echo-back. Returns undefined for junk.
function normalizeDateOnly(value: unknown) {
  const text = normalizeText(value);
  if (!text) {
    return undefined;
  }
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return undefined;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

// Converts a bare date to the DATETIME string Lovrabet expects. The dataset
// declares agreement_date/signed_date/effective_date as type=DATETIME (the
// physical column is DATE), so a bare "YYYY-MM-DD" is rejected with
// PARAM_TYPE_INVALID on .update(); it must be "YYYY-MM-DD HH:mm:ss".
function toLovrabetDateTime(value: unknown) {
  const dateOnly = normalizeDateOnly(value);
  return dateOnly ? `${dateOnly} 00:00:00` : undefined;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function formatMysqlDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("无效的日期时间");
  }
  const pad = (next: number) => String(next).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    " ",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
    ":",
    pad(date.getSeconds()),
  ].join("");
}
