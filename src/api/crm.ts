/**
 * 当前项目内的客户与销售数据访问层
 *
 * [说明] 客户主数据已经通过数据库连接分析为当前项目数据集。
 * 前端统一使用当前项目客户端读取。
 */
import { lovrabetClient } from "@/api/client";
import { CURRENT_APP_MODEL_KEYS } from "@/api/model-keys";
import { buildWhere } from "@/utils/queries";

export const CRM_CUSTOMER_MODEL_KEY = CURRENT_APP_MODEL_KEYS.customerCompany;

export type CrmCustomer = {
  id: string;
  name: string;
  uscc?: string;
  legal_rep?: string;
  reg_capital?: number | null;
  industry?: string;
  business_scope?: string;
  reg_address?: string;
  status_code?: string;
  created_at?: number;
  updated_at?: number;
};

/**
 * 拉取活跃客户（按 name 模糊搜索，pageSize 限制）
 */
export async function listCrmCustomers(
  opts: { keyword?: string; pageSize?: number } = {},
) {
  const where: any = {};
  if (opts.keyword && opts.keyword.trim()) {
    where.name = { $contain: opts.keyword.trim() };
  }
  const resp = await lovrabetClient.models[CRM_CUSTOMER_MODEL_KEY].filter({
    where,
    currentPage: 1,
    pageSize: opts.pageSize ?? 200,
  });
  return (resp?.tableData || []) as CrmCustomer[];
}

/**
 * 按 id 读单条
 */
export async function getCrmCustomer(
  id: number | string,
): Promise<CrmCustomer | null> {
  const rec = await lovrabetClient.models[CRM_CUSTOMER_MODEL_KEY].getOne({
    id: Number(id),
  });
  return (rec?.id ? rec : null) as CrmCustomer | null;
}

/**
 * 拉取本地供应商池（partner_type in [supplier, service_provider, individual]，且 status=active）
 *
 * 用于非销售合同的"对方主体"下拉（采购/服务/租赁/人力/认证/其他）。
 * 客户与供应商属于不同主数据域，供应商继续使用商业伙伴数据集。
 */
export type LocalPartner = {
  id: number;
  name: string;
  partner_type: "supplier" | "customer" | "service_provider" | "individual";
  unified_credit_code?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  bank_name?: string;
  bank_account?: string;
  supplier_category?: string;
  payment_purpose?: string;
  external_source?: string;
  external_record_id?: string;
  remark?: string;
  status: string;
};

export type CreateLocalPartnerInput = Pick<LocalPartner, "name"> & {
  partner_type: Exclude<LocalPartner["partner_type"], "customer">;
  status?: "active" | "disabled";
  unified_credit_code?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  bank_name?: string;
  bank_account?: string;
  supplier_category?: string;
  payment_purpose?: string;
  external_source?: string;
  external_record_id?: string;
  remark?: string;
};

export async function listLocalSuppliers(
  opts: { keyword?: string; pageSize?: number } = {},
) {
  const partnerModel = lovrabetClient.models[LOCAL_PARTNER_MODEL_KEY];
  const keyword = opts.keyword?.trim();
  const pageSize = opts.pageSize ?? 200;
  const baseConditions = [
    { partner_type: { $in: ["supplier", "service_provider", "individual"] } },
    { status: { $eq: "active" } },
  ];

  if (!keyword) {
    const resp = await partnerModel.filter({
      where: buildWhere(baseConditions),
      currentPage: 1,
      pageSize,
    });
    return (resp.tableData || []) as LocalPartner[];
  }

  const resp = await partnerModel.filter({
    where: buildWhere([
      ...baseConditions,
      {
        $or: [
          { name: { $contain: keyword } },
          { unified_credit_code: { $contain: keyword } },
        ],
      },
    ]),
    currentPage: 1,
    pageSize,
  });
  return (resp.tableData || []) as LocalPartner[];
}

export async function getLocalPartner(
  id: number | string,
): Promise<LocalPartner | null> {
  const partnerModel = lovrabetClient.models[LOCAL_PARTNER_MODEL_KEY];
  const record = await partnerModel.getOne({ id: Number(id) });
  return (record?.id ? record : null) as LocalPartner | null;
}

export async function createLocalPartner(
  input: CreateLocalPartnerInput,
): Promise<LocalPartner> {
  const partnerModel = lovrabetClient.models[LOCAL_PARTNER_MODEL_KEY];
  const payload = {
    name: input.name.trim(),
    partner_type: input.partner_type,
    status: input.status || "active",
  };
  [
    "unified_credit_code",
    "contact_name",
    "contact_phone",
    "contact_email",
    "address",
    "bank_name",
    "bank_account",
    "supplier_category",
    "payment_purpose",
    "external_source",
    "external_record_id",
    "remark",
  ].forEach((field) => {
    const value = input[field as keyof CreateLocalPartnerInput];
    if (typeof value === "string" && value.trim()) {
      (payload as Record<string, unknown>)[field] = value.trim();
    }
  });
  const created = await partnerModel.create(payload);
  const createdId = Number(
    created?.id ??
      created?.result?.id ??
      created?.data?.id ??
      created?.data?.result?.id ??
      created,
  );
  if (!Number.isFinite(createdId) || createdId <= 0) {
    throw new Error("供应商已创建，但未返回有效记录，请刷新后重试");
  }
  return { id: createdId, ...payload } as LocalPartner;
}

const LOCAL_PARTNER_CODE = "68c70907e27c481cbefb96dd3906936e";
const LOCAL_PARTNER_MODEL_KEY = `dataset_${LOCAL_PARTNER_CODE}`;
