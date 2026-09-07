/** Instant API Policy 路由：invoiceRecord 受控读取。 */
export default async function cpoPolicyReadInvoiceRecord(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: { request: params || {}, config: {"mode":"main","resource":"invoiceRecord","tableName":"invoice_record","bizType":"invoice"} },
  });
}
