/** Instant API Policy 路由：travelApplication 受控读取。 */
export default async function cpoPolicyReadTravelApplication(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: { request: params || {}, config: {"mode":"main","resource":"travelApplication","tableName":"travel_application","bizType":"travel"} },
  });
}
