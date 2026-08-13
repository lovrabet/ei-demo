/**
 * 合同版本签署：将指定版本置为当前生效版本，旧生效版本自动 superseded，并回写合同主表。
 *
 * [接口路径] POST /api/endpoint/app-4d050189/cpoSignContractVersion
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * {
 *   "contractId": 123,            // 必填，合同申请 id
 *   "versionId": 456,             // 必填，要签署生效的合同版本 id
 *   "signedAt": "2026-07-28 18:00:00"  // 可选，签署时间；缺省取当前时间
 * }
 *
 * [返回数据结构]
 * {
 *   "contractId": 123,
 *   "versionId": 456,
 *   "supersededVersionIds": [455],
 *   "contractStatus": "signed"
 * }
 */
const TABLES = {
  contract: "dataset_53869993f80f45ae8ef6cdf051d8e355", // 数据集: 合同申请 | 数据表: contract_application
  version: "dataset_f54c0d114e0b44ea96e8e3754fd1de72", // 数据集: 合同版本 | 数据表: contract_version
};

// MySQL DATETIME(3) 兼容的 Asia/Shanghai 时间字符串。
// 关键：不能含 'T' 或 'Z'，否则与平台注入的 naive local 时间混用时触发 SQL-530。
function mysqlNow() {
  const chinaTimeOffsetMs = 8 * 60 * 60 * 1000;
  return new Date(Date.now() + chinaTimeOffsetMs)
    .toISOString()
    .replace("T", " ")
    .slice(0, 23);
}

export default async function cpoSignContractVersion(params, context) {
  const contractId = Number(params?.contractId);
  const versionId = Number(params?.versionId);
  if (!Number.isInteger(contractId) || contractId <= 0) {
    throw new Error("contractId must be a positive integer");
  }
  if (!Number.isInteger(versionId) || versionId <= 0) {
    throw new Error("versionId must be a positive integer");
  }

  const models = context.client.models;

  const contract = await models[TABLES.contract].getOne({ id: contractId });
  if (!contract) {
    throw new Error("contract not found: " + contractId);
  }

  const version = await models[TABLES.version].getOne({ id: versionId });
  if (!version) {
    throw new Error("version not found: " + versionId);
  }
  if (Number(version.contract_id) !== contractId) {
    throw new Error("version " + versionId + " does not belong to contract " + contractId);
  }
  if (version.status === "superseded") {
    throw new Error("version " + versionId + " is superseded and cannot be signed");
  }

  const signedAt =
    typeof params?.signedAt === "string" && params.signedAt.trim()
      ? params.signedAt.trim()
      : mysqlNow();

  const result = await context.client.db.transaction(async (tx) => {
    const current = await tx.models[TABLES.version].filter({
      where: {
        contract_id: { $eq: contractId },
        is_current: { $eq: 1 },
      },
      select: ["id", "status"],
      pageSize: 100,
    });
    const currentIds = (current.tableData || []).map((row) => Number(row.id));
    const supersededIds = currentIds.filter((id) => id !== versionId);

    if (supersededIds.length > 0) {
      await tx.models[TABLES.version].update({
        id: supersededIds,
        is_current: 0,
        status: "superseded",
      });
    }

    await tx.models[TABLES.version].update({
      id: versionId,
      is_current: 1,
      status: "signed",
      signed_at: signedAt,
    });

    await tx.models[TABLES.contract].update({
      id: contractId,
      current_version_id: versionId,
      status: "signed",
      signed_at: signedAt,
    });

    return {
      contractId,
      versionId,
      supersededVersionIds: supersededIds,
      contractStatus: "signed",
    };
  });

  return result;
}
