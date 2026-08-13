/**
 * 单据 360 可关联对象查询。
 *
 * [脚本名称] cpoListDocument360Options
 * [脚本类型] ENDPOINT
 * [接口路径] POST /api/endpoint/app-4d050189/cpoListDocument360Options
 */
const RULES = {
  payment_invoice: {
    targetBizType: "invoice",
    datasetKey: "invoiceRecord",
  },
  originates_from_quote: {
    targetBizType: "quote",
    datasetKey: "quoteHeader",
  },
  covered_by_nda: {
    targetBizType: "legal_agreement",
    datasetKey: "legalAgreement",
  },
  serves_customer: {
    targetBizType: "crm_customer",
    datasetKey: "quoteCustomer",
  },
};

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

function titleOf(rule, row) {
  if (rule.targetBizType === "invoice") {
    return (
      text(row.invoice_title) ||
      text(row.invoice_no) ||
      text(row.seller_name) ||
      "关联对象标题缺失"
    );
  }
  if (rule.targetBizType === "quote") {
    return text(row.quote_title) || text(row.quote_no) || "关联对象标题缺失";
  }
  if (rule.targetBizType === "legal_agreement") {
    return (
      text(row.agreement_title) || text(row.agreement_no) || "关联对象标题缺失"
    );
  }
  return (
    text(row.customer_name) || text(row.customer_code) || "关联对象标题缺失"
  );
}

function optionOf(rule, row, allocatedByInvoice) {
  const amount =
    rule.targetBizType === "invoice"
      ? Number(row.total_amount) || 0
      : rule.targetBizType === "quote"
        ? Number(row.total_amount) || 0
        : undefined;
  const allocatedAmount =
    rule.targetBizType === "invoice"
      ? allocatedByInvoice.get(Number(row.id)) || 0
      : undefined;
  const availableAmount =
    rule.targetBizType === "invoice"
      ? Math.max(amount - allocatedAmount, 0)
      : undefined;
  const title = titleOf(rule, row);
  const secondary = [
    text(row.invoice_no || row.quote_no || row.agreement_no),
    text(row.seller_name || row.primary_party_name_snapshot),
  ]
    .filter((item) => item && item !== title)
    .join(" · ");
  return {
    value: Number(row.id),
    label: title,
    secondary,
    bizType: rule.targetBizType,
    bizId: Number(row.id),
    status: text(row.status),
    amount,
    currency: text(row.currency || row.currency_code) || "CNY",
    allocatedAmount,
    availableAmount,
  };
}

export default async function cpoListDocument360Options(params, context) {
  const relationType = text(params?.relationType);
  const rule = RULES[relationType];
  if (!rule) {
    throw new Error(`DOCUMENT_360_RELATION_UNSUPPORTED:${relationType}`);
  }
  const keyword = text(params?.keyword).toLowerCase();
  const pageSize = Math.min(Math.max(Number(params?.pageSize) || 100, 1), 200);
  const map = await context.client.bff.execute({
    scriptName: "cpoDatasetMap",
    params: {},
  });
  const datasetCode = map.DATASET_CODES?.[rule.datasetKey];
  const model = context.client.models[`dataset_${datasetCode}`];
  if (!model?.filter) throw new Error(`MODEL_MISSING:${rule.datasetKey}`);

  const response = await model.filter({
    where:
      rule.targetBizType === "invoice"
        ? {
            invoice_direction: { $eq: "incoming" },
          }
        : {},
    currentPage: 1,
    pageSize: 200,
    orderBy: [{ updated_at: "desc" }, { id: "desc" }],
  });
  let rows = rowsOf(response);
  if (rule.targetBizType === "invoice") {
    rows = rows.filter(
      (row) =>
        !["cancelled", "rejected"].includes(text(row.status)) &&
        !["reimbursement", "customer_billing"].includes(
          text(row.invoice_purpose),
        ),
    );
  }
  if (rule.targetBizType === "legal_agreement") {
    rows = rows.filter((row) => text(row.agreement_type) === "NDA");
  }
  if (keyword) {
    rows = rows.filter((row) =>
      [
        row.invoice_title,
        row.invoice_no,
        row.seller_name,
        row.quote_title,
        row.quote_no,
        row.agreement_title,
        row.agreement_no,
        row.primary_party_name_snapshot,
        row.customer_name,
        row.customer_code,
      ]
        .map((value) => text(value).toLowerCase())
        .some((value) => value.includes(keyword)),
    );
  }
  rows = rows.slice(0, pageSize);

  const allocatedByInvoice = new Map();
  if (rule.targetBizType === "invoice" && rows.length) {
    const linkModel =
      context.client.models[`dataset_${map.DATASET_CODES.bizInvoiceLink}`];
    if (!linkModel?.filter) throw new Error("MODEL_MISSING:bizInvoiceLink");
    const links = await linkModel.filter({
      where: {
        invoice_id: { $in: rows.map((row) => Number(row.id)) },
      },
      currentPage: 1,
      pageSize: 1000,
    });
    for (const link of rowsOf(links)) {
      const invoiceId = Number(link.invoice_id);
      allocatedByInvoice.set(
        invoiceId,
        (allocatedByInvoice.get(invoiceId) || 0) +
          (Number(link.amount_used) || 0),
      );
    }
    rows = rows.filter(
      (row) =>
        Number(row.total_amount || 0) -
          (allocatedByInvoice.get(Number(row.id)) || 0) >
        0.001,
    );
  }

  const tableData = rows.map((row) => optionOf(rule, row, allocatedByInvoice));
  return {
    relationType,
    targetBizType: rule.targetBizType,
    tableData,
    paging: {
      currentPage: 1,
      pageSize,
      totalCount: tableData.length,
    },
  };
}
