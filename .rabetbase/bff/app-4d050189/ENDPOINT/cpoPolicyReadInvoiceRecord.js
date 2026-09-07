/** Instant API Policy 路由：invoiceRecord 受控读取。 */
export default async function cpoPolicyReadInvoiceRecord(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: { request: params || {}, config: {"mode":"main","resource":"invoiceRecord","datasetCode":"fc11e2d760b94b2ca2ccf0485ed40ca8","bizType":"invoice"} },
  });
}
