/**
 * 合同付款计划单条读取继承合同主单权限。
 */
export default async function cpoContractPaymentPlanReadOneGuard(
  params,
  context,
) {
  const result = params?.result ?? params;
  if (!result?.id) {
    throw new Error("CPO_RESOURCE_NOT_FOUND:contractPaymentPlan");
  }
  const contractId = Number(result.contract_id);
  if (!Number.isFinite(contractId) || contractId <= 0) {
    throw new Error("CPO_RESOURCE_NOT_FOUND:contractPaymentPlan");
  }

  const contractCode = "53869993f80f45ae8ef6cdf051d8e355";
  const contractModel = context.client.models[`dataset_${contractCode}`];
  if (!contractModel?.getOne) {
    throw new Error("MODEL_MISSING:contractApplication");
  }
  const contract = await contractModel.getOne({ id: contractId });
  if (!contract?.id) {
    throw new Error("CPO_READ_FORBIDDEN:contractPaymentPlan");
  }
  return result;
}
