/**
 * 合同付款计划继承合同主单的读取权限。
 * 合同主单的 Instant API 已限制为申请人、流程参与人和管理员可见，
 * 因此先取当前用户可见合同 ID，再收紧付款计划查询条件。
 */
function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

const CONTRACT_APPLICATION_CODE = "53869993f80f45ae8ef6cdf051d8e355";

export default async function cpoContractPaymentPlanReadFilterGuard(
  params,
  context,
) {
  const values =
    params?.values && typeof params.values === "object"
      ? params.values
      : params && typeof params === "object"
        ? params
        : {};
  const contractModel =
    context.client.models[`dataset_${CONTRACT_APPLICATION_CODE}`];
  if (!contractModel?.filter) {
    throw new Error("MODEL_MISSING:contractApplication");
  }

  const accessibleIds = [];
  for (let currentPage = 1; currentPage <= 100; currentPage += 1) {
    const response = await contractModel.filter({
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
          contract_id: {
            $in: accessibleIds.length ? accessibleIds : [-1],
          },
        },
      ],
    },
  };
}
