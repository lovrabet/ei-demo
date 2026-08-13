/**
 * 合同付款计划同步入口。
 *
 * [脚本描述] 在合同草稿中创建、更新和删除付款计划，并保护已关联付款申请的计划
 * [接口路径] POST /api/endpoint/app-4d050189/cpoSyncContractPaymentPlans
 *
 * [HTTP 请求体参数]
 * {
 *   "contractId": 123,
 *   "plans": [{
 *     "id": 1,
 *     "phase_no": 1,
 *     "phase_name": "首付款",
 *     "planned_amount": 50000,
 *     "currency": "CNY",
 *     "planned_pay_date": "2026-08-31",
 *     "trigger_condition": "合同签署后",
 *     "status": "pending",
 *     "remark": ""
 *   }]
 * }
 *
 * [返回数据结构]
 * { contractId, plans[], createdIds[], updatedIds[], deletedIds[] }
 */
const EDITABLE_CONTRACT_STATUSES = new Set(["draft", "rejected"]);
const USER_MANAGED_PLAN_STATUSES = new Set(["pending", "paid", "not_required"]);
const ALL_PLAN_STATUSES = new Set([
  ...USER_MANAGED_PLAN_STATUSES,
  "processing",
  "cancelled",
]);
const ADMIN_ROLES = new Set([
  "admin",
  "administrator",
  "super_admin",
  "cpo_admin",
  "workflow_admin",
]);

function optionalText(value) {
  return value === undefined || value === null ? "" : String(value).trim();
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

function positiveId(value, fieldName) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`INVALID_PARAMS:${fieldName} must be a positive number`);
  }
  return id;
}

function readCreatedId(result) {
  const candidate =
    typeof result === "number"
      ? result
      : (result?.id ??
        result?.result?.id ??
        result?.data?.id ??
        result?.data?.result?.id);
  return positiveId(candidate, "createdId");
}

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

function normalizePlan(plan, index) {
  if (!plan || typeof plan !== "object") {
    throw new Error(`PAYMENT_PLAN_INVALID:${index}`);
  }
  const phaseNo = Number(plan.phase_no);
  const plannedAmount = Number(plan.planned_amount);
  if (!Number.isInteger(phaseNo) || phaseNo <= 0) {
    throw new Error(`PAYMENT_PLAN_PHASE_INVALID:${index}`);
  }
  if (!Number.isFinite(plannedAmount) || plannedAmount <= 0) {
    throw new Error(`PAYMENT_PLAN_AMOUNT_INVALID:${index}`);
  }
  const status = optionalText(plan.status) || "pending";
  if (!ALL_PLAN_STATUSES.has(status)) {
    throw new Error(`PAYMENT_PLAN_STATUS_INVALID:${index}:${status}`);
  }
  return {
    ...(plan.id ? { id: positiveId(plan.id, `plans[${index}].id`) } : {}),
    phase_no: phaseNo,
    phase_name: optionalText(plan.phase_name) || null,
    planned_amount: Math.round(plannedAmount * 100) / 100,
    currency: optionalText(plan.currency).toUpperCase() || "CNY",
    planned_pay_date: optionalText(plan.planned_pay_date) || null,
    trigger_condition: optionalText(plan.trigger_condition) || null,
    status,
    remark: optionalText(plan.remark) || null,
  };
}

function isPlanEditable(plan, lockedPlanIds = new Set()) {
  return (
    !lockedPlanIds.has(Number(plan.id)) &&
    USER_MANAGED_PLAN_STATUSES.has(String(plan.status))
  );
}

function editableFieldsChanged(existing, requested) {
  return [
    "phase_no",
    "phase_name",
    "planned_amount",
    "currency",
    "planned_pay_date",
    "trigger_condition",
    "status",
    "remark",
  ].some(
    (field) => optionalText(existing[field]) !== optionalText(requested[field]),
  );
}

