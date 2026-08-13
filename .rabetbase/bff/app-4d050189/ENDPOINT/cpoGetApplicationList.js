/**
 * 申请单汇总：流程管理员和财务顾问组成员跨 CPO 主单查询流程。
 *
 * [脚本描述] 允许流程管理员和财务顾问组成员按进行中、已完成、驳回/废弃查看单据，支持业务类型、申请人、状态和关键词筛选。
 *            平台流绑定的主单以平台回写的 flow_status/instance_status/running_node/node_process_user 分类与展示，
 *            不再读取 legacy biz_task（自研状态机已废弃）。
 * [接口路径] POST /api/endpoint/app-4d050189/cpoGetApplicationList
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * { "bizType": "expense|invoice|contract|payment|salary_payment|travel（可选）", "scope": "active|completed|voided（可选）", "status": "进行中状态值（可选）", "applicantUserId": "申请人员工 ID（可选）", "keyword": "（可选）", "page": 1, "pageSize": 20 }
 *
 * [返回数据结构]
 * { scope: "application_reader", paging: { currentPage, pageSize, totalCount }, tableData: [ { bizType, bizId, title, status, flowStatus, instanceStatus, processInstanceId, runningNode, approverUserIds, amount, currency, applicantName, submittedAt, updatedAt, detailPath } ] }
 */

const FETCH_PAGE_SIZE = 200;
const MAX_ROWS_PER_TYPE = 1000;
const DISCONTINUED_STATUSES = ["rejected", "cancelled", "invalid"];
// 平台流（FORM_FLOW）绑定的主单：流程状态以平台回写列为准
const FLOW_BOUND_BIZ_TYPES = [
  "expense",
  "invoice_application",
  "contract",
  "crm_contract",
  "payment",
  "salary_payment",
  "travel",
];
const PLATFORM_FLOW_VOIDED = ["REJECTED", "CANCELLED"];
const APPLICATION_BIZ_TYPES = [
  "expense",
  "invoice",
  "invoice_application",
  "contract",
  "crm_contract",
  "payment",
  "salary_payment",
  "travel",
];
const COMPLETED_STATUSES_BY_TYPE = {
  expense: ["paid_confirmed", "completed"],
  invoice: ["reviewed", "archived", "used", "completed"],
  invoice_application: ["reviewed", "completed"],
  contract: ["signed", "archived", "completed"],
  crm_contract: ["signed", "completed"],
  payment: ["paid_confirmed", "completed"],
  salary_payment: ["paid_confirmed", "completed"],
  travel: ["reviewed", "completed"],
};
const READ_ALL_USER_CATEGORIES = [
  "workflow_admin_user",
  "application_read_all_user",
];
const DETAIL_PATH = {
  expense: (id) =>
    `/application-detail/expense/${encodeURIComponent(String(id))}`,
  invoice: (id) =>
    `/application-detail/invoice/${encodeURIComponent(String(id))}`,
  invoice_application: (id) =>
    `/application-detail/invoice_application/${encodeURIComponent(String(id))}`,
  contract: (id) =>
    `/application-detail/contract/${encodeURIComponent(String(id))}`,
  crm_contract: (id) =>
    `/receivable-contract-detail/${encodeURIComponent(String(id))}`,
  payment: (id) =>
    `/application-detail/payment/${encodeURIComponent(String(id))}`,
  salary_payment: (id) =>
    `/application-detail/salary_payment/${encodeURIComponent(String(id))}`,
  travel: (id) =>
    `/application-detail/travel/${encodeURIComponent(String(id))}`,
};

const CURRENCY_FIELD_BY_TYPE = {
  contract: "currency",
  crm_contract: "currency",
  payment: "currency",
  salary_payment: "currency",
  travel: "currency",
  invoice_application: "currency",
};

