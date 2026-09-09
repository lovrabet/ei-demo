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

const FINANCE_ADVISOR_ROLE_CODE = "oa_demo_finance_advisor";

const PARENT_TABLE_BY_BIZ_TYPE = {
  expense: "expense_application",
  invoice: "invoice_record",
  invoice_application: "invoice_application",
  contract: "contract_application",
  crm_contract: "crm_contract",
  payment: "payment_application",
  salary_payment: "salary_payment_application",
  travel: "travel_application",
};

function extractPlatformRoleCodes(roles) {
  if (!Array.isArray(roles)) return [];
  return roles
    .map((role) =>
      role && typeof role === "object" ? optionalText(role.roleCode) : "",
    )
    .filter(Boolean);
}

function actorOf(context) {
  const userInfo = context?.userInfo || {};
  const roleCodes = extractPlatformRoleCodes(userInfo.roles);
  return {
    userId: optionalText(userInfo.userId || userInfo.id),
    roleCodes,
    canReadAll:
      userInfo.isAdmin === true ||
      roleCodes.includes(FINANCE_ADVISOR_ROLE_CODE),
  };
}

function parseNodeProcessActors(raw) {
  if (!raw) return { userIds: [], roleTokens: [] };
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    const ids = [
      ...(Array.isArray(value?.assignees) ? value.assignees : []),
      ...(Array.isArray(value?.candidateUsers) ? value.candidateUsers : []),
      ...(Array.isArray(value?.tasks)
        ? value.tasks.flatMap((task) =>
            Array.isArray(task?.assignee)
              ? task.assignee
              : task?.assignee === undefined || task?.assignee === null
                ? []
                : [task.assignee],
          )
        : []),
    ];
    const candidateGroups = Array.isArray(value?.candidateGroups)
      ? value.candidateGroups
      : [];
    return {
      userIds: [...new Set(ids.map(optionalText).filter(Boolean))],
      roleTokens: [
        ...new Set(
          candidateGroups.flatMap((group) =>
            extractPlatformRoleCodes([group]),
          ),
        ),
      ],
    };
  } catch {
    return { userIds: [], roleTokens: [] };
  }
}

