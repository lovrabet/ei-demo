/** Instant API Policy 路由：contractPaymentPlan 受控读取。 */
export default async function cpoPolicyReadContractPaymentPlan(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: { request: params || {}, config: {"mode":"child","resource":"contractPaymentPlan","datasetCode":"08e17d8ba3a24e938fef89816c8f4ccb","parentDatasetCode":"53869993f80f45ae8ef6cdf051d8e355","parentField":"contract_id","parentBizType":"contract"} },
  });
}
