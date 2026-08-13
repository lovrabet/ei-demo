/**
 * 工资付款明细继承工资付款主单的读取权限。
 * 主单的 Instant API 已由 cpoApplicationReadFilterGuard 限制为申请人、
 * 流程参与人和管理员可见，因此先通过主单模型取可见 ID，再收紧明细条件。
 */
function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

const SALARY_PAYMENT_APPLICATION_CODE =
  "235e11a9cb7945c8926b4d31fe64843f";

export default async function cpoSalaryPaymentItemReadFilterGuard(
  params,
  context,
) {
  const values =
    params?.values && typeof params.values === "object"
      ? params.values
      : params && typeof params === "object"
        ? params
        : {};
  const mainCode = SALARY_PAYMENT_APPLICATION_CODE;
  const mainModel = context.client.models[`dataset_${mainCode}`];
  if (!mainCode || !mainModel?.filter) {
    throw new Error("MODEL_MISSING:salaryPaymentApplication");
  }

  const accessibleIds = [];
  for (let currentPage = 1; currentPage <= 100; currentPage += 1) {
    const response = await mainModel.filter({
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
          salary_payment_id: {
            $in: accessibleIds.length ? accessibleIds : [-1],
          },
        },
      ],
    },
  };
}
