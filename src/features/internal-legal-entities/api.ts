import { lovrabetClient } from "@/api/client";
import { buildWhere } from "@/utils/queries";
import type { LegalAgreementPartyDraft } from "@/features/legal-agreements/types";

type UnknownRecord = Record<string, any>;

interface LovrabetModel {
  filter(params: UnknownRecord): Promise<UnknownRecord>;
}

export const INTERNAL_LEGAL_ENTITY_CODE = "c48a794368684f16b3b4d0e6c0c088ea";
export const INTERNAL_LEGAL_ENTITY_MODEL_KEY = `dataset_${INTERNAL_LEGAL_ENTITY_CODE}`;

export interface InternalLegalEntityRecord {
  id?: number | string;
  entity_code?: string;
  entity_name?: string;
  short_name?: string;
  unified_credit_code?: string;
  legal_representative?: string;
  registered_address?: string;
  business_address?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  invoice_title?: string;
  invoice_tax_no?: string;
  status?: "ACTIVE" | "INACTIVE" | string;
  is_default?: boolean | number | string;
  sort_no?: number | string;
}

export interface InternalLegalEntityOption {
  id?: number | string;
  entityCode: string;
  entityName: string;
  shortName?: string;
  unifiedCreditCode?: string;
  legalRepresentative?: string;
  registeredAddress?: string;
  businessAddress?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  invoiceTitle?: string;
  invoiceTaxNo?: string;
  status: "ACTIVE" | "INACTIVE";
  isDefault: boolean;
  sortNo: number;
}

export const FALLBACK_INTERNAL_LEGAL_ENTITY: InternalLegalEntityOption = {
  id: 1,
  entityCode: "QZYT",
  entityName: "杭州启智云图科技有限公司",
  shortName: "启智云图",
  unifiedCreditCode: "91330110MAEAG8LN2G",
  registeredAddress: "杭州市余杭区五常大道165号靖源国际3幢709室",
  businessAddress: "杭州市余杭区五常大道165号靖源国际3幢709室",
  invoiceTitle: "杭州启智云图科技有限公司",
  invoiceTaxNo: "91330110MAEAG8LN2G",
  status: "ACTIVE",
  isDefault: true,
  sortNo: 10,
};

export function normalizeInternalLegalEntity(
  record: InternalLegalEntityRecord,
): InternalLegalEntityOption {
  const entityName = optionalText(record.entity_name);
  return {
    id: record.id,
    entityCode: optionalText(record.entity_code) || String(record.id || ""),
    entityName: entityName || FALLBACK_INTERNAL_LEGAL_ENTITY.entityName,
    shortName: optionalText(record.short_name),
    unifiedCreditCode: optionalText(record.unified_credit_code),
    legalRepresentative: optionalText(record.legal_representative),
    registeredAddress: optionalText(record.registered_address),
    businessAddress: optionalText(record.business_address),
    contactName: optionalText(record.contact_name),
    contactPhone: optionalText(record.contact_phone),
    contactEmail: optionalText(record.contact_email),
    invoiceTitle: optionalText(record.invoice_title),
    invoiceTaxNo: optionalText(record.invoice_tax_no),
    status: record.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    isDefault: isTruthy(record.is_default),
    sortNo: normalizeNumber(record.sort_no) ?? 100,
  };
}

export function selectDefaultInternalLegalEntity(
  entities: InternalLegalEntityOption[],
): InternalLegalEntityOption {
  const activeEntities = entities.filter(
    (entity) => entity.status === "ACTIVE",
  );
  const candidates = activeEntities.length ? activeEntities : entities;
  return (
    candidates.find((entity) => entity.isDefault) ||
    [...candidates].sort(sortInternalLegalEntities)[0] ||
    FALLBACK_INTERNAL_LEGAL_ENTITY
  );
}

export function findInternalLegalEntityByCode(
  entities: InternalLegalEntityOption[],
  code?: string,
): InternalLegalEntityOption | undefined {
  const normalizedCode = normalizeText(code);
  if (!normalizedCode) {
    return undefined;
  }
  return entities.find((entity) => entity.entityCode === normalizedCode);
}

export function findInternalLegalEntityByName(
  entities: InternalLegalEntityOption[],
  name?: string,
): InternalLegalEntityOption | undefined {
  const normalizedName = normalizeText(name);
  if (!normalizedName) {
    return undefined;
  }
  return entities.find((entity) => entity.entityName === normalizedName);
}

export function internalLegalEntityToLegalAgreementParty(
  entity: InternalLegalEntityOption,
): LegalAgreementPartyDraft {
  return {
    partyTitle: "乙方",
    partyRole: "OUR_SIDE",
    sourceType: "INTERNAL_COMPANY",
    companyName: entity.entityName,
    uscc: entity.unifiedCreditCode || entity.invoiceTaxNo,
    legalRep: entity.legalRepresentative,
    address: entity.registeredAddress || entity.businessAddress,
    contactName: entity.contactName,
    contactPhone: entity.contactPhone,
    contactEmail: entity.contactEmail,
  };
}

export function internalLegalEntityToSelectOption(
  entity: InternalLegalEntityOption,
) {
  return {
    value: entity.entityCode,
    label: entity.entityName,
  };
}

export function internalLegalEntityToNameSelectOption(
  entity: InternalLegalEntityOption,
) {
  return {
    value: entity.entityName,
    label: entity.entityName,
  };
}

export async function listInternalLegalEntities(
  pageSize = 100,
): Promise<InternalLegalEntityOption[]> {
  const response = await getInternalLegalEntityModel().filter({
    where: buildWhere([{ status: { $eq: "ACTIVE" } }]),
    select: [
      "id",
      "entity_code",
      "entity_name",
      "short_name",
      "unified_credit_code",
      "legal_representative",
      "registered_address",
      "business_address",
      "contact_name",
      "contact_phone",
      "contact_email",
      "invoice_title",
      "invoice_tax_no",
      "status",
      "is_default",
      "sort_no",
    ],
    orderBy: [{ is_default: "desc" }, { sort_no: "asc" }, { id: "asc" }],
    currentPage: 1,
    pageSize,
  });
  const entities = readRows<InternalLegalEntityRecord>(response)
    .map(normalizeInternalLegalEntity)
    .filter((entity) => entity.entityName && entity.status === "ACTIVE")
    .sort(sortInternalLegalEntities);

  return entities.length ? entities : [FALLBACK_INTERNAL_LEGAL_ENTITY];
}

export async function getDefaultInternalLegalEntity() {
  return selectDefaultInternalLegalEntity(await listInternalLegalEntities());
}

function getInternalLegalEntityModel(): LovrabetModel {
  const models = lovrabetClient.models as Record<string, LovrabetModel>;
  const model =
    models.internalLegalEntity || models[INTERNAL_LEGAL_ENTITY_MODEL_KEY];
  if (!model) {
    throw new Error("Lovrabet 模型未注册：我方主体");
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

function sortInternalLegalEntities(
  left: InternalLegalEntityOption,
  right: InternalLegalEntityOption,
) {
  return (
    Number(right.isDefault) - Number(left.isDefault) ||
    left.sortNo - right.sortNo ||
    String(left.id || "").localeCompare(String(right.id || ""))
  );
}

function isTruthy(value: unknown) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true" ||
    value === "b'1'"
  );
}

function normalizeNumber(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function optionalText(value: unknown) {
  const text = normalizeText(value);
  return text || undefined;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}
