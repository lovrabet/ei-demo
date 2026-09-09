/**
 * Instant API Policy 路由：操作流水读取继承所属业务主单权限。
 *
 * [依赖数据集] biz_action_record 及其 biz_type 对应的业务主单
 * [调用 BF] cpoPolicyRead
 * [副作用] 无
 *
 * @param {Object} params Instant API 原始读取参数
 * @param {Object} context 平台注入的执行上下文
 * @returns {Promise<Object>} 经过行级权限过滤的操作流水结果
 * @throws {Error} 所属主单不存在或当前用户无权读取时抛出权限异常
 */
export default async function cpoPolicyReadBizActionRecord(params, context) {
  return context.client.bff.execute({
    scriptName: "cpoPolicyRead",
    params: {
      request: params || {},
      config: {
        mode: "polymorphic_child",
        resource: "bizActionRecord",
        tableName: "biz_action_record",
        bizTypeField: "biz_type",
        bizIdField: "biz_id",
      },
    },
  });
}
