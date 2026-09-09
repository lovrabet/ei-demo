import { lovrabetClient } from "@/api/client";
import type { AttachmentFileValue } from "@/features/attachments/api";

export type RecognizedIssuedInvoice = {
  invoiceNo: string;
  invoiceDate: string;
  sellerName: string;
  buyerName: string;
  buyerTaxNo: string;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  taxRate: number;
  invoiceType: "vat_special" | "vat_normal" | "other";
  invoiceContent: string;
};

export type CompleteInvoiceApplicationResult = {
  invoiceApplicationId: number;
  invoiceId: number;
  invoiceNo: string;
  status: string;
  fulfilledAmount: number;
  unfulfilledAmount: number;
};

export async function completeInvoiceApplication(params: {
  invoiceApplicationId: number;
  invoice: RecognizedIssuedInvoice;
  attachment: AttachmentFileValue;
}) {
  return lovrabetClient.bff.execute<CompleteInvoiceApplicationResult>({
    scriptName: "cpoCompleteInvoiceApplication",
    params,
  });
}
