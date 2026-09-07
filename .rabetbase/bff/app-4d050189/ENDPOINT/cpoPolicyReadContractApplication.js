/** Instant API Policy 路由：contractApplication 受控读取。 */
export default async function cpoPolicyReadContractApplication(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: { request: params || {}, config: {"mode":"main","resource":"contractApplication","datasetCode":"53869993f80f45ae8ef6cdf051d8e355","bizType":"contract"} },
  });
}
