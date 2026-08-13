/**
 * 日期格式化工具（从报价模块抽取为通用工具，避免法务页面依赖报价 feature）。
 */

export function formatDateText(value?: string | number | Date | null) {
  if (!value) {
    return "-";
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  const pad = (next: number) => String(next).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
  ].join("");
}

export function formatDateTimeText(value?: string | number | Date | null) {
  if (!value) {
    return "-";
  }
  if (typeof value === "string") {
    const mysqlMatch = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})/);
    if (mysqlMatch) {
      return `${mysqlMatch[1]} ${mysqlMatch[2]}:${mysqlMatch[3]}`;
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  const pad = (next: number) => String(next).padStart(2, "0");
  return [
    formatDateText(date),
    " ",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}
