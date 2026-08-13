/**
 * 我的草稿列表：跨 4 张主表查 applicant_user_id = 当前用户 + status = draft，
 *   按 bizType 合并返回，每条带编辑跳转路径。
 *
 * [脚本描述] ENDPOINT：扫 4 张主表（contract / payment / expense / invoice）后合并
 * [接口路径] POST /api/endpoint/app-4d050189/cpoGetMyDrafts
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * { "pageSize": 50 }
 *
 * [返回数据结构]
 * { tableData: [ { id, bizType, title, status, applicant_name_snapshot, applicant_user_id, amount, currency, created_at, updated_at, editPath, pageId } ] }
 *   - editPath 形如 /contract-form?id=12 /payment-form?id=7
 *   - pageId 用于前端跳转或反查详情
 *
 * 设计决策：不新加 biz_draft 表，三个主表 status='draft' 即草稿天然定义。
 */
const CONTRACT_CODE = "53869993f80f45ae8ef6cdf051d8e355";
const PAYMENT_CODE = "7da208a5059b4b13896d7c7ae29c8492";
const SALARY_PAYMENT_CODE = "235e11a9cb7945c8926b4d31fe64843f";
const EXPENSE_CODE = "7851365c96244a1896e834daec447ddb";
const INVOICE_CODE = "fc11e2d760b94b2ca2ccf0485ed40ca8";
const TRAVEL_CODE = "28494f18f334400c893576b6e168d3f6";
const CRM_CONTRACT_CODE = "804e3a5ed3224074be329b9ed4799cc3";

const EDIT_PATH = {
  contract: (id) => `/contract-form?id=${id}`,
  payment: (id) => `/payment-form?id=${id}`,
  salary_payment: (id) => `/salary-payment-form?id=${id}`,
  expense: (id) => `/expense-form?id=${id}`,
  invoice: (id) => `/invoice-form?id=${id}`,
  invoice_application: (id) => `/invoice-form?id=${id}`,
  travel: (id) => `/travel-form?id=${id}`,
  crm_contract: (id) => `/sales-contract-form?id=${id}`,
};

