/** Instant API Policy 路由：salaryPaymentItem 受控读取。 */
export default async function cpoPolicyReadSalaryPaymentItem(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: { request: params || {}, config: {"mode":"child","resource":"salaryPaymentItem","tableName":"salary_payment_item","parentTableName":"salary_payment_application","parentField":"salary_payment_id","parentBizType":"salary_payment"} },
  });
}
