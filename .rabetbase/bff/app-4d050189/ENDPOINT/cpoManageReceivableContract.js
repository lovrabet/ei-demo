/**
 * 收款合同与收款计划维护。
 *
 * [脚本名称] cpoManageReceivableContract
 * [脚本类型] ENDPOINT
 * [接口路径] POST /api/endpoint/app-4d050189/cpoManageReceivableContract
 */

const CONTRACT_STATUSES = new Set([
  "PENDING",
  "IN_PROGRESS",
  "SIGNED",
  "COMPLETED",
  "CANCELLED",
]);
const MANAGED_EDITABLE_STATUSES = new Set(["draft", "rejected"]);
const MANAGED_LOCKED_STATUSES = new Set(["submitted", "reviewed"]);
const PLAN_STATUSES = new Set([
  "DRAFT",
  "PENDING",
  "INVOICED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "NOT_REQUIRED",
  "CANCELLED",
]);

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function positiveId(value, field) {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) {
    throw new Error(`INVALID_PARAMS:${field}`);
  }
  return result;
}

function optionalMoney(value, field) {
  if (value === "" || value === undefined || value === null) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) {
    throw new Error(`INVALID_PARAMS:${field}`);
  }
  return Math.round((result + Number.EPSILON) * 100) / 100;
}

function createdId(response) {
  return Number(response?.id || response?.data?.id || response) || 0;
}

function dateOrNull(value) {
  return text(value) || null;
}

async function actorOf(context) {
  const actor = await context.client.bff.execute({
    scriptName: "cpoCurrentActor",
    params: {},
  });
  if (!text(actor?.userId)) throw new Error("CPO_ACTOR_MISSING");
  return actor;
}

async function requireContract(model, contractId) {
  const contract = await model.getOne({ id: contractId });
  if (!contract?.id) {
    throw new Error("RECEIVABLE_CONTRACT_NOT_FOUND");
  }
  return contract;
}

async function assertCompanyAndOpportunity(
  models,
  codes,
  companyId,
  opportunityId,
) {
  const company = await models[`dataset_${codes.crmCompany}`].getOne({
    id: companyId,
  });
  if (!company?.id) throw new Error("RECEIVABLE_CONTRACT_COMPANY_NOT_FOUND");
  if (!opportunityId) return;
  const opportunity = await models[`dataset_${codes.crmOpportunity}`].getOne({
    id: opportunityId,
  });
  if (!opportunity?.id || Number(opportunity.company_id) !== companyId) {
    throw new Error("RECEIVABLE_CONTRACT_OPPORTUNITY_MISMATCH");
  }
}

async function assertContractNoAvailable(model, contractNo, excludeId = 0) {
  const response = await model.filter({
    where: { contract_no: { $eq: contractNo } },
    select: ["id"],
    currentPage: 1,
    pageSize: 10,
  });
  const conflict = (response?.tableData || []).find(
    (row) =>
      Number(row.id) !== Number(excludeId),
  );
  if (conflict) throw new Error("RECEIVABLE_CONTRACT_NO_DUPLICATED");
}

function assertManagedApplicant(contract, actor) {
  if (text(contract.applicant_user_id) !== text(actor.userId)) {
    throw new Error(`APPLICANT_MISMATCH:crm_contract:${contract.id}`);
  }
}

