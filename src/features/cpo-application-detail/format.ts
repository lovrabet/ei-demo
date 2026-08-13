import type {
  DetailField,
  WorkflowAction,
  WorkflowPlanStep,
  WorkflowTask,
} from "./types";

function optionalText(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function numberValue(value: unknown) {
  if (value === "" || value === undefined || value === null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function timestampOf(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const timestamp = new Date(String(value).replace(" ", "T")).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatDateValue(value: unknown, includeTime = false) {
  if (value === undefined || value === null || value === "") return "-";
  const text = String(value).trim();
  const normalized = text.replace("T", " ");
  if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) {
    return includeTime ? normalized.slice(0, 16) : normalized.slice(0, 10);
  }
  const date = new Date(value as string | number);
  if (!Number.isFinite(date.getTime())) return text || "-";
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return includeTime
    ? `${datePart} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    : datePart;
}

export function formatCompanions(value: unknown) {
  const text = optionalText(value);
  if (!text) return "-";
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return text;
    const names = parsed
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (!item || typeof item !== "object") return "";
        return optionalText(item.name || item.userName || item.label);
      })
      .filter(Boolean);
    return names.length ? names.join("、") : "-";
  } catch {
    return text;
  }
}

export function formatDetailValue(
  value: unknown,
  field: DetailField,
  record: Record<string, unknown> = {},
) {
  if (value === undefined || value === null || value === "") return "-";
  if (field.options) {
    const label = field.options[String(value)];
    if (label) return label;
  }

  if (field.format === "money") {
    const amount = numberValue(value);
    if (amount === undefined) return optionalText(value) || "-";
    const currency =
      optionalText(
        field.currencyField ? record[field.currencyField] : undefined,
      ) || "CNY";
    try {
      return new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  }

  if (field.format === "percent") {
    const number = numberValue(value);
    if (number === undefined) return optionalText(value) || "-";
    const percent = Math.abs(number) <= 1 ? number * 100 : number;
    return `${Number(percent.toFixed(2))}%`;
  }
  if (field.format === "date") return formatDateValue(value);
  if (field.format === "datetime") return formatDateValue(value, true);
  if (field.format === "boolean")
    return Number(value) === 1 || value === true ? "是" : "否";
  if (field.format === "companions") return formatCompanions(value);

  return optionalText(value) || "-";
}

export function selectCurrentTask(tasks: WorkflowTask[]) {
  return [...tasks]
    .filter((task) => task.status === "pending")
    .sort(
      (left, right) =>
        timestampOf(right.created_at) - timestampOf(left.created_at),
    )[0];
}

export function sortActionsAscending(actions: WorkflowAction[]) {
  return [...actions].sort(
    (left, right) =>
      timestampOf(left.created_at) - timestampOf(right.created_at),
  );
}

export function selectLatestSubmitAction(actions: WorkflowAction[]) {
  return [...actions]
    .filter((action) => action.action === "submit")
    .sort(
      (left, right) =>
        timestampOf(right.created_at) - timestampOf(left.created_at),
    )[0];
}

export function splitWorkflowJourneyActions(
  actions: WorkflowAction[],
  applicationStatus?: string,
) {
  const sortedActions = sortActionsAscending(actions);
  const latestSubmitAction = selectLatestSubmitAction(sortedActions);
  const journeyIsActive = !["draft", "cancelled"].includes(
    applicationStatus || "",
  );
  if (!latestSubmitAction || !journeyIsActive) {
    return {
      historicalActions: sortedActions,
      currentSubmitAction: undefined,
    };
  }

  const latestSubmitIndex = sortedActions.findIndex(
    (action) => action === latestSubmitAction,
  );
  return {
    historicalActions: sortedActions.slice(0, latestSubmitIndex),
    currentSubmitAction: latestSubmitAction,
  };
}

export function isHistoricalPaidCompletion(
  actions: WorkflowAction[],
  applicationStatus?: string,
) {
  return (
    applicationStatus === "paid_confirmed" &&
    actions.some((action) => action.action === "confirm_legacy_paid")
  );
}

export function getVisibleWorkflowPlanRows(
  rows: WorkflowPlanStep[],
  actions: WorkflowAction[],
  applicationStatus?: string,
) {
  if (["rejected", "cancelled", "invalid"].includes(applicationStatus || "")) {
    return rows.filter(
      (row) => row.state !== "upcoming" && row.state !== "current",
    );
  }

  if (["signed", "archived"].includes(applicationStatus || "")) {
    return rows
      .map((row) =>
        row.taskType === "sign" && row.state === "upcoming"
          ? { ...row, state: "completed" as const }
          : row,
      )
      .filter((row) => row.state !== "upcoming" && row.state !== "current");
  }

  return isHistoricalPaidCompletion(actions, applicationStatus)
    ? rows.filter((row) => row.state !== "upcoming")
    : rows;
}

const COMPLETED_WORKFLOW_STATUSES = new Set([
  "reviewed",
  "signed",
  "archived",
  "paid_confirmed",
  "completed",
  "used",
]);

export function isWorkflowJourneyCompleted(
  rows: WorkflowPlanStep[],
  applicationStatus?: string,
) {
  if (!COMPLETED_WORKFLOW_STATUSES.has(applicationStatus || "")) return false;
  return !rows.some((row) =>
    ["upcoming", "current", "rejected"].includes(row.state),
  );
}
