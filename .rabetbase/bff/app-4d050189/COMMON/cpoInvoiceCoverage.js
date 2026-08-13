/**
 * 采购付款的进项发票核销汇总与欠票敞口计算（叶子 COMMON：不调用其它 COMMON）。
 *
 * [脚本描述] 按付款申请汇总 biz_invoice_link 的核销金额，回写付款计划已收票金额，并算出已付未收票敞口
 * [脚本名称] cpoInvoiceCoverage
 * [脚本类型] COMMON（leaf）
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoInvoiceCoverage.js
 *
 * 口径说明：
 * - 权威事实是 biz_invoice_link（biz_type=payment，relation_type=payment_coverage）的核销明细。
 * - contract_payment_plan.invoiced_amount 是按期次的汇总冗余，只由本脚本重算。
 * - 欠票敞口只统计已确认付款的部分：已付金额 - 已付部分已核销的发票金额。
 *   先票后款（发票已挂在未付款的申请上）不计入敞口。
 *
 * @param {Object} params { contractId?, paymentIds?, persist? }
 *   contractId - 按合同重算该合同下全部付款与期次
 *   paymentIds - 按付款申请重算，并自动扩展到同期次的其它付款以保证期次汇总完整
 *   persist    - 默认 true；false 时只计算不回写
 * @param {Object} context 平台注入上下文
 * @returns {Promise<Object>} { payments[], plans[], summary }
 */
const PAYMENT_APPLICATION_CODE = "7da208a5059b4b13896d7c7ae29c8492";
const CONTRACT_PAYMENT_PLAN_CODE = "08e17d8ba3a24e938fef89816c8f4ccb";
const BIZ_INVOICE_LINK_CODE = "9dd0d102219145ddbb67d1c247a84fb9";

const PAYMENT_COVERAGE_RELATION = "payment_coverage";
// 作废与草稿不进入敞口口径：草稿尚未成为付款事实，取消与驳回不再需要发票。
const INACTIVE_PAYMENT_STATUSES = new Set(["cancelled", "rejected"]);
const PAID_PAYMENT_STATUSES = new Set(["paid_confirmed"]);

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function money(value) {
  const result = Number(value);
  if (!Number.isFinite(result)) return 0;
  return Math.round((result + Number.EPSILON) * 100) / 100;
}

function positiveInt(value) {
  const result = Number(value);
  return Number.isInteger(result) && result > 0 ? result : 0;
}

function unique(values) {
  return [...new Set(values.map(positiveInt).filter(Boolean))];
}

function paymentIsPaid(payment) {
  return (
    PAID_PAYMENT_STATUSES.has(text(payment.status)) ||
    PAID_PAYMENT_STATUSES.has(text(payment.bank_status))
  );
}

