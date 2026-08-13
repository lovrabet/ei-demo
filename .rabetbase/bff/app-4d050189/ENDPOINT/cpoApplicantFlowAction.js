/**
 * 申请人删除草稿附件、删除草稿（draft 阶段专用）。
 *
 * [脚本描述] 仅允许申请人本人删除 draft 草稿附件或逻辑删除 draft 草稿；正式流程的撤回/作废已由平台原生审批流接管（cancelPlatformProcess）
 * [接口路径] POST /api/endpoint/app-4d050189/cpoApplicantFlowAction
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * { "bizType": "expense|invoice|contract|payment|salary_payment|travel|crm_contract", "bizId": 123, "action": "delete_attachment|delete_draft", "attachmentId": 456, "comment": "原因（可选）" }
 *
 * [返回数据结构]
 * { bizType, bizId, action, status, isDeleted, attachmentId?, cleanup?, summary? }
 */
const DATASET_CODES = {
  attachment: "ab17964f0efd46f78cecb4969140f257",
  expenseItem: "d99c32ef07b749948cc24fd391f8fd2c",
  salaryPaymentItem: "19ef166f3d2242a19911ccb8a5685bb8",
  contractPaymentPlan: "08e17d8ba3a24e938fef89816c8f4ccb",
  crmReceivablePlan: "c4c7c35bfe244a78b08667e649b05640",
  bizInvoiceLink: "9dd0d102219145ddbb67d1c247a84fb9",
  bizRelation: "1a4139b6d59a493ea89111d936e27238",
  bizTask: "da9cddc0fd244545b94ae7cddfde21ea",
};

function normalizeBizId(value) {
  const candidate =
    value && typeof value === "object"
      ? (value.id ??
        value.result?.id ??
        value.data?.id ??
        value.data?.result?.id)
      : value;
  const numericBizId = Number(candidate);
  if (!Number.isFinite(numericBizId) || numericBizId <= 0) {
    throw new Error("INVALID_PARAMS:bizId must be a finite positive number");
  }
  return numericBizId;
}

function normalizeAttachmentId(value) {
  const numericAttachmentId = Number(value);
  if (!Number.isFinite(numericAttachmentId) || numericAttachmentId <= 0) {
    throw new Error(
      "INVALID_PARAMS:attachmentId must be a finite positive number",
    );
  }
  return numericAttachmentId;
}

function optionalText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

