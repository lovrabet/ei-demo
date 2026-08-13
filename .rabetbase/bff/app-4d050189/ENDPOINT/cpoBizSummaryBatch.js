/**
 * 批量业务摘要查询（平台审批流列表页专用）。
 *
 * [脚本描述] 平台待办/已办任务只有 datasetCode+dataId，列表页展示标题/金额需回查
 *            主表。前端分组后调本端点一次拿全，替代逐数据集 filter 的 N 次浏览器请求。
 * [接口路径] POST /api/endpoint/app-4d050189/cpoBizSummaryBatch
 *
 * [HTTP 请求体参数]
 * {
 *   "refs": [{ "datasetCode": "7851365c96244a1896e834daec447ddb", "ids": [93, 96] }]
 * }
 *
 * [返回数据结构]
 * { summaries: { "<datasetCode>:<id>": { id, title, amount, applicant } } }
 */

// 仅允许平台流程绑定的 7 个业务数据集
const ALLOWED_DATASETS = {
  "7851365c96244a1896e834daec447ddb": {
    title: "title",
    amount: "total_cny_amount",
    applicant: "applicant_name_snapshot",
  },
  "7da208a5059b4b13896d7c7ae29c8492": {
    title: "title",
    amount: "amount",
    applicant: "applicant_name_snapshot",
  },
  "53869993f80f45ae8ef6cdf051d8e355": {
    title: "contract_name",
    amount: "amount",
    applicant: "applicant_name_snapshot",
  },
  "28494f18f334400c893576b6e168d3f6": {
    title: "title",
    amount: "estimated_amount",
    applicant: "applicant_name_snapshot",
  },
  "235e11a9cb7945c8926b4d31fe64843f": {
    title: "title",
    amount: "amount",
    applicant: "applicant_name_snapshot",
  },
  ae51202c44e140828ba87e4571094d1a: {
    title: "application_title",
    amount: "requested_total_amount",
    applicant: "applicant_name_snapshot",
  },
  "804e3a5ed3224074be329b9ed4799cc3": {
    title: "title",
    amount: "amount",
    applicant: "applicant_name_snapshot",
  },
};

export default async function cpoBizSummaryBatch(params, context) {
  const refs = Array.isArray(params?.refs) ? params.refs : [];
  const summaries = {};

  await Promise.all(
    refs.map(async (ref) => {
      const datasetCode = String(ref?.datasetCode || "");
      const fields = ALLOWED_DATASETS[datasetCode];
      const ids = [
        ...new Set(
          (Array.isArray(ref?.ids) ? ref.ids : [])
            .map((v) => Number(v))
            .filter((v) => Number.isFinite(v) && v > 0),
        ),
      ];
      if (!fields || ids.length === 0) return;

      const model = context.client.models[`dataset_${datasetCode}`];
      if (!model?.filter) return;

      try {
        const resp = await model.filter({
          where: { id: { $in: ids } },
          select: [
            "id",
            fields.title,
            fields.amount,
            fields.applicant,
            "flow_status",
            "instance_status",
          ],
          currentPage: 1,
          pageSize: Math.min(ids.length, 200),
        });
        for (const rec of resp?.tableData || []) {
          summaries[`${datasetCode}:${rec.id}`] = {
            id: rec.id,
            title: rec[fields.title] || "",
            amount: Number(rec[fields.amount]) || 0,
            applicant: rec[fields.applicant] || "",
            flowStatus: rec.flow_status || "",
            instanceStatus: rec.instance_status || "",
          };
        }
      } catch {
        // 单个数据集查询失败不阻塞其它数据集
      }
    }),
  );

  return { summaries };
}
