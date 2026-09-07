/** Instant API Policy 路由：invoiceApplication 受控读取。 */
export default async function cpoPolicyReadInvoiceApplication(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: { request: params || {}, config: {"mode":"main","resource":"invoiceApplication","datasetCode":"ae51202c44e140828ba87e4571094d1a","bizType":"invoice_application"} },
  });
}
