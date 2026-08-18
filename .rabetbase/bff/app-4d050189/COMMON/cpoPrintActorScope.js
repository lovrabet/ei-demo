/**
 * 判定当前用户在指定申请单上的打印角色作用域。
 *
 * [脚本描述] application_read_all_user 作为财务打印角色；审批参与人由平台 Flow 管理，不再读取自研待办表
 * [脚本名称] cpoPrintActorScope
 * [脚本类型] COMMON
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoPrintActorScope.js
 *
 * @param {Object} params { bizType, bizId, actor, dictionary }
 *   actor/dictionary 由调用方（ENDPOINT）通过 cpoCurrentActor/cpoDictionary 取好后传入，
 *   因为平台不允许 COMMON 再调用其他 COMMON。
 * @returns {Promise<{actor:Object,roleScope:string,roleLabel:string,isFinance:boolean,financeUserIds:string[]}>}
 */
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

  return {
    actor,
    roleScope: "business",
    roleLabel: "业务侧",
    isFinance: false,
    financeUserIds,
  };
}
