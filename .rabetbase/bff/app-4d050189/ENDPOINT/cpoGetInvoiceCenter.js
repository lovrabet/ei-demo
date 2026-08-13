/**
 * 发票中心：聚合发票、合同、付款、报销与交易对手关系。
 *
 * [脚本描述] 为定制发票台账提供分页、汇总、风险提示与关联单据摘要
 * [接口路径] POST /api/endpoint/app-4d050189/cpoGetInvoiceCenter
 *
 * [HTTP 请求体参数]
 * { "scope": "all|incoming|outgoing|action_required", "status": "", "purpose": "", "keyword": "", "page": 1, "pageSize": 20 }
 */

const READ_ALL_USER_CATEGORIES = [
  "workflow_admin_user",
  "application_read_all_user",
];

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function numberOf(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function unique(values) {
  return [
    ...new Set(values.map((value) => positiveInt(value, 0)).filter(Boolean)),
  ];
}

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
  if (!configured) throw new Error("CPO_INVOICE_CENTER_ACCESS_REQUIRED");
}

function comparableTime(value) {
  if (!value) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const time = new Date(String(value).replace(" ", "T")).getTime();
  return Number.isFinite(time) ? time : 0;
}

function documentPath(bizType, bizId) {
  if (bizType === "expense") {
    return `/application-detail/expense/${bizId}`;
  }
  if (bizType === "invoice_application") {
    return `/application-detail/invoice_application/${bizId}`;
  }
  if (bizType === "crm_contract") {
    return `/receivable-contract-detail/${bizId}`;
  }
  if (["payment", "contract", "invoice"].includes(bizType)) {
    return `/application-detail/${bizType}/${bizId}`;
  }
  return "";
}

function buildActionReasons(invoice, allocatedAmount, relatedDocuments) {
  const reasons = [];
  const amount = numberOf(invoice.total_amount);
  if (!text(invoice.invoice_direction)) reasons.push("未标记发票方向");
  if (!text(invoice.invoice_purpose)) reasons.push("未标记业务用途");
  if (!text(invoice.invoice_no)) reasons.push("缺少发票号码");
  if (!text(invoice.file_path)) reasons.push("缺少发票文件");
  const counterpartyName =
    text(invoice.partner_name_snapshot) ||
    (text(invoice.invoice_direction) === "outgoing"
      ? text(invoice.buyer_name)
      : text(invoice.seller_name));
  if (!positiveInt(invoice.partner_id, 0) && !counterpartyName) {
    reasons.push("交易对手名称缺失");
  }
  if (
    text(invoice.invoice_direction) === "incoming" &&
    ["procurement", "contract_payment"].includes(
      text(invoice.invoice_purpose),
    ) &&
    amount > allocatedAmount
  ) {
    reasons.push("进项发票尚未完成分摊");
  }
  if (allocatedAmount > amount + 0.005) reasons.push("分摊金额超过票面金额");
  if (!positiveInt(invoice.contract_id, 0) && !relatedDocuments.length) {
    reasons.push("尚未关联业务单据");
  }
  return reasons;
}

function buildUsageStatus(invoice, allocatedAmount, relatedDocuments) {
  const totalAmount = numberOf(invoice.total_amount);
  const activeDocuments = relatedDocuments.filter(
    (document) =>
      !["cancelled", "invalid", "rejected"].includes(text(document.status)),
  );
  const bizTypes = new Set(activeDocuments.map((document) => document.bizType));
  const fullyAllocated =
    totalAmount > 0 && allocatedAmount >= totalAmount - 0.005;
  const partiallyAllocated = allocatedAmount > 0 && !fullyAllocated;
  if (bizTypes.has("payment")) {
    return fullyAllocated
      ? { value: "payment_allocated", label: "已核销付款", tone: "success" }
      : { value: "payment_partial", label: "部分核销付款", tone: "warning" };
  }
  if (bizTypes.has("expense")) {
    return fullyAllocated
      ? { value: "expense_linked", label: "已关联报销", tone: "success" }
      : { value: "expense_partial", label: "部分关联报销", tone: "warning" };
  }
  if (fullyAllocated) {
    return { value: "allocated", label: "已完成分摊", tone: "success" };
  }
  if (partiallyAllocated) {
    return { value: "partial", label: "部分分摊", tone: "warning" };
  }
  if (bizTypes.has("contract")) {
    return {
      value: "contract_linked",
      label: "已归属合同",
      tone: "processing",
    };
  }
  if (relatedDocuments.length && !activeDocuments.length) {
    return { value: "inactive_relation", label: "原关联已失效", tone: "error" };
  }
  return { value: "unlinked", label: "待关联", tone: "default" };
}

