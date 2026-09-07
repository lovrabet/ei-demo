/** Instant API Policy 路由：expenseItem 受控读取。 */
export default async function cpoPolicyReadExpenseItem(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: { request: params || {}, config: {"mode":"child","resource":"expenseItem","datasetCode":"d99c32ef07b749948cc24fd391f8fd2c","parentDatasetCode":"7851365c96244a1896e834daec447ddb","parentField":"expense_id","parentBizType":"expense"} },
  });
}
