/**
 * CPO 生效报销规则读取入口。
 *
 * [脚本描述] 返回 status=active 且在生效期内的报销规则，供 Agent、前端和审批辅助读取
 * [接口路径] POST /api/endpoint/app-4d050189/cpoListEffectiveExpenseRules
 *
 * [HTTP 请求体参数]
 * {
 *   "expenseType": "travel",
 *   "category": "flight",
 *   "effectiveDate": "2026-06-22"
 * }
 *
 * [返回数据结构]
 * { tableData, total, effectiveDate, generatedAt }
 */

function optionalText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function formatDateInShanghai(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeDateText(value) {
  if (value === undefined || value === null || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateInShanghai(value);
  }
  const text = String(value).trim();
  if (/^\d{10}$/.test(text)) {
    return formatDateInShanghai(new Date(Number(text) * 1000));
  }
  if (/^\d{13}$/.test(text)) {
    return formatDateInShanghai(new Date(Number(text)));
  }
  return text.slice(0, 10);
}

function todayDateText() {
  return formatDateInShanghai(new Date());
}

function readRows(response) {
  const rows =
    response?.tableData ||
    response?.data?.tableData ||
    response?.result?.tableData ||
    response?.data?.result?.tableData ||
    [];
  return Array.isArray(rows) ? rows : [];
}

function readTotal(response, fallback) {
  const total =
    response?.total ??
    response?.data?.total ??
    response?.result?.total ??
    response?.data?.result?.total;
  const numeric = Number(total);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isEffective(row, effectiveDate) {
  const from = normalizeDateText(row.effective_from);
  const to = normalizeDateText(row.effective_to);
  return (!from || from <= effectiveDate) && (!to || to >= effectiveDate);
}

function matchesScope(row, field, requestedValue) {
  if (!requestedValue) return true;
  const value = optionalText(row[field]).toLowerCase();
  return !value || value === "all" || value === requestedValue;
}

function normalizeRule(row) {
  return {
    id: row.id,
    rule_code: optionalText(row.rule_code),
    rule_name: optionalText(row.rule_name),
    expense_type: optionalText(row.expense_type) || "all",
    category: optionalText(row.category) || "all",
    condition_text: optionalText(row.condition_text),
    calculation_type: optionalText(row.calculation_type) || "manual_review",
    reimburse_ratio:
      row.reimburse_ratio === undefined || row.reimburse_ratio === null || row.reimburse_ratio === ""
        ? null
        : Number(row.reimburse_ratio),
    limit_amount:
      row.limit_amount === undefined || row.limit_amount === null || row.limit_amount === ""
        ? null
        : Number(row.limit_amount),
    requirement_text: optionalText(row.requirement_text),
    priority: Number(row.priority) || 100,
    status: optionalText(row.status) || "active",
    effective_from: normalizeDateText(row.effective_from) || null,
    effective_to: normalizeDateText(row.effective_to) || null,
    remark: optionalText(row.remark),
  };
}

export default async function cpoListEffectiveExpenseRules(params = {}, context) {
  const bff = context.client.bff;
  const datasetMap = await bff.execute({ scriptName: "cpoDatasetMap", params: {} });
  const expenseRuleCode = datasetMap.DATASET_CODES?.expenseRule;
  if (!expenseRuleCode) throw new Error("DATASET_CODE_MISSING:expenseRule");

  const model = context.client.models[`dataset_${expenseRuleCode}`];
  if (!model?.filter) throw new Error(`MODEL_MISSING:dataset_${expenseRuleCode}`);

  const effectiveDate = normalizeDateText(params.effectiveDate) || todayDateText();
  const expenseType = optionalText(params.expenseType || params.expense_type).toLowerCase();
  const category = optionalText(params.category).toLowerCase();

  const response = await model.filter({
    where: { status: { $eq: "active" } },
    select: [
      "id",
      "rule_code",
      "rule_name",
      "expense_type",
      "category",
      "condition_text",
      "calculation_type",
      "reimburse_ratio",
      "limit_amount",
      "requirement_text",
      "priority",
      "status",
      "effective_from",
      "effective_to",
      "remark",
    ],
    orderBy: [{ priority: "asc" }, { id: "asc" }],
    currentPage: 1,
    pageSize: 500,
  });

  const tableData = readRows(response)
    .filter((row) => isEffective(row, effectiveDate))
    .filter((row) => matchesScope(row, "expense_type", expenseType))
    .filter((row) => matchesScope(row, "category", category))
    .map(normalizeRule);

  return {
    tableData,
    total: readTotal(response, tableData.length),
    effectiveDate,
    generatedAt: new Date().toISOString(),
  };
}
