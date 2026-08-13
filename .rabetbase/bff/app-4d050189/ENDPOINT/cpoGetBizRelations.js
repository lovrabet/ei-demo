/**
 * CPO business object relation query.
 *
 * [脚本描述] 查询源业务对象的有效关系；先校验源单据读取权限
 * [接口路径] POST /api/endpoint/app-4d050189/cpoGetBizRelations
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * { "bizType": "expense", "bizId": 123, "relationType": "reimburses_travel" }
 *
 * [返回数据结构]
 * { tableData: [biz_relation row], paging }
 */
function optionalText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeBizId(value) {
  const numericId = Number(value);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new Error("INVALID_PARAMS:bizId must be a positive number");
  }
  return numericId;
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

export default async function cpoGetBizRelations(params, context) {
  const bizType = optionalText(params?.bizType);
  const bizId = normalizeBizId(params?.bizId);
  const relationType = optionalText(params?.relationType);
  if (!bizType) throw new Error("INVALID_PARAMS:bizType is required");

  const bff = context.client.bff;
  const datasetMap = await bff.execute({
    scriptName: "cpoDatasetMap",
    params: {},
  });
  const meta = datasetMap.BIZ_TYPE_TO_DATASET[bizType];
  if (!meta) throw new Error(`INVALID_BIZ_TYPE:${bizType}`);

  const { record } = await bff.execute({
    scriptName: "cpoBizResolver",
    params: { bizType, bizId, meta },
  });
  await bff.execute({
    scriptName: "cpoApplicationReadOneGuard",
    params: { bizType, result: record },
  });

  const relationCode = datasetMap.DATASET_CODES?.bizRelation;
  if (!relationCode) throw new Error("DATASET_CODE_MISSING:bizRelation");
  const relationModel = context.client.models[`dataset_${relationCode}`];
  if (!relationModel?.filter) {
    throw new Error(`MODEL_MISSING:dataset_${relationCode}`);
  }

  const where = {
    source_biz_type: { $eq: bizType },
    source_biz_id: { $eq: bizId },
    relation_status: { $eq: "active" },
  };
  if (relationType) where.relation_type = { $eq: relationType };

  const response = await relationModel.filter({
    where,
    currentPage: 1,
    pageSize: 50,
    orderBy: [{ updated_at: "desc" }],
  });
  const rows = readRows(response);
  return {
    tableData: rows,
    paging:
      response?.paging || {
        currentPage: 1,
        pageSize: 50,
        totalCount: rows.length,
      },
  };
}