export default async function cpoInvoiceCoverage(params, context) {
  const contractId = positiveInt(params?.contractId);
  const requestedPaymentIds = unique(
    Array.isArray(params?.paymentIds) ? params.paymentIds : [],
  );
  const persist = params?.persist !== false;
  if (!contractId && !requestedPaymentIds.length) {
    throw new Error("INVALID_PARAMS:contractId or paymentIds is required");
  }

  const models = context.client.models;
  const paymentModel = models[`dataset_${PAYMENT_APPLICATION_CODE}`];
  const planModel = models[`dataset_${CONTRACT_PAYMENT_PLAN_CODE}`];
  const linkModel = models[`dataset_${BIZ_INVOICE_LINK_CODE}`];
  if (!paymentModel?.filter) throw new Error("MODEL_MISSING:paymentApplication");
  if (!planModel?.filter) throw new Error("MODEL_MISSING:contractPaymentPlan");
  if (!linkModel?.filter) throw new Error("MODEL_MISSING:bizInvoiceLink");

  const PAYMENT_SELECT = [
    "id",
    "contract_id",
    "payment_plan_id",
    "amount",
    "status",
    "bank_status",
  ];

  const seedResponse = await paymentModel.filter({
    where: contractId
      ? { contract_id: { $eq: contractId } }
      : { id: { $in: requestedPaymentIds } },
    select: PAYMENT_SELECT,
    currentPage: 1,
    pageSize: 1000,
  });
  const seedPayments = rowsOf(seedResponse);

  // 一张发票可以冲抵多期，重算某一期必须看到该期下的全部付款申请，
  // 否则按单个付款回写会把同期其它付款的核销金额抹掉。
  const planIds = unique(seedPayments.map((row) => row.payment_plan_id));
  const expandedResponse =
    !contractId && planIds.length
      ? await paymentModel.filter({
          where: { payment_plan_id: { $in: planIds } },
          select: PAYMENT_SELECT,
          currentPage: 1,
          pageSize: 1000,
        })
      : { tableData: [] };

  const paymentById = new Map();
  for (const payment of [...seedPayments, ...rowsOf(expandedResponse)]) {
    paymentById.set(positiveInt(payment.id), payment);
  }
  const activePayments = [...paymentById.values()].filter(
    (payment) => !INACTIVE_PAYMENT_STATUSES.has(text(payment.status)),
  );
  const paymentIds = unique(activePayments.map((payment) => payment.id));

  const linkResponse = paymentIds.length
    ? await linkModel.filter({
        where: {
          biz_type: { $eq: "payment" },
          biz_id: { $in: paymentIds },
          relation_type: { $eq: PAYMENT_COVERAGE_RELATION },
        },
        select: ["id", "invoice_id", "biz_id", "amount_used"],
        currentPage: 1,
        pageSize: 5000,
      })
    : { tableData: [] };

  const coveredByPayment = new Map();
  const invoiceIdsByPayment = new Map();
  for (const link of rowsOf(linkResponse)) {
    const paymentId = positiveInt(link.biz_id);
    if (!paymentId) continue;
    coveredByPayment.set(
      paymentId,
      money((coveredByPayment.get(paymentId) || 0) + money(link.amount_used)),
    );
    const invoiceId = positiveInt(link.invoice_id);
    if (!invoiceId) continue;
    const invoiceIds = invoiceIdsByPayment.get(paymentId) || new Set();
    invoiceIds.add(invoiceId);
    invoiceIdsByPayment.set(paymentId, invoiceIds);
  }

  const paymentRows = activePayments.map((payment) => {
    const paymentId = positiveInt(payment.id);
    const amount = money(payment.amount);
    const coveredAmount = money(coveredByPayment.get(paymentId) || 0);
    const paid = paymentIsPaid(payment);
    return {
      paymentId,
      contractId: positiveInt(payment.contract_id),
      planId: positiveInt(payment.payment_plan_id),
      amount,
      coveredAmount,
      // 未收票金额只对已付款有意义；未付款的缺口不是欠票。
      pendingInvoiceAmount: paid ? money(Math.max(amount - coveredAmount, 0)) : 0,
      paid,
      invoiceCount: (invoiceIdsByPayment.get(paymentId) || new Set()).size,
    };
  });

  const coveredByPlan = new Map();
  for (const row of paymentRows) {
    if (!row.planId) continue;
    coveredByPlan.set(
      row.planId,
      money((coveredByPlan.get(row.planId) || 0) + row.coveredAmount),
    );
  }

  const affectedPlanIds = unique([
    ...planIds,
    ...paymentRows.map((row) => row.planId),
  ]);
  const planResponse = affectedPlanIds.length
    ? await planModel.filter({
        where: { id: { $in: affectedPlanIds } },
        select: [
          "id",
          "contract_id",
          "phase_no",
          "phase_name",
          "planned_amount",
          "actual_paid_amount",
          "invoiced_amount",
          "status",
        ],
        currentPage: 1,
        pageSize: Math.min(affectedPlanIds.length, 1000),
      })
    : { tableData: [] };

  const planRows = [];
  for (const plan of rowsOf(planResponse)) {
    const planId = positiveInt(plan.id);
    const invoicedAmount = money(coveredByPlan.get(planId) || 0);
    const storedAmount = money(plan.invoiced_amount);
    const changed = Math.abs(invoicedAmount - storedAmount) > 0.001;
    if (changed && persist && planModel?.update) {
      await planModel.update({ id: planId, invoiced_amount: invoicedAmount });
    }
    planRows.push({
      planId,
      contractId: positiveInt(plan.contract_id),
      phaseNo: positiveInt(plan.phase_no),
      phaseName: text(plan.phase_name),
      plannedAmount: money(plan.planned_amount),
      actualPaidAmount: money(plan.actual_paid_amount),
      invoicedAmount,
      previousInvoicedAmount: storedAmount,
      updated: changed && persist,
    });
  }

  const scopedRows = contractId
    ? paymentRows.filter((row) => row.contractId === contractId)
    : paymentRows;
  const paidRows = scopedRows.filter((row) => row.paid);
  const paidAmount = money(
    paidRows.reduce((sum, row) => sum + row.amount, 0),
  );
  const paidCoveredAmount = money(
    paidRows.reduce((sum, row) => sum + Math.min(row.coveredAmount, row.amount), 0),
  );

  return {
    contractId,
    payments: paymentRows,
    plans: planRows,
    summary: {
      paymentCount: scopedRows.length,
      paidPaymentCount: paidRows.length,
      paidAmount,
      coveredAmount: money(
        scopedRows.reduce((sum, row) => sum + row.coveredAmount, 0),
      ),
      paidCoveredAmount,
      pendingInvoiceAmount: money(Math.max(paidAmount - paidCoveredAmount, 0)),
      pendingInvoicePaymentCount: paidRows.filter(
        (row) => row.pendingInvoiceAmount > 0.001,
      ).length,
    },
  };
}
