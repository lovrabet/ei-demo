/**
 * Instant API Policy 受控读取内核。
 *
 * Policy 只把 filter/getOne/getOneOrigin 路由到薄 ENDPOINT；这里按固定配置
 * 执行 Dataset 查询并应用平台用户、平台角色与平台 Flow 节点人员权限。
 * 不读取 biz_task、cpo_workflow_participant 或业务字典中的自建权限名单。
 */
function optionalText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeId(params) {
  const value = params?.id ?? params?.dataid ?? params?.bizId;
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

const READ_ALL_ROLES = new Set([
  "admin",
  "administrator",
  "super_admin",
  "owner",
  "cpo_admin",
  "管理员",
  "应用owner",
  "finance",
  "finance_advisor",
  "财务组",
  "财务顾问",
]);

function normalizeRoles(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) => typeof item === "string"
      ? item
      : item?.code || item?.name || item?.value || item?.roleCode || item?.roleName)
    .map((item) => optionalText(item).toLowerCase())
    .filter(Boolean);
}

function actorOf(context) {
  const userInfo = context?.userInfo || {};
  const roles = [
    ...normalizeRoles(userInfo.roles),
    ...normalizeRoles(userInfo.roleList),
    ...normalizeRoles(userInfo.roleCodes),
    ...normalizeRoles(userInfo.role),
  ];
  return {
    userId: optionalText(userInfo.userId || userInfo.id),
    canReadAll:
      userInfo.isAdmin === true ||
      userInfo.admin === true ||
      userInfo.is_super_admin === true ||
      roles.some((role) => READ_ALL_ROLES.has(role)),
  };
}

function parseNodeProcessUserIds(raw) {
  if (!raw) return [];
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    const ids = [
      ...(Array.isArray(value?.assignees) ? value.assignees : []),
      ...(Array.isArray(value?.candidateUsers) ? value.candidateUsers : []),
      ...(Array.isArray(value?.tasks)
        ? value.tasks.flatMap((task) => Array.isArray(task?.assignee)
          ? task.assignee
          : task?.assignee === undefined || task?.assignee === null
            ? []
            : [task.assignee])
        : []),
    ];
    return [...new Set(ids.map(optionalText).filter(Boolean))];
  } catch {
    return [];
  }
}

function assertRecordVisible(record, context, resource) {
  if (!record?.id) throw new Error(`CPO_RESOURCE_NOT_FOUND:${resource}`);
  const actor = actorOf(context);
  if (!actor.userId) throw new Error("CPO_ACTOR_MISSING");
  if (
    actor.canReadAll ||
    optionalText(record.applicant_user_id) === actor.userId ||
    parseNodeProcessUserIds(record.node_process_user).includes(actor.userId)
  ) {
    return record;
  }
  throw new Error(`CPO_READ_FORBIDDEN:${resource}:${record.id}`);
}

function restrictList(values, context) {
  const actor = actorOf(context);
  if (actor.canReadAll) return { ...values, where: values?.where || {} };
  if (!actor.userId) throw new Error("CPO_ACTOR_MISSING");
  return {
    ...values,
    where: {
      $and: [values?.where || {}, { applicant_user_id: { $eq: actor.userId } }],
    },
  };
}

async function readMain({ request, config, context }) {
  const model = context.client.models[`dataset_${config.datasetCode}`];
  if (!model?.filter || !model?.getOne) {
    throw new Error(`MODEL_MISSING:${config.resource}`);
  }
  const id = normalizeId(request);
  if (id) {
    const result = await model.getOne({ id });
    return assertRecordVisible(result, context, config.resource);
  }
  return model.filter(restrictList(request, context));
}

async function readChild({ request, config, context }) {
  const childModel = context.client.models[`dataset_${config.datasetCode}`];
  const parentModel = context.client.models[`dataset_${config.parentDatasetCode}`];
  if (!childModel?.filter || !childModel?.getOne || !parentModel?.filter || !parentModel?.getOne) {
    throw new Error(`MODEL_MISSING:${config.resource}`);
  }
  const id = normalizeId(request);
  if (id) {
    const result = await childModel.getOne({ id });
    if (!result?.id) throw new Error(`CPO_RESOURCE_NOT_FOUND:${config.resource}`);
    const parentId = Number(result[config.parentField]);
    const parent = Number.isFinite(parentId) && parentId > 0
      ? await parentModel.getOne({ id: parentId })
      : null;
    assertRecordVisible(parent, context, config.parentBizType);
    return result;
  }

  const parentResponse = await parentModel.filter(restrictList({
    select: ["id"],
    currentPage: 1,
    pageSize: 1000,
  }, context));
  const parentIds = rowsOf(parentResponse)
    .map((row) => Number(row.id))
    .filter((value) => Number.isFinite(value) && value > 0);
  return childModel.filter({
    ...request,
    where: {
      $and: [
        request?.where || {},
        { [config.parentField]: { $in: parentIds.length ? parentIds : [-1] } },
      ],
    },
  });
}

