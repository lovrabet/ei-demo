export default async function cpoAfterReadOneGuard(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoApplicationReadOneGuard",
    params: { bizType: "invoice", result: params },
  });
}
