import { describe, expect, it } from "vitest";

import cpoCurrentActor from "../../../.rabetbase/bff/app-4d050189/COMMON/cpoCurrentActor.js";

describe("cpoCurrentActor", () => {
  it("recognizes the administrator flag injected by Lovrabet", async () => {
    const actor = await cpoCurrentActor(
      {},
      {
        userInfo: { id: 7, isAdmin: true },
      },
    );

    expect(actor.userId).toBe("7");
    expect(actor.isAdmin).toBe(true);
    expect(actor.canReadAllApplications).toBe(true);
  });

  it("recognizes the stable finance advisor role code", async () => {
    const actor = await cpoCurrentActor(
      {},
      {
        userInfo: {
          userId: "18",
          roles: [{ roleCode: "oa_demo_finance_advisor" }],
        },
      },
    );

    expect(actor.isFinanceAdvisor).toBe(true);
    expect(actor.canReadAllApplications).toBe(true);
  });

  it("does not grant financial read-all access to workflow administrators", async () => {
    const actor = await cpoCurrentActor(
      {},
      {
        userInfo: {
          userId: "19",
          roles: [{ roleCode: "oa_demo_workflow_admin" }],
        },
      },
    );

    expect(actor.isWorkflowAdmin).toBe(true);
    expect(actor.isAdmin).toBe(false);
    expect(actor.canReadAllApplications).toBe(false);
  });

  it("rejects every role source except the injected roles[].roleCode field", async () => {
    const actor = await cpoCurrentActor(
      {},
      {
        userInfo: {
          userId: "20",
          admin: true,
          is_super_admin: true,
          isOwner: true,
          roleList: [{ roleId: 2964 }],
          role: { name: "财务顾问" },
          roleCodes: [
            "oa_demo_finance_advisor",
            "oa_demo_workflow_admin",
          ],
          roles: [
            { roleCode: "finance_advisor" },
            { roleCode: "OA_DEMO_FINANCE_ADVISOR" },
            { code: "oa_demo_finance_advisor" },
            { code: "oa_demo_workflow_admin" },
            { roleId: 2964, roleType: "ADMIN", roleName: "管理员" },
            { roleName: "财务顾问" },
            "oa_demo_finance_advisor",
            "oa_demo_workflow_admin",
          ],
        },
      },
    );

    expect(actor.isAdmin).toBe(false);
    expect(actor.isFinanceAdvisor).toBe(false);
    expect(actor.isWorkflowAdmin).toBe(false);
    expect(actor.canReadAllApplications).toBe(false);
  });
});
