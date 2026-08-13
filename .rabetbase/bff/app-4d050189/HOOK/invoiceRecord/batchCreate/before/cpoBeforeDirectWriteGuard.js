/** 拒绝发票台账标准 batchCreate；请调用 cpoSaveDraft。 */
export default async function cpoBeforeDirectWriteGuard(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoDirectWriteGuard",
    params: { resource: "invoiceRecord", operation: "batchCreate" },
  });
}
