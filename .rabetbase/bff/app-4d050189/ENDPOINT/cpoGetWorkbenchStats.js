/**
 * 工作台 Dashboard：个人发起、业务金额、申请趋势、待办分布与风险概览。
 *
 * [脚本描述] 合并当前用户统计与 cpoWorkbenchDashboard 自定义 SQL 聚合结果；
 *            待办数按各流程绑定主表 flow_status=SUBMITTED 聚合（legacy biz_task 已废弃）
 * [接口路径] POST /api/endpoint/app-4d050189/cpoGetWorkbenchStats
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * {} （无入参；按当前用户上下文统计）
 *
 * [返回数据结构]
 * { actor, personal, organization, trend, workload, generatedAt }
 */
const DASHBOARD_SQL_CODE = "4d050189-a33eb743";
const TREND_BIZ_TYPES = ["expense", "contract", "payment", "invoice", "travel"];

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function lastMonthKeys(count) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - (count - 1 - index),
        1,
      ),
    );
    return date.toISOString().slice(0, 7);
  });
}

function parseOrganizationRows(rows) {
  const metrics = {};
  const workload = [];
  const trendByPeriod = Object.fromEntries(
    lastMonthKeys(6).map((period) => [
      period,
      {
        period,
        expense: 0,
        contract: 0,
        payment: 0,
        invoice: 0,
        travel: 0,
        total: 0,
      },
    ]),
  );

  for (const row of rows || []) {
    if (row.section === "metric" && row.metric_key) {
      metrics[row.metric_key] = {
        count: toNumber(row.record_count),
        amount: toNumber(row.amount),
      };
      continue;
    }

    if (row.section === "workload" && row.biz_type) {
      workload.push({
        bizType: row.biz_type,
        count: toNumber(row.record_count),
      });
      continue;
    }

    if (
      row.section === "trend" &&
      row.period &&
      trendByPeriod[row.period] &&
      TREND_BIZ_TYPES.includes(row.biz_type)
    ) {
      trendByPeriod[row.period][row.biz_type] = toNumber(row.record_count);
    }
  }

  const trend = Object.values(trendByPeriod).map((item) => ({
    ...item,
    total: TREND_BIZ_TYPES.reduce((sum, bizType) => sum + item[bizType], 0),
  }));

  return {
    organization: {
      expenseAmount30d: metrics.expense_amount_30d?.amount || 0,
      expenseCount30d: metrics.expense_amount_30d?.count || 0,
      paymentAmount30d: metrics.payment_amount_30d?.amount || 0,
      paymentCount30d: metrics.payment_amount_30d?.count || 0,
      contractAmount30d: metrics.contract_amount_30d?.amount || 0,
      contractCount30d: metrics.contract_amount_30d?.count || 0,
      pendingTaskCount: metrics.pending_tasks?.count || 0,
      overdueTaskCount: metrics.overdue_tasks?.count || 0,
      credentialRiskCount: metrics.credential_risks?.count || 0,
    },
    trend,
    workload: workload.sort((a, b) => b.count - a.count),
  };
}

async function countRunningFlows(models, map) {
  // 平台流运行中数量 = 各流程绑定主表 flow_status=SUBMITTED 之和。
  // legacy biz_task 已废弃清空，不再作为待办口径。
  const C = map.DATASET_CODES;
  const flowBoundCodes = [
    C.expenseApplication,
    C.paymentApplication,
    C.contractApplication,
    C.travelApplication,
    C.salaryPaymentApplication,
    C.invoiceApplication,
    C.crmContract,
  ];
  let count = 0;
  for (const code of flowBoundCodes) {
    const model = code && models[`dataset_${code}`];
    if (!model?.filter) continue;
    try {
      const resp = await model.filter({
        where: { flow_status: { $eq: "SUBMITTED" } },
        select: ["id"],
        currentPage: 1,
        pageSize: 1,
      });
      count +=
        resp && typeof resp.paging?.totalCount === "number"
          ? resp.paging.totalCount
          : resp?.tableData?.length || 0;
    } catch {
      // 单个数据集失败不阻塞整体
    }
  }
  return count;
}

