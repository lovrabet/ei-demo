/**
 * 合同付款上下文聚合查询。
 *
 * [脚本描述] 查询合同、付款计划、首个待付款计划和历史付款记录
 * [接口路径] POST /api/endpoint/app-4d050189/cpoGetContractPaymentContext
 *
 * [HTTP 请求体参数]
 * { "contractId": 123 }
 *
 * [返回数据结构]
 * { contract, plans[], pendingPlan, paymentHistory[], summary }
 */
function positiveId(value, fieldName) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`INVALID_PARAMS:${fieldName} must be a positive number`);
  }
  return id;
}

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

export default async function cpoGetContractPaymentContext(params, context) {
  const contractId = positiveId(params?.contractId, "contractId");
  const map = await context.client.bff.execute({
    scriptName: "cpoDatasetMap",
    params: {},
  });
  const C = map.DATASET_CODES;
  if (!C.contractPaymentPlan) {
    throw new Error("DATASET_CODE_MISSING:contractPaymentPlan");
  }

  const contractModel =
    context.client.models[`dataset_${C.contractApplication}`];
  const planModel = context.client.models[`dataset_${C.contractPaymentPlan}`];
  const paymentModel = context.client.models[`dataset_${C.paymentApplication}`];
  if (!contractModel?.getOne || !planModel?.filter || !paymentModel?.filter) {
    throw new Error("MODEL_MISSING:contract payment context");
  }

  const contract = await contractModel.getOne({ id: contractId });
  if (!contract?.id) {
    throw new Error(`CONTRACT_NOT_FOUND:${contractId}`);
  }
  await context.client.bff.execute({
    scriptName: "cpoApplicationReadOneGuard",
    params: { bizType: "contract", result: contract },
  });

  const [planResponse, paymentResponse] = await Promise.all([
    planModel.filter({
      where: {
        contract_id: { $eq: contractId },
      },
      currentPage: 1,
      pageSize: 200,
      orderBy: [{ phase_no: "asc" }, { id: "asc" }],
    }),
    paymentModel.filter({
      where: {
        contract_id: { $eq: contractId },
      },
      currentPage: 1,
      pageSize: 200,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    }),
  ]);

  const plans = rowsOf(planResponse);
  const paymentHistory = rowsOf(paymentResponse);
  const activePayments = paymentHistory.filter(
    (payment) => !["cancelled", "rejected"].includes(String(payment.status)),
  );
  const enrichedPlans = plans.map((plan) => {
    const payments = activePayments.filter(
      (payment) => Number(payment.payment_plan_id) === Number(plan.id),
    );
    const paidPayments = payments.filter(
      (payment) =>
        String(payment.status) === "paid_confirmed" ||
        String(payment.bank_status) === "paid_confirmed",
    );
    const appliedAmount = payments.reduce(
      (sum, payment) => sum + (Number(payment.amount) || 0),
      0,
    );
    const confirmedPaidAmount = paidPayments.reduce(
      (sum, payment) => sum + (Number(payment.amount) || 0),
      0,
    );
    return {
      ...plan,
      payment_count: payments.length,
      paid_payment_count: paidPayments.length,
      applied_amount: Math.round(appliedAmount * 100) / 100,
      confirmed_paid_amount: Math.round(confirmedPaidAmount * 100) / 100,
      remaining_amount:
        Math.round(
          Math.max(Number(plan.planned_amount || 0) - confirmedPaidAmount, 0) *
            100,
        ) / 100,
    };
  });
  const pendingPlan =
    enrichedPlans.find(
      (plan) =>
        !["not_required", "cancelled"].includes(String(plan.status)) &&
        (String(plan.status) !== "paid" || Number(plan.remaining_amount) > 0),
    ) || null;

  return {
    contract,
    plans: enrichedPlans,
    pendingPlan,
    paymentHistory,
    summary: {
      planCount: enrichedPlans.length,
      pendingCount: enrichedPlans.filter((plan) => plan.status === "pending")
        .length,
      processingCount: enrichedPlans.filter(
        (plan) => plan.status === "processing",
      )
        .length,
      paidCount: enrichedPlans.filter((plan) => plan.status === "paid").length,
      notRequiredCount: enrichedPlans.filter(
        (plan) => plan.status === "not_required",
      ).length,
      paymentCount: paymentHistory.length,
    },
  };
}