async function enrichInvoiceLinks(response, context) {
  const rows = rowsOf(response);
  if (!rows.length) return response;
  const DATASET_CODES = {
    expenseItem: "d99c32ef07b749948cc24fd391f8fd2c",
  };
  const BIZ_TYPE_TO_DATASET = {
    expense: {
      modelKey: "dataset_7851365c96244a1896e834daec447ddb",
      titleField: "title",
    },
    travel: {
      modelKey: "dataset_28494f18f334400c893576b6e168d3f6",
      titleField: "title",
    },
    payment: {
      modelKey: "dataset_7da208a5059b4b13896d7c7ae29c8492",
      titleField: "title",
    },
    contract: {
      modelKey: "dataset_53869993f80f45ae8ef6cdf051d8e355",
      titleField: "contract_name",
    },
    invoice: {
      modelKey: "dataset_fc11e2d760b94b2ca2ccf0485ed40ca8",
      titleField: "invoice_title",
    },
  };
  const models = context.client.models;
  const actor = actorOf(context);
  if (!actor.userId) throw new Error("CPO_ACTOR_MISSING");
  const expenseItemIds = [...new Set(rows
    .filter((row) => row?.biz_type === "expense_item")
    .map((row) => row?.biz_id)
    .filter(Boolean))];
  const expenseIdByItemId = new Map();
  if (expenseItemIds.length) {
    const items = await models[`dataset_${DATASET_CODES.expenseItem}`].filter({
      where: { id: { $in: expenseItemIds } },
      select: ["id", "expense_id"],
      currentPage: 1,
      pageSize: 1000,
    });
    for (const item of rowsOf(items)) expenseIdByItemId.set(String(item.id), item.expense_id);
  }
  const targets = rows.map((row) => ({
    applicationType: row?.biz_type === "expense_item" ? "expense" : row?.biz_type,
    applicationId: row?.biz_type === "expense_item"
      ? expenseIdByItemId.get(String(row?.biz_id))
      : row?.biz_id,
  }));
  const idsByType = new Map();
  for (const target of targets) {
    if (!target.applicationId || !BIZ_TYPE_TO_DATASET?.[target.applicationType]) continue;
    const ids = idsByType.get(target.applicationType) || new Set();
    ids.add(target.applicationId);
    idsByType.set(target.applicationType, ids);
  }
  const titleByTarget = new Map();
  const visibleTargets = new Set();
  await Promise.all([...idsByType.entries()].map(async ([bizType, ids]) => {
    const meta = BIZ_TYPE_TO_DATASET[bizType];
    const query = restrictList({
      where: { id: { $in: [...ids] } },
      select: ["id", meta.titleField],
      currentPage: 1,
      pageSize: 1000,
    }, context);
    const result = await models[meta.modelKey].filter(query);
    for (const item of rowsOf(result)) {
      const key = `${bizType}:${String(item.id)}`;
      visibleTargets.add(key);
      titleByTarget.set(key, item?.[meta.titleField] || null);
    }
  }));
  const tableData = rows.flatMap((row, index) => {
    const target = targets[index];
    const key = target?.applicationId
      ? `${target.applicationType}:${String(target.applicationId)}`
      : "";
    if (!actor.canReadAll && (!key || !visibleTargets.has(key))) return [];
    return [{
      ...row,
      application_type: target?.applicationType || null,
      application_id: target?.applicationId || null,
      application_title: key ? titleByTarget.get(key) || null : null,
    }];
  });
  return {
    ...response,
    tableData,
    paging: response?.paging
      ? { ...response.paging, totalCount: actor.canReadAll ? response.paging.totalCount : tableData.length }
      : response?.paging,
  };
}

export default async function cpoPolicyRead(params, context) {
  const config = params?.config;
  const request = params?.request && typeof params.request === "object" ? params.request : {};
  if (!config?.datasetCode || !optionalText(config.resource)) {
    throw new Error("INVALID_PARAMS:policy read config is required");
  }
  if (config.mode === "main") return readMain({ request, config, context });
  if (config.mode === "child") return readChild({ request, config, context });
  if (config.mode === "invoice_link") {
    const model = context.client.models[`dataset_${config.datasetCode}`];
    if (!model?.filter) throw new Error("MODEL_MISSING:bizInvoiceLink");
    return enrichInvoiceLinks(await model.filter(request), context);
  }
  throw new Error(`INVALID_PARAMS:unsupported policy read mode ${optionalText(config.mode)}`);
}
