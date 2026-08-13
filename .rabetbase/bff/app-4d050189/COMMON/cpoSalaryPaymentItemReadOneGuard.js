/**
 * 工资付款明细单条读取继承主单权限。
 */
export default async function cpoSalaryPaymentItemReadOneGuard(
  params,
  context,
) {
  const result = params?.result ?? params;
  if (!result?.id) {
    throw new Error("CPO_RESOURCE_NOT_FOUND:salaryPaymentItem");
  }
  const salaryPaymentId = Number(result.salary_payment_id);
  if (!Number.isFinite(salaryPaymentId) || salaryPaymentId <= 0) {
    throw new Error("CPO_RESOURCE_NOT_FOUND:salaryPaymentItem");
  }

  const mainCode = "235e11a9cb7945c8926b4d31fe64843f";
  const mainModel = context.client.models[`dataset_${mainCode}`];
  if (!mainCode || !mainModel?.getOne) {
    throw new Error("MODEL_MISSING:salaryPaymentApplication");
  }
  const parent = await mainModel.getOne({ id: salaryPaymentId });
  if (!parent?.id) {
    throw new Error("CPO_READ_FORBIDDEN:salaryPaymentItem");
  }
  return result;
}
