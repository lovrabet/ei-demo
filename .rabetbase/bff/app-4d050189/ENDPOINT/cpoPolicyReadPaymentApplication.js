/** Instant API Policy 路由：paymentApplication 受控读取。 */
export default async function cpoPolicyReadPaymentApplication(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: { request: params || {}, config: {"mode":"main","resource":"paymentApplication","tableName":"payment_application","bizType":"payment"} },
  });
}
