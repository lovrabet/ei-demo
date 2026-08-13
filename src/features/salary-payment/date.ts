import dayjs from "dayjs";

export function parseSalaryPaymentDate(
  value: unknown,
  fallback: dayjs.Dayjs,
): dayjs.Dayjs {
  if (value === undefined || value === null || value === "") return fallback;

  const normalized =
    typeof value === "string" && /^[+-]?\d{12,}$/.test(value.trim())
      ? Number(value)
      : value;
  const parsed =
    typeof normalized === "number"
      ? dayjs(normalized)
      : dayjs(String(normalized));

  return parsed.isValid() ? parsed : fallback;
}
