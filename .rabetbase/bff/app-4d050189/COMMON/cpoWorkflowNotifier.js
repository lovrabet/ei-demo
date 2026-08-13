/**
 * 审批流消息通知适配器（叶子 COMMON：不调用其它 COMMON）。
 *
 * [脚本描述] 将审批领域事件转换为平台标准通知消息；当前投递到应用级 Webhook 配置
 * [脚本名称] cpoWorkflowNotifier
 * [脚本类型] COMMON（leaf）
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoWorkflowNotifier.js
 *
 * @param {Object} params
 * @param {number|string} [params.eventId] 操作流水 ID，预留给后续 Outbox 幂等键
 * @param {"TASK_ASSIGNED"|"WORKFLOW_REJECTED"|"WORKFLOW_COMPLETED"|"WORKFLOW_CANCELLED"|"WORKFLOW_UPDATED"} params.eventType
 * @param {string} params.bizType
 * @param {number|string} params.bizId
 * @param {string} params.action
 * @param {string} [params.fromStatus]
 * @param {string} params.toStatus
 * @param {string} [params.comment]
 * @param {Object} params.summary
 * @param {Object} [params.nextTask]
 * @param {Object} [params.actor]
 * @returns {Promise<{sent:boolean,configCode:string,channelType:string,eventType:string,eventId?:number|string}>}
 */
const CONFIG_CODE = "ncc_b47e8b3887624c55bee730cdaa5733cf";
const APP_CODE = "app-4d050189";

const EVENT_POLICIES = {
  TASK_ASSIGNED: {
    title: "审批待办通知",
    summarySuffix: "已产生新的审批待办",
    theme: "blue",
  },
  WORKFLOW_REJECTED: {
    title: "审批驳回通知",
    summarySuffix: "已被驳回",
    theme: "red",
  },
  WORKFLOW_COMPLETED: {
    title: "审批完成通知",
    summarySuffix: "审批流程已完成",
    theme: "green",
  },
  WORKFLOW_CANCELLED: {
    title: "审批取消通知",
    summarySuffix: "已取消或撤回",
    theme: "grey",
  },
  WORKFLOW_UPDATED: {
    title: "审批状态通知",
    summarySuffix: "审批状态已更新",
    theme: "orange",
  },
};

const BIZ_TYPE_LABELS = {
  expense: "费用报销",
  invoice: "发票申请",
  invoice_application: "销项开票申请",
  contract: "合同申请",
  payment: "付款申请",
  salary_payment: "工资付款",
  travel: "差旅申请",
  quotation: "报价申请",
};

function optionalText(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function normalizePositiveId(value, fieldName, required = true) {
  if (!required && (value === undefined || value === null || value === "")) {
    return undefined;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`INVALID_PARAMS:${fieldName} must be a positive number`);
  }
  return numeric;
}

function normalizeBusinessTitle(summary, bizType, bizId) {
  const title = optionalText(summary?.title);
  if (!title) return "关联对象标题缺失";
  const internalFallbacks = new Set([
    `${bizType}#${bizId}`,
    `${bizType}-${bizId}`,
    String(bizId),
  ]);
  return internalFallbacks.has(title) ? "关联对象标题缺失" : title;
}

function buildApplicationUrl(context, bizType, bizId) {
  const candidate = optionalText(context?.appCode) || APP_CODE;
  const appCode = /^app-[a-z0-9]+$/i.test(candidate) ? candidate : APP_CODE;
  return `https://${appCode}.app.lovrabet.com/application-detail/${encodeURIComponent(bizType)}/${encodeURIComponent(String(bizId))}`;
}

function buildActions(eventType, applicationUrl) {
  const text = eventType === "TASK_ASSIGNED" ? "立即审批" : "查看申请";
  return {
    actions: [{ text, url: applicationUrl }],
  };
}

function fact(label, value) {
  const text = optionalText(value);
  return text ? { label, value: text } : null;
}

function buildFacts({
  bizType,
  bizTitle,
  toStatus,
  comment,
  summary,
  nextTask,
  actor,
}) {
  return [
    fact("业务类型", BIZ_TYPE_LABELS[bizType] || "业务申请"),
    fact("业务标题", bizTitle),
    fact("申请人", summary?.applicantName),
    fact("当前状态", toStatus),
    fact("当前步骤", nextTask?.stepName),
    fact("处理人", nextTask?.assigneeName),
    fact("操作人", actor?.name),
    fact("审批意见", comment),
  ].filter(Boolean);
}

export default async function cpoWorkflowNotifier(params, context) {
  const {
    eventId,
    eventType,
    bizType,
    bizId,
    action,
    fromStatus = "",
    toStatus,
    comment = "",
    summary = {},
    nextTask = null,
    actor = {},
  } = params || {};

  const policy = EVENT_POLICIES[eventType];
  if (!policy)
    throw new Error(`INVALID_PARAMS:unsupported eventType ${eventType}`);
  if (
    !optionalText(bizType) ||
    !optionalText(action) ||
    !optionalText(toStatus)
  ) {
    throw new Error("INVALID_PARAMS:bizType,action,toStatus are required");
  }

  const numericBizId = normalizePositiveId(bizId, "bizId");
  const numericEventId = normalizePositiveId(eventId, "eventId", false);
  const bizTitle = normalizeBusinessTitle(summary, bizType, numericBizId);
  const bizTypeLabel = BIZ_TYPE_LABELS[bizType] || "业务申请";
  const applicationUrl = buildApplicationUrl(context, bizType, numericBizId);
  const facts = buildFacts({
    bizType,
    bizTitle,
    toStatus,
    comment,
    summary,
    nextTask,
    actor,
  });

  const result = await context.client.extension.execute(
    "notification",
    "send",
    {
      configCode: CONFIG_CODE,
      audiences: [],
      message: {
        title: policy.title,
        summary: `${bizTypeLabel}“${bizTitle}”${policy.summarySuffix}`,
        theme: policy.theme,
        ...buildActions(eventType, applicationUrl),
        facts,
      },
    },
  );

  return {
    sent: result?.sent === true,
    configCode: result?.configCode || CONFIG_CODE,
    channelType: result?.channelType || "WEBHOOK",
    eventType,
    ...(numericEventId ? { eventId: numericEventId } : {}),
    fromStatus: optionalText(fromStatus),
  };
}
