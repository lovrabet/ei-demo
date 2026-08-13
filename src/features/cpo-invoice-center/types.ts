export type InvoiceCenterScope =
  "all" | "incoming" | "outgoing" | "action_required";

export type InvoiceRelatedDocument = {
  key: string;
  bizType:
    | "contract"
    | "payment"
    | "expense"
    | "crm_contract"
    | "invoice_application";
  bizId: number;
  title: string;
  status?: string;
  amount?: number;
  path?: string;
  relationLabel: string;
};

export type InvoiceCenterRow = {
  id: number;
  invoiceNo?: string;
  title: string;
  direction?: string;
  purpose?: string;
  workflowStatus?: string;
  workflowStatusLabel?: string;
  usageStatus?: string;
  usageStatusLabel?: string;
  usageStatusTone?: string;
  totalAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  currency: string;
  invoiceDate?: string | number;
  updatedAt?: string | number;
  partnerId?: number;
  partnerName?: string;
  sellerName?: string;
  buyerName?: string;
  filePath?: string;
  relatedDocuments: InvoiceRelatedDocument[];
  actionReasons: string[];
  detailPath: string;
};

export type InvoiceCenterResponse = {
  scope: string;
  summary: {
    invoiceCount: number;
    activeInvoiceCount: number;
    inactiveInvoiceCount: number;
    incomingCount: number;
    outgoingCount: number;
    totalAmount: number;
    allocatedAmount: number;
    unallocatedAmount: number;
    actionRequiredCount: number;
  };
  paging: {
    currentPage: number;
    pageSize: number;
    totalCount: number;
  };
  tableData: InvoiceCenterRow[];
};