export default async function cpoGetMyDrafts(params, context) {
  const { pageSize = 50 } = params || {};
  const cap = Math.max(1, Math.min(Number(pageSize) || 50, 200));

  // 当前操作人（通过 cpoCurrentActor BFF 调用，符合 ENDPOINT→COMMON 规范）
  const actor = await context.client.bff.execute({
    scriptName: "cpoCurrentActor",
    params: {},
  });
  const map = await context.client.bff.execute({
    scriptName: "cpoDatasetMap",
    params: {},
  });
  const userId = actor.userId;
  if (!userId) {
    return {
      tableData: [],
      paging: { currentPage: 1, pageSize: cap, totalCount: 0 },
    };
  }

  // 并行查主表
  const where = (bizType) => {
    const base = {
      applicant_user_id: { $eq: userId },
      status: { $eq: "draft" },
    };
    return bizType === "invoice"
      ? { $and: [base, { invoice_direction: { $eq: "outgoing" } }] }
      : base;
  };

  const [
    contractResp,
    paymentResp,
    salaryPaymentResp,
    expenseResp,
    invoiceResp,
    invoiceApplicationResp,
    travelResp,
    crmContractResp,
  ] = await Promise.all([
    context.client.models[`dataset_${CONTRACT_CODE}`].filter({
      where: where("contract"),
      currentPage: 1,
      pageSize: cap,
      orderBy: [{ updated_at: "desc" }],
    }),
    context.client.models[`dataset_${PAYMENT_CODE}`].filter({
      where: where("payment"),
      currentPage: 1,
      pageSize: cap,
      orderBy: [{ updated_at: "desc" }],
    }),
    context.client.models[`dataset_${SALARY_PAYMENT_CODE}`].filter({
      where: where("salary_payment"),
      currentPage: 1,
      pageSize: cap,
      orderBy: [{ updated_at: "desc" }],
    }),
    context.client.models[`dataset_${EXPENSE_CODE}`].filter({
      where: where("expense"),
      currentPage: 1,
      pageSize: cap,
      orderBy: [{ updated_at: "desc" }],
    }),
    context.client.models[`dataset_${INVOICE_CODE}`].filter({
      where: where("invoice"),
      currentPage: 1,
      pageSize: cap,
      orderBy: [{ updated_at: "desc" }],
    }),
    map.DATASET_CODES.invoiceApplication &&
    context.client.models[`dataset_${map.DATASET_CODES.invoiceApplication}`]
      ?.filter
      ? context.client.models[
          `dataset_${map.DATASET_CODES.invoiceApplication}`
        ].filter({
          where: where("invoice_application"),
          currentPage: 1,
          pageSize: cap,
          orderBy: [{ updated_at: "desc" }],
        })
      : Promise.resolve({ tableData: [] }),
    context.client.models[`dataset_${TRAVEL_CODE}`].filter({
      where: where("travel"),
      currentPage: 1,
      pageSize: cap,
      orderBy: [{ updated_at: "desc" }],
    }),
    context.client.models[`dataset_${CRM_CONTRACT_CODE}`]?.filter
      ? context.client.models[`dataset_${CRM_CONTRACT_CODE}`].filter({
          where: {
            applicant_user_id: { $eq: userId },
            sign_status: { $eq: "draft" },
            workflow_managed: { $eq: 1 },
          },
          currentPage: 1,
          pageSize: cap,
          orderBy: [{ updated_at: "desc" }],
        })
      : Promise.resolve({ tableData: [] }),
  ]);

  const buildRow = (bizType, r) => ({
    id: Number(r.id),
    bizType,
    bizId: Number(r.id),
    title:
      bizType === "contract"
        ? r.contract_name || "合同标题缺失"
        : bizType === "crm_contract"
          ? r.title || r.contract_no || "销售合同标题缺失"
          : bizType === "invoice"
            ? r.invoice_title ||
              r.invoice_no ||
              r.partner_name_snapshot ||
              r.seller_name ||
              r.buyer_name ||
              "开票申请标题缺失"
            : bizType === "invoice_application"
              ? r.application_title ||
                r.customer_name_snapshot ||
                "销项开票申请标题缺失"
              : bizType === "travel"
                ? r.title || "差旅出行标题缺失"
                : r.title ||
                  (bizType === "expense"
                    ? "报销标题缺失"
                    : bizType === "salary_payment"
                      ? "工资付款标题缺失"
                      : "付款标题缺失"),
    status: bizType === "crm_contract" ? r.sign_status : r.status,
    applicant_name_snapshot: r.applicant_name_snapshot || "",
    applicant_user_id: r.applicant_user_id,
    amount:
      bizType === "expense"
        ? r.reimbursable_cny_amount
        : ["contract", "crm_contract"].includes(bizType)
          ? r.amount
          : bizType === "invoice"
            ? r.total_amount
            : bizType === "invoice_application"
              ? r.requested_total_amount
              : bizType === "travel"
                ? r.estimated_amount
                : r.amount,
    currency: r.currency || (bizType === "expense" ? "CNY" : ""),
    created_at: r.created_at,
    updated_at: r.updated_at,
    editPath: EDIT_PATH[bizType] ? EDIT_PATH[bizType](r.id) : null,
  });

  const all = [
    ...(contractResp.tableData || []).map((r) => buildRow("contract", r)),
    ...(paymentResp.tableData || []).map((r) => buildRow("payment", r)),
    ...(salaryPaymentResp.tableData || []).map((r) =>
      buildRow("salary_payment", r),
    ),
    ...(expenseResp.tableData || []).map((r) => buildRow("expense", r)),
    ...(invoiceResp.tableData || []).map((r) => buildRow("invoice", r)),
    ...(invoiceApplicationResp.tableData || []).map((r) =>
      buildRow("invoice_application", r),
    ),
    ...(travelResp.tableData || []).map((r) => buildRow("travel", r)),
    ...(crmContractResp.tableData || []).map((r) =>
      buildRow("crm_contract", r),
    ),
  ].sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));

  return {
    tableData: all.slice(0, cap),
    paging: { currentPage: 1, pageSize: cap, totalCount: all.length },
  };
}
