/** Instant API Policy 路由：salaryPaymentApplication 受控读取。 */
export default async function cpoPolicyReadSalaryPaymentApplication(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: { request: params || {}, config: {"mode":"main","resource":"salaryPaymentApplication","datasetCode":"235e11a9cb7945c8926b4d31fe64843f","bizType":"salary_payment"} },
  });
}
