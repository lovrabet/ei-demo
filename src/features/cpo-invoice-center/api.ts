import { lovrabetClient } from "@/api/client";
import type { InvoiceCenterResponse, InvoiceCenterScope } from "./types";

export async function getInvoiceCenter(params: {
  scope: InvoiceCenterScope;
  status?: string;
  purpose?: string;
  keyword?: string;
  page: number;
  pageSize: number;
}): Promise<InvoiceCenterResponse> {
  const response = await lovrabetClient.bff.execute<InvoiceCenterResponse>({
    scriptName: "cpoGetInvoiceCenter",
    params,
  });
  const emptySummary: InvoiceCenterResponse["summary"] = {
    invoiceCount: 0,
    activeInvoiceCount: 0,
    inactiveInvoiceCount: 0,
    incomingCount: 0,
    outgoingCount: 0,
    totalAmount: 0,
    allocatedAmount: 0,
    unallocatedAmount: 0,
    actionRequiredCount: 0,
  };
  return {
    ...response,
    summary: { ...emptySummary, ...(response.summary || {}) },
    paging: response.paging || {
      currentPage: params.page,
      pageSize: params.pageSize,
      totalCount: 0,
    },
    tableData: response.tableData || [],
  };
}