function isBusinessActive(row) {
  if (["cancelled", "invalid"].includes(row.workflowStatus)) return false;
  if (row.workflowStatus !== "rejected") return true;
  return !["unlinked", "inactive_relation"].includes(row.usageStatus);
}

export default async function cpoGetInvoiceCenter(params, context) {
  const {
    scope = "all",
    status = "",
    purpose = "",
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
  await assertReader(actor, dictionary);

  const C = map.DATASET_CODES;
  const models = context.client.models;
  const invoiceResponse = await models[`dataset_${C.invoiceRecord}`].filter({
    currentPage: 1,
    pageSize: 1000,
    orderBy: [{ invoice_date: "desc" }, { updated_at: "desc" }, { id: "desc" }],
  });
  const invoices = rowsOf(invoiceResponse);
  const invoiceIds = unique(invoices.map((invoice) => invoice.id));
  const [linkResponse, receivableAllocationResponse, fulfillmentResponse] =
    invoiceIds.length
      ? await Promise.all([
          models[`dataset_${C.bizInvoiceLink}`].filter({
            where: {
              invoice_id: { $in: invoiceIds },
            },
            currentPage: 1,
            pageSize: 3000,
            orderBy: [{ created_at: "desc" }, { id: "desc" }],
          }),
          C.receivableInvoiceAllocation &&
          models[`dataset_${C.receivableInvoiceAllocation}`]?.filter
            ? models[`dataset_${C.receivableInvoiceAllocation}`].filter({
                where: {
                  invoice_id: { $in: invoiceIds },
                  relation_status: { $eq: "active" },
                },
                currentPage: 1,
                pageSize: 3000,
              })
            : Promise.resolve({ tableData: [] }),
          C.invoiceApplicationFulfillment &&
          models[`dataset_${C.invoiceApplicationFulfillment}`]?.filter
            ? models[`dataset_${C.invoiceApplicationFulfillment}`].filter({
                where: {
                  invoice_id: { $in: invoiceIds },
                  relation_status: { $eq: "active" },
                },
                currentPage: 1,
                pageSize: 3000,
              })
            : Promise.resolve({ tableData: [] }),
        ])
      : [{ tableData: [] }, { tableData: [] }, { tableData: [] }];
  const links = rowsOf(linkResponse);
  const receivableAllocations = rowsOf(receivableAllocationResponse);
  const fulfillments = rowsOf(fulfillmentResponse);
  const paymentIds = unique(
    links
      .filter((link) => text(link.biz_type) === "payment")
      .map((link) => link.biz_id),
  );
  const expenseItemIds = unique(
    links
      .filter((link) => text(link.biz_type) === "expense_item")
      .map((link) => link.biz_id),
  );
  const [paymentResponse, expenseItemResponse] = await Promise.all([
    paymentIds.length
      ? models[`dataset_${C.paymentApplication}`].filter({
          where: { id: { $in: paymentIds } },
          currentPage: 1,
          pageSize: Math.min(1000, paymentIds.length),
        })
      : Promise.resolve({ tableData: [] }),
    expenseItemIds.length
      ? models[`dataset_${C.expenseItem}`].filter({
          where: { id: { $in: expenseItemIds } },
          currentPage: 1,
          pageSize: Math.min(1000, expenseItemIds.length),
        })
      : Promise.resolve({ tableData: [] }),
  ]);
  const paymentRows = rowsOf(paymentResponse);
  const expenseItemRows = rowsOf(expenseItemResponse);
  const expenseIds = unique(expenseItemRows.map((item) => item.expense_id));
  const contractIds = unique([
    ...invoices.map((invoice) => invoice.contract_id),
    ...paymentRows.map((payment) => payment.contract_id),
  ]);
  const partnerIds = unique([
    ...invoices.map((invoice) => invoice.partner_id),
    ...paymentRows.map((payment) => payment.partner_id),
  ]);
  const crmContractIds = unique(
    receivableAllocations.map((allocation) => allocation.crm_contract_id),
  );
  const invoiceApplicationIds = unique(
    fulfillments.map((relation) => relation.invoice_application_id),
  );
  const [
    contractResponse,
    expenseResponse,
    partnerResponse,
    crmContractResponse,
    invoiceApplicationResponse,
  ] =
    await Promise.all([
      contractIds.length
        ? models[`dataset_${C.contractApplication}`].filter({
            where: { id: { $in: contractIds } },
            currentPage: 1,
            pageSize: Math.min(1000, contractIds.length),
          })
        : Promise.resolve({ tableData: [] }),
      expenseIds.length
        ? models[`dataset_${C.expenseApplication}`].filter({
            where: { id: { $in: expenseIds } },
            currentPage: 1,
            pageSize: Math.min(1000, expenseIds.length),
          })
        : Promise.resolve({ tableData: [] }),
      partnerIds.length
        ? models[`dataset_${C.businessPartner}`].filter({
            where: { id: { $in: partnerIds } },
            currentPage: 1,
            pageSize: Math.min(1000, partnerIds.length),
          })
        : Promise.resolve({ tableData: [] }),
      crmContractIds.length && models[`dataset_${C.crmContract}`]?.filter
        ? models[`dataset_${C.crmContract}`].filter({
            where: { id: { $in: crmContractIds } },
            currentPage: 1,
            pageSize: Math.min(1000, crmContractIds.length),
          })
        : Promise.resolve({ tableData: [] }),
      invoiceApplicationIds.length &&
      C.invoiceApplication &&
      models[`dataset_${C.invoiceApplication}`]?.filter
        ? models[`dataset_${C.invoiceApplication}`].filter({
            where: { id: { $in: invoiceApplicationIds } },
            currentPage: 1,
            pageSize: Math.min(1000, invoiceApplicationIds.length),
          })
        : Promise.resolve({ tableData: [] }),
    ]);
  const paymentById = new Map(paymentRows.map((row) => [Number(row.id), row]));
  const expenseItemById = new Map(
    expenseItemRows.map((row) => [Number(row.id), row]),
  );
  const expenseById = new Map(
    rowsOf(expenseResponse).map((row) => [Number(row.id), row]),
  );
  const contractById = new Map(
    rowsOf(contractResponse).map((row) => [Number(row.id), row]),
  );
  const partnerById = new Map(
    rowsOf(partnerResponse).map((row) => [Number(row.id), row]),
  );
  const crmContractById = new Map(
    rowsOf(crmContractResponse).map((row) => [Number(row.id), row]),
  );
  const invoiceApplicationById = new Map(
    rowsOf(invoiceApplicationResponse).map((row) => [Number(row.id), row]),
  );
  const linksByInvoiceId = new Map();
  for (const link of links) {
    const invoiceId = Number(link.invoice_id);
    if (!linksByInvoiceId.has(invoiceId)) linksByInvoiceId.set(invoiceId, []);
    linksByInvoiceId.get(invoiceId).push(link);
  }
  const receivableAllocationsByInvoiceId = new Map();
  for (const allocation of receivableAllocations) {
    const invoiceId = Number(allocation.invoice_id);
    if (!receivableAllocationsByInvoiceId.has(invoiceId)) {
      receivableAllocationsByInvoiceId.set(invoiceId, []);
    }
    receivableAllocationsByInvoiceId.get(invoiceId).push(allocation);
  }
  const fulfillmentsByInvoiceId = new Map();
  for (const relation of fulfillments) {
    const invoiceId = Number(relation.invoice_id);
    if (!fulfillmentsByInvoiceId.has(invoiceId)) {
      fulfillmentsByInvoiceId.set(invoiceId, []);
    }
    fulfillmentsByInvoiceId.get(invoiceId).push(relation);
  }

  const rows = invoices.map((invoice) => {
    const invoiceLinks = linksByInvoiceId.get(Number(invoice.id)) || [];
    const relatedDocuments = [];
    const directContract = contractById.get(Number(invoice.contract_id));
    if (directContract) {
      const contractTitle =
        text(directContract.contract_name) || text(directContract.contract_no);
      if (contractTitle) {
        relatedDocuments.push({
          key: `contract:${directContract.id}`,
          bizType: "contract",
          bizId: Number(directContract.id),
          title: contractTitle,
          status: text(
            directContract.lifecycle_status || directContract.status,
          ),
          amount: numberOf(directContract.amount),
          path: documentPath("contract", directContract.id),
          relationLabel: "关联合同",
        });
      }
    }
    for (const link of invoiceLinks) {
      if (text(link.biz_type) === "payment") {
        const payment = paymentById.get(Number(link.biz_id));
        if (payment) {
          const paymentTitle =
            text(payment.title) || text(payment.payment_phase_name);
          if (paymentTitle) {
            relatedDocuments.push({
              key: `payment:${payment.id}`,
              bizType: "payment",
              bizId: Number(payment.id),
              title: paymentTitle,
              status: text(payment.status),
              amount: numberOf(link.amount_used || payment.amount),
              path: documentPath("payment", payment.id),
              relationLabel: "付款核销",
            });
          }
        }
      }
      if (text(link.biz_type) === "expense_item") {
        const item = expenseItemById.get(Number(link.biz_id));
        const expense = expenseById.get(Number(item?.expense_id));
        if (expense) {
          const expenseTitle = text(expense.title);
          if (expenseTitle) {
            relatedDocuments.push({
              key: `expense:${expense.id}`,
              bizType: "expense",
              bizId: Number(expense.id),
              title: expenseTitle,
              status: text(expense.status),
              amount: numberOf(link.amount_used || item?.cny_amount),
              path: documentPath("expense", expense.id),
              relationLabel: "用于报销",
            });
          }
        }
      }
    }
    const invoiceReceivableAllocations =
      receivableAllocationsByInvoiceId.get(Number(invoice.id)) || [];
    for (const allocation of invoiceReceivableAllocations) {
      const crmContract = crmContractById.get(
        Number(allocation.crm_contract_id),
      );
      const contractTitle =
        text(crmContract?.title) ||
        text(crmContract?.contract_no) ||
        text(allocation.contract_title_snapshot);
      if (contractTitle) {
        relatedDocuments.push({
          key: `crm_contract:${allocation.crm_contract_id}`,
          bizType: "crm_contract",
          bizId: Number(allocation.crm_contract_id),
          title: contractTitle,
          status: text(crmContract?.status || crmContract?.sign_status),
          amount: numberOf(allocation.allocated_amount),
          path: documentPath("crm_contract", allocation.crm_contract_id),
          relationLabel: "应收开票分摊",
        });
      }
    }
    const invoiceFulfillments =
      fulfillmentsByInvoiceId.get(Number(invoice.id)) || [];
    for (const relation of invoiceFulfillments) {
      const application = invoiceApplicationById.get(
        Number(relation.invoice_application_id),
      );
      const applicationTitle =
        text(application?.application_title) ||
        text(application?.application_no) ||
        text(application?.customer_name_snapshot);
      if (applicationTitle) {
        relatedDocuments.push({
          key: `invoice_application:${application.id}`,
          bizType: "invoice_application",
          bizId: Number(application.id),
          title: applicationTitle,
          status: text(application.status),
          amount: numberOf(relation.fulfilled_amount),
          path: documentPath("invoice_application", application.id),
          relationLabel: "履约开票申请",
        });
      }
    }
    const deduplicatedDocuments = [
      ...new Map(relatedDocuments.map((item) => [item.key, item])).values(),
    ];
    const allocatedAmount =
      text(invoice.invoice_direction) === "outgoing"
        ? invoiceReceivableAllocations.reduce(
            (sum, allocation) =>
              sum + numberOf(allocation.allocated_amount),
            0,
          )
        : invoiceLinks.reduce(
            (sum, link) => sum + numberOf(link.amount_used),
            0,
          );
    const totalAmount = numberOf(invoice.total_amount);
    const actionReasons = buildActionReasons(
      invoice,
      allocatedAmount,
      deduplicatedDocuments,
    );
    const usageStatus = buildUsageStatus(
      invoice,
      allocatedAmount,
      deduplicatedDocuments,
    );
    const partner = partnerById.get(Number(invoice.partner_id));
    const partnerName =
      text(partner?.name) ||
      text(invoice.partner_name_snapshot) ||
      (text(invoice.invoice_direction) === "outgoing"
        ? text(invoice.buyer_name)
        : text(invoice.seller_name));
    return {
      id: Number(invoice.id),
      invoiceNo: text(invoice.invoice_no),
      title:
        text(invoice.invoice_title) ||
        text(invoice.invoice_no) ||
        `${partnerName || "未命名"}发票`,
      direction: text(invoice.invoice_direction),
      purpose: text(invoice.invoice_purpose),
      workflowStatus: text(invoice.status),
      workflowStatusLabel:
        dictionary?.status?.[text(invoice.status)] || text(invoice.status),
      usageStatus: usageStatus.value,
      usageStatusLabel: usageStatus.label,
      usageStatusTone: usageStatus.tone,
      totalAmount,
      allocatedAmount,
      unallocatedAmount: Math.max(totalAmount - allocatedAmount, 0),
      currency: text(invoice.currency) || "CNY",
      invoiceDate: invoice.invoice_date,
      updatedAt: invoice.updated_at,
      partnerId: positiveInt(invoice.partner_id, 0) || undefined,
      partnerName,
      sellerName: text(invoice.seller_name),
      buyerName: text(invoice.buyer_name),
      filePath: text(invoice.file_path),
      relatedDocuments: deduplicatedDocuments,
      actionReasons,
      detailPath: documentPath("invoice", invoice.id),
      sortTime: comparableTime(
        invoice.invoice_date || invoice.updated_at || invoice.created_at,
      ),
    };
  });

  const normalizedKeyword = text(keyword).toLocaleLowerCase();
  const filtered = rows
    .filter((row) => {
      if (scope === "incoming" && row.direction !== "incoming") return false;
      if (scope === "outgoing" && row.direction !== "outgoing") return false;
      if (
        scope === "action_required" &&
        (!row.actionReasons.length || !isBusinessActive(row))
      )
        return false;
      if (status && row.workflowStatus !== status) return false;
      if (purpose && row.purpose !== purpose) return false;
      if (!normalizedKeyword) return true;
      return [
        row.invoiceNo,
        row.title,
        row.partnerName,
        row.sellerName,
        row.buyerName,
        ...row.relatedDocuments.map((item) => item.title),
      ].some((value) =>
        text(value).toLocaleLowerCase().includes(normalizedKeyword),
      );
    })
    .sort((left, right) => right.sortTime - left.sortTime);
  const start = (currentPage - 1) * normalizedPageSize;
  const tableData = filtered
    .slice(start, start + normalizedPageSize)
    .map(({ sortTime, ...row }) => row);
  const activeRows = rows.filter(isBusinessActive);
  const inactiveRows = rows.filter((row) => !isBusinessActive(row));
  const summary = {
    invoiceCount: rows.length,
    activeInvoiceCount: activeRows.length,
    inactiveInvoiceCount: inactiveRows.length,
    incomingCount: rows.filter((row) => row.direction === "incoming").length,
    outgoingCount: rows.filter((row) => row.direction === "outgoing").length,
    totalAmount: activeRows.reduce((sum, row) => sum + row.totalAmount, 0),
    allocatedAmount: activeRows.reduce(
      (sum, row) => sum + row.allocatedAmount,
      0,
    ),
    unallocatedAmount: activeRows.reduce(
      (sum, row) => sum + row.unallocatedAmount,
      0,
    ),
    actionRequiredCount: activeRows.filter((row) => row.actionReasons.length)
      .length,
  };

  return {
    scope: "application_reader",
    summary,
    paging: {
      currentPage,
      pageSize: normalizedPageSize,
      totalCount: filtered.length,
    },
    tableData,
  };
}
