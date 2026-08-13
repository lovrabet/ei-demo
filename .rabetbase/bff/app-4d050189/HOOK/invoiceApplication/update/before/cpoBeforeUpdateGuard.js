export default async function cpoBeforeUpdateGuard(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoApplicationUpdateGuard",
    params: { bizType: "invoice_application", values: params },
  });
}
