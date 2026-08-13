/** 拒绝发票台账标准 update；请调用 cpoSaveDraft 或流程动作 BFF。 */
export default async function cpoBeforeUpdateGuard(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoDirectWriteGuard",
    params: { resource: "invoiceRecord", operation: "update" },
  });
}
