/*
 * CPO 业务字典查询（COMMON）。
 *
 * [脚本描述] 从 cpo_dictionary 数据集读取启用状态的字典项，按 category 分组返回 code->label 映射。
 * [脚本名称] cpoDictionary
 * [脚本类型] COMMON
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoDictionary.js
 *
 * @param {Object} params { category?: string } 不传 category 返回全部分类
 * @param {Object} context 平台注入上下文
 * @returns {Promise<Object>} { [category]: { code: label } }
 */

async function loadAllDictionary(context) {
  const model = context.client.models.byTable("cpo_dictionary");
  if (!model || !model.filter) {
    throw new Error("DICTIONARY_MODEL_NOT_FOUND");
  }

  const result = await model.filter({
    where: { is_active: { $eq: 1 } },
    select: ["category", "code", "label", "sort_order"],
    orderBy: [{ category: "asc" }, { sort_order: "asc" }, { id: "asc" }],
    currentPage: 1,
    pageSize: 1000,
  });

  const dict = {};
  for (const row of result.tableData || []) {
    const category = row.category;
    if (!category) continue;
    dict[category] = dict[category] || {};
    dict[category][row.code] = row.label;
  }
  return dict;
}

/**
 * @param {Object} params 查询参数
 * @param {string} [params.category] 字典分类；不传时返回全部分类
 * @param {Object} context 平台注入上下文
 * @returns {Promise<Object>} 按分类组织的 code 到 label 映射
 */
export default async function cpoDictionary(params, context) {
  const { category = "" } = params || {};
  const dict = await loadAllDictionary(context);
  if (category) {
    return { [category]: dict[category] || {} };
  }
  return dict;
}
