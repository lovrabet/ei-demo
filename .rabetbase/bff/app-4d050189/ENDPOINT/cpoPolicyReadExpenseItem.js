/** Instant API Policy 路由：expenseItem 受控读取。 */
export default async function cpoPolicyReadExpenseItem(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: { request: params || {}, config: {"mode":"child","resource":"expenseItem","tableName":"expense_item","parentTableName":"expense_application","parentField":"expense_id","parentBizType":"expense"} },
  });
}
