/** Instant API Policy 路由：contractPaymentPlan 受控读取。 */
export default async function cpoPolicyReadContractPaymentPlan(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: { request: params || {}, config: {"mode":"child","resource":"contractPaymentPlan","tableName":"contract_payment_plan","parentTableName":"contract_application","parentField":"contract_id","parentBizType":"contract"} },
  });
}
