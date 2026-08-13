/**
 * 收款合同详情：聚合客户、商机、联系人、收款计划、实际回款和销项发票。
 *
 * [脚本名称] cpoGetReceivableContractDetail
 * [脚本类型] ENDPOINT
 * [接口路径] POST /api/endpoint/app-4d050189/cpoGetReceivableContractDetail
 */

const INACTIVE_INVOICE_STATUSES = new Set(["rejected", "cancelled", "invalid"]);

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

function positiveId(value, field) {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) {
    throw new Error(`INVALID_PARAMS:${field}`);
  }
  return result;
}

function numberOf(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function statusLabel(status) {
  return (
    {
      PENDING: "待签署",
      IN_PROGRESS: "签署中",
      DRAFT: "草稿",
      SUBMITTED: "审批中",
      REVIEWED: "待签署",
      REJECTED: "已驳回",
      SIGNED: "已签署",
      COMPLETED: "已完成",
      CANCELLED: "已作废",
    }[text(status).toUpperCase()] ||
    text(status) ||
    "状态待补"
  );
}

function planStatusLabel(status) {
  return (
    {
      DRAFT: "待补全",
      PENDING: "待收款",
      INVOICED: "已开票",
      PARTIALLY_RECEIVED: "部分收款",
      RECEIVED: "已收款",
      NOT_REQUIRED: "无需收款",
      CANCELLED: "已取消",
    }[text(status).toUpperCase()] ||
    text(status) ||
    "状态待补"
  );
}

function workflowActionLabel(action) {
  return (
    {
      submit: "提交申请",
      review_pass: "审批通过",
      review_reject: "审批驳回",
      sign: "签署合同",
      cancel: "作废",
    }[text(action)] ||
    text(action) ||
    "流程处理"
  );
}

function workflowState(status) {
  const normalized = text(status).toLowerCase();
  if (["signed", "completed"].includes(normalized)) {
    return { status: "completed", statusLabel: "流程已完成" };
  }
  if (["cancelled", "rejected"].includes(normalized)) {
    return {
      status: "voided",
      statusLabel: normalized === "rejected" ? "审批已驳回" : "流程已作废",
    };
  }
  if (normalized === "draft") {
    return { status: "draft", statusLabel: "草稿" };
  }
  return { status: "in_progress", statusLabel: "流程进行中" };
}

export default async function cpoGetReceivableContractDetail(params, context) {
  const contractId = positiveId(params?.contractId, "contractId");
  const map = await context.client.bff.execute({
    scriptName: "cpoDatasetMap",
    params: {},
  });
  const C = map.DATASET_CODES;
  const models = context.client.models;
  const contractModel = models[`dataset_${C.crmContract}`];
  const contract = await contractModel.getOne({ id: contractId });
  if (!contract?.id) {
    throw new Error("RECEIVABLE_CONTRACT_NOT_FOUND");
  }

  const [
    company,
    opportunity,
    contactResponse,
    planResponse,
    relationResponse,
    receiptAllocationResponse,
    workflowActionResponse,
    attachmentResponse,
  ] = await Promise.all([
    models[`dataset_${C.crmCompany}`].getOne({ id: contract.company_id }),
    contract.opportunity_id
      ? models[`dataset_${C.crmOpportunity}`].getOne({
          id: contract.opportunity_id,
        })
      : Promise.resolve(null),
    models[`dataset_${C.crmContact}`].filter({
      where: { company_id: { $eq: Number(contract.company_id) } },
      currentPage: 1,
      pageSize: 500,
      orderBy: [{ is_primary: "desc" }, { updated_at: "desc" }],
    }),
    models[`dataset_${C.crmReceivablePlan}`].filter({
      where: { contract_id: { $eq: contractId } },
      currentPage: 1,
      pageSize: 500,
      orderBy: [{ phase_no: "asc" }, { id: "asc" }],
    }),
    models[`dataset_${C.bizRelation}`].filter({
      where: {
        target_biz_type: { $eq: "crm_contract" },
        target_biz_id: { $eq: contractId },
        relation_type: { $eq: "bills_crm_contract" },
        relation_status: { $eq: "active" },
      },
      select: ["source_biz_id"],
      currentPage: 1,
      pageSize: 500,
    }),
    models[`dataset_${C.customerReceiptAllocation}`].filter({
      where: {
        target_biz_type: { $eq: "crm_contract" },
        target_biz_id: { $eq: contractId },
      },
      select: ["id", "receipt_id", "allocated_amount", "currency", "remark"],
      currentPage: 1,
      pageSize: 500,
    }),
    models[`dataset_${C.bizActionRecord}`].filter({
      where: {
        biz_type: { $eq: "crm_contract" },
        biz_id: { $eq: contractId },
      },
      select: [
        "id",
        "action",
        "from_status",
        "to_status",
        "actor_name_snapshot",
        "actor_role_snapshot",
        "comment",
        "created_at",
      ],
      currentPage: 1,
      pageSize: 500,
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    }),
    models[`dataset_${C.attachment}`].filter({
      where: {
        biz_type: { $eq: "crm_contract" },
        biz_id: { $eq: contractId },
      },
      select: [
        "id",
        "attachment_type",
        "file_name",
        "file_path",
        "file_type",
        "uploaded_by",
        "created_at",
      ],
      currentPage: 1,
      pageSize: 500,
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    }),
  ]);

  const planIds = rowsOf(planResponse)
    .map((plan) => Number(plan.id))
    .filter(Boolean);
  const [invoiceAllocationResponse, planReceiptAllocationResponse] =
    await Promise.all([
      C.receivableInvoiceAllocation &&
      models[`dataset_${C.receivableInvoiceAllocation}`]?.filter
        ? models[`dataset_${C.receivableInvoiceAllocation}`].filter({
            where: {
              crm_contract_id: { $eq: contractId },
              relation_status: { $eq: "active" },
            },
            select: [
              "id",
              "invoice_id",
              "receivable_plan_id",
              "allocated_amount",
              "plan_title_snapshot",
            ],
            currentPage: 1,
            pageSize: 1000,
          })
        : Promise.resolve({ tableData: [] }),
      planIds.length
        ? models[`dataset_${C.customerReceiptAllocation}`].filter({
            where: {
              target_biz_type: { $eq: "crm_receivable_plan" },
              target_biz_id: { $in: planIds },
            },
            select: [
              "id",
              "receipt_id",
              "target_biz_id",
              "target_title_snapshot",
              "allocated_amount",
              "currency",
              "remark",
            ],
            currentPage: 1,
            pageSize: 1000,
          })
        : Promise.resolve({ tableData: [] }),
    ]);
  const invoiceAllocations = rowsOf(invoiceAllocationResponse);

  const invoiceIds = [
    ...new Set(
      [
        ...rowsOf(relationResponse).map((row) => Number(row.source_biz_id)),
        ...invoiceAllocations.map((row) => Number(row.invoice_id)),
      ].filter(Boolean),
    ),
  ].filter(Boolean);
  const invoiceResponse = invoiceIds.length
    ? await models[`dataset_${C.invoiceRecord}`].filter({
        where: { id: { $in: invoiceIds } },
        currentPage: 1,
        pageSize: Math.min(invoiceIds.length, 500),
        orderBy: [{ invoice_date: "desc" }, { id: "desc" }],
      })
    : { tableData: [] };
  const receiptAllocations = [
    ...new Map(
      [
        ...rowsOf(receiptAllocationResponse),
        ...rowsOf(planReceiptAllocationResponse),
      ].map((allocation) => [Number(allocation.id), allocation]),
    ).values(),
  ];
  const receiptIds = [
    ...new Set(
      receiptAllocations.map((allocation) => Number(allocation.receipt_id)),
    ),
  ].filter(Boolean);
  const receiptResponse = receiptIds.length
    ? await models[`dataset_${C.customerReceipt}`].filter({
        where: {
          id: { $in: receiptIds },
          status: { $eq: "confirmed" },
        },
        select: [
          "id",
          "receipt_no",
          "receipt_title",
          "customer_name_snapshot",
          "amount",
          "currency",
          "received_date",
          "date_precision",
          "receipt_method",
          "bank_reference",
          "data_quality_status",
          "remark",
        ],
        currentPage: 1,
        pageSize: Math.min(receiptIds.length, 500),
        orderBy: [{ received_date: "desc" }, { id: "desc" }],
      })
    : { tableData: [] };
  const allocationsByReceiptId = new Map();
  for (const allocation of receiptAllocations) {
    const receiptId = Number(allocation.receipt_id);
    if (!allocationsByReceiptId.has(receiptId)) {
      allocationsByReceiptId.set(receiptId, []);
    }
    allocationsByReceiptId.get(receiptId).push(allocation);
  }
  const receipts = rowsOf(receiptResponse).map((receipt) => {
    const allocations = allocationsByReceiptId.get(Number(receipt.id)) || [];
    const allocatedAmount = allocations.reduce(
      (sum, allocation) => sum + numberOf(allocation.allocated_amount),
      0,
    );
    return {
      id: Number(receipt.id),
      receiptNo: text(receipt.receipt_no) || "回款编号缺失",
      title: text(receipt.receipt_title) || "关联对象标题缺失",
      amount: numberOf(receipt.amount),
      allocatedAmount,
      currency:
        text(receipt.currency) || text(allocations[0]?.currency) || "CNY",
      receivedDate: receipt.received_date,
      datePrecision: text(receipt.date_precision) || "unknown",
      receiptMethod: text(receipt.receipt_method),
      bankReference: text(receipt.bank_reference),
      dataQualityStatus: text(receipt.data_quality_status),
      remark: text(receipt.remark) || text(allocations[0]?.remark),
      allocations: allocations.map((allocation) => ({
        id: Number(allocation.id),
        planId:
          text(allocation.target_biz_type) === "crm_receivable_plan"
            ? Number(allocation.target_biz_id)
            : null,
        planTitle: text(allocation.target_title_snapshot),
        amount: numberOf(allocation.allocated_amount),
        currency: text(allocation.currency) || "CNY",
      })),
    };
  });
  const plans = rowsOf(planResponse).map((plan) => ({
    ...plan,
    statusLabel: planStatusLabel(plan.status),
  }));
  const activePlans = plans.filter((plan) => text(plan.status) !== "CANCELLED");
  const workflowActions = rowsOf(workflowActionResponse).map((action) => ({
    id: Number(action.id),
    action: text(action.action),
    actionLabel: workflowActionLabel(action.action),
    fromStatus: text(action.from_status),
    toStatus: text(action.to_status),
    actorName: text(action.actor_name_snapshot) || "处理人信息缺失",
    actorRole: text(action.actor_role_snapshot),
    comment: text(action.comment),
    createdAt: action.created_at,
  }));
  const submittedAction = workflowActions.find(
    (action) => action.action === "submit",
  );
  const approvedAction = workflowActions.find(
    (action) => action.action === "review_pass",
  );
  const signedAction = [...workflowActions]
    .reverse()
    .find((action) => action.action === "sign");
  const currentWorkflowState = workflowState(contract.sign_status);
  const invoices = rowsOf(invoiceResponse)
    .filter((invoice) => !INACTIVE_INVOICE_STATUSES.has(text(invoice.status)))
    .map((invoice) => {
      const allocations = invoiceAllocations.filter(
        (allocation) => Number(allocation.invoice_id) === Number(invoice.id),
      );
      return {
        id: Number(invoice.id),
        title:
          text(invoice.invoice_title) ||
          text(invoice.invoice_no) ||
          "关联对象标题缺失",
        invoiceNo: text(invoice.invoice_no),
        amount: numberOf(invoice.total_amount),
        allocatedAmount: allocations.length
          ? allocations.reduce(
              (sum, allocation) => sum + numberOf(allocation.allocated_amount),
              0,
            )
          : numberOf(invoice.total_amount),
        allocations: allocations.map((allocation) => ({
          id: Number(allocation.id),
          planId: Number(allocation.receivable_plan_id),
          planTitle: text(allocation.plan_title_snapshot),
          amount: numberOf(allocation.allocated_amount),
        })),
        invoiceDate: invoice.invoice_date,
        status: text(invoice.status),
        detailPath: `/application-detail/invoice/${Number(invoice.id)}`,
      };
    });

  return {
    contract: {
      ...contract,
      id: Number(contract.id),
      companyName: text(company?.name) || "关联对象标题缺失",
      opportunityName: opportunity
        ? text(opportunity.name) || "关联对象标题缺失"
        : "",
      signStatusLabel: statusLabel(contract.sign_status),
      direction: "receivable",
    },
    company: company || null,
    opportunity: opportunity || null,
    contacts: rowsOf(contactResponse),
    plans,
    receipts,
    invoices,
    workflow: {
      ...currentWorkflowState,
      submittedAt: submittedAction?.createdAt || null,
      approvedAt: approvedAction?.createdAt || null,
      signedAt: signedAction?.createdAt || contract.signed_date || null,
      actions: workflowActions,
    },
    attachments: rowsOf(attachmentResponse).map((attachment) => ({
      id: Number(attachment.id),
      attachmentType: text(attachment.attachment_type),
      fileName: text(attachment.file_name) || "附件名称缺失",
      filePath: text(attachment.file_path),
      fileType: text(attachment.file_type),
      uploadedBy: text(attachment.uploaded_by),
      createdAt: attachment.created_at,
    })),
    summary: {
      planCount: activePlans.length,
      completedPlanCount: activePlans.filter(
        (plan) => text(plan.status) === "RECEIVED",
      ).length,
      plannedAmount: activePlans.reduce(
        (sum, plan) => sum + numberOf(plan.planned_amount),
        0,
      ),
      invoicedAmount: activePlans.reduce(
        (sum, plan) => sum + numberOf(plan.invoiced_amount),
        0,
      ),
      receiptCount: receipts.length,
      receivedAmount: receipts.reduce(
        (sum, receipt) => sum + numberOf(receipt.allocatedAmount),
        0,
      ),
      invoiceCount: invoices.length,
      invoiceAmount: invoices.reduce(
        (sum, invoice) => sum + numberOf(invoice.allocatedAmount),
        0,
      ),
      needsCompletionCount: activePlans.filter(
        (plan) => text(plan.data_quality_status) === "NEEDS_COMPLETION",
      ).length,
    },
  };
}
