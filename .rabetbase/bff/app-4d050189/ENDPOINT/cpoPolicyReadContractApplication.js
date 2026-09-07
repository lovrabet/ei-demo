/** Instant API Policy 路由：contractApplication 受控读取。 */
export default async function cpoPolicyReadContractApplication(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: { request: params || {}, config: {"mode":"main","resource":"contractApplication","tableName":"contract_application","bizType":"contract"} },
  });
}
