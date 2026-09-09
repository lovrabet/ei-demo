/**
 * 报销明细单条读取继承报销主单权限。
 */
export default async function cpoExpenseItemReadOneGuard(params, context) {
  const result = params?.result ?? params;
  if (!result?.id) {
    throw new Error("CPO_RESOURCE_NOT_FOUND:expenseItem");
  }
  const expenseId = Number(result.expense_id);
  if (!Number.isFinite(expenseId) || expenseId <= 0) {
    throw new Error("CPO_RESOURCE_NOT_FOUND:expenseItem");
  }

  const expenseModel = context.client.models.byTable("expense_application");
  if (!expenseModel?.getOne) {
    throw new Error("MODEL_MISSING:expenseApplication");
  }
  const expense = await expenseModel.getOne({ id: expenseId });
  if (!expense?.id) {
    throw new Error("CPO_READ_FORBIDDEN:expenseItem");
  }
  return result;
}
