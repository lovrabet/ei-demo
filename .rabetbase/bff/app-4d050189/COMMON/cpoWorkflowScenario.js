/**
 * 场景化工作流解析器（叶子 COMMON）。
 *
 * [脚本描述] 根据可信业务类型、单据方向和任务快照解析稳定 workflowKey
 * [脚本名称] cpoWorkflowScenario
 * [脚本类型] COMMON
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoWorkflowScenario.js
 *
 * @param {Object} params { bizType?, record?, task?, workflowKey?, op? }
 * @returns {Promise<{workflowKey?:string,versionNo?:number,scenario?:Object,scenarios?:Object[]}>}
 */

const SCENARIOS = [
  {
    workflowKey: "expense_reimbursement",
    label: "报销申请",
    category: "费用与付款",
    bizType: "expense",
    directionLabel: "费用报销",
    approvalRequired: true,
    executionMode: "workflow",
    configurable: true,
    completionLabel: "网银复核并提交后完成",
  },
  {
    workflowKey: "travel_request",
    label: "差旅申请",
    category: "费用与付款",
    bizType: "travel",
    directionLabel: "出行申请",
    approvalRequired: true,
    executionMode: "workflow",
    configurable: true,
    completionLabel: "审批通过后完成",
  },
  {
    workflowKey: "vendor_payment",
    label: "商务付款申请",
    category: "费用与付款",
    bizType: "payment",
    directionLabel: "对外付款",
    approvalRequired: true,
    executionMode: "workflow",
    configurable: true,
    completionLabel: "网银复核并提交后完成",
  },
  {
    workflowKey: "salary_payment",
    label: "工资付款",
    category: "费用与付款",
    bizType: "salary_payment",
    directionLabel: "工资发放",
    approvalRequired: true,
    executionMode: "workflow",
    configurable: true,
    completionLabel: "网银复核并提交后完成",
  },
  {
    workflowKey: "external_service_contract",
    label: "外部服务合同",
    category: "合同",
    bizType: "contract",
    directionLabel: "付款合同",
    approvalRequired: true,
    executionMode: "workflow",
    configurable: true,
    completionLabel: "合同签署后完成",
  },
  {
    workflowKey: "receivable_sales_contract",
    label: "对外销售合同",
    category: "合同",
    bizType: "crm_contract",
    directionLabel: "收款合同",
    approvalRequired: true,
    executionMode: "workflow",
    configurable: true,
    completionLabel: "合同签署后完成",
  },
  {
    workflowKey: "outgoing_invoice_application",
    label: "销项发票申请",
    category: "发票与收款",
    bizType: "invoice_application",
    directionLabel: "我们向客户开票",
    approvalRequired: true,
    executionMode: "workflow",
    configurable: true,
    completionLabel: "开票审核通过后完成",
  },
  {
    workflowKey: "incoming_invoice_archive",
    label: "进项发票归档",
    category: "发票与收款",
    bizType: "invoice",
    directionLabel: "供应商向我们开票",
    approvalRequired: false,
    executionMode: "direct",
    configurable: false,
    completionLabel: "校验后直接归档",
  },
  {
    workflowKey: "customer_receipt_confirmation",
    label: "客户回款确认",
    category: "发票与收款",
    bizType: "customer_receipt",
    directionLabel: "客户向我们付款",
    approvalRequired: false,
    executionMode: "managed",
    configurable: false,
    completionLabel: "财务录入并完成核销",
  },
];

const SCENARIO_BY_KEY = Object.fromEntries(
  SCENARIOS.map((scenario) => [scenario.workflowKey, scenario]),
);

const DEFAULT_BY_BIZ_TYPE = {
  expense: "expense_reimbursement",
  travel: "travel_request",
  payment: "vendor_payment",
  salary_payment: "salary_payment",
  contract: "external_service_contract",
  crm_contract: "receivable_sales_contract",
  customer_receipt: "customer_receipt_confirmation",
  invoice_application: "outgoing_invoice_application",
};

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function resolveWorkflowKey(params) {
  const taskKey = text(params?.task?.workflow_key);
  if (taskKey && SCENARIO_BY_KEY[taskKey]) return taskKey;

  const explicitKey = text(params?.workflowKey);
  if (explicitKey && SCENARIO_BY_KEY[explicitKey]) return explicitKey;

  const bizType = text(params?.bizType);
  const record = params?.record || {};
  if (bizType === "invoice") {
    return text(record.invoice_direction).toLowerCase() === "outgoing"
      ? "outgoing_invoice_application"
      : "incoming_invoice_archive";
  }
  return DEFAULT_BY_BIZ_TYPE[bizType] || "";
}

export default async function cpoWorkflowScenario(params) {
  if (params?.op === "list") {
    return { scenarios: SCENARIOS.map((scenario) => ({ ...scenario })) };
  }

  const workflowKey = resolveWorkflowKey(params || {});
  if (!workflowKey) {
    throw new Error(`WORKFLOW_SCENARIO_NOT_FOUND:${text(params?.bizType)}`);
  }
  const taskVersion = Number(params?.task?.workflow_version);
  return {
    workflowKey,
    versionNo:
      Number.isFinite(taskVersion) && taskVersion > 0 ? taskVersion : null,
    scenario: { ...SCENARIO_BY_KEY[workflowKey] },
  };
}
