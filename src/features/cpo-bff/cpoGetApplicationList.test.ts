import { describe, expect, it, vi } from "vitest";

import cpoGetApplicationList from "../../../.rabetbase/bff/app-4d050189/ENDPOINT/cpoGetApplicationList.js";

function contextWithActor(actor: Record<string, unknown>) {
  return {
    client: {
      bff: {
        execute: vi.fn(async ({ scriptName }: { scriptName: string }) => {
          if (scriptName === "cpoCurrentActor") return actor;
          if (scriptName === "cpoDatasetMap") {
            return { BIZ_TYPE_TO_DATASET: {} };
          }
          if (scriptName === "cpoDictionary") return {};
          throw new Error(`unexpected script ${scriptName}`);
        }),
      },
      models: { byTable: vi.fn() },
    },
  };
}

describe("cpoGetApplicationList access", () => {
  it("allows finance advisors to open the cross-application summary", async () => {
    const result = await cpoGetApplicationList(
      {},
      contextWithActor({
        userId: "21",
        isFinanceAdvisor: true,
        canReadAllApplications: true,
      }),
    );

    expect(result.paging.totalCount).toBe(0);
  });

  it("does not grant the financial summary to workflow administrators", async () => {
    await expect(
      cpoGetApplicationList(
        {},
        contextWithActor({ userId: "22", isWorkflowAdmin: true }),
      ),
    ).rejects.toThrow("CPO_APPLICATION_LIST_ACCESS_REQUIRED");
  });
});
