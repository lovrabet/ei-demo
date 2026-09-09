import { describe, expect, it, vi } from "vitest";
import cpoCompleteInvoiceApplication from "../../../.rabetbase/bff/app-4d050189/ENDPOINT/cpoCompleteInvoiceApplication";

function request() {
  return {
    invoiceApplicationId: 11,
    invoice: {
      invoiceNo: "26332000007191573046",
      invoiceDate: "2026-08-21",
      sellerName: "杭州启智云图科技有限公司",
      buyerName: "演示客户有限公司",
      buyerTaxNo: "91330110DEMO000001",
      amount: 257425.74,
      taxAmount: 2574.26,
      totalAmount: 260000,
      taxRate: 0.01,
      invoiceType: "vat_special",
      invoiceContent: "软件及技术服务",
    },
    attachment: {
      fileName: "演示客户发票.pdf",
      filePath: "demo/customer-invoice.pdf",
      fileType: "application/pdf",
    },
  };
}

function contextFor(actor: Record<string, unknown>) {
  const relationCreate = vi.fn().mockResolvedValue(41);
  const attachmentCreate = vi.fn().mockResolvedValue(31);
  const invoiceCreate = vi.fn().mockResolvedValue(21);
  const invoiceUpdate = vi.fn().mockResolvedValue(undefined);
  const applicationUpdate = vi.fn().mockResolvedValue(undefined);
  const fulfillmentCreate = vi.fn().mockResolvedValue(51);
  const execute = vi.fn(async ({ scriptName }) => {
    if (scriptName === "cpoCurrentActor") return actor;
    if (scriptName === "cpoInvoiceDuplicateGuard") return { duplicates: [] };
    if (scriptName === "cpoActionRecorder") return { recorded: true };
    throw new Error(`unexpected script: ${scriptName}`);
  });
  const tables = {
    invoice_application: {
      update: applicationUpdate,
      getOne: vi.fn().mockResolvedValue({
        id: 11,
        status: "reviewed",
        application_title: "演示客户开票申请",
        seller_name: "杭州启智云图科技有限公司",
        buyer_name: "演示客户有限公司",
        buyer_tax_no: "91330110DEMO000001",
        requested_total_amount: 260000,
        currency: "CNY",
      }),
    },
    invoice_record: {
      filter: vi.fn().mockResolvedValue({ tableData: [] }),
      getOne: vi.fn().mockResolvedValue({ id: 21, status: "draft" }),
      create: invoiceCreate,
      update: invoiceUpdate,
    },
    invoice_application_fulfillment: {
      filter: vi.fn(async ({ select }) => ({
        tableData: select?.includes("fulfilled_amount")
          ? [{ fulfilled_amount: 260000 }]
          : [],
      })),
      create: fulfillmentCreate,
      update: vi.fn(),
    },
    attachment: {
      filter: vi.fn().mockResolvedValue({ tableData: [] }),
      create: attachmentCreate,
    },
    biz_relation: {
      filter: vi.fn(async ({ where }) => ({
        tableData:
          where.source_biz_type?.$eq === "invoice_application"
            ? [
                {
                  id: 9,
                  target_biz_type: "crm_contract",
                  target_biz_id: 8,
                  relation_status: "active",
                },
              ]
            : [],
      })),
      create: relationCreate,
      update: vi.fn(),
    },
  };
  return {
    spies: {
      relationCreate,
      attachmentCreate,
      invoiceCreate,
      invoiceUpdate,
      applicationUpdate,
      fulfillmentCreate,
      execute,
    },
    context: {
      client: {
        bff: { execute },
        models: { byTable: (tableName: keyof typeof tables) => tables[tableName] },
      },
    },
  };
}

describe("cpoCompleteInvoiceApplication", () => {
  it("registers the uploaded invoice and completes the approved application", async () => {
    const { context, spies } = contextFor({
      userId: "finance-1",
      userName: "演示财务",
      roles: ["oa_demo_finance_advisor"],
      isFinanceAdvisor: true,
    });

    const result = await cpoCompleteInvoiceApplication(
      request(),
      context as any,
    );

    expect(spies.attachmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        biz_type: "invoice",
        biz_id: 21,
        attachment_type: "invoice",
      }),
    );
    expect(spies.relationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        source_biz_type: "invoice",
        target_biz_type: "crm_contract",
        target_biz_id: 8,
      }),
    );
    expect(spies.invoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice_no: "26332000007191573046",
        status: "draft",
      }),
    );
    expect(spies.invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 21, status: "reviewed" }),
    );
    expect(spies.fulfillmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice_application_id: 11,
        invoice_id: 21,
        fulfilled_amount: 260000,
      }),
    );
    expect(spies.applicationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 11, status: "completed" }),
    );
    expect(result).toMatchObject({
      invoiceId: 21,
      invoiceNo: "26332000007191573046",
      status: "completed",
      unfulfilledAmount: 0,
    });
  });

  it("rejects an ordinary applicant even when the application belongs to them", async () => {
    const { context, spies } = contextFor({
      userId: "applicant-1",
      userName: "普通申请人",
      roles: ["user"],
      isFinanceAdvisor: false,
      isAdmin: false,
    });

    await expect(
      cpoCompleteInvoiceApplication(request(), context as any),
    ).rejects.toThrow("INVOICE_APPLICATION_COMPLETION_FORBIDDEN");
    expect(spies.invoiceCreate).not.toHaveBeenCalled();
  });
});
