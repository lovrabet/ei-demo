/** Instant API Policy 路由：expenseApplication 受控读取。 */
export default async function cpoPolicyReadExpenseApplication(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: { request: params || {}, config: {"mode":"main","resource":"expenseApplication","tableName":"expense_application","bizType":"expense"} },
  });
}