export default async function cpoSyncContractPaymentPlans(params, context) {
  const contractId = positiveId(params?.contractId, "contractId");
  if (!Array.isArray(params?.plans)) {
    throw new Error("INVALID_PARAMS:plans must be an array");
  }
  if (params.plans.length > 100) {
    throw new Error("PAYMENT_PLAN_LIMIT_EXCEEDED:100");
  }
  const plans = params.plans.map(normalizePlan);
  const invalidNewPlan = plans.find(
    (plan) => !plan.id && !USER_MANAGED_PLAN_STATUSES.has(plan.status),
  );
  if (invalidNewPlan) {
    throw new Error(
      `PAYMENT_PLAN_STATUS_NOT_USER_MANAGED:${invalidNewPlan.status}`,
    );
  }
  const phaseNumbers = plans.map((plan) => plan.phase_no);
  if (new Set(phaseNumbers).size !== phaseNumbers.length) {
    throw new Error("PAYMENT_PLAN_PHASE_DUPLICATED");
  }

  const [map, actor] = await Promise.all([
    context.client.bff.execute({ scriptName: "cpoDatasetMap", params: {} }),
    context.client.bff.execute({ scriptName: "cpoCurrentActor", params: {} }),
  ]);
  const C = map.DATASET_CODES;
  if (!C.contractPaymentPlan) {
    throw new Error("DATASET_CODE_MISSING:contractPaymentPlan");
  }
  const contractModel =
    context.client.models[`dataset_${C.contractApplication}`];
  const planModel = context.client.models[`dataset_${C.contractPaymentPlan}`];
  const paymentModel = context.client.models[`dataset_${C.paymentApplication}`];
  if (
    !contractModel?.getOne ||
    !planModel?.filter ||
    !planModel?.create ||
    !planModel?.update ||
    !planModel?.delete ||
    !paymentModel?.filter
  ) {
    throw new Error("MODEL_MISSING:contract payment plan sync");
  }

  const contract = await contractModel.getOne({ id: contractId });
  if (!contract?.id) {
    throw new Error(`CONTRACT_NOT_FOUND:${contractId}`);
  }
  const isAdmin = actorIsAdmin(actor, context);
  if (!isAdmin && !EDITABLE_CONTRACT_STATUSES.has(String(contract.status))) {
    throw new Error(`CONTRACT_STATUS_LOCKED:${contract.status}`);
  }
  if (
    !isAdmin &&
    contract.applicant_user_id &&
    actor?.userId &&
    optionalText(contract.applicant_user_id) !== optionalText(actor.userId)
  ) {
    throw new Error(`CONTRACT_OWNER_MISMATCH:${contractId}`);
  }
  if (
    String(contract.payment_requirement || "unknown") === "not_required" &&
    plans.length
  ) {
    throw new Error("CONTRACT_PAYMENT_NOT_REQUIRED_HAS_PLANS");
  }

  const existingResponse = await planModel.filter({
    where: {
      contract_id: { $eq: contractId },
    },
    currentPage: 1,
    pageSize: 200,
    orderBy: [{ phase_no: "asc" }, { id: "asc" }],
  });
  const allRows = rowsOf(existingResponse);
  const existingRows = allRows;
  const existingPlanIds = existingRows.map((row) => Number(row.id));
  const paymentResponse = existingPlanIds.length
    ? await paymentModel.filter({
        where: { payment_plan_id: { $in: existingPlanIds } },
        select: ["id", "payment_plan_id", "status"],
        currentPage: 1,
        pageSize: 5000,
      })
    : { tableData: [] };
  const lockedPlanIds = new Set(
    rowsOf(paymentResponse)
      .filter(
        (payment) =>
          !["cancelled", "rejected"].includes(String(payment.status)),
      )
      .map((payment) => Number(payment.payment_plan_id))
      .filter(Boolean),
  );
  const existingById = new Map(
    existingRows.map((row) => [Number(row.id), row]),
  );
  const requestedIds = new Set(
    plans.map((plan) => Number(plan.id)).filter(Boolean),
  );

  for (const plan of plans) {
    if (!plan.id) continue;
    const existing = existingById.get(Number(plan.id));
    if (!existing) {
      throw new Error(`PAYMENT_PLAN_NOT_FOUND:${contractId}:${plan.id}`);
    }
    if (
      !isPlanEditable(existing, lockedPlanIds) &&
      editableFieldsChanged(existing, plan)
    ) {
      throw new Error(
        `PAYMENT_PLAN_STATUS_LOCKED:${plan.id}:${existing.status}`,
      );
    }
    if (
      isPlanEditable(existing, lockedPlanIds) &&
      !USER_MANAGED_PLAN_STATUSES.has(plan.status)
    ) {
      throw new Error(`PAYMENT_PLAN_STATUS_NOT_USER_MANAGED:${plan.status}`);
    }
  }

  const removableRows = existingRows.filter(
    (row) =>
      !requestedIds.has(Number(row.id)) && isPlanEditable(row, lockedPlanIds),
  );
  const omittedLocked = existingRows.filter(
    (row) => !requestedIds.has(Number(row.id)) && !removableRows.includes(row),
  );
  if (omittedLocked.length) {
    const locked = omittedLocked[0];
    throw new Error(`PAYMENT_PLAN_DELETE_LOCKED:${locked.id}:${locked.status}`);
  }

  const deletedIds = removableRows.map((row) => Number(row.id));
  for (const id of deletedIds) {
    await planModel.update({
      id,
      status: "cancelled",
      linked_payment_application_id: null,
    });
    await planModel.delete({ id });
  }

  const changingPhaseRows = plans.filter((plan) => {
    if (!plan.id) return false;
    const existing = existingById.get(Number(plan.id));
    return (
      existing &&
      isPlanEditable(existing, lockedPlanIds) &&
      Number(existing.phase_no) !== plan.phase_no
    );
  });
  for (const [index, plan] of changingPhaseRows.entries()) {
    await planModel.update({
      id: plan.id,
      phase_no: 4294967000 - index,
    });
  }

  const createdIds = [];
  const restoredIds = [];
  const updatedIds = [];
  for (const plan of plans) {
    const payload = {
      contract_id: contractId,
      phase_no: plan.phase_no,
      phase_name: plan.phase_name,
      planned_amount: plan.planned_amount,
      currency: plan.currency,
      planned_pay_date: plan.planned_pay_date,
      trigger_condition: plan.trigger_condition,
      status: plan.status,
      remark: plan.remark,
    };
    if (plan.id) {
      const existing = existingById.get(Number(plan.id));
      if (isPlanEditable(existing, lockedPlanIds)) {
        await planModel.update({ id: plan.id, ...payload });
        updatedIds.push(Number(plan.id));
      }
      continue;
    }
    createdIds.push(
      readCreatedId(
        await planModel.create({
          ...payload,
          status: plan.status,
        }),
      ),
    );
  }

  const refreshed = await planModel.filter({
    where: {
      contract_id: { $eq: contractId },
    },
    currentPage: 1,
    pageSize: 200,
    orderBy: [{ phase_no: "asc" }, { id: "asc" }],
  });
  return {
    contractId,
    plans: rowsOf(refreshed),
    createdIds,
    restoredIds,
    updatedIds,
    deletedIds,
  };
}
