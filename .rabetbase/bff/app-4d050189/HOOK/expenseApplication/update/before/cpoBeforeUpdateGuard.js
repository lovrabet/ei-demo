/**
 * 报销主单的 Instant API 更新守卫。
 * 作废状态必须走 cpoApplicantFlowAction，它会在事务内同步释放发票关联。
 */
export default async function cpoBeforeUpdateGuard(params, context) {
  const values = params?.values && typeof params.values === "object" ? params.values : params || {};
  if (Object.prototype.hasOwnProperty.call(values, "status")) {
    throw new Error(
      "CPO_STATUS_TRANSITION_FORBIDDEN:expenseApplication:update:请调用 Backend Function cpoApplicantFlowAction，参数 { bizType: 'expense', bizId, action: 'withdraw'|'cancel' }",
    );
  }
  return context.client.bff.execute({
    scriptName: "cpoDirectWriteGuard",
    params: { resource: "expenseApplication", operation: "update" },
  });
}
