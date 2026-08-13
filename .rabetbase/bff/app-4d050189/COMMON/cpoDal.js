/**
 * 统一数据访问层（Data Access Layer）。
 *
 * [脚本描述] 通过业务语义键（物理表名 / SQL 语义名）访问数据集与 Custom SQL，
 *            屏蔽 dataset code 与 sql code 的应用级差异，避免 BFF 中大量罗列 code。
 * [脚本名称] cpoDal
 * [脚本类型] COMMON
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoDal.js
 *
 * @param {Object} params { map }
 *   map 由调用方通过 cpoDatasetMap 取好后传入，
 *   因为平台不允许 COMMON 再调用其他 COMMON。
 * @param {Object} context - 平台注入上下文。
 * @returns {Promise<{model:function, sql:function}>}
 *   - model(tableName): 返回对应数据集的 LovrabetModel
 *   - sql(name, params?): 执行语义名对应的 Custom SQL，返回行数组
 *
 * 示例：
 *   const map = await bff.execute({ scriptName: "cpoDatasetMap", params: {} });
 *   const dal = await bff.execute({ scriptName: "cpoDal", params: { map } });
 *   const companies = await dal.model("crm_company").filter({ where: {...} });
 *   const rows = await dal.sql("customer360List", { keyword });
 */
export default async function cpoDal(params, context) {
  const map = params?.map;

  const tableToModelKey = map?.TABLE_TO_MODEL_KEY || {};
  const sqlCodes = map?.SQL_CODES || {};

  function model(tableName) {
    const modelKey = tableToModelKey[tableName];
    if (!modelKey) {
      throw new Error(`DAL_TABLE_NOT_FOUND:${tableName}`);
    }
    const m = context.client.models[modelKey];
    if (!m) {
      throw new Error(`DAL_MODEL_NOT_REGISTERED:${tableName}(${modelKey})`);
    }
    return m;
  }

  async function sql(name, sqlParams) {
    const sqlCode = sqlCodes[name];
    if (!sqlCode) {
      throw new Error(`DAL_SQL_NOT_FOUND:${name}`);
    }
    const result = await context.client.sql.execute({
      sqlCode,
      params: sqlParams ?? {},
    });
    return Array.isArray(result) ? result : result?.rows ?? [];
  }

  return { model, sql };
}
