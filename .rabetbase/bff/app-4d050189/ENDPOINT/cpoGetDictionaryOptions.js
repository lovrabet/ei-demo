/**
 * 读取启用的 CPO 业务字典选项。
 *
 * [脚本描述] 调用 cpoDictionary COMMON，按分类返回前端 Select 可直接使用的 code/label。
 * [接口路径] POST /api/endpoint/app-4d050189/cpoGetDictionaryOptions
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * { "category": "expense_type" }
 *
 * [返回数据结构]
 * {
 *   "category": "expense_type",
 *   "tableData": [{ "value": "travel", "label": "差旅" }],
 *   "total": 1
 * }
 */
export default async function cpoGetDictionaryOptions(params, context) {
  const category = String(params?.category || "").trim();
  if (
    !category ||
    category.length > 64 ||
    !/^[a-zA-Z0-9_:-]+$/.test(category)
  ) {
    throw new Error("INVALID_DICTIONARY_CATEGORY");
  }

  const dictionary = await context.client.bff.execute({
    scriptName: "cpoDictionary",
    params: { category },
  });
  const categoryEntries = dictionary?.[category] || {};
  const tableData = Object.entries(categoryEntries).map(([value, label]) => ({
    value,
    label: String(label || value),
  }));

  return { category, tableData, total: tableData.length };
}
