/**
 * 报销明细继承报销主单读取权限。
 * 主单只允许平台管理员、申请人和当前待审批人读取，因此先通过已受
 * cpoApplicationReadFilterGuard 保护的主单模型取得可见 ID，再收紧明细查询。
 */
function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

export default async function cpoExpenseItemReadFilterGuard(params, context) {
  const values =
    params?.values && typeof params.values === "object"
      ? params.values
      : params && typeof params === "object"
        ? params
        : {};
  const expenseModel = context.client.models.byTable("expense_application");
  if (!expenseModel?.filter) {
    throw new Error("MODEL_MISSING:expenseApplication");
  }

  const accessibleIds = [];
  for (let currentPage = 1; currentPage <= 100; currentPage += 1) {
    const response = await expenseModel.filter({
      select: ["id"],
      orderBy: [{ id: "asc" }],
      currentPage,
      pageSize: 100,
    });
    const rows = rowsOf(response);
    accessibleIds.push(
      ...rows.map((row) => Number(row.id)).filter((id) => id > 0),
    );
    if (rows.length < 100) break;
  }

  return {
    ...values,
    where: {
      $and: [
        values.where || {},
        {
          expense_id: {
            $in: accessibleIds.length ? accessibleIds : [-1],
          },
        },
      ],
    },
  };
}
