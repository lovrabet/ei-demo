/** Instant API Policy 路由：bizInvoiceLink 受控读取。 */
export default async function cpoPolicyReadBizInvoiceLink(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: { request: params || {}, config: {"mode":"invoice_link","resource":"bizInvoiceLink","datasetCode":"9dd0d102219145ddbb67d1c247a84fb9"} },
  });
}
