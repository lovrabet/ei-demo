import dayjs, { type Dayjs } from "dayjs";

function numericTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!/^[+-]?\d+$/.test(text)) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}

export function parseExpenseRuleDate(value: unknown): Dayjs | null {
  if (value === undefined || value === null || value === "") return null;

  const timestamp = numericTimestamp(value);
  const normalized =
    timestamp === undefined
      ? value
      : Math.abs(timestamp) < 100_000_000_000
        ? timestamp * 1000
        : timestamp;
  const parsed = dayjs(normalized as dayjs.ConfigType);
  return parsed.isValid() ? parsed : null;
}

export function formatExpenseRuleDate(
  value: unknown,
  emptyText: string,
): string {
  if (value === undefined || value === null || value === "") return emptyText;
  return parseExpenseRuleDate(value)?.format("YYYY-MM-DD") || "日期格式异常";
}
