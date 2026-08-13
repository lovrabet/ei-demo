import { useEffect, useState } from "react";
import { lovrabetClient } from "@/api/client";

export type CpoDictionaryOption = {
  value: string;
  label: string;
};

type DictionaryOptionsResponse = {
  tableData?: CpoDictionaryOption[];
};

export async function listCpoDictionaryOptions(category: string) {
  const response = await lovrabetClient.bff.execute<DictionaryOptionsResponse>({
    scriptName: "cpoGetDictionaryOptions",
    params: { category },
  });
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

export function useCpoDictionaryOptions(category: string) {
  const [options, setOptions] = useState<CpoDictionaryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    listCpoDictionaryOptions(category)
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
  }, [category]);

  return { options, loading, error };
}
