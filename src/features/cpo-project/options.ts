import { useEffect, useState } from "react";
import { lovrabetClient } from "@/api/client";
import {
  listCpoDictionaryOptions,
  type CpoDictionaryOption,
} from "@/features/cpo-dictionary/options";

/**
 * 项目库数据集（cpo_project 表）code。
 * 平台侧数据集创建后填入实际 code；为空时直接回退字典选项。
 */
export const CPO_PROJECT_DATASET_CODE = "";

export type ProjectOption = CpoDictionaryOption;

async function listProjectOptionsFromDataset(): Promise<ProjectOption[]> {
  const response = await (
    lovrabetClient.models as Record<string, { filter: (params: unknown) => Promise<{ tableData?: unknown[] }> }>
  )[`dataset_${CPO_PROJECT_DATASET_CODE}`].filter({
    select: ["id", "code", "name", "sort_order"],
    where: {
      $and: [{ is_deleted: { $eq: 0 } }],
    },
    orderBy: [{ sort_order: "asc" }, { id: "asc" }],
    currentPage: 1,
    pageSize: 200,
  });
  const rows = response?.tableData || [];
  return rows.map((row: any) => ({
    value: String(row.code ?? ""),
    label: String(row.name ?? row.code ?? ""),
  }));
}

export async function listProjectOptions(): Promise<ProjectOption[]> {
  if (CPO_PROJECT_DATASET_CODE) {
    try {
      const options = await listProjectOptionsFromDataset();
      if (options.length > 0) return options;
    } catch (error) {
      // 项目库数据集尚未创建或配置时，回退到字典选项
      console.warn("Failed to load project options from dataset, fallback to dictionary", error);
    }
  }
  return listCpoDictionaryOptions("expense_project");
}

export function useProjectOptions() {
  const [options, setOptions] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    listProjectOptions()
      .then((nextOptions) => {
        if (active) setOptions(nextOptions);
      })
      .catch((nextError) => {
        if (!active) return;
        setOptions([]);
        setError(nextError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { options, loading, error };
}
