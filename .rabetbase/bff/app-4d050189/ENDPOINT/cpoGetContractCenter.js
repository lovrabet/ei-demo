/**
 * 合同工作台：按合同维度聚合审批签署、付款计划、付款申请和发票信息。
 *
 * [脚本描述] 为定制合同列表提供分页、状态分组、资金进度和关联单据摘要
 * [接口路径] POST /api/endpoint/app-4d050189/cpoGetContractCenter
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * { "scope": "all|approval|pending_signature|signed|expiring|voided", "direction": "receivable|payable", "contractType": "", "keyword": "", "page": 1, "pageSize": 20 }
 *
 * [返回数据结构]
 * { scope: "application_reader", summary: {...}, scopeCounts: {...}, paging: {...}, tableData: [...] }
 */

const READ_ALL_USER_CATEGORIES = [
  "workflow_admin_user",
  "application_read_all_user",
];
const VOIDED_STATUSES = new Set(["cancelled", "invalid"]);
const SIGNED_STATUSES = new Set(["signed", "archived", "completed"]);
const INACTIVE_PAYMENT_STATUSES = new Set(["draft", "rejected", "cancelled"]);
const INACTIVE_INVOICE_STATUSES = new Set(["rejected", "cancelled", "invalid"]);
const EXPIRING_DAYS = 60;

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function numberOf(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function unique(values) {
  return [
    ...new Set(values.map((value) => positiveInt(value, 0)).filter(Boolean)),
  ];
}

// 平台回写 node_process_user 为 JSON：{ assignees: [userId...], candidateUsers, candidateGroups, tasks }
function parseApproverUserIds(raw) {
  const rawText = text(raw);
  if (!rawText) return [];
  try {
    const payload = JSON.parse(rawText);
    const assignees = Array.isArray(payload?.assignees) ? payload.assignees : [];
    const candidates = Array.isArray(payload?.candidateUsers)
      ? payload.candidateUsers
      : [];
    return [
      ...new Set(
        [...assignees, ...candidates]
          .map((value) => text(value))
          .filter(Boolean),
      ),
    ];
  } catch {
    return [];
  }
}

const PLATFORM_VOIDED_FLOWS = new Set(["REJECTED", "CANCELLED"]);

function actorIsAdmin(actor) {
  const roles = Array.isArray(actor?.roles) ? actor.roles : [actor?.roles];
  return roles.some((role) => {
    const value = text(
      typeof role === "string"
        ? role
        : role?.code || role?.name || role?.value || role?.roleCode,
    ).toLowerCase();
    return ["admin", "administrator", "super_admin", "cpo_admin"].includes(
      value,
    );
  });
}

async function assertReader(actor, dictionary) {
  if (actorIsAdmin(actor)) return;
  const userId = text(actor?.userId);
  if (!userId) throw new Error("CPO_ACTOR_MISSING");
  const configured = READ_ALL_USER_CATEGORIES.some((category) =>
    Object.prototype.hasOwnProperty.call(dictionary?.[category] || {}, userId),
  );
  if (!configured) throw new Error("CPO_CONTRACT_CENTER_ACCESS_REQUIRED");
}

function timeOf(value) {
  if (!value) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const valueTime = new Date(String(value).replace(" ", "T")).getTime();
  return Number.isFinite(valueTime) ? valueTime : 0;
}

function normalizeContractDirection(direction, contractType) {
  const value = text(direction);
  if (["receivable", "outbound", "outgoing", "income"].includes(value)) {
    return "receivable";
  }
  if (["payable", "inbound", "incoming", "expense"].includes(value)) {
    return "payable";
  }
  // contract_application 只承载付款合同；收款合同统一来自客户合同主档。
  // 历史 sales 值不能再被推断成另一份收款合同，否则同一合同会重复展示。
  return "payable";
}

function isVoided(row) {
  return (
    VOIDED_STATUSES.has(text(row.workflowStatus)) ||
    PLATFORM_VOIDED_FLOWS.has(text(row.flowStatus).toUpperCase()) ||
    text(row.instanceStatus).toUpperCase() === "CANCELLED"
  );
}

function isSigned(row) {
  return (
    text(row.lifecycleStatus) === "signed" ||
    SIGNED_STATUSES.has(text(row.workflowStatus))
  );
}

// 平台流主单：审批态以 flow_status 为准（SUBMITTED 审批中、COMPLETED 通过、REJECTED/CANCELLED 废弃）
function platformApprovalState(row) {
  if (PLATFORM_VOIDED_FLOWS.has(text(row.flowStatus).toUpperCase()) ||
      text(row.instanceStatus).toUpperCase() === "CANCELLED") {
    return "voided";
  }
  if (text(row.flowStatus).toUpperCase() === "SUBMITTED") return "approval";
  if (text(row.flowStatus).toUpperCase() === "COMPLETED") {
    if (isSigned(row)) return "signed";
    if (text(row.lifecycleStatus) === "pending_signature" ||
        text(row.workflowStatus) === "reviewed") {
      return "pending_signature";
    }
    return "signed";
  }
  return "";
}

function isPendingSignature(row) {
  if (isVoided(row) || isSigned(row)) return false;
  if (text(row.flowStatus)) {
    return platformApprovalState(row) === "pending_signature";
  }
  return (
    text(row.currentTaskType) === "sign" ||
    text(row.lifecycleStatus) === "pending_signature" ||
    text(row.workflowStatus) === "reviewed"
  );
}

function isApproval(row) {
  if (isVoided(row) || isSigned(row)) return false;
  if (text(row.flowStatus)) {
    return platformApprovalState(row) === "approval";
  }
  return (
    text(row.currentTaskType) === "review" ||
    ["submitted", "rejected"].includes(text(row.workflowStatus))
  );
}

function isExpiring(row, now) {
  if (!isSigned(row)) return false;
  const end = timeOf(row.endDate);
  if (!end) return false;
  const limit = now + EXPIRING_DAYS * 24 * 60 * 60 * 1000;
  return end >= now && end <= limit;
}

function matchesScope(row, scope, now) {
  if (scope === "approval") return isApproval(row);
  if (scope === "pending_signature") return isPendingSignature(row);
  if (scope === "signed") return isSigned(row) && !isVoided(row);
  if (scope === "expiring") return isExpiring(row, now);
  if (scope === "voided") return isVoided(row);
  return true;
}

function addToMapList(map, key, row) {
  const normalizedKey = positiveInt(key, 0);
  if (!normalizedKey) return;
  if (!map.has(normalizedKey)) map.set(normalizedKey, []);
  map.get(normalizedKey).push(row);
}

function earliestPendingPlan(plans) {
  return plans
    .filter(
      (plan) =>
        !["paid", "cancelled", "not_required"].includes(text(plan.status)),
    )
    .sort((left, right) => {
      const leftTime = timeOf(left.planned_pay_date) || Number.MAX_SAFE_INTEGER;
      const rightTime =
        timeOf(right.planned_pay_date) || Number.MAX_SAFE_INTEGER;
      return (
        leftTime - rightTime ||
        numberOf(left.phase_no) - numberOf(right.phase_no)
      );
    })[0];
}

function earliestPendingReceivablePlan(plans) {
  return plans
    .filter(
      (plan) =>
        !["RECEIVED", "CANCELLED", "NOT_REQUIRED"].includes(
          text(plan.status).toUpperCase(),
        ),
    )
    .sort((left, right) => {
      const leftTime =
        timeOf(left.planned_receipt_date) || Number.MAX_SAFE_INTEGER;
      const rightTime =
        timeOf(right.planned_receipt_date) || Number.MAX_SAFE_INTEGER;
      return (
        leftTime - rightTime ||
        numberOf(left.phase_no) - numberOf(right.phase_no)
      );
    })[0];
}

function crmContractState(signStatus) {
  const status = text(signStatus).toUpperCase();
  if (status === "DRAFT") {
    return {
      workflowStatus: "draft",
      lifecycleStatus: "draft",
      statusLabel: "草稿",
    };
  }
  if (status === "SUBMITTED") {
    return {
      workflowStatus: "submitted",
      lifecycleStatus: "approval",
      statusLabel: "审批中",
    };
  }
  if (status === "REJECTED") {
    return {
      workflowStatus: "rejected",
      lifecycleStatus: "rejected",
      statusLabel: "已驳回",
    };
  }
  if (status === "REVIEWED") {
    return {
      workflowStatus: "reviewed",
      lifecycleStatus: "pending_signature",
      statusLabel: "待签署",
    };
  }
  if (status === "CANCELLED") {
    return {
      workflowStatus: "cancelled",
      lifecycleStatus: "cancelled",
      statusLabel: "已作废",
    };
  }
  if (["SIGNED", "COMPLETED"].includes(status)) {
    return {
      workflowStatus: status === "COMPLETED" ? "completed" : "signed",
      lifecycleStatus: "signed",
      statusLabel: status === "COMPLETED" ? "已完成" : "已签署",
    };
  }
  return {
    workflowStatus: "reviewed",
    lifecycleStatus: "pending_signature",
    statusLabel: status === "IN_PROGRESS" ? "签署中" : "待签署",
  };
}

export default async function cpoGetContractCenter(params, context) {
  const {
    scope = "all",
    direction = "",
    contractType = "",
    keyword = "",
    page = 1,
    pageSize = 20,
  } = params || {};
  const currentPage = positiveInt(page, 1);
  const normalizedPageSize = Math.min(positiveInt(pageSize, 20), 100);
  const bff = context.client.bff;
  const [map, dictionary, actor] = await Promise.all([
    bff.execute({ scriptName: "cpoDatasetMap", params: {} }),
    bff.execute({ scriptName: "cpoDictionary", params: {} }),
    bff.execute({ scriptName: "cpoCurrentActor", params: {} }),
  ]);
  // cpoDal 需要 cpoDatasetMap 返回的映射；平台不允许 COMMON 互调，故由调用方传入 map
  const dal = await bff.execute({
    scriptName: "cpoDal",
    params: { map },
  });
  await assertReader(actor, dictionary);

  // CRM 收款合同走 Custom SQL（同库 LEFT JOIN crm_company 取 company_name），
  // 替代原先 crmContract filter + crmCompany 全表扫描两次调用
  const [contractResponse, crmContractResult] = await Promise.all([
    dal.model("contract_application").filter({
      select: [
        "id",
        "contract_no",
        "contract_name",
        "contract_type",
        "direction",
        "our_role",
        "partner_id",
        "amount",
        "currency",
        "start_date",
        "end_date",
        "signed_at",
        "status",
        "lifecycle_status",
        "lifecycle_updated_at",
        "applicant_name_snapshot",
        "liaison_name_snapshot",
        "submitted_at",
        "created_at",
        "updated_at",
        "process_instance_id",
        "instance_status",
        "flow_status",
        "running_node",
        "node_process_user",
      ],
      currentPage: 1,
      pageSize: 1000,
      orderBy: [{ updated_at: "desc" }, { id: "desc" }],
    }),
    dal.sql("contractCenterCrmContracts", {}),
  ]);
  const contracts = rowsOf(contractResponse);
  const crmContracts = Array.isArray(crmContractResult)
    ? crmContractResult
    : Array.isArray(crmContractResult?.rows)
      ? crmContractResult.rows
      : [];
  const contractIds = unique(contracts.map((contract) => contract.id));
  const partnerIds = unique(contracts.map((contract) => contract.partner_id));

  const [partnerResponse, planResponse, paymentResponse] = await Promise.all([
    partnerIds.length
      ? dal.model("business_partner").filter({
          where: { id: { $in: partnerIds } },
          select: ["id", "name"],
          currentPage: 1,
          pageSize: Math.min(partnerIds.length, 1000),
        })
      : Promise.resolve({ tableData: [] }),
    contractIds.length
      ? dal.model("contract_payment_plan").filter({
          where: {
            contract_id: { $in: contractIds },
          },
          currentPage: 1,
          pageSize: 3000,
          orderBy: [{ phase_no: "asc" }, { id: "asc" }],
        })
      : Promise.resolve({ tableData: [] }),
    contractIds.length
      ? dal.model("payment_application").filter({
          where: {
            contract_id: { $in: contractIds },
          },
          select: [
            "id",
            "contract_id",
            "payment_plan_id",
            "title",
            "amount",
            "currency",
            "status",
            "bank_status",
            "payment_phase_name",
            "updated_at",
          ],
          currentPage: 1,
          pageSize: 3000,
        })
      : Promise.resolve({ tableData: [] }),
  ]);

  const partnerById = new Map(
    rowsOf(partnerResponse).map((row) => [Number(row.id), row]),
  );
  const plansByContract = new Map();
  for (const plan of rowsOf(planResponse)) {
    addToMapList(plansByContract, plan.contract_id, plan);
  }
  const payments = rowsOf(paymentResponse);
  const paymentsByContract = new Map();
  for (const payment of payments) {
    addToMapList(paymentsByContract, payment.contract_id, payment);
  }

  const paymentIds = unique(payments.map((payment) => payment.id));
  const [directInvoiceResponse, invoiceLinkResponse] = await Promise.all([
    contractIds.length
      ? dal.model("invoice_record").filter({
          where: {
            contract_id: { $in: contractIds },
          },
          currentPage: 1,
          pageSize: 3000,
        })
      : Promise.resolve({ tableData: [] }),
    contractIds.length || paymentIds.length
      ? dal.model("biz_invoice_link").filter({
          where: {
            $or: [
              ...(contractIds.length
                ? [
                    {
                      biz_type: { $eq: "contract" },
                      biz_id: { $in: contractIds },
                    },
                  ]
                : []),
              ...(paymentIds.length
                ? [
                    {
                      biz_type: { $eq: "payment" },
                      biz_id: { $in: paymentIds },
                    },
                  ]
                : []),
            ],
          },
          currentPage: 1,
          pageSize: 5000,
        })
      : Promise.resolve({ tableData: [] }),
  ]);
  const invoiceLinks = rowsOf(invoiceLinkResponse);
  const linkedInvoiceIds = unique(invoiceLinks.map((link) => link.invoice_id));
  const directInvoices = rowsOf(directInvoiceResponse);
  const directInvoiceIds = new Set(
    directInvoices.map((invoice) => Number(invoice.id)),
  );
  const missingInvoiceIds = linkedInvoiceIds.filter(
    (id) => !directInvoiceIds.has(id),
  );
  const linkedInvoiceResponse = missingInvoiceIds.length
    ? await dal.model("invoice_record").filter({
        where: { id: { $in: missingInvoiceIds } },
        currentPage: 1,
        pageSize: Math.min(missingInvoiceIds.length, 3000),
      })
    : { tableData: [] };
  const invoiceById = new Map(
    [...directInvoices, ...rowsOf(linkedInvoiceResponse)].map((invoice) => [
      Number(invoice.id),
      invoice,
    ]),
  );
  const crmContractIds = unique(crmContracts.map((contract) => contract.id));
  const [
    crmInvoiceRelationResponse,
    crmPlanResponse,
    crmReceiptAllocationResponse,
    crmFlowResponse,
  ] = await Promise.all([
    crmContractIds.length
      ? dal.model("biz_relation").filter({
          where: {
            target_biz_type: { $eq: "crm_contract" },
            target_biz_id: { $in: crmContractIds },
            relation_type: { $eq: "bills_crm_contract" },
            relation_status: { $eq: "active" },
          },
          select: ["source_biz_id", "target_biz_id"],
          currentPage: 1,
          pageSize: 3000,
        })
      : Promise.resolve({ tableData: [] }),
    crmContractIds.length
      ? dal.model("crm_contract_receivable_plan").filter({
          where: { contract_id: { $in: crmContractIds } },
          currentPage: 1,
          pageSize: 5000,
          orderBy: [{ phase_no: "asc" }, { id: "asc" }],
        })
      : Promise.resolve({ tableData: [] }),
    crmContractIds.length
      ? dal.model("customer_receipt_allocation").filter({
          where: {
            target_biz_type: { $eq: "crm_contract" },
            target_biz_id: { $in: crmContractIds },
          },
          select: [
            "id",
            "receipt_id",
            "target_biz_id",
            "allocated_amount",
            "currency",
          ],
          currentPage: 1,
          pageSize: 5000,
        })
      : Promise.resolve({ tableData: [] }),
    crmContractIds.length
      ? dal.model("crm_contract").filter({
          where: { id: { $in: crmContractIds } },
          select: [
            "id",
            "process_instance_id",
            "instance_status",
            "flow_status",
            "running_node",
            "node_process_user",
          ],
          currentPage: 1,
          pageSize: Math.min(crmContractIds.length, 1000),
        })
      : Promise.resolve({ tableData: [] }),
  ]);
  const crmFlowById = new Map();
  for (const row of rowsOf(crmFlowResponse)) {
    crmFlowById.set(Number(row.id), row);
  }
  const crmInvoiceRelations = rowsOf(crmInvoiceRelationResponse);
  const crmInvoiceIds = unique(
    crmInvoiceRelations.map((relation) => relation.source_biz_id),
  );
  const crmInvoiceResponse = crmInvoiceIds.length
    ? await dal.model("invoice_record").filter({
        where: { id: { $in: crmInvoiceIds } },
        currentPage: 1,
        pageSize: Math.min(crmInvoiceIds.length, 3000),
      })
    : { tableData: [] };
  const crmInvoiceById = new Map(
    rowsOf(crmInvoiceResponse).map((invoice) => [Number(invoice.id), invoice]),
  );
  const crmInvoiceIdsByContract = new Map();
  for (const relation of crmInvoiceRelations) {
    addToMapList(
      crmInvoiceIdsByContract,
      relation.target_biz_id,
      Number(relation.source_biz_id),
    );
  }
  const crmPlansByContract = new Map();
  for (const plan of rowsOf(crmPlanResponse)) {
    addToMapList(crmPlansByContract, plan.contract_id, plan);
  }
  const crmReceiptAllocations = rowsOf(crmReceiptAllocationResponse);
  const crmReceiptIds = unique(
    crmReceiptAllocations.map((allocation) => allocation.receipt_id),
  );
  const crmReceiptResponse = crmReceiptIds.length
    ? await dal.model("customer_receipt").filter({
        where: {
          id: { $in: crmReceiptIds },
          status: { $eq: "confirmed" },
        },
        select: [
          "id",
          "receipt_no",
          "receipt_title",
          "received_date",
          "date_precision",
          "data_quality_status",
        ],
        currentPage: 1,
        pageSize: Math.min(crmReceiptIds.length, 5000),
      })
    : { tableData: [] };
  const crmReceiptById = new Map(
    rowsOf(crmReceiptResponse).map((receipt) => [Number(receipt.id), receipt]),
  );
  const crmReceiptAllocationsByContract = new Map();
  for (const allocation of crmReceiptAllocations) {
    if (!crmReceiptById.has(Number(allocation.receipt_id))) continue;
    addToMapList(
      crmReceiptAllocationsByContract,
      allocation.target_biz_id,
      allocation,
    );
  }
  const paymentContractById = new Map(
    payments.map((payment) => [
      Number(payment.id),
      Number(payment.contract_id),
    ]),
  );
  const invoiceIdsByContract = new Map();
  for (const invoice of directInvoices) {
    addToMapList(invoiceIdsByContract, invoice.contract_id, Number(invoice.id));
  }
  for (const link of invoiceLinks) {
    const linkType = text(link.biz_type);
    const contractId =
      linkType === "contract"
        ? Number(link.biz_id)
        : linkType === "payment"
          ? paymentContractById.get(Number(link.biz_id))
          : 0;
    addToMapList(invoiceIdsByContract, contractId, Number(link.invoice_id));
  }

  const now = Date.now();
  const cpoRows = contracts.map((contract) => {
    const contractId = Number(contract.id);
    const partner = partnerById.get(Number(contract.partner_id));
    const plans = plansByContract.get(contractId) || [];
    const activePlans = plans.filter(
      (plan) => text(plan.status) !== "cancelled",
    );
    const contractPayments = (paymentsByContract.get(contractId) || []).filter(
      (payment) => !INACTIVE_PAYMENT_STATUSES.has(text(payment.status)),
    );
    const paidPayments = contractPayments.filter(
      (payment) =>
        text(payment.status) === "paid_confirmed" ||
        text(payment.bank_status) === "paid_confirmed",
    );
    const invoiceIds = [...new Set(invoiceIdsByContract.get(contractId) || [])];
    const invoices = invoiceIds
      .map((id) => invoiceById.get(Number(id)))
      .filter(
        (invoice) =>
          invoice && !INACTIVE_INVOICE_STATUSES.has(text(invoice.status)),
      );
    const flow = contract.process_instance_id
      ? {
          processInstanceId: text(contract.process_instance_id),
          flowStatus: text(contract.flow_status),
          instanceStatus: text(contract.instance_status),
          runningNode: text(contract.running_node),
          approverUserIds: parseApproverUserIds(contract.node_process_user),
        }
      : {
          processInstanceId: "",
          flowStatus: "",
          instanceStatus: "",
          runningNode: "",
          approverUserIds: [],
        };
    const nextPlan = earliestPendingPlan(activePlans);
    const plannedAmount = activePlans.reduce(
      (sum, plan) => sum + numberOf(plan.planned_amount),
      0,
    );
    const paidAmount = paidPayments.reduce(
      (sum, payment) => sum + numberOf(payment.amount),
      0,
    );
    const invoiceAmount = invoices.reduce(
      (sum, invoice) => sum + numberOf(invoice.total_amount),
      0,
    );
    const workflowStatus = text(contract.status);
    const lifecycleStatus = text(contract.lifecycle_status);
    return {
      id: contractId,
      contractNo: text(contract.contract_no),
      contractName:
        text(contract.contract_name) ||
        text(contract.contract_no) ||
        "关联对象标题缺失",
      contractType: text(contract.contract_type),
      contractTypeLabel:
        dictionary?.contract_type?.[text(contract.contract_type)] ||
        text(contract.contract_type),
      direction: normalizeContractDirection(
        contract.direction,
        contract.contract_type,
      ),
      source: "cpo",
      sourceLabel: "供应商合同",
      ourRole: text(contract.our_role),
      partnerName: text(partner?.name) || "关联对象标题缺失",
      amount: numberOf(contract.amount),
      currency: text(contract.currency) || "CNY",
      startDate: contract.start_date,
      endDate: contract.end_date,
      signedAt: contract.signed_at,
      workflowStatus,
      workflowStatusLabel:
        dictionary?.status?.[workflowStatus] || workflowStatus,
      lifecycleStatus,
      paymentRequirement: text(contract.payment_requirement) || "unknown",
      paymentRequirementLabel: {
        required: "需要付款",
        not_required: "无需付款",
        unknown: "待确认",
      }[text(contract.payment_requirement) || "unknown"],
      applicantName: text(contract.applicant_name_snapshot),
      liaisonName: text(contract.liaison_name_snapshot),
      submittedAt: contract.submitted_at,
      updatedAt:
        contract.lifecycle_updated_at ||
        contract.updated_at ||
        contract.created_at,
      ...flow,
      currentTaskId: undefined,
      currentTaskType: "",
      currentTaskTitle: flow.runningNode,
      currentProcessorName: "",
      currentProcessorRole: "",
      planCount: activePlans.length,
      expectedPlanCount: activePlans.length,
      paidPlanCount: activePlans.filter((plan) => text(plan.status) === "paid")
        .length,
      plannedAmount,
      paymentCount: contractPayments.length,
      paidPaymentCount: paidPayments.length,
      paidAmount,
      invoiceCount: invoices.length,
      invoiceAmount,
      nextPaymentDate: nextPlan?.planned_pay_date,
      nextPaymentName: text(nextPlan?.phase_name),
      overduePayment:
        Boolean(nextPlan?.planned_pay_date) &&
        timeOf(nextPlan.planned_pay_date) < now,
      detailPath: `/application-detail/contract/${contractId}`,
      sortTime: timeOf(
        contract.lifecycle_updated_at ||
          contract.updated_at ||
          contract.submitted_at ||
          contract.created_at,
      ),
    };
  });
  const crmRows = crmContracts.map((contract) => {
    const state = crmContractState(contract.sign_status);
    const companyName = contract.company_name;
    const invoices = [
      ...new Set(crmInvoiceIdsByContract.get(Number(contract.id)) || []),
    ]
      .map((invoiceId) => crmInvoiceById.get(Number(invoiceId)))
      .filter(
        (invoice) =>
          invoice && !INACTIVE_INVOICE_STATUSES.has(text(invoice.status)),
      );
    const plans = (crmPlansByContract.get(Number(contract.id)) || []).filter(
      (plan) => text(plan.status).toUpperCase() !== "CANCELLED",
    );
    const receiptAllocations =
      crmReceiptAllocationsByContract.get(Number(contract.id)) || [];
    const plannedAmount = plans.reduce(
      (sum, plan) => sum + numberOf(plan.planned_amount),
      0,
    );
    const receivedAmount = receiptAllocations.reduce(
      (sum, allocation) => sum + numberOf(allocation.allocated_amount),
      0,
    );
    const fullyReceived =
      numberOf(contract.amount) > 0 &&
      receivedAmount + 0.001 >= numberOf(contract.amount);
    const nextPlan = fullyReceived
      ? null
      : earliestPendingReceivablePlan(plans);
    const receiptCount = new Set(
      receiptAllocations.map((allocation) => Number(allocation.receipt_id)),
    ).size;
    const crmFlow = crmFlowById.get(Number(contract.id));
    const flow = crmFlow?.process_instance_id
      ? {
          processInstanceId: text(crmFlow.process_instance_id),
          flowStatus: text(crmFlow.flow_status),
          instanceStatus: text(crmFlow.instance_status),
          runningNode: text(crmFlow.running_node),
          approverUserIds: parseApproverUserIds(crmFlow.node_process_user),
        }
      : {
          processInstanceId: "",
          flowStatus: "",
          instanceStatus: "",
          runningNode: "",
          approverUserIds: [],
        };
    return {
      id: Number(contract.id),
      contractNo: text(contract.contract_no),
      contractName:
        text(contract.title) ||
        text(contract.contract_no) ||
        "关联对象标题缺失",
      contractType: "service",
      contractTypeLabel: "客户服务",
      direction: "receivable",
      source: "crm",
      sourceLabel: "客户合同",
      ourRole: "service_provider",
      partnerName: text(companyName) || "关联对象标题缺失",
      amount: numberOf(contract.amount),
      currency: text(contract.currency) || "CNY",
      startDate: contract.start_date,
      endDate: contract.end_date,
      signedAt: contract.signed_date,
      workflowStatus: state.workflowStatus,
      workflowStatusLabel: state.statusLabel,
      lifecycleStatus: state.lifecycleStatus,
      applicantName: text(contract.applicant_name_snapshot),
      submittedAt: contract.submitted_at || contract.created_at,
      updatedAt: contract.updated_at || contract.created_at,
      ...flow,
      currentTaskId: undefined,
      currentTaskType: "",
      currentTaskTitle: flow.runningNode,
      currentProcessorName: "",
      currentProcessorRole: "",
      planCount: plans.length,
      expectedPlanCount: numberOf(contract.payment_periods),
      paidPlanCount: plans.filter(
        (plan) => text(plan.status).toUpperCase() === "RECEIVED",
      ).length,
      plannedAmount,
      paymentCount: 0,
      paidPaymentCount: 0,
      paidAmount: receivedAmount,
      receivedAmount,
      receiptCount,
      fullyReceived,
      invoicedPlanAmount: plans.reduce(
        (sum, plan) => sum + numberOf(plan.invoiced_amount),
        0,
      ),
      invoiceCount: invoices.length,
      invoiceAmount: invoices.reduce(
        (sum, invoice) => sum + numberOf(invoice.total_amount),
        0,
      ),
      nextPaymentDate: nextPlan?.planned_receipt_date,
      nextPaymentName: fullyReceived
        ? "已全额收款"
        : text(nextPlan?.phase_name),
      overduePayment:
        Boolean(nextPlan?.planned_receipt_date) &&
        timeOf(nextPlan.planned_receipt_date) < now,
      detailPath: `/receivable-contract-detail/${Number(contract.id)}`,
      sortTime: timeOf(contract.updated_at || contract.created_at),
    };
  });
  const rows = [...cpoRows, ...crmRows];

  const normalizedKeyword = text(keyword).toLocaleLowerCase();
  const normalizedContractType = text(contractType);
  const normalizedDirection = text(direction);
  const searchedRows = rows.filter((row) => {
    if (normalizedDirection && row.direction !== normalizedDirection) {
      return false;
    }
    if (normalizedContractType && row.contractType !== normalizedContractType) {
      return false;
    }
    if (!normalizedKeyword) return true;
    return [
      row.contractName,
      row.contractNo,
      row.partnerName,
      row.applicantName,
      row.liaisonName,
    ].some((value) =>
      text(value).toLocaleLowerCase().includes(normalizedKeyword),
    );
  });
  const scopeCounts = {
    all: searchedRows.length,
    approval: searchedRows.filter((row) => isApproval(row)).length,
    pendingSignature: searchedRows.filter((row) => isPendingSignature(row))
      .length,
    signed: searchedRows.filter((row) => isSigned(row) && !isVoided(row))
      .length,
    expiring: searchedRows.filter((row) => isExpiring(row, now)).length,
    voided: searchedRows.filter((row) => isVoided(row)).length,
  };
  const filtered = searchedRows
    .filter((row) => matchesScope(row, text(scope), now))
    .sort((left, right) => right.sortTime - left.sortTime);
  const start = (currentPage - 1) * normalizedPageSize;
  const tableData = filtered
    .slice(start, start + normalizedPageSize)
    .map(({ sortTime, ...row }) => row);
  // 汇总跟随业务方向、类型和关键词筛选，避免两个合同工作区的数字混算。
  const activeRows = searchedRows.filter(
    (row) => !isVoided(row) && text(row.workflowStatus) !== "draft",
  );
  const amountsByCurrency = activeRows.reduce((result, row) => {
    const currency = text(row.currency) || "CNY";
    result[currency] = numberOf(result[currency]) + row.amount;
    return result;
  }, {});
  const summary = {
    contractCount: activeRows.length,
    amountsByCurrency,
    receivableCount: activeRows.filter((row) => row.direction === "receivable")
      .length,
    payableCount: activeRows.filter((row) => row.direction === "payable")
      .length,
    pendingSignatureCount: rows.filter((row) => isPendingSignature(row)).length,
    overduePaymentCount: activeRows.filter((row) => row.overduePayment).length,
  };

  return {
    scope: "application_reader",
    summary,
    scopeCounts,
    paging: {
      currentPage,
      pageSize: normalizedPageSize,
      totalCount: filtered.length,
    },
    tableData,
  };
}
