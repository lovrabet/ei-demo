import { lovrabetClient } from "@/api/client";
import type { ContractCenterResponse, ContractCenterScope } from "./types";

const EMPTY_RESPONSE: ContractCenterResponse = {
  scope: "application_reader",
  summary: {
    contractCount: 0,
    amountsByCurrency: {},
    receivableCount: 0,
    payableCount: 0,
    pendingSignatureCount: 0,
    overduePaymentCount: 0,
    invoicePendingAmount: 0,
    invoicePendingContractCount: 0,
  },
  scopeCounts: {
    all: 0,
    approval: 0,
    pendingSignature: 0,
    signed: 0,
    expiring: 0,
    voided: 0,
  },
  paging: { currentPage: 1, pageSize: 20, totalCount: 0 },
  tableData: [],
};

export async function getContractCenter(params: {
  scope: ContractCenterScope;
  direction?: "receivable" | "payable" | "";
  contractType?: string;
  keyword?: string;
  page: number;
  pageSize: number;
}): Promise<ContractCenterResponse> {
  const response = await lovrabetClient.bff.execute<ContractCenterResponse>({
    scriptName: "cpoGetContractCenter",
    params,
  });
  return {
    ...EMPTY_RESPONSE,
    ...response,
    summary: { ...EMPTY_RESPONSE.summary, ...(response.summary || {}) },
    scopeCounts: {
      ...EMPTY_RESPONSE.scopeCounts,
      ...(response.scopeCounts || {}),
    },
    paging: response.paging || {
      currentPage: params.page,
      pageSize: params.pageSize,
      totalCount: 0,
    },
    tableData: response.tableData || [],
  };
}
