/** 拒绝报销明细标准 create；请调用 cpoSaveDraft。 */
export default async function cpoBeforeDirectWriteGuard(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoDirectWriteGuard",
    params: { resource: "expenseItem", operation: "create" },
  });
}