export default async function cpoManageReceivableContract(params, context) {
  const action = text(params?.action);
  const [map, actor] = await Promise.all([
    context.client.bff.execute({ scriptName: "cpoDatasetMap", params: {} }),
    actorOf(context),
  ]);
  const C = map.DATASET_CODES;
  const contractModel = context.client.models[`dataset_${C.crmContract}`];
  const planModel = context.client.models[`dataset_${C.crmReceivablePlan}`];

  if (action === "create_draft" || action === "create_application") {
    const submit = action === "create_application";
    const values = params?.contract || {};
    const companyId = positiveId(values.companyId, "companyId");
    const opportunityId = Number(values.opportunityId) || 0;
    const title = text(values.title);
    const contractNo = text(values.contractNo);
    const amount = optionalMoney(values.amount, "amount");
    if (!title || !contractNo) {
      throw new Error("RECEIVABLE_CONTRACT_TITLE_AND_NO_REQUIRED");
    }
    if (amount === null || amount <= 0) {
      throw new Error("INVALID_PARAMS:amount");
    }
    await Promise.all([
      assertCompanyAndOpportunity(
        context.client.models,
        C,
        companyId,
        opportunityId,
      ),
      assertContractNoAvailable(contractModel, contractNo),
    ]);
    const actorNumericId = Number(actor.userId);
    const response = await contractModel.create({
      company_id: companyId,
      opportunity_id: opportunityId || null,
      contract_no: contractNo,
      title,
      amount,
      currency: text(values.currency) || "CNY",
      sign_status: submit ? "submitted" : "draft",
      signed_date: null,
      start_date: dateOrNull(values.startDate),
      end_date: dateOrNull(values.endDate),
      owner_user_id:
        Number.isFinite(actorNumericId) && actorNumericId > 0
          ? actorNumericId
          : null,
      applicant_user_id: text(actor.userId),
      applicant_name_snapshot: text(actor.userName) || null,
      submitted_at: submit
        ? new Date().toISOString().slice(0, 19).replace("T", " ")
        : null,
      workflow_managed: 1,
      remark: text(values.remark) || null,
      payment_periods: 0,
      cashflow_direction: "RECEIVABLE",
    });
    const contractId = createdId(response);
    if (!contractId) throw new Error("RECEIVABLE_CONTRACT_CREATE_FAILED");
    return { success: true, action, contractId };
  }

  const contractId = positiveId(params?.contractId, "contractId");
  const contract = await requireContract(contractModel, contractId);
  const workflowManaged = Number(contract.workflow_managed) === 1;

  if (action === "update_contract") {
    if (workflowManaged) {
      assertManagedApplicant(contract, actor);
      const currentStatus = text(contract.sign_status).toLowerCase();
      if (!MANAGED_EDITABLE_STATUSES.has(currentStatus)) {
        throw new Error(`RECEIVABLE_CONTRACT_WORKFLOW_LOCKED:${currentStatus}`);
      }
    }
    const signStatus = text(params?.contract?.signStatus).toUpperCase();
    if (!workflowManaged && signStatus && !CONTRACT_STATUSES.has(signStatus)) {
      throw new Error(`CONTRACT_STATUS_INVALID:${signStatus}`);
    }
    const nextContractNo =
      text(params?.contract?.contractNo) || text(contract.contract_no);
    const nextCompanyId =
      Number(params?.contract?.companyId) || Number(contract.company_id);
    const nextOpportunityId =
      params?.contract?.opportunityId === null ||
      params?.contract?.opportunityId === ""
        ? 0
        : Number(params?.contract?.opportunityId || contract.opportunity_id) ||
          0;
    await Promise.all([
      assertCompanyAndOpportunity(
        context.client.models,
        C,
        nextCompanyId,
        nextOpportunityId,
      ),
      assertContractNoAvailable(contractModel, nextContractNo, contractId),
    ]);
    const payload = {
      id: contractId,
      company_id: nextCompanyId,
      opportunity_id: nextOpportunityId || null,
      title: text(params?.contract?.title) || text(contract.title),
      contract_no: nextContractNo,
      amount:
        optionalMoney(params?.contract?.amount, "amount") ??
        Number(contract.amount),
      currency:
        text(params?.contract?.currency) || text(contract.currency) || "CNY",
      sign_status: workflowManaged
        ? params?.submit === true
          ? "submitted"
          : text(contract.sign_status)
        : signStatus || text(contract.sign_status),
      signed_date: workflowManaged
        ? contract.signed_date || null
        : dateOrNull(params?.contract?.signedDate),
      start_date: dateOrNull(params?.contract?.startDate),
      end_date: dateOrNull(params?.contract?.endDate),
      owner_user_id: text(params?.contract?.ownerUserId) || null,
      remark: text(params?.contract?.remark) || null,
      cashflow_direction: "RECEIVABLE",
    };
    if (!payload.title || !payload.contract_no) {
      throw new Error("RECEIVABLE_CONTRACT_TITLE_AND_NO_REQUIRED");
    }
    await contractModel.update(payload);
    return { success: true, action, contractId };
  }

  if (action === "save_plan") {
    const currentStatus = text(contract.sign_status).toLowerCase();
    if (workflowManaged && MANAGED_LOCKED_STATUSES.has(currentStatus)) {
      throw new Error(`RECEIVABLE_PLAN_WORKFLOW_LOCKED:${currentStatus}`);
    }
    const planId = Number(params?.plan?.id) || 0;
    const phaseNo = positiveId(params?.plan?.phaseNo, "phaseNo");
    const requestedStatus = text(params?.plan?.status).toUpperCase();
    const status =
      workflowManaged && MANAGED_EDITABLE_STATUSES.has(currentStatus)
        ? "DRAFT"
        : requestedStatus || "PENDING";
    if (!PLAN_STATUSES.has(status)) {
      throw new Error(`RECEIVABLE_PLAN_STATUS_INVALID:${status}`);
    }
    const plannedAmount = optionalMoney(
      params?.plan?.plannedAmount,
      "plannedAmount",
    );
    const invoicedAmount =
      optionalMoney(params?.plan?.invoicedAmount, "invoicedAmount") || 0;
    const receivedAmount =
      optionalMoney(params?.plan?.receivedAmount, "receivedAmount") || 0;
    if (plannedAmount !== null && receivedAmount > plannedAmount) {
      throw new Error("RECEIVABLE_PLAN_RECEIVED_EXCEEDS_PLANNED");
    }
    const duplicateResponse = await planModel.filter({
      where: {
        contract_id: { $eq: contractId },
        phase_no: { $eq: phaseNo },
      },
      currentPage: 1,
      pageSize: 10,
    });
    const duplicate = (duplicateResponse?.tableData || []).find(
      (row) => Number(row.id) !== planId,
    );
    if (duplicate) throw new Error("RECEIVABLE_PLAN_PHASE_DUPLICATED");
    const actorId = positiveId(actor.userId, "actor.userId");
    const payload = {
      contract_id: contractId,
      phase_no: phaseNo,
      phase_name: text(params?.plan?.phaseName) || `第${phaseNo}期`,
      planned_amount: plannedAmount,
      currency:
        text(params?.plan?.currency) || text(contract.currency) || "CNY",
      planned_receipt_date: dateOrNull(params?.plan?.plannedReceiptDate),
      trigger_condition: text(params?.plan?.triggerCondition) || null,
      status,
      invoiced_amount: invoicedAmount,
      received_amount: receivedAmount,
      actual_received_date: dateOrNull(params?.plan?.actualReceivedDate),
      data_quality_status:
        plannedAmount !== null && dateOrNull(params?.plan?.plannedReceiptDate)
          ? "COMPLETE"
          : "NEEDS_COMPLETION",
      remark: text(params?.plan?.remark) || null,
      updated_by_user_id: actorId,
      updated_by_name_snapshot: text(actor.userName) || null,
    };
    let savedId = planId;
    if (planId) {
      const existing = await planModel.getOne({ id: planId });
      if (!existing?.id || Number(existing.contract_id) !== contractId) {
        throw new Error("RECEIVABLE_PLAN_NOT_FOUND");
      }
      await planModel.update({ id: planId, ...payload });
    } else {
      savedId = createdId(
        await planModel.create({
          ...payload,
          created_by_user_id: actorId,
          created_by_name_snapshot: text(actor.userName) || null,
        }),
      );
    }
    const planResponse = await planModel.filter({
      where: { contract_id: { $eq: contractId } },
      currentPage: 1,
      pageSize: 500,
    });
    const count = (planResponse?.tableData || []).filter(
      (row) => text(row.status) !== "CANCELLED",
    ).length;
    await contractModel.update({ id: contractId, payment_periods: count });
    return { success: true, action, contractId, planId: savedId };
  }

  if (action === "cancel_plan") {
    const currentStatus = text(contract.sign_status).toLowerCase();
    if (workflowManaged && MANAGED_LOCKED_STATUSES.has(currentStatus)) {
      throw new Error(`RECEIVABLE_PLAN_WORKFLOW_LOCKED:${currentStatus}`);
    }
    const planId = positiveId(params?.planId, "planId");
    const existing = await planModel.getOne({ id: planId });
    if (!existing?.id || Number(existing.contract_id) !== contractId) {
      throw new Error("RECEIVABLE_PLAN_NOT_FOUND");
    }
    await planModel.update({
      id: planId,
      status: "CANCELLED",
      updated_by_user_id: positiveId(actor.userId, "actor.userId"),
      updated_by_name_snapshot: text(actor.userName) || null,
    });
    return { success: true, action, contractId, planId };
  }

  throw new Error(`RECEIVABLE_CONTRACT_ACTION_UNSUPPORTED:${action}`);
}
