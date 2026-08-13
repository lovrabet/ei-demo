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
const ADMIN_ROLES = new Set([
  "admin",
  "administrator",
  "super_admin",
  "cpo_admin",
  "workflow_admin",
]);
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
    modelKey: "dataset_7851365c96244a1896e834daec447ddb",
    statusField: "status",
  },
  invoice: {
    bizType: "invoice",
    modelKey: "dataset_fc11e2d760b94b2ca2ccf0485ed40ca8",
    statusField: "status",
  },
  invoice_application: {
    bizType: "invoice_application",
    modelKey: "dataset_ae51202c44e140828ba87e4571094d1a",
    statusField: "status",
  },
  contract: {
    bizType: "contract",
    modelKey: "dataset_53869993f80f45ae8ef6cdf051d8e355",
    statusField: "status",
  },
  payment: {
    bizType: "payment",
    modelKey: "dataset_7da208a5059b4b13896d7c7ae29c8492",
    statusField: "status",
  },
  salary_payment: {
    bizType: "salary_payment",
    modelKey: "dataset_235e11a9cb7945c8926b4d31fe64843f",
    statusField: "status",
  },
  travel: {
    bizType: "travel",
    modelKey: "dataset_28494f18f334400c893576b6e168d3f6",
    statusField: "status",
  },
};

function optionalText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeRole(value) {
  return optionalText(value).toLowerCase();
}

function normalizeRoles(roleLike) {
  if (Array.isArray(roleLike)) {
    return roleLike
      .map((item) =>
        typeof item === "string"
          ? item
          : item?.code || item?.name || item?.value || item?.roleCode,
      )
      .map(normalizeRole)
      .filter(Boolean);
  }
  const role = normalizeRole(roleLike);
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
    roles: normalizeRoles(
      userInfo.roles ||
        userInfo.roleList ||
        userInfo.roleCodes ||
        userInfo.role,
    ),
    isAdmin: userInfo.isAdmin === true || userInfo.admin === true,
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

  const model = context.client.models[meta.modelKey];
  if (!model) throw new Error(`MODEL_MISSING:${meta.modelKey}`);

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
