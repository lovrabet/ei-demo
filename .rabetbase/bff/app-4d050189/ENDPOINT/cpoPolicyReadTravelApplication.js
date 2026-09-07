/** Instant API Policy 路由：travelApplication 受控读取。 */
export default async function cpoPolicyReadTravelApplication(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: { request: params || {}, config: {"mode":"main","resource":"travelApplication","datasetCode":"28494f18f334400c893576b6e168d3f6","bizType":"travel"} },
  });
}
