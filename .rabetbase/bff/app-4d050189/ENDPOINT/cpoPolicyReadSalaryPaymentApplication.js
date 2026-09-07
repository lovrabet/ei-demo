/** Instant API Policy 路由：salaryPaymentApplication 受控读取。 */
export default async function cpoPolicyReadSalaryPaymentApplication(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: { request: params || {}, config: {"mode":"main","resource":"salaryPaymentApplication","tableName":"salary_payment_application","bizType":"salary_payment"} },
  });
}
