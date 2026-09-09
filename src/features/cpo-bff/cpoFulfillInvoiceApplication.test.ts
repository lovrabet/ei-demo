import { describe, expect, it, vi } from "vitest";
import cpoFulfillInvoiceApplication from "../../../.rabetbase/bff/app-4d050189/ENDPOINT/cpoFulfillInvoiceApplication";

describe("cpoFulfillInvoiceApplication", () => {
  it("does not let an ordinary applicant perform finance fulfillment", async () => {
    const update = vi.fn();
    const tables = {
      invoice_application: {
        getOne: vi.fn().mockResolvedValue({
          id: 11,
          status: "reviewed",
          applicant_user_id: "applicant-1",
          requested_total_amount: 100,
        }),
        update,
      },
      invoice_record: {
        getOne: vi.fn().mockResolvedValue({
          id: 21,
          status: "reviewed",
          invoice_direction: "outgoing",
          applicant_user_id: "applicant-1",
          total_amount: 100,
        }),
      },
      invoice_application_fulfillment: {
        filter: vi.fn().mockResolvedValue({ tableData: [] }),
        create: vi.fn(),
        update: vi.fn(),
      },
    };
    const context = {
      client: {
        bff: {
          execute: vi.fn().mockResolvedValue({
            userId: "applicant-1",
            isAdmin: false,
            isFinanceAdvisor: false,
          }),
        },
        models: {
          byTable: (tableName: keyof typeof tables) => tables[tableName],
        },
      },
    };

    await expect(
      cpoFulfillInvoiceApplication(
        {
          op: "fulfill",
          invoiceApplicationId: 11,
          invoiceId: 21,
          amount: 100,
        },
        context as any,
      ),
    ).rejects.toThrow("INVOICE_FULFILLMENT_FORBIDDEN");
    expect(update).not.toHaveBeenCalled();
  });
});
