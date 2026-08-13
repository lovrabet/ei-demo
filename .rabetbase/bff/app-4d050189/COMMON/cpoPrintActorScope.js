/**
 * 判定当前用户在指定申请单上的打印角色作用域。
 *
 * [脚本描述] application_read_all_user 作为财务打印角色；单据任务参与人按财务任务或审批任务归类；其他可读用户归入业务侧
 * [脚本名称] cpoPrintActorScope
 * [脚本类型] COMMON
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoPrintActorScope.js
 *
 * @param {Object} params { bizType, bizId, actor, dictionary }
 *   actor/dictionary 由调用方（ENDPOINT）通过 cpoCurrentActor/cpoDictionary 取好后传入，
 *   因为平台不允许 COMMON 再调用其他 COMMON。
 * @returns {Promise<{actor:Object,roleScope:string,roleLabel:string,isFinance:boolean,financeUserIds:string[]}>}
 */
const BIZ_TASK_MODEL_KEY = "dataset_da9cddc0fd244545b94ae7cddfde21ea"; // 数据集: 业务任务 | 数据表: biz_task
const FINANCE_TASK_TYPES = new Set(["create_voucher", "pay", "confirm"]);
const FINANCE_ASSIGNEE_ROLES = new Set([
  "voucher_creator",
  "payer",
  "confirmer",
]);

function optionalText(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function positiveId(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("INVALID_PARAMS:bizId must be a positive number");
  }
  return numeric;
}

function financeUserIdsOf(dictionary) {
  return Object.keys(dictionary?.application_read_all_user || {})
    .map(optionalText)
    .filter(Boolean);
}

async function loadActorTasks(context, bizType, bizId, actorUserId) {
  const taskModel = context.client.models[BIZ_TASK_MODEL_KEY];
  if (!taskModel?.filter) return [];
  const response = await taskModel.filter({
    where: {
      biz_type: { $eq: bizType },
      biz_id: { $eq: bizId },
      $or: [
        { assignee_user_id: { $eq: actorUserId } },
        { completed_by_user_id: { $eq: actorUserId } },
      ],
    },
    select: [
      "task_type",
      "assignee_role",
      "assignee_user_id",
      "completed_by_user_id",
    ],
    currentPage: 1,
    pageSize: 200,
  });
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

function taskIsFinance(task) {
  return (
    FINANCE_TASK_TYPES.has(optionalText(task?.task_type).toLowerCase()) ||
    FINANCE_ASSIGNEE_ROLES.has(optionalText(task?.assignee_role).toLowerCase())
  );
}

export default async function cpoPrintActorScope(params, context) {
  const bizType = optionalText(params?.bizType);
  const bizId = positiveId(params?.bizId);
  if (!bizType) throw new Error("INVALID_PARAMS:bizType is required");
  const actor = params?.actor;
  const dictionary = params?.dictionary;
  const actorUserId = optionalText(actor?.userId);
  if (!actorUserId) throw new Error("CPO_ACTOR_MISSING");
  const financeUserIds = financeUserIdsOf(dictionary);
  if (financeUserIds.includes(actorUserId)) {
    return {
      actor,
      roleScope: "finance",
      roleLabel: "财务侧",
      isFinance: true,
      financeUserIds,
    };
  }

  const tasks = await loadActorTasks(context, bizType, bizId, actorUserId);
  if (tasks.some(taskIsFinance)) {
    return {
      actor,
      roleScope: "finance",
      roleLabel: "财务侧",
      isFinance: true,
      financeUserIds: Array.from(new Set([...financeUserIds, actorUserId])),
    };
  }
  if (tasks.length) {
    return {
      actor,
      roleScope: "approver",
      roleLabel: "审批侧",
      isFinance: false,
      financeUserIds,
    };
  }
  return {
    actor,
    roleScope: "business",
    roleLabel: "业务侧",
    isFinance: false,
    financeUserIds,
  };
}
