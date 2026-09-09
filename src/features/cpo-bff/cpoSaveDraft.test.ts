import { describe, expect, it, vi } from "vitest";

import cpoSaveDraft from "../../../.rabetbase/bff/app-4d050189/ENDPOINT/cpoSaveDraft.js";

describe("cpoSaveDraft invoice application", () => {
  it("keeps application_no and applies the aligned default tax rate", async () => {
    const create = vi.fn().mockResolvedValue(31);
    const context = {
      client: {
        bff: {
          execute: vi.fn(async ({ scriptName }: { scriptName: string }) => {
            if (scriptName === "cpoDatasetMap") {
              return {
                BIZ_TYPE_TO_DATASET: {
                  invoice_application: {
                    tableName: "invoice_application",
                    statusField: "status",
                  },
                },
              };
            }
            if (scriptName === "cpoCurrentActor") {
              return {
                userId: "41",
                userName: "演示申请人",
                isAdmin: false,
              };
            }
            throw new Error(`unexpected script ${scriptName}`);
          }),
        },
        models: {
          byTable: (tableName: string) =>
            tableName === "invoice_application" ? { create } : undefined,
        },
      },
    };

    const result = await cpoSaveDraft(
      {
        bizType: "invoice_application",
        values: {
          application_no: "DEMO-INV-001",
          application_title: "演示开票申请",
        },
      },
      context,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        application_no: "DEMO-INV-001",
        tax_rate: 0.01,
        applicant_user_id: "41",
        status: "draft",
      }),
    );
    expect(result).toMatchObject({
      bizType: "invoice_application",
      bizId: 31,
      status: "draft",
      mode: "create",
    });
  });
});
