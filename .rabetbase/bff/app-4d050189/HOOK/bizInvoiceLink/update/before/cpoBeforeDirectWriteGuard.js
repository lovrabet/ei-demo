/** 拒绝发票关联标准 update；关联由 cpoSaveDraft 自动同步。 */
export default async function cpoBeforeDirectWriteGuard(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoDirectWriteGuard",
    params: { resource: "bizInvoiceLink", operation: "update" },
  });
}
