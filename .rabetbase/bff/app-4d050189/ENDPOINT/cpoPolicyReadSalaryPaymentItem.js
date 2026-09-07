/** Instant API Policy 路由：salaryPaymentItem 受控读取。 */
export default async function cpoPolicyReadSalaryPaymentItem(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: { request: params || {}, config: {"mode":"child","resource":"salaryPaymentItem","datasetCode":"19ef166f3d2242a19911ccb8a5685bb8","parentDatasetCode":"235e11a9cb7945c8926b4d31fe64843f","parentField":"salary_payment_id","parentBizType":"salary_payment"} },
  });
}
