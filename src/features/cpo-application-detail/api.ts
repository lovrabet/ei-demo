import { lovrabetClient } from "@/api/client";
import type {
  AdvanceWorkflowResponse,
  ApplicationDetailResponse,
  CpoApplicationBizType,
  Document360Option,
} from "./types";

const INTERNAL_PRINT_AUDIT_ACTIONS = new Set([
  "print_summary_requested",
  "print_full_requested",
  "print_confirmed",
  "print_confirmation_revoked",
]);

export async function getApplicationDetail(
  bizType: CpoApplicationBizType,
  bizId: number,
): Promise<ApplicationDetailResponse> {
  const response = await lovrabetClient.bff.execute<ApplicationDetailResponse>({
    scriptName: "cpoGetBizTimeline",
    params: { bizType, bizId },
  });
  if (!response?.biz || !response?.summary) {
    throw new Error("单据详情返回不完整");
  }
  return {
    ...response,
    tasks: response.tasks || [],
    actions: (response.actions || []).filter(
      (action) =>
        !INTERNAL_PRINT_AUDIT_ACTIONS.has(String(action.action || "")),
    ),
    workflowPlan: response.workflowPlan || [],
    currentTask: response.currentTask || null,
    availableActions: response.availableActions || [],
    canAct: Boolean(response.canAct),
    attachments: response.attachments || [],
    invoiceLinks: response.invoiceLinks || [],
    expenseItems: response.expenseItems || [],
    salaryItems: response.salaryItems || [],
    related: response.related || {},
    businessContext: response.businessContext || {
      metrics: [],
      risks: [],
      relatedDocuments: [],
    },
    management: response.management || { canManage: false, capabilities: [] },
  };
}

export async function listDocument360Options(params: {
  relationType:
    | "payment_invoice"
    | "originates_from_quote"
    | "covered_by_nda"
    | "serves_customer";
  keyword?: string;
  pageSize?: number;
}): Promise<Document360Option[]> {
  const response = await lovrabetClient.bff.execute<{
    tableData?: Document360Option[];
  }>({
    scriptName: "cpoListDocument360Options",
    params,
  });
  return response.tableData || [];
}

export async function manageDocument360(
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return lovrabetClient.bff.execute<Record<string, unknown>>({
    scriptName: "cpoManageDocument360",
    params,
  });
}

export async function advanceApplicationWorkflow(params: {
  bizType: CpoApplicationBizType;
  bizId: number;
  taskId?: number | string;
  action: string;
  comment?: string;
}): Promise<AdvanceWorkflowResponse> {
  return lovrabetClient.bff.execute<AdvanceWorkflowResponse>({
    scriptName: "cpoAdvanceWorkflow",
    params,
  });
}
