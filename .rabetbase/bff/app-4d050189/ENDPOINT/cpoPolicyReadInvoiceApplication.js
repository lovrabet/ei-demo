/** Instant API Policy 路由：invoiceApplication 受控读取。 */
export default async function cpoPolicyReadInvoiceApplication(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: { request: params || {}, config: {"mode":"main","resource":"invoiceApplication","tableName":"invoice_application","bizType":"invoice_application"} },
  });
}
