export default async function cpoAfterReadOneGuard(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoApplicationReadOneGuard",
    params: { bizType: "payment", result: params },
  });
}
