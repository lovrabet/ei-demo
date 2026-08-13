/**
 * 合同付款计划的付款汇总（叶子 COMMON：不调用其它 COMMON）。
 *
 * 权威事实：payment_application.payment_plan_id。
 * contract_payment_plan 上的状态、实付金额、实付时间以及单个付款 ID
 * 均为兼容性缓存，不能作为“计划只能关联一笔付款”的业务约束。
 *
 * @param {Object} params { planIds?, contractId?, persist? }
 * @returns {Promise<Object>} { plans[], summary }
 */
const PAYMENT_APPLICATION_CODE = "7da208a5059b4b13896d7c7ae29c8492";
const CONTRACT_PAYMENT_PLAN_CODE = "08e17d8ba3a24e938fef89816c8f4ccb";

const INACTIVE_PAYMENT_STATUSES = new Set(["cancelled", "rejected"]);
const PAID_PAYMENT_STATUSES = new Set(["paid_confirmed"]);
const MANUAL_PLAN_STATUSES = new Set(["not_required", "cancelled"]);

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function positiveInt(value) {
  const result = Number(value);
  return Number.isInteger(result) && result > 0 ? result : 0;
}

function unique(values) {
  return [...new Set(values.map(positiveInt).filter(Boolean))];
}

function money(value) {
  const result = Number(value);
  if (!Number.isFinite(result)) return 0;
  return Math.round((result + Number.EPSILON) * 100) / 100;
}

function paymentIsPaid(payment) {
  return (
    PAID_PAYMENT_STATUSES.has(text(payment.status)) ||
    PAID_PAYMENT_STATUSES.has(text(payment.bank_status))
  );
}

function dateTime(value) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export default async function cpoPaymentPlanSummary(params, context) {
  const contractId = positiveInt(params?.contractId);
  const requestedPlanIds = unique(
    Array.isArray(params?.planIds) ? params.planIds : [],
  );
  const persist = params?.persist !== false;
  if (!contractId && !requestedPlanIds.length) {
    throw new Error("INVALID_PARAMS:contractId or planIds is required");
  }

  const planModel =
    context.client.models[`dataset_${CONTRACT_PAYMENT_PLAN_CODE}`];
  const paymentModel =
    context.client.models[`dataset_${PAYMENT_APPLICATION_CODE}`];
  if (!planModel?.filter) throw new Error("MODEL_MISSING:contractPaymentPlan");
  if (!paymentModel?.filter) throw new Error("MODEL_MISSING:paymentApplication");

  const planResponse = await planModel.filter({
    where: contractId
      ? { contract_id: { $eq: contractId } }
      : { id: { $in: requestedPlanIds } },
    select: [
      "id",
      "contract_id",
      "phase_no",
      "phase_name",
      "planned_amount",
      "status",
      "linked_payment_application_id",
      "actual_paid_amount",
      "actual_paid_at",
    ],
    currentPage: 1,
    pageSize: 1000,
  });
  const plans = rowsOf(planResponse);
  const planIds = unique(plans.map((plan) => plan.id));
  const paymentResponse = planIds.length
    ? await paymentModel.filter({
        where: { payment_plan_id: { $in: planIds } },
        select: [
          "id",
          "payment_plan_id",
          "amount",
          "status",
          "bank_status",
          "bank_confirmed_at",
          "updated_at",
        ],
        currentPage: 1,
        pageSize: 5000,
      })
    : { tableData: [] };

  const paymentsByPlan = new Map();
  for (const payment of rowsOf(paymentResponse)) {
    if (INACTIVE_PAYMENT_STATUSES.has(text(payment.status))) continue;
    const planId = positiveInt(payment.payment_plan_id);
    if (!planId) continue;
    const rows = paymentsByPlan.get(planId) || [];
    rows.push(payment);
    paymentsByPlan.set(planId, rows);
  }

  const resultPlans = [];
  for (const plan of plans) {
    const planId = positiveInt(plan.id);
    const payments = paymentsByPlan.get(planId) || [];
    const paidPayments = payments.filter(paymentIsPaid);
    const actualPaidAmount = money(
      paidPayments.reduce((sum, payment) => sum + money(payment.amount), 0),
    );
    const appliedAmount = money(
      payments.reduce((sum, payment) => sum + money(payment.amount), 0),
    );
    const latestPayment = [...payments].sort((left, right) => {
      const timeDiff =
        dateTime(right.updated_at || right.bank_confirmed_at) -
        dateTime(left.updated_at || left.bank_confirmed_at);
      return timeDiff || positiveInt(right.id) - positiveInt(left.id);
    })[0];
    const latestPaidAt = paidPayments.reduce((latest, payment) => {
      const value = payment.bank_confirmed_at || null;
      return dateTime(value) > dateTime(latest) ? value : latest;
    }, null);
    const plannedAmount = money(plan.planned_amount);
    const existingStatus = text(plan.status);
    const status = MANUAL_PLAN_STATUSES.has(existingStatus)
      ? existingStatus
      : plannedAmount > 0 && actualPaidAmount + 0.001 >= plannedAmount
        ? "paid"
        : payments.length
          ? "processing"
          : existingStatus === "paid" && !payments.length
            ? "paid"
            : "pending";
    const update = {
      id: planId,
      status,
      linked_payment_application_id: latestPayment
        ? positiveInt(latestPayment.id)
        : null,
      actual_paid_amount: actualPaidAmount,
      actual_paid_at: latestPaidAt,
    };
    const changed =
      status !== existingStatus ||
      positiveInt(plan.linked_payment_application_id) !==
        positiveInt(update.linked_payment_application_id) ||
      Math.abs(money(plan.actual_paid_amount) - actualPaidAmount) > 0.001 ||
      dateTime(plan.actual_paid_at) !== dateTime(latestPaidAt);
    if (changed && persist && planModel?.update) {
      await planModel.update(update);
    }
    resultPlans.push({
      planId,
      contractId: positiveInt(plan.contract_id),
      phaseNo: positiveInt(plan.phase_no),
      phaseName: text(plan.phase_name),
      plannedAmount,
      paymentCount: payments.length,
      paidPaymentCount: paidPayments.length,
      appliedAmount,
      actualPaidAmount,
      remainingAmount: money(Math.max(plannedAmount - actualPaidAmount, 0)),
      status,
      updated: changed && persist,
    });
  }

  return {
    contractId,
    plans: resultPlans,
    summary: {
      planCount: resultPlans.length,
      paymentCount: resultPlans.reduce(
        (sum, plan) => sum + plan.paymentCount,
        0,
      ),
      plannedAmount: money(
        resultPlans.reduce((sum, plan) => sum + plan.plannedAmount, 0),
      ),
      appliedAmount: money(
        resultPlans.reduce((sum, plan) => sum + plan.appliedAmount, 0),
      ),
      actualPaidAmount: money(
        resultPlans.reduce((sum, plan) => sum + plan.actualPaidAmount, 0),
      ),
    },
  };
}
