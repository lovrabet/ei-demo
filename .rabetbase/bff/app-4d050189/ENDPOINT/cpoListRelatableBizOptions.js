/**
 * CPO related business object options.
 *
 * [脚本描述] 按明确业务规则列出可关联业务对象，避免任意单据盲目互联
 * [接口路径] POST /api/endpoint/app-4d050189/cpoListRelatableBizOptions
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * { "sourceBizType": "expense", "relationType": "reimburses_travel", "pageSize": 20 }
 *
 * [返回数据结构]
 * { tableData: [ { value, label, bizType, bizId, title, status } ], paging }
 */
const RELATION_RULES = {
  expense: {
    reimburses_travel: {
      targetBizType: "travel",
      status: "reviewed",
    },
  },
};

function optionalText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
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

function getRule(sourceBizType, relationType) {
  const rule = RELATION_RULES[sourceBizType]?.[relationType];
  if (!rule) {
    throw new Error(`RELATION_RULE_UNSUPPORTED:${sourceBizType}:${relationType}`);
  }
  return rule;
}

function buildTravelLabel(row) {
  const dateRange = [row.start_date, row.end_date].filter(Boolean).join(" 至 ");
  const suffix = [row.destination_city, dateRange].filter(Boolean).join(" / ");
  const title = row.title || "关联差旅标题缺失";
  return suffix ? `${title}（${suffix}）` : title;
}

function toTravelOption(row) {
  return {
    value: Number(row.id),
    label: buildTravelLabel(row),
    bizType: "travel",
    bizId: Number(row.id),
    title: row.title || "",
    status: row.status || "",
    travelType: row.travel_type || "",
    destinationCity: row.destination_city || "",
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    amount: row.estimated_amount ?? 0,
    currency: row.currency || "CNY",
  };
}

export default async function cpoListRelatableBizOptions(params, context) {
  const sourceBizType = optionalText(params?.sourceBizType);
  const relationType = optionalText(params?.relationType);
  const rule = getRule(sourceBizType, relationType);
  const pageSize = Math.min(positiveInt(params?.pageSize, 20), 100);

  const bff = context.client.bff;
  const [datasetMap, actor] = await Promise.all([
    bff.execute({ scriptName: "cpoDatasetMap", params: {} }),
    bff.execute({ scriptName: "cpoCurrentActor", params: {} }),
  ]);
  const actorUserId = optionalText(actor?.userId);
  if (!actorUserId) {
    return { tableData: [], paging: { currentPage: 1, pageSize, totalCount: 0 } };
  }

  if (rule.targetBizType !== "travel") {
    throw new Error(`RELATION_TARGET_UNSUPPORTED:${rule.targetBizType}`);
  }

  const travelCode = datasetMap.DATASET_CODES?.travelApplication;
  const travelModel = context.client.models[`dataset_${travelCode}`];
  if (!travelModel?.filter) {
    throw new Error(`MODEL_MISSING:dataset_${travelCode}`);
  }

  const response = await travelModel.filter({
    where: {
      status: { $eq: rule.status },
      applicant_user_id: { $eq: actorUserId },
    },
    currentPage: 1,
    pageSize,
    orderBy: [{ updated_at: "desc" }],
  });
  const rows = readRows(response);
  return {
    tableData: rows.map(toTravelOption),
    paging:
      response?.paging || {
        currentPage: 1,
        pageSize,
        totalCount: rows.length,
      },
  };
}
