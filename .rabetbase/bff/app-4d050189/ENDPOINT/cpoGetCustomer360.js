/**
 * 客户 360：为三栏工作台聚合客户、联系人、商机、跟进、收款合同和计划。
 *
 * 客户列表走 Custom SQL（cpoCustomer360List）：公司 LEFT JOIN 客户状态字典，
 * 并内联统计商机数/合同数/合同总额，替代原先的 3 张全表扫描 + JS 内存聚合。
 * CRM 表迁入 yuntoo-cpo 后同库 JOIN 可用。
 *
 * [脚本名称] cpoGetCustomer360
 * [脚本类型] ENDPOINT
 * [接口路径] POST /api/endpoint/app-4d050189/cpoGetCustomer360
 */

// SQL 附加的统计/关联列，构造 selectedCustomer 时必须剔除，保持与 Instant API 行结构一致
const SQL_AGG_KEYS = [
  "status_name",
  "opportunity_count",
  "contract_count",
  "contract_amount",
];

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

function numberOf(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function idsOf(values) {
  return [...new Set(values.map((value) => Number(value)).filter(Boolean))];
}

function statusLabelOf(row) {
  return (
    text(row.status_name) || text(row.status_code) || "状态待补"
  );
}

export default async function cpoGetCustomer360(params, context) {
  const bff = context.client.bff;
  const map = await bff.execute({
    scriptName: "cpoDatasetMap",
    params: {},
  });
  // cpoDal 需要 cpoDatasetMap 返回的映射；平台不允许 COMMON 互调，故由调用方传入 map
  const dal = await bff.execute({
    scriptName: "cpoDal",
    params: { map },
  });
  const normalizedKeyword = text(params?.keyword).toLocaleLowerCase();
  const [listResult, statusResponse] = await Promise.all([
    dal.sql("customer360List", { keyword: normalizedKeyword || null }),
    dal.model("crm_customer_status").filter({
      currentPage: 1,
      pageSize: 200,
    }),
  ]);
  const statuses = rowsOf(statusResponse);
  // BFF 内 sql.execute 直接返回行数组（与 cpoGetWorkbenchStats 一致）；兼容 {rows} 包装
  const companies = Array.isArray(listResult)
    ? listResult
    : Array.isArray(listResult?.rows)
      ? listResult.rows
      : [];
  const requestedCompanyId = Number(params?.companyId) || 0;
  const selected =
    companies.find((company) => Number(company.id) === requestedCompanyId) ||
    companies[0] ||
    null;
  const customerList = companies.map((company) => ({
    id: Number(company.id),
    name: text(company.name) || "关联对象标题缺失",
    industry: text(company.industry),
    statusCode: text(company.status_code),
    statusLabel: statusLabelOf(company),
    opportunityCount: numberOf(company.opportunity_count),
    contractCount: numberOf(company.contract_count),
    contractAmount: numberOf(company.contract_amount),
  }));
  if (!selected) {
    return {
      customers: customerList,
      selectedCustomer: null,
      statuses,
      contacts: [],
      opportunities: [],
      contracts: [],
      plans: [],
      receipts: [],
      followUps: [],
      summary: {},
    };
  }

  const selectedId = Number(selected.id);
  const [opportunityResponse, contractResponse] = await Promise.all([
    dal.model("crm_opportunity").filter({
      where: { company_id: { $eq: selectedId } },
      currentPage: 1,
      pageSize: 2000,
      orderBy: [{ updated_at: "desc" }, { id: "desc" }],
    }),
    dal.model("crm_contract").filter({
      where: { company_id: { $eq: selectedId } },
      currentPage: 1,
      pageSize: 2000,
      orderBy: [{ updated_at: "desc" }, { id: "desc" }],
    }),
  ]);
  const selectedOpportunities = rowsOf(opportunityResponse);
  const selectedContracts = rowsOf(contractResponse);
  const opportunityIds = idsOf(selectedOpportunities.map((row) => row.id));
  const contractIds = idsOf(selectedContracts.map((row) => row.id));
  const [contactResponse, followUpResponse, planResponse, receiptResponse] =
    await Promise.all([
      dal.model("crm_contact").filter({
        where: { company_id: { $eq: selectedId } },
        currentPage: 1,
        pageSize: 500,
        orderBy: [{ is_primary: "desc" }, { updated_at: "desc" }],
      }),
      opportunityIds.length
        ? dal.model("crm_follow_up").filter({
            where: { opportunity_id: { $in: opportunityIds } },
            currentPage: 1,
            pageSize: 1000,
            orderBy: [{ followed_at: "desc" }, { id: "desc" }],
          })
        : Promise.resolve({ tableData: [] }),
      contractIds.length
        ? dal.model("crm_contract_receivable_plan").filter({
            where: { contract_id: { $in: contractIds } },
            currentPage: 1,
            pageSize: 2000,
            orderBy: [{ planned_receipt_date: "asc" }, { phase_no: "asc" }],
          })
        : Promise.resolve({ tableData: [] }),
      dal.model("customer_receipt").filter({
        where: {
          crm_company_id: { $eq: selectedId },
          status: { $eq: "confirmed" },
        },
        select: [
          "id",
          "receipt_no",
          "receipt_title",
          "amount",
          "currency",
          "received_date",
          "date_precision",
          "data_quality_status",
          "remark",
        ],
        currentPage: 1,
        pageSize: 2000,
        orderBy: [{ received_date: "desc" }, { id: "desc" }],
      }),
    ]);
  const plans = rowsOf(planResponse);
  const rawReceipts = rowsOf(receiptResponse);
  const receiptIds = idsOf(rawReceipts.map((receipt) => receipt.id));
  const receiptAllocationResponse =
    receiptIds.length && contractIds.length
      ? await dal.model("customer_receipt_allocation").filter({
          where: {
            receipt_id: { $in: receiptIds },
            target_biz_type: { $eq: "crm_contract" },
            target_biz_id: { $in: contractIds },
          },
          select: [
            "id",
            "receipt_id",
            "target_biz_id",
            "target_title_snapshot",
            "allocated_amount",
            "currency",
          ],
          currentPage: 1,
          pageSize: 4000,
        })
      : { tableData: [] };
  const receiptAllocations = rowsOf(receiptAllocationResponse);
  const allocationsByReceiptId = new Map();
  for (const allocation of receiptAllocations) {
    const receiptId = Number(allocation.receipt_id);
    if (!allocationsByReceiptId.has(receiptId)) {
      allocationsByReceiptId.set(receiptId, []);
    }
    allocationsByReceiptId.get(receiptId).push(allocation);
  }
  const receipts = rawReceipts.map((receipt) => {
    const allocations = allocationsByReceiptId.get(Number(receipt.id)) || [];
    return {
      id: Number(receipt.id),
      receiptNo: text(receipt.receipt_no) || "回款编号缺失",
      title: text(receipt.receipt_title) || "关联对象标题缺失",
      amount: numberOf(receipt.amount),
      allocatedAmount: allocations.reduce(
        (sum, allocation) => sum + numberOf(allocation.allocated_amount),
        0,
      ),
      currency: text(receipt.currency) || "CNY",
      receivedDate: receipt.received_date,
      datePrecision: text(receipt.date_precision) || "unknown",
      dataQualityStatus: text(receipt.data_quality_status),
      remark: text(receipt.remark),
      allocations: allocations.map((allocation) => ({
        id: Number(allocation.id),
        contractId: Number(allocation.target_biz_id),
        contractTitle:
          text(allocation.target_title_snapshot) || "关联对象标题缺失",
        amount: numberOf(allocation.allocated_amount),
        currency: text(allocation.currency) || text(receipt.currency) || "CNY",
      })),
    };
  });

  const selectedStatusLabel = statusLabelOf(selected);
  const selectedBase = Object.fromEntries(
    Object.entries(selected).filter(([key]) => !SQL_AGG_KEYS.includes(key)),
  );
  // 与 Instant API 行为对齐：非空枚举字段补 <field>_label 字典
  if (selectedBase.status_code !== null && selectedBase.status_code !== undefined) {
    selectedBase.status_code_label = {
      label: selectedStatusLabel,
      value: selectedBase.status_code,
    };
  }
  if (
    selectedBase.reg_capital_unit !== null &&
    selectedBase.reg_capital_unit !== undefined
  ) {
    selectedBase.reg_capital_unit_label = {
      label: selectedBase.reg_capital_unit,
      value: selectedBase.reg_capital_unit,
    };
  }

  return {
    customers: customerList,
    statuses,
    selectedCustomer: {
      ...selectedBase,
      id: selectedId,
      statusLabel: selectedStatusLabel,
    },
    contacts: rowsOf(contactResponse),
    opportunities: selectedOpportunities,
    contracts: selectedContracts.map((contract) => ({
      ...contract,
      detailPath: `/receivable-contract-detail/${Number(contract.id)}`,
    })),
    plans,
    receipts,
    followUps: rowsOf(followUpResponse),
    summary: {
      opportunityCount: selectedOpportunities.length,
      contractCount: selectedContracts.length,
      contractAmount: selectedContracts.reduce(
        (sum, row) => sum + numberOf(row.amount),
        0,
      ),
      plannedAmount: plans
        .filter((row) => text(row.status) !== "CANCELLED")
        .reduce((sum, row) => sum + numberOf(row.planned_amount), 0),
      receiptCount: receipts.length,
      receivedAmount: receiptAllocations.reduce(
        (sum, allocation) => sum + numberOf(allocation.allocated_amount),
        0,
      ),
    },
  };
}
