import { CPO_STATUS_LABEL, CPO_TASK_TYPE_LABEL } from "./routes";

/**
 * legacy 申请流程状态展示。平台单据（有 flow_status）由列表页走
 * platformFlowStatusMeta，不经此函数。
 */
export type ApplicationFlowStatusInput = {
  status?: string;
  currentTaskType?: string;
};

const STATUS_COLOR: Record<string, string> = {
  draft: "default",
  submitted: "processing",
  reviewed: "blue",
  rejected: "red",
  signed: "cyan",
  archived: "green",
  completed: "green",
  voucher_created: "geekblue",
  bank_review_pending: "gold",
  bank_pending: "orange",
  paid_confirmed: "green",
  payment_failed: "red",
  cancelled: "default",
};

const TASK_COLOR: Record<string, string> = {
  review: "blue",
  create_voucher: "geekblue",
  pay: "orange",
  bank_review: "gold",
  confirm: "green",
  sign: "cyan",
  archive: "default",
  supplement_material: "purple",
};

function optionalText(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

/**
 * 有待办任务时优先显示任务节点（如"审核中"），否则显示业务状态标签。
 */
export function getApplicationFlowStatus(
  value: ApplicationFlowStatusInput,
): { label: string; color: string } {
  const taskType = optionalText(value?.currentTaskType);
  if (taskType) {
    return {
      label: CPO_TASK_TYPE_LABEL[taskType] || taskType,
      color: TASK_COLOR[taskType] || "default",
    };
  }
  const status = optionalText(value?.status).toLowerCase();
  if (!status) return { label: "-", color: "default" };
  return {
    label: CPO_STATUS_LABEL[status] || status,
    color: STATUS_COLOR[status] || "default",
  };
}
