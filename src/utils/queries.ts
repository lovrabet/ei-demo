/**
 * 通用查询工具
 * 用于构建 Lovrabet SDK 查询条件
 */

type WhereItem = Record<string, any>;

/**
 * 构建 where 条件，自动过滤空值并处理 $and
 * @example buildWhere([
 *   { deleted: { $eq: 0 } },
 *   params.name ? { name: { $contain: params.name } } : null,
 * ])
 */
export function buildWhere(conditions: WhereItem[]): WhereItem | undefined {
  const filtered = conditions.filter(Boolean);
  if (filtered.length === 0) {
    return undefined;
  }
  if (filtered.length === 1) {
    return filtered[0];
  }
  return { $and: filtered };
}

/**
 * 解析页码参数，无效值返回 fallback
 */
export function parsePageNumber(
  value: string | null,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) {
    return fallback;
  }
  return result;
}
