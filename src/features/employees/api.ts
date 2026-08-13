import { lovrabetClient } from "@/api/client";

/**
 * 员工选项查询（合同接口人、差旅同行人选人下拉）。
 *
 * 数据源为平台 employee 数据集；员工规模小（demo 12 人），全量拉取后
 * 在前端按工号/姓名/花名/邮箱过滤，避免依赖不确定的 $like 语法。
 */

export type EmployeeOption = {
  userId: string;
  username: string;
  snapshotName: string;
  email?: string;
  yuntooEmail?: string;
  workNo?: string;
};

function optionalText(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function toEmployeeOption(row: Record<string, unknown>): EmployeeOption {
  return {
    userId: optionalText(row.id),
    username: optionalText(row.username),
    snapshotName: optionalText(row.full_name),
    email: optionalText(row.email),
    yuntooEmail: optionalText(row.yuntoo_email),
    workNo: optionalText(row.work_no),
  };
}

export async function listEmployeeOptions(
  keyword: string,
): Promise<EmployeeOption[]> {
  const result = await lovrabetClient.models.employee.filter({
    where: { deleted: { $eq: false } },
    currentPage: 1,
    pageSize: 500,
    orderBy: [{ work_no: "asc" }],
  });
  const rows = Array.isArray(result?.tableData) ? result.tableData : [];
  const employees = rows.map(toEmployeeOption);
  const query = keyword.trim().toLowerCase();
  if (!query) return employees;
  return employees.filter((employee) =>
    [employee.workNo, employee.snapshotName, employee.username, employee.email]
      .filter(Boolean)
      .map((value) => value!.toLowerCase())
      .some((value) => value.includes(query)),
  );
}

export function employeeToSelectOption(employee: EmployeeOption) {
  return {
    value: employee.userId,
    label: employee.snapshotName,
    secondary: undefined as string | undefined,
    employee,
  };
}

export function findEmployeeByValue(
  employees: EmployeeOption[],
  value?: string | null,
): EmployeeOption | undefined {
  const target = optionalText(value);
  if (!target) return undefined;
  return employees.find((employee) => employee.userId === target);
}
