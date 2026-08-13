function datasetModelKey<const T extends string>(code: T) {
  return `dataset_${code}` as const;
}

/**
 * 当前应用内 CRM 相关数据集的稳定模型键。
 *
 * 页面使用 dataset code，避免 api pull 重新生成别名后旧页面在运行时崩溃。
 */
export const CURRENT_APP_MODEL_KEYS = {
  customerCompany: datasetModelKey("c095e4a857dd41bd9ef182617e9d634c"),
  customerContact: datasetModelKey("a7f95d3929fe4c9fa0fb0fd863d1d4e6"),
  receivableContract: datasetModelKey("804e3a5ed3224074be329b9ed4799cc3"),
  receivablePlan: datasetModelKey("c4c7c35bfe244a78b08667e649b05640"),
  salesOpportunity: datasetModelKey("07988c72b6754850b85aa75fdbbdb7e4"),
} as const;
