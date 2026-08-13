function datePart(parts: Intl.DateTimeFormatPart[], type: string) {
  return parts.find((part) => part.type === type)?.value || "";
}

export function normalizeInvoiceDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;

  const raw = String(value).trim();
  const datePrefix = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (datePrefix) return datePrefix[1];

  const numeric = Number(raw);
  const date = Number.isFinite(numeric)
    ? new Date(raw.length <= 10 ? numeric * 1000 : numeric)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return [
    datePart(parts, "year"),
    datePart(parts, "month"),
    datePart(parts, "day"),
  ].join("-");
}
