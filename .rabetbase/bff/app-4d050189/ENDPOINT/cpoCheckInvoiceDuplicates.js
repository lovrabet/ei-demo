/**
 * 发票查重查询入口。
 *
 * [脚本描述] 按报销单或发票号码调用统一守卫，返回同单重复、重复台账及跨报销占用明细
 * [接口路径] POST /api/endpoint/app-4d050189/cpoCheckInvoiceDuplicates
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * { "expenseId": 14 } 或 { "invoiceNos": ["26337000000590589880"] }
 *
 * [返回数据结构]
 * { expenseId, checkedInvoiceCount, invoiceNos, hasDuplicates, duplicates[] }
 */
export default async function cpoCheckInvoiceDuplicates(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoInvoiceDuplicateGuard",
    params: {
      expenseId: params?.expenseId,
      invoiceNos: params?.invoiceNos,
      assertUnique: false,
    },
  });
}
