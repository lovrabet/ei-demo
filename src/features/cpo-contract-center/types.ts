export type ContractCenterScope =
  "all" | "approval" | "pending_signature" | "signed" | "expiring" | "voided";

export type ContractCenterRow = {
  id: number;
  contractNo?: string;
  contractName: string;
  contractType?: string;
  contractTypeLabel?: string;
  direction: "receivable" | "payable";
  source: "cpo" | "crm";
  sourceLabel: string;
  ourRole?: string;
  partnerName: string;
  amount: number;
  currency: string;
  startDate?: string | number;
  endDate?: string | number;
  signedAt?: string | number;
  workflowStatus?: string;
  workflowStatusLabel?: string;
  lifecycleStatus?: string;
  /** 平台流回写（flow_status: SUBMITTED/COMPLETED/REJECTED/CANCELLED），仅平台绑定合同有值 */
  flowStatus?: string;
  instanceStatus?: string;
  processInstanceId?: string;
  runningNode?: string;
  approverUserIds?: string[];
  applicantName?: string;
  liaisonName?: string;
  submittedAt?: string | number;
  updatedAt?: string | number;
  currentTaskId?: number;
  currentTaskType?: string;
  currentTaskTitle?: string;
  currentProcessorName?: string;
  currentProcessorRole?: string;
  planCount: number;
  expectedPlanCount: number;
  paidPlanCount: number;
  plannedAmount: number;
  paymentCount: number;
  paidPaymentCount: number;
  paidAmount: number;
  receivedAmount?: number;
  receiptCount?: number;
  fullyReceived?: boolean;
  invoicedPlanAmount?: number;
  invoiceCount: number;
  invoiceAmount: number;
  nextPaymentDate?: string | number;
  nextPaymentName?: string;
  overduePayment: boolean;
  detailPath: string;
};

export type ContractCenterResponse = {
  scope: string;
  summary: {
    contractCount: number;
    amountsByCurrency: Record<string, number>;
    receivableCount: number;
    payableCount: number;
    pendingSignatureCount: number;
    overduePaymentCount: number;
    invoicePendingAmount: number;
    invoicePendingContractCount: number;
  };
  scopeCounts: {
    all: number;
    approval: number;
    pendingSignature: number;
    signed: number;
    expiring: number;
    voided: number;
  };
  paging: {
    currentPage: number;
    pageSize: number;
    totalCount: number;
  };
  tableData: ContractCenterRow[];
};
