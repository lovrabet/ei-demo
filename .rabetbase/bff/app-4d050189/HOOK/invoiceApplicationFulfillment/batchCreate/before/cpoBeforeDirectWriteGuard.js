export default async function cpoBeforeDirectWriteGuard(params, context) {
  return context.client.bff.execute({ scriptName: "cpoDirectWriteGuard", params: { resource: "invoiceApplicationFulfillment", operation: "batchCreate" } });
}
