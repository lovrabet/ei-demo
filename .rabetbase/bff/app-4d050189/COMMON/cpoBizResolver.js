/**
 * 按 bizType + bizId 读取业务主单并归一化业务摘要（叶子 COMMON）。
 *
 * [脚本描述] 调用方需自行获取 meta（通过 cpoDatasetMap）并传入；本脚本仅做 getOne + 摘要归一
 * [脚本名称] cpoBizResolver
 * [脚本类型] COMMON（leaf）
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoBizResolver.js
 *
 * @param {Object} params { bizType, bizId, meta }  meta 来自 cpoDatasetMap().BIZ_TYPE_TO_DATASET[bizType]
 * @returns {Promise<{record:Object, summary:Object, meta:Object}>}
 */
export default async function cpoBizResolver(params, context) {
  const { bizType, bizId, meta } = params || {};
  const candidate =
    bizId && typeof bizId === "object"
      ? (bizId.id ?? bizId.result?.id ?? bizId.data?.id ?? bizId.data?.result?.id)
      : bizId;
  const numericBizId = Number(candidate);
  if (!bizType || !Number.isFinite(numericBizId) || !meta || !meta.modelKey) {
    throw new Error(`INVALID_PARAMS:cpoBizResolver requires bizType,bizId,meta`);
  }

  const record = await context.client.models[meta.modelKey].getOne({ id: numericBizId });
  if (!record?.id) {
    throw new Error(`BIZ_NOT_FOUND:${bizType}:${numericBizId}`);
  }

  const fallbackTitle = (meta.fallbackTitleFields || [])
    .map((field) => record[field])
    .filter(Boolean)
    .join(" / ");
  const summary = {
    bizType,
    bizId: record.id,
    title:
      record[meta.titleField] || fallbackTitle || "关联对象标题缺失",
    amount: record[meta.amountField] ?? 0,
    status: record[meta.statusField] || "",
    applicantName: record[meta.applicantField] || "",
    updatedAt: record[meta.updatedField] || record[meta.createdField] || "",
  };

  return { record, summary, meta };
}
