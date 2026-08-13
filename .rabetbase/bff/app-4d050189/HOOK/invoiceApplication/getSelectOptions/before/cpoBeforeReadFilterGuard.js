export default async function cpoBeforeReadFilterGuard(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoApplicationReadFilterGuard",
    params: { bizType: "invoice_application", values: params },
  });
}
