/**
 * CPO 主单普通更新权限保护。
 *
 * [脚本描述] 标准 update / 标准列表页编辑入口共用守卫：状态字段由流程动作写入，普通用户只可更新本人草稿或驳回单据
 * [脚本名称] cpoApplicationUpdateGuard
 * [脚本类型] COMMON
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoApplicationUpdateGuard.js
 *
 * @param {Object} params - { bizType, values }，values 为 update 原始参数。
 * @param {Object} context - 平台注入上下文。
 * @returns {Promise<Object>} 清洗后的 update 参数。
 */
const EDITABLE_STATUSES = new Set(["draft", "rejected"]);
const PROTECTED_FIELDS = new Set([
  "status",
  "bank_status",
  "applicant_user_id",
  "applicant_name_snapshot",
  "submitted_at",
  "signed_at",
  "bank_submitted_at",
  "bank_confirmed_at",
  "bank_confirmed_by_user_id",
  "bank_confirmed_by_name_snapshot",
  "last_action_at",
  "current_owner_user_id",
  "current_owner_role",
  "current_owner_name_snapshot",
]);

const BIZ_TYPE_TO_DATASET = {
  expense: {
    bizType: "expense",
    tableName: "expense_application",
    statusField: "status",
  },
  invoice: {
    bizType: "invoice",
    tableName: "invoice_record",
    statusField: "status",
  },
  invoice_application: {
    bizType: "invoice_application",
    tableName: "invoice_application",
    statusField: "status",
  },
  contract: {
    bizType: "contract",
    tableName: "contract_application",
    statusField: "status",
  },
  payment: {
    bizType: "payment",
    tableName: "payment_application",
    statusField: "status",
  },
  salary_payment: {
    bizType: "salary_payment",
    tableName: "salary_payment_application",
    statusField: "status",
  },
  travel: {
    bizType: "travel",
    tableName: "travel_application",
    statusField: "status",
  },
};

function optionalText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function actorIsAdmin(actor, context) {
  const userInfo = context?.userInfo || {};
  return actor?.isAdmin === true || userInfo.isAdmin === true;
}

function pickFirstText(...values) {
  for (const value of values) {
    const text = optionalText(value);
    if (text) return text;
  }
  return "";
}

function currentActorFromContext(context) {
  const userInfo = context?.userInfo || {};
  return {
    userId: pickFirstText(
      userInfo.userId,
      userInfo.id,
      userInfo.openId,
      userInfo.open_id,
    ),
    isAdmin: userInfo.isAdmin === true,
  };
}

function normalizeValues(params) {
  const values =
    params?.values && typeof params.values === "object"
      ? params.values
      : params;
  if (!values || typeof values !== "object") {
    throw new Error("INVALID_PARAMS:values are required");
  }
  return values;
}

function normalizeId(values) {
  const candidate = values.id ?? values.bizId ?? values.dataid;
  const numericId = Number(candidate);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new Error("INVALID_PARAMS:id must be a finite positive number");
  }
  return numericId;
}

function cleanUpdatePayload(values, id) {
  const cleaned = { id };
  for (const [key, value] of Object.entries(values)) {
    if (key === "id" || key === "bizId" || key === "dataid") continue;
    if (key.startsWith("_")) continue;
    if (PROTECTED_FIELDS.has(key)) continue;
    if (value !== undefined) cleaned[key] = value;
  }
  return cleaned;
}

function resolveMeta(bizType) {
  const meta = BIZ_TYPE_TO_DATASET[bizType];
  if (!meta) throw new Error(`INVALID_BIZ_TYPE:${bizType || ""}`);
  return meta;
}

export default async function cpoApplicationUpdateGuard(params, context) {
  const bizType = optionalText(params?.bizType);
  const values = normalizeValues(params);
  const id = normalizeId(values);

  const actor = currentActorFromContext(context);
  const meta = resolveMeta(bizType);
  const isAdmin = actorIsAdmin(actor, context);

  const model = context.client.models.byTable(meta.tableName);
  if (!model) throw new Error(`MODEL_MISSING:${meta.tableName}`);

  const existing = await model.getOne({ id });
  if (!existing?.id) {
    throw new Error(`CPO_RECORD_NOT_FOUND:${bizType}:${id}`);
  }

  if (!isAdmin) {
    const actorUserId = optionalText(actor?.userId);
    if (!actorUserId) throw new Error("CPO_ACTOR_MISSING");

    const currentStatus = existing[meta.statusField || "status"];
    if (!EDITABLE_STATUSES.has(currentStatus)) {
      throw new Error(`CPO_UPDATE_FORBIDDEN:${bizType}:${currentStatus}`);
    }

    const ownerUserId = optionalText(existing.applicant_user_id);
    if (ownerUserId && ownerUserId !== actorUserId) {
      throw new Error(`CPO_UPDATE_OWNER_MISMATCH:${bizType}:${id}`);
    }
  }

  return cleanUpdatePayload(values, id);
}
