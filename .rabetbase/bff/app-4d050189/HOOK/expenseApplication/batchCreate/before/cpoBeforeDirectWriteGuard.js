/** 拒绝报销主单标准 batchCreate；请调用 cpoSaveDraft。 */
export default async function cpoBeforeDirectWriteGuard(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoDirectWriteGuard",
    params: { resource: "expenseApplication", operation: "batchCreate" },
  });
}
