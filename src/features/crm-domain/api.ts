import { lovrabetClient } from "@/api/client";
import type {
  Customer360Response,
  ReceivableContractDetailResponse,
} from "./types";

export function getReceivableContractDetail(contractId: number) {
  return lovrabetClient.bff.execute<ReceivableContractDetailResponse>({
    scriptName: "cpoGetReceivableContractDetail",
    params: { contractId },
  });
}

export function manageReceivableContract(params: Record<string, unknown>) {
  return lovrabetClient.bff.execute<{
    success: boolean;
    contractId: number;
    planId?: number;
  }>({
    scriptName: "cpoManageReceivableContract",
    params,
  });
}

export function getCustomer360(params: {
  companyId?: number;
  keyword?: string;
}) {
  return lovrabetClient.bff.execute<Customer360Response>({
    scriptName: "cpoGetCustomer360",
    params,
  });
}

export function manageCustomer360(params: Record<string, unknown>) {
  return lovrabetClient.bff.execute<{
    success: boolean;
    companyId?: number;
    contactId?: number;
    followUpId?: number;
  }>({
    scriptName: "cpoManageCustomer360",
    params,
  });
}
