/**
 * 发票关联列表批量补充申请单类型、主单 ID 与标题。
 *
 * [接口路径] POST /api/app-4d050189/9dd0d102219145ddbb67d1c247a84fb9/filter
 * [触发节点] after
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/dataset/1013765#api-list
 *
 * [响应补充字段]
 * application_type: expense / travel / payment / contract
 * application_id: 对应申请主单 ID
 * application_title: 对应申请单标题
 *
 * @param {Object} params - filter 响应结果，包含 tableData、paging、tableColumns。
 * @param {Object} context - 平台注入的执行上下文。
 * @returns {Promise<Object>} 补充申请单展示字段后的 filter 响应。
 */
export default async function cpoAfterInvoiceLinkFilterEnrichApplication(params, context) {
  const rows = Array.isArray(params?.tableData) ? params.tableData : [];
  if (rows.length === 0) return params;

  try {
    const { DATASET_CODES, BIZ_TYPE_TO_DATASET } = await context.client.bff.execute({
      scriptName: "cpoDatasetMap",
      params: {},
    });
    const models = context.client.models;

    const expenseItemRows = rows.filter((row) => row?.biz_type === "expense_item");
    const missingExpenseItemIds = [
      ...new Set(
        expenseItemRows
          .filter((row) => !row?.expense_item?.expense_id)
          .map((row) => row?.biz_id)
          .filter((id) => id !== null && id !== undefined && id !== ""),
      ),
    ];

    const expenseIdByItemId = new Map();
    for (const row of expenseItemRows) {
      const expenseId = row?.expense_item?.expense_id;
      if (expenseId !== null && expenseId !== undefined && expenseId !== "") {
        expenseIdByItemId.set(String(row.biz_id), expenseId);
      }
    }

    if (missingExpenseItemIds.length > 0) {
      const expenseItemResult = await models[`dataset_${DATASET_CODES.expenseItem}`].filter({
        where: { id: { $in: missingExpenseItemIds } },
        select: ["id", "expense_id"],
        currentPage: 1,
        pageSize: 1000,
      });
      for (const item of expenseItemResult?.tableData || []) {
        expenseIdByItemId.set(String(item.id), item.expense_id);
      }
    }

    const targets = rows.map((row, index) => {
      const applicationType = row?.biz_type === "expense_item" ? "expense" : row?.biz_type;
      const applicationId = row?.biz_type === "expense_item"
        ? expenseIdByItemId.get(String(row?.biz_id))
        : row?.biz_id;
      return { index, applicationType, applicationId };
    });

    const idsByType = new Map();
    for (const target of targets) {
      if (!target.applicationId || !BIZ_TYPE_TO_DATASET?.[target.applicationType]) continue;
      const ids = idsByType.get(target.applicationType) || new Set();
      ids.add(target.applicationId);
      idsByType.set(target.applicationType, ids);
    }

    const titleByTarget = new Map();
    await Promise.all(
      [...idsByType.entries()].map(async ([applicationType, idSet]) => {
        const meta = BIZ_TYPE_TO_DATASET[applicationType];
        const result = await models[meta.modelKey].filter({
          where: { id: { $in: [...idSet] } },
          select: ["id", meta.titleField],
          currentPage: 1,
          pageSize: 1000,
        });
        for (const application of result?.tableData || []) {
          titleByTarget.set(
            `${applicationType}:${String(application.id)}`,
            application?.[meta.titleField] || null,
          );
        }
      }),
    );

    return {
      ...params,
      tableData: rows.map((row, index) => {
        const target = targets[index];
        if (!target?.applicationId) return row;
        return {
          ...row,
          application_type: target.applicationType,
          application_id: target.applicationId,
          application_title:
            titleByTarget.get(`${target.applicationType}:${String(target.applicationId)}`) || null,
        };
      }),
    };
  } catch (_error) {
    // 展示字段补充失败时保留原始列表，避免影响发票关联主查询。
    return params;
  }
}