function idsOf(rows) {
  return Array.from(
    new Set(
      (rows || [])
        .map((row) => Number(row?.id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
}

function modelOf(models, datasetCode, label) {
  const model = models[`dataset_${datasetCode}`];
  if (!model?.filter || !model?.update) {
    throw new Error(`MODEL_MISSING:${label}`);
  }
  return model;
}

async function findRows(model, where, select, pageSize = 1000) {
  return rowsOf(
    await model.filter({
      where,
      select,
      currentPage: 1,
      pageSize,
    }),
  );
}

async function deleteIds(model, ids, extra = {}) {
  if (!ids.length) return 0;
  if (!model?.delete) throw new Error("MODEL_DELETE_MISSING");
  if (Object.keys(extra).length) {
    await model.update({ id: ids, ...extra });
  }
  for (const id of ids) {
    await model.delete({ id });
  }
  return ids.length;
}

async function assertDraftDeleted(mainModel, bizType, bizId) {
  if (!mainModel?.filter) throw new Error(`MODEL_MISSING:${bizType}`);
  const remaining = await findRows(
    mainModel,
    { id: { $eq: bizId } },
    ["id"],
    1,
  );
  if (remaining.length) {
    throw new Error(`DRAFT_DELETE_NOT_APPLIED:${bizType}:${bizId}`);
  }
}

async function deleteOwnedDraftAttachment({
  context,
  bizType,
  bizId,
  attachmentId,
}) {
  const attachmentModel =
    context.client.models[`dataset_${DATASET_CODES.attachment}`];
  if (
    !attachmentModel?.getOne ||
    !attachmentModel?.filter ||
    !attachmentModel?.delete
  ) {
    throw new Error("MODEL_MISSING:attachment");
  }

  const attachment = await attachmentModel.getOne({ id: attachmentId });
  if (!attachment?.id) {
    throw new Error(`ATTACHMENT_NOT_FOUND:${attachmentId}`);
  }
  if (
    optionalText(attachment.biz_type) !== bizType ||
    Number(attachment.biz_id) !== bizId
  ) {
    throw new Error(
      `ATTACHMENT_BUSINESS_MISMATCH:${attachmentId}:${bizType}:${bizId}`,
    );
  }

  await attachmentModel.delete({ id: attachmentId });
  const remaining = await findRows(
    attachmentModel,
    { id: { $eq: attachmentId } },
    ["id"],
    1,
  );
  if (remaining.length) {
    throw new Error(`ATTACHMENT_DELETE_NOT_APPLIED:${attachmentId}`);
  }
}

/**
 * 草稿删除属于数据生命周期操作，不属于工作流状态迁移。
 * 在同一事务内逻辑删除主单、草稿子项、附件和关系；不写业务操作流水。
 */
async function logicalDeleteDraftAggregate({
  context,
  meta,
  bizType,
  bizId,
  actorUserId,
}) {
  if (!context.client.db?.transaction) {
    throw new Error("TRANSACTION_CLIENT_MISSING:delete_draft");
  }

  return context.client.db.transaction(async (tx) => {
    const models = tx.models;
    const mainModel = models[meta.modelKey];
    if (!mainModel?.getOne || !mainModel?.update || !mainModel?.delete) {
      throw new Error(`MODEL_MISSING:${meta.modelKey}`);
    }

    const current = await mainModel.getOne({ id: bizId });
    if (!current?.id) {
      throw new Error(`BIZ_NOT_FOUND:${bizType}:${bizId}`);
    }
    const currentStatus = optionalText(current[meta.statusField]);
    if (currentStatus !== "draft") {
      throw new Error(`DRAFT_DELETE_FORBIDDEN:${bizType}:${currentStatus}`);
    }
    if (optionalText(current.applicant_user_id) !== actorUserId) {
      throw new Error(`APPLICANT_MISMATCH:${bizType}:${bizId}`);
    }

    const taskModel = modelOf(models, DATASET_CODES.bizTask, "bizTask");
    const pendingTasks = await findRows(
      taskModel,
      {
        biz_type: { $eq: bizType },
        biz_id: { $eq: bizId },
        status: { $eq: "pending" },
      },
      ["id"],
      100,
    );
    if (pendingTasks.length) {
      throw new Error(`DRAFT_DELETE_PENDING_TASK_EXISTS:${bizType}:${bizId}`);
    }

    const attachmentModel = modelOf(
      models,
      DATASET_CODES.attachment,
      "attachment",
    );
    const relationModel = modelOf(
      models,
      DATASET_CODES.bizRelation,
      "bizRelation",
    );
    const invoiceLinkModel = modelOf(
      models,
      DATASET_CODES.bizInvoiceLink,
      "bizInvoiceLink",
    );

    const [attachments, relations, directInvoiceLinks] = await Promise.all([
      findRows(
        attachmentModel,
        {
          biz_type: { $eq: bizType },
          biz_id: { $eq: bizId },
        },
        ["id"],
      ),
      findRows(
        relationModel,
        {
          $and: [
            {
              $or: [
                {
                  source_biz_type: { $eq: bizType },
                  source_biz_id: { $eq: bizId },
                },
                {
                  target_biz_type: { $eq: bizType },
                  target_biz_id: { $eq: bizId },
                },
              ],
            },
          ],
        },
        ["id"],
      ),
      findRows(
        invoiceLinkModel,
        bizType === "invoice"
          ? {
              $and: [
                {
                  $or: [
                    {
                      biz_type: { $eq: bizType },
                      biz_id: { $eq: bizId },
                    },
                    { invoice_id: { $eq: bizId } },
                  ],
                },
              ],
            }
          : {
              biz_type: { $eq: bizType },
              biz_id: { $eq: bizId },
            },
        ["id"],
      ),
    ]);

    let childModel = null;
    let childRows = [];
    let expenseItemInvoiceLinks = [];

    if (bizType === "expense") {
      childModel = modelOf(models, DATASET_CODES.expenseItem, "expenseItem");
      childRows = await findRows(childModel, { expense_id: { $eq: bizId } }, [
        "id",
      ]);
      const itemIds = idsOf(childRows);
      if (itemIds.length) {
        expenseItemInvoiceLinks = await findRows(
          invoiceLinkModel,
          {
            biz_type: { $eq: "expense_item" },
            biz_id: { $in: itemIds },
          },
          ["id"],
        );
      }
    } else if (bizType === "salary_payment") {
      childModel = modelOf(
        models,
        DATASET_CODES.salaryPaymentItem,
        "salaryPaymentItem",
      );
      childRows = await findRows(
        childModel,
        { salary_payment_id: { $eq: bizId } },
        ["id"],
      );
    } else if (bizType === "contract") {
      childModel = modelOf(
        models,
        DATASET_CODES.contractPaymentPlan,
        "contractPaymentPlan",
      );
      childRows = await findRows(childModel, { contract_id: { $eq: bizId } }, [
        "id",
        "linked_payment_application_id",
      ]);
      if (
        childRows.some((row) => {
          const linkedId = row.linked_payment_application_id;
          return (
            linkedId !== undefined &&
            linkedId !== null &&
            linkedId !== "" &&
            Number.isFinite(Number(linkedId)) &&
            Number(linkedId) > 0
          );
        })
      ) {
        throw new Error(`DRAFT_DELETE_LINKED_PAYMENT_EXISTS:contract:${bizId}`);
      }
    }

    // 发票台账一旦被报销、付款或合同使用，就不能从发票入口单独删除。
    // 应先在来源业务中解除正式关联；直接级联删除会让来源单据保留一个
    // 无法打开的 invoice_id，并破坏发票覆盖金额与明细列表的一致性。
    if (bizType === "invoice" && directInvoiceLinks.length) {
      throw new Error(`DRAFT_DELETE_LINKED_BUSINESS_EXISTS:invoice:${bizId}`);
    }

    const invoiceLinkIds = idsOf([
      ...directInvoiceLinks,
      ...expenseItemInvoiceLinks,
    ]);
    const cleanup = {
      invoiceLinks: await deleteIds(invoiceLinkModel, invoiceLinkIds),
      childRecords: childModel
        ? await deleteIds(childModel, idsOf(childRows))
        : 0,
      attachments: await deleteIds(attachmentModel, idsOf(attachments)),
      relations: await deleteIds(relationModel, idsOf(relations), {
        relation_status: "cancelled",
      }),
    };

    await mainModel.delete({ id: bizId });
    await assertDraftDeleted(mainModel, bizType, bizId);
    return cleanup;
  });
}

async function logicalDeleteReceivableDraftAggregate({
  context,
  meta,
  bizId,
  actorUserId,
}) {
  const mainModel = context.client.models[meta.modelKey];
  const planModel =
    context.client.models[`dataset_${DATASET_CODES.crmReceivablePlan}`];
  const attachmentModel =
    context.client.models[`dataset_${DATASET_CODES.attachment}`];
  const taskModel = context.client.models[`dataset_${DATASET_CODES.bizTask}`];
  const current = await mainModel.getOne({ id: bizId });
  if (!current?.id) {
    throw new Error(`BIZ_NOT_FOUND:crm_contract:${bizId}`);
  }
  if (optionalText(current[meta.statusField]) !== "draft") {
    throw new Error(
      `DRAFT_DELETE_FORBIDDEN:crm_contract:${optionalText(current[meta.statusField])}`,
    );
  }
  if (optionalText(current.applicant_user_id) !== actorUserId) {
    throw new Error(`APPLICANT_MISMATCH:crm_contract:${bizId}`);
  }
  const pendingTasks = await findRows(
    taskModel,
    {
      biz_type: { $eq: "crm_contract" },
      biz_id: { $eq: bizId },
      status: { $eq: "pending" },
    },
    ["id"],
    100,
  );
  if (pendingTasks.length) {
    throw new Error(`DRAFT_DELETE_PENDING_TASK_EXISTS:crm_contract:${bizId}`);
  }
  const [plans, attachments] = await Promise.all([
    findRows(planModel, { contract_id: { $eq: bizId } }, ["id"], 500),
    findRows(
      attachmentModel,
      {
        biz_type: { $eq: "crm_contract" },
        biz_id: { $eq: bizId },
      },
      ["id"],
      500,
    ),
  ]);
  const cleanup = {
    childRecords: idsOf(plans).length,
    attachments: await deleteIds(attachmentModel, idsOf(attachments)),
    invoiceLinks: 0,
    relations: 0,
  };
  if (idsOf(plans).length) {
    await planModel.update({ id: idsOf(plans), status: "CANCELLED" });
  }
  if (!mainModel?.delete) throw new Error(`MODEL_MISSING:${meta.modelKey}`);
  await mainModel.delete({ id: bizId });
  await assertDraftDeleted(mainModel, "crm_contract", bizId);
  return cleanup;
}

export default async function cpoApplicantFlowAction(params, context) {
  const { bizType, bizId, action, comment = "" } = params || {};
  if (!bizType || bizId === undefined || bizId === null || !action) {
    throw new Error("INVALID_PARAMS:bizType,bizId,action are required");
  }
  const numericBizId = normalizeBizId(bizId);
  const bff = context.client.bff;
  const [{ BIZ_TYPE_TO_DATASET }, actor] = await Promise.all([
    bff.execute({ scriptName: "cpoDatasetMap", params: {} }),
    bff.execute({ scriptName: "cpoCurrentActor", params: {} }),
  ]);
  const meta = BIZ_TYPE_TO_DATASET && BIZ_TYPE_TO_DATASET[bizType];
  if (!meta) throw new Error(`INVALID_BIZ_TYPE:${bizType}`);

  const actorUserId = optionalText(actor.userId);
  if (!actorUserId) throw new Error("CURRENT_ACTOR_MISSING");

  const { record } = await bff.execute({
    scriptName: "cpoBizResolver",
    params: { bizType, bizId: numericBizId, meta },
  });
  const currentStatus = record[meta.statusField];

  if (action === "delete_attachment") {
    if (currentStatus !== "draft") {
      throw new Error(
        `ATTACHMENT_DELETE_FORBIDDEN:${bizType}:${currentStatus}`,
      );
    }
    if (optionalText(record.applicant_user_id) !== actorUserId) {
      throw new Error(`APPLICANT_MISMATCH:${bizType}:${numericBizId}`);
    }
    const attachmentId = normalizeAttachmentId(params?.attachmentId);
    await deleteOwnedDraftAttachment({
      context,
      bizType,
      bizId: numericBizId,
      attachmentId,
    });
    return {
      bizType,
      bizId: numericBizId,
      action,
      status: "draft",
      attachmentId,
      isDeleted: true,
    };
  }

  if (action === "delete_draft") {
    if (currentStatus !== "draft") {
      throw new Error(`DRAFT_DELETE_FORBIDDEN:${bizType}:${currentStatus}`);
    }
    if (optionalText(record.applicant_user_id) !== actorUserId) {
      throw new Error(`APPLICANT_MISMATCH:${bizType}:${numericBizId}`);
    }
    const cleanup =
      bizType === "crm_contract"
        ? await logicalDeleteReceivableDraftAggregate({
            context,
            meta,
            bizId: numericBizId,
            actorUserId,
          })
        : await logicalDeleteDraftAggregate({
            context,
            meta,
            bizType,
            bizId: numericBizId,
            actorUserId,
          });
    return {
      bizType,
      bizId: numericBizId,
      action,
      status: "draft",
      isDeleted: true,
      currentTaskId: null,
      cleanup,
    };
  }

  // 正式流程（非草稿）的撤回/作废已由平台原生审批流接管（前端走 cancelPlatformProcess）。
  // legacy 状态机的 withdraw/cancel 依赖 biz_task 待办，已随自建状态机废弃清空，
  // 此处不再提供，避免对平台单据产生 PENDING_TASK_NOT_FOUND 之类的误导性错误。
  throw new Error(
    `APPLICANT_ACTION_NOT_SUPPORTED:${action}:仅支持 delete_attachment/delete_draft，正式流程请使用平台审批中心`,
  );
}