export default async function cpoGetWorkbenchStats(params, context) {
  const actor = await context.client.bff.execute({
    scriptName: "cpoCurrentActor",
    params: {},
  });
  const map = await context.client.bff.execute({
    scriptName: "cpoDatasetMap",
    params: {},
  });
  const models = context.client.models;
  const C = map.DATASET_CODES;

  // “我发起的”只统计已进入正式流程的单据；草稿不属于业务申请统计。
  const applicantWhere = {
    $and: [
      ...(actor.userId ? [{ applicant_user_id: { $eq: actor.userId } }] : []),
      { status: { $ne: "draft" } },
    ],
  };
  const one = { currentPage: 1, pageSize: 1 };

  const [
    myExpense,
    myContract,
    myPayment,
    mySalaryPayment,
    myInvoice,
    myInvoiceApplication,
    myTravel,
    bankPending,
    salaryBankPending,
    expiring,
    organizationRows,
  ] = await Promise.all([
    models[`dataset_${C.expenseApplication}`].filter({
      where: applicantWhere,
      ...one,
    }),
    models[`dataset_${C.contractApplication}`].filter({
      where: applicantWhere,
      ...one,
    }),
    models[`dataset_${C.paymentApplication}`].filter({
      where: applicantWhere,
      ...one,
    }),
    models[`dataset_${C.salaryPaymentApplication}`].filter({
      where: applicantWhere,
      ...one,
    }),
    models[`dataset_${C.invoiceRecord}`].filter({
      where: {
        $and: [applicantWhere, { invoice_direction: { $eq: "outgoing" } }],
      },
      ...one,
    }),
    C.invoiceApplication && models[`dataset_${C.invoiceApplication}`]?.filter
      ? models[`dataset_${C.invoiceApplication}`].filter({
          where: applicantWhere,
          ...one,
        })
      : Promise.resolve({ tableData: [] }),
    models[`dataset_${C.travelApplication}`].filter({
      where: applicantWhere,
      ...one,
    }),
    models[`dataset_${C.paymentApplication}`].filter({
      where: { status: { $eq: "bank_pending" } },
      ...one,
    }),
    models[`dataset_${C.salaryPaymentApplication}`].filter({
      where: { status: { $eq: "bank_pending" } },
      ...one,
    }),
    models[`dataset_${C.companyCredential}`].filter({
      where: { status: { $eq: "expiring" } },
      ...one,
    }),
    context.client.sql.execute({ sqlCode: DASHBOARD_SQL_CODE, params: {} }),
  ]);
  const runningApprovalCount = await countRunningFlows(models, map);

  const total = (r) =>
    r && r.paging && typeof r.paging.totalCount === "number"
      ? r.paging.totalCount
      : r && r.tableData
        ? r.tableData.length
        : 0;

  const personal = {
    myTodoCount: runningApprovalCount,
    myInitiatedCount:
      total(myExpense) +
      total(myContract) +
      total(myPayment) +
      total(mySalaryPayment) +
      total(myInvoice) +
      total(myInvoiceApplication) +
      total(myTravel),
    paymentBankPendingCount: total(bankPending) + total(salaryBankPending),
    expiringCredentialCount: total(expiring),
  };
  const organizationData = parseOrganizationRows(organizationRows);
  // 全局当前待办改为平台流运行中数量（flow_status=SUBMITTED），替代已废弃的 biz_task 口径。
  organizationData.organization.pendingTaskCount = runningApprovalCount;

  return {
    ...personal,
    personal,
    actor: {
      userId: actor.userId || "",
      displayName: actor.displayName || actor.userName || "",
    },
    ...organizationData,
    generatedAt: new Date().toISOString(),
  };
}