function assertRecordVisible(record, context, resource) {
  if (!record?.id) throw new Error(`CPO_RESOURCE_NOT_FOUND:${resource}`);
  const actor = actorOf(context);
  if (!actor.userId) throw new Error("CPO_ACTOR_MISSING");
  const processActors = parseNodeProcessActors(record.node_process_user);
  if (
    actor.canReadAll ||
    optionalText(record.applicant_user_id) === actor.userId ||
    processActors.userIds.includes(actor.userId) ||
    processActors.roleTokens.some((role) => actor.roleCodes.includes(role))
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

function collectWhereIds(where, fieldName, result = []) {
  if (!where || typeof where !== "object") return result;
  const condition = where[fieldName];
  if (condition !== undefined) {
    const candidates =
      condition && typeof condition === "object"
        ? [
            condition.$eq,
            ...(Array.isArray(condition.$in) ? condition.$in : []),
          ]
        : [condition];
    for (const candidate of candidates) {
      const id = Number(candidate);
      if (Number.isFinite(id) && id > 0 && !result.includes(id))
        result.push(id);
    }
  }
  for (const key of ["$and", "$or"]) {
    const branches = Array.isArray(where[key]) ? where[key] : [];
    for (const branch of branches) collectWhereIds(branch, fieldName, result);
  }
  return result;
}

function collectWhereTexts(where, fieldName, result = []) {
  if (!where || typeof where !== "object") return result;
  const condition = where[fieldName];
  if (condition !== undefined) {
    const candidates =
      condition && typeof condition === "object"
        ? [
            condition.$eq,
            ...(Array.isArray(condition.$in) ? condition.$in : []),
          ]
        : [condition];
    for (const candidate of candidates) {
      const value = optionalText(candidate);
      if (value && !result.includes(value)) result.push(value);
    }
  }
  for (const key of ["$and", "$or"]) {
    const branches = Array.isArray(where[key]) ? where[key] : [];
    for (const branch of branches) collectWhereTexts(branch, fieldName, result);
  }
  return result;
}

async function listVisibleParentIds(parentModel, context) {
  const result = [];
  for (let currentPage = 1; currentPage <= 100; currentPage += 1) {
    const response = await parentModel.filter(
      restrictList(
        {
          select: ["id"],
          orderBy: [{ id: "asc" }],
          currentPage,
          pageSize: 100,
        },
        context,
      ),
    );
    const rows = rowsOf(response);
    result.push(
      ...rows
        .map((row) => Number(row.id))
        .filter((id) => Number.isFinite(id) && id > 0),
    );
    if (rows.length < 100) break;
  }
  return [...new Set(result)];
}

async function readMain({ request, config, context }) {
  const model = context.client.models.byTable(config.tableName);
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
  const childModel = context.client.models.byTable(config.tableName);
  const parentModel = context.client.models.byTable(config.parentTableName);
  if (
    !childModel?.filter ||
    !childModel?.getOne ||
    !parentModel?.filter ||
    !parentModel?.getOne
  ) {
    throw new Error(`MODEL_MISSING:${config.resource}`);
  }
  const id = normalizeId(request);
  if (id) {
    const result = await childModel.getOne({ id });
    if (!result?.id)
      throw new Error(`CPO_RESOURCE_NOT_FOUND:${config.resource}`);
    const parentId = Number(result[config.parentField]);
    const parent =
      Number.isFinite(parentId) && parentId > 0
        ? await parentModel.getOne({ id: parentId })
        : null;
    assertRecordVisible(parent, context, config.parentBizType);
    return result;
  }

  const actor = actorOf(context);
  if (actor.canReadAll) return childModel.filter(request);
  const requestedParentIds = collectWhereIds(
    request?.where,
    config.parentField,
  );
  let parentIds;
  if (requestedParentIds.length) {
    await Promise.all(
      requestedParentIds.map(async (parentId) => {
        const parent = await parentModel.getOne({ id: parentId });
        assertRecordVisible(parent, context, config.parentBizType);
      }),
    );
    parentIds = requestedParentIds;
  } else {
    parentIds = await listVisibleParentIds(parentModel, context);
  }
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

async function readPolymorphicChild({ request, config, context }) {
  const childModel = context.client.models.byTable(config.tableName);
  if (!childModel?.filter || !childModel?.getOne) {
    throw new Error(`MODEL_MISSING:${config.resource}`);
  }

  const assertParentVisible = async (bizType, bizId) => {
    const parentTableName = PARENT_TABLE_BY_BIZ_TYPE[bizType];
    if (!parentTableName) {
      throw new Error(`CPO_READ_FORBIDDEN:${config.resource}:${bizType}`);
    }
    const parentModel = context.client.models.byTable(parentTableName);
    if (!parentModel?.getOne) {
      throw new Error(`MODEL_MISSING:${parentTableName}`);
    }
    const parent = await parentModel.getOne({ id: bizId });
    assertRecordVisible(parent, context, bizType);
  };

  const id = normalizeId(request);
  if (id) {
    const result = await childModel.getOne({ id });
    if (!result?.id) {
      throw new Error(`CPO_RESOURCE_NOT_FOUND:${config.resource}`);
    }
    const bizType = optionalText(result[config.bizTypeField]);
    const bizId = Number(result[config.bizIdField]);
    await assertParentVisible(bizType, bizId);
    return result;
  }

  const actor = actorOf(context);
  if (actor.canReadAll) return childModel.filter(request);
  const bizTypes = collectWhereTexts(request?.where, config.bizTypeField);
  const bizIds = collectWhereIds(request?.where, config.bizIdField);
  if (bizTypes.length !== 1 || !bizIds.length) {
    return childModel.filter({
      ...request,
      where: { $and: [request?.where || {}, { id: { $in: [-1] } }] },
    });
  }
  await Promise.all(
    bizIds.map((bizId) => assertParentVisible(bizTypes[0], bizId)),
  );
  return childModel.filter({
    ...request,
    where: {
      $and: [
        request?.where || {},
        { [config.bizTypeField]: { $eq: bizTypes[0] } },
        { [config.bizIdField]: { $in: bizIds } },
      ],
    },
  });
}

async function enrichInvoiceLinks(response, context) {
  const rows = rowsOf(response);
  if (!rows.length) return response;
  const BIZ_TYPE_TO_DATASET = {
    expense: {
      tableName: "expense_application",
      titleField: "title",
    },
    travel: {
      tableName: "travel_application",
      titleField: "title",
    },
    payment: {
      tableName: "payment_application",
      titleField: "title",
    },
    contract: {
      tableName: "contract_application",
      titleField: "contract_name",
    },
    invoice: {
      tableName: "invoice_record",
      titleField: "invoice_title",
    },
  };
  const models = context.client.models;
  const actor = actorOf(context);
  if (!actor.userId) throw new Error("CPO_ACTOR_MISSING");
  const expenseItemIds = [
    ...new Set(
      rows
        .filter((row) => row?.biz_type === "expense_item")
        .map((row) => row?.biz_id)
        .filter(Boolean),
    ),
  ];
  const expenseIdByItemId = new Map();
  if (expenseItemIds.length) {
    const items = await models.byTable("expense_item").filter({
      where: { id: { $in: expenseItemIds } },
      select: ["id", "expense_id"],
      currentPage: 1,
      pageSize: 100,
    });
    for (const item of rowsOf(items))
      expenseIdByItemId.set(String(item.id), item.expense_id);
  }
  const targets = rows.map((row) => ({
    applicationType:
      row?.biz_type === "expense_item" ? "expense" : row?.biz_type,
    applicationId:
      row?.biz_type === "expense_item"
        ? expenseIdByItemId.get(String(row?.biz_id))
        : row?.biz_id,
  }));
  const idsByType = new Map();
  for (const target of targets) {
    if (!target.applicationId || !BIZ_TYPE_TO_DATASET?.[target.applicationType])
      continue;
    const ids = idsByType.get(target.applicationType) || new Set();
    ids.add(target.applicationId);
    idsByType.set(target.applicationType, ids);
  }
  const titleByTarget = new Map();
  const visibleTargets = new Set();
  await Promise.all(
    [...idsByType.entries()].map(async ([bizType, ids]) => {
      const meta = BIZ_TYPE_TO_DATASET[bizType];
      const query = restrictList(
        {
          where: { id: { $in: [...ids] } },
          select: ["id", meta.titleField],
          currentPage: 1,
          pageSize: 100,
        },
        context,
      );
      const result = await models.byTable(meta.tableName).filter(query);
      for (const item of rowsOf(result)) {
        const key = `${bizType}:${String(item.id)}`;
        visibleTargets.add(key);
        titleByTarget.set(key, item?.[meta.titleField] || null);
      }
    }),
  );
  const tableData = rows.flatMap((row, index) => {
    const target = targets[index];
    const key = target?.applicationId
      ? `${target.applicationType}:${String(target.applicationId)}`
      : "";
    if (!actor.canReadAll && (!key || !visibleTargets.has(key))) return [];
    return [
      {
        ...row,
        application_type: target?.applicationType || null,
        application_id: target?.applicationId || null,
        application_title: key ? titleByTarget.get(key) || null : null,
      },
    ];
  });
  return {
    ...response,
    tableData,
    paging: response?.paging
      ? {
          ...response.paging,
          totalCount: actor.canReadAll
            ? response.paging.totalCount
            : tableData.length,
        }
      : response?.paging,
  };
}

export default async function cpoPolicyRead(params, context) {
  const config = params?.config;
  const request =
    params?.request && typeof params.request === "object" ? params.request : {};
  if (!config?.tableName || !optionalText(config.resource)) {
    throw new Error("INVALID_PARAMS:policy read config is required");
  }
  if (config.mode === "main") return readMain({ request, config, context });
  if (config.mode === "child") return readChild({ request, config, context });
  if (config.mode === "polymorphic_child") {
    return readPolymorphicChild({ request, config, context });
  }
  if (config.mode === "invoice_link") {
    const model = context.client.models.byTable(config.tableName);
    if (!model?.filter) throw new Error("MODEL_MISSING:bizInvoiceLink");
    return enrichInvoiceLinks(await model.filter(request), context);
  }
  throw new Error(
    `INVALID_PARAMS:unsupported policy read mode ${optionalText(config.mode)}`,
  );
}