function optionalText(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

function totalOf(response, fallback) {
  return typeof response?.paging?.totalCount === "number"
    ? response.paging.totalCount
    : fallback;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function comparableTime(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const time = new Date(String(value).replace(" ", "T")).getTime();
  return Number.isFinite(time) ? time : 0;
}

function actorHasReadAllRole(actor) {
  return optionalText(actor?.roles?.[0]).toLowerCase() === "admin";
}

async function assertApplicationListReader(actor, bff) {
  if (actorHasReadAllRole(actor)) return;
  const userId = optionalText(actor?.userId);
  if (!userId) throw new Error("CPO_ACTOR_MISSING");

  const dictionary = await bff.execute({
    scriptName: "cpoDictionary",
    params: {},
  });
  const configured = READ_ALL_USER_CATEGORIES.some((category) =>
    Object.prototype.hasOwnProperty.call(dictionary?.[category] || {}, userId),
  );
  if (!configured) {
    throw new Error("CPO_APPLICATION_LIST_ACCESS_REQUIRED");
  }
}

function labelOf(dictionary, category, code) {
  return dictionary?.[category]?.[code] ?? code;
}

function enrichRow(row, dictionary) {
  return {
    ...row,
    statusLabel: labelOf(dictionary, "status", row.status),
    expenseTypeLabel: labelOf(dictionary, "expense_type", row.expense_type),
    travelTypeLabel: labelOf(dictionary, "travel_type", row.travel_type),
    invoiceTypeLabel: labelOf(dictionary, "invoice_type", row.invoice_type),
    requestTypeLabel: labelOf(dictionary, "request_type", row.request_type),
  };
}

function isFlowBound(bizType) {
  return FLOW_BOUND_BIZ_TYPES.includes(bizType);
}

// 平台回写 node_process_user 为 JSON：{ assignees: [userId...], candidateUsers, candidateGroups, tasks }
function parseApproverUserIds(raw) {
  const text = optionalText(raw);
  if (!text) return [];
  try {
    const payload = JSON.parse(text);
    const assignees = Array.isArray(payload?.assignees) ? payload.assignees : [];
    const candidates = Array.isArray(payload?.candidateUsers)
      ? payload.candidateUsers
      : [];
    return unique([...assignees, ...candidates].map((v) => optionalText(v)));
  } catch {
    return [];
  }
}

// 平台流主单的 scope 分类：flow_status 为准，instance_status 兜底撤销态
function platformMatchesScope(flowStatus, instanceStatus, scope) {
  if (!flowStatus) return false;
  if (scope === "voided") {
    return (
      PLATFORM_FLOW_VOIDED.includes(flowStatus) || instanceStatus === "CANCELLED"
    );
  }
  if (scope === "completed") return flowStatus === "COMPLETED";
  if (scope === "active") return flowStatus === "SUBMITTED";
  return true;
}

function selectFieldsFor(bizType, meta) {
  const currencyField = CURRENCY_FIELD_BY_TYPE[bizType];
  return unique([
    "id",
    "applicant_user_id",
    meta.applicantField,
    meta.titleField,
    ...(meta.fallbackTitleFields || []),
    meta.statusField,
    meta.amountField,
    currencyField,
    meta.createdField,
    meta.updatedField,
    meta.businessUpdatedField,
    meta.hasSubmittedAt ? "submitted_at" : "",
    ...(isFlowBound(bizType)
      ? [
          "process_instance_id",
          "instance_status",
          "flow_status",
          "running_node",
          "node_process_user",
        ]
      : []),
    ["payment", "salary_payment"].includes(bizType) ? "last_action_at" : "",
    ["payment", "salary_payment"].includes(bizType) ? "bank_status" : "",
    bizType === "expense" ? "expense_type" : "",
    bizType === "expense" ? "travel_type" : "",
    ["invoice", "invoice_application"].includes(bizType) ? "invoice_type" : "",
    ["invoice", "invoice_application"].includes(bizType) ? "request_type" : "",
    bizType === "invoice" ? "invoice_direction" : "",
  ]);
}

function applicationScopeWhere(bizType, where) {
  if (bizType === "crm_contract") {
    return { $and: [where, { workflow_managed: { $eq: 1 } }] };
  }
  if (bizType !== "invoice") return where;
  return {
    $and: [where, { invoice_direction: { $eq: "outgoing" } }],
  };
}

function buildTitle(record, bizType, meta) {
  const fallback = (meta.fallbackTitleFields || [])
    .map((field) => record[field])
    .filter(Boolean)
    .join(" / ");
  return record[meta.titleField] || fallback || "关联对象标题缺失";
}

function completedStatusesFor(bizType) {
  return COMPLETED_STATUSES_BY_TYPE[bizType] || ["completed"];
}

function recordMatchesScope(status, bizType, scope) {
  if (!status || status === "draft") return false;
  if (scope === "voided") return DISCONTINUED_STATUSES.includes(status);
  if (scope === "completed") {
    return completedStatusesFor(bizType).includes(status);
  }
  if (scope === "active") {
    return (
      !DISCONTINUED_STATUSES.includes(status) &&
      !completedStatusesFor(bizType).includes(status)
    );
  }
  return !DISCONTINUED_STATUSES.includes(status);
}

function effectiveBankStatus(record, bizType, status) {
  if (!["payment", "salary_payment"].includes(bizType)) return "";
  const explicit = optionalText(record.bank_status);
  if (explicit) return explicit;
  if (
    [
      "bank_review_pending",
      "bank_pending",
      "paid_confirmed",
      "payment_failed",
    ].includes(status)
  ) {
    return status;
  }
  return "not_submitted";
}

function buildRow(record, bizType, meta, scope) {
  const status = optionalText(record[meta.statusField]);
  const flowBound = isFlowBound(bizType);
  const processInstanceId = flowBound
    ? optionalText(record.process_instance_id)
    : "";
  const flowStatus = flowBound
    ? optionalText(record.flow_status).toUpperCase()
    : "";
  const instanceStatus = flowBound
    ? optionalText(record.instance_status).toUpperCase()
    : "";
  if (flowBound) {
    // 平台流主单：无流程实例 = 从未提交的草稿，不出现在汇总里
    if (!processInstanceId) return null;
    if (!platformMatchesScope(flowStatus, instanceStatus, scope)) return null;
  } else if (!recordMatchesScope(status, bizType, scope)) {
    return null;
  }

  const bizId = Number(record.id);
  const submittedAt =
    record.submitted_at ||
    (["payment", "salary_payment"].includes(bizType)
      ? record.last_action_at
      : "");
  const businessUpdatedAt = meta.businessUpdatedField
    ? record[meta.businessUpdatedField]
    : record[meta.updatedField];
  const currencyField = CURRENCY_FIELD_BY_TYPE[bizType];
  const approverUserIds = flowBound
    ? parseApproverUserIds(record.node_process_user)
    : [];
  return {
    id: bizId,
    bizType,
    bizId,
    title: buildTitle(record, bizType, meta),
    status,
    flowStatus,
    instanceStatus,
    processInstanceId,
    runningNode: flowBound ? optionalText(record.running_node) : "",
    approverUserIds,
    currentProcessorUserId: approverUserIds[0] || "",
    bankStatus: effectiveBankStatus(record, bizType, status),
    amount: record[meta.amountField],
    currency: currencyField
      ? record[currencyField]
      : ["expense", "invoice"].includes(bizType)
        ? "CNY"
        : "",
    applicantUserId: record.applicant_user_id,
    applicantName: record[meta.applicantField] || "",
    expense_type: record.expense_type,
    travel_type: record.travel_type,
    invoice_type: record.invoice_type,
    request_type: record.request_type,
    submittedAt,
    createdAt: record[meta.createdField],
    updatedAt: businessUpdatedAt,
    sortTime: comparableTime(
      submittedAt || businessUpdatedAt || record[meta.createdField],
    ),
    detailPath: DETAIL_PATH[bizType]?.(bizId) || "",
  };
}

function statusScopeWhere(bizType, meta, scope) {
  if (isFlowBound(bizType)) {
    if (scope === "voided") {
      return {
        $or: [
          { flow_status: { $in: PLATFORM_FLOW_VOIDED } },
          { instance_status: { $eq: "CANCELLED" } },
        ],
      };
    }
    if (scope === "completed") {
      return { flow_status: { $eq: "COMPLETED" } };
    }
    if (scope === "active") {
      return { flow_status: { $eq: "SUBMITTED" } };
    }
    // 未指定 scope：排除从未发起流程的草稿
    return { process_instance_id: { $ne: "" } };
  }
  if (scope === "voided") {
    return {
      [meta.statusField]: { $in: DISCONTINUED_STATUSES },
    };
  }
  if (scope === "completed") {
    return {
      [meta.statusField]: { $in: completedStatusesFor(bizType) },
    };
  }

  const excludedStatuses = ["draft", ...DISCONTINUED_STATUSES];
  if (scope === "active") {
    excludedStatuses.push(...completedStatusesFor(bizType));
  }
  return {
    $and: [
      ...unique(excludedStatuses).map((status) => ({
        [meta.statusField]: { $ne: status },
      })),
    ],
  };
}

async function fetchApplicationsByType(
  model,
  bizType,
  meta,
  scope,
  exactStatus,
  applicantUserId,
) {
  const all = [];
  let currentPage = 1;
  let totalCount = 0;

  do {
    const statusWhere = statusScopeWhere(bizType, meta, scope);
    const where = applicantUserId
      ? {
          $and: [statusWhere, { applicant_user_id: { $eq: applicantUserId } }],
        }
      : statusWhere;
    const response = await model.filter({
      where: applicationScopeWhere(bizType, where),
      select: selectFieldsFor(bizType, meta),
      orderBy: [
        {
          [meta.hasSubmittedAt
            ? "submitted_at"
            : meta.businessUpdatedField || meta.updatedField]: "desc",
        },
      ],
      currentPage,
      pageSize: FETCH_PAGE_SIZE,
    });
    const rows = rowsOf(response);
    all.push(...rows);
    totalCount = totalOf(response, all.length);
    if (!rows.length) break;
    currentPage += 1;
  } while (all.length < totalCount && all.length < MAX_ROWS_PER_TYPE);

  return all
    .map((record) => buildRow(record, bizType, meta, scope))
    .filter((row) => !exactStatus || optionalText(row?.status) === exactStatus)
    .filter(Boolean);
}

function matchesKeyword(row, keyword) {
  if (!keyword) return true;
  const normalized = keyword.toLocaleLowerCase();
  return [row.bizId, row.title, row.applicantUserId, row.applicantName].some(
    (value) => optionalText(value).toLocaleLowerCase().includes(normalized),
  );
}

export default async function cpoGetApplicationList(params, context) {
  const {
    bizType = "",
    scope: requestedScope = "",
    status = "",
    applicantUserId = "",
    keyword = "",
    page = 1,
    pageSize = 20,
  } = params || {};
  const normalizedStatus = optionalText(status);
  const legacyScope = ["active", "completed", "voided"].includes(
    normalizedStatus,
  )
    ? normalizedStatus
    : "";
  const scope = ["active", "completed", "voided"].includes(
    optionalText(requestedScope),
  )
    ? optionalText(requestedScope)
    : legacyScope;
  const exactStatus = legacyScope ? "" : normalizedStatus;
  const normalizedApplicantUserId = optionalText(applicantUserId);
  const currentPage = positiveInt(page, 1);
  const normalizedPageSize = Math.min(positiveInt(pageSize, 20), 100);
  const bff = context.client.bff;
  const actor = await bff.execute({
    scriptName: "cpoCurrentActor",
    params: {},
  });
  await assertApplicationListReader(actor, bff);

  const [map, dictionary] = await Promise.all([
    bff.execute({ scriptName: "cpoDatasetMap", params: {} }),
    bff.execute({ scriptName: "cpoDictionary", params: {} }),
  ]);
  const metas = map.BIZ_TYPE_TO_DATASET || {};
  const selectedBizTypes = bizType
    ? APPLICATION_BIZ_TYPES.includes(bizType) && metas[bizType]
      ? [bizType]
      : []
    : APPLICATION_BIZ_TYPES.filter((type) => metas[type]);

  const lists = await Promise.all(
    selectedBizTypes.map((type) => {
      const meta = metas[type];
      const model = context.client.models[meta.modelKey];
      return model?.filter
        ? fetchApplicationsByType(
            model,
            type,
            meta,
            scope,
            exactStatus,
            normalizedApplicantUserId,
          )
        : Promise.resolve([]);
    }),
  );

  const sortedRows = lists
    .flat()
    .filter((row) => matchesKeyword(row, optionalText(keyword)))
    .sort((left, right) => right.sortTime - left.sortTime)
    .map(({ sortTime, ...row }) => enrichRow(row, dictionary));
  const all = sortedRows;
  const start = (currentPage - 1) * normalizedPageSize;
  const tableData = all.slice(start, start + normalizedPageSize);

  return {
    scope: "application_reader",
    paging: {
      currentPage,
      pageSize: normalizedPageSize,
      totalCount: all.length,
    },
    tableData,
  };
}
