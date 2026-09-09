import { describe, expect, it } from "vitest";

import cpoApplicationReadFilterGuard from "../../../.rabetbase/bff/app-4d050189/COMMON/cpoApplicationReadFilterGuard.js";
import cpoApplicationReadOneGuard from "../../../.rabetbase/bff/app-4d050189/COMMON/cpoApplicationReadOneGuard.js";

const stableRole = { roleCode: "oa_demo_finance_advisor" };
const unsupportedRoleSources = {
  roleCodes: ["oa_demo_finance_advisor"],
  roles: [
    { code: "oa_demo_finance_advisor" },
    "oa_demo_finance_advisor",
  ],
};

describe("CPO application role guards", () => {
  it("allows list-wide access only through roles[].roleCode", async () => {
    const originalWhere = { status: { $eq: "submitted" } };

    await expect(
      cpoApplicationReadFilterGuard(
        { bizType: "expense", values: { where: originalWhere } },
        { userInfo: { userId: "21", roles: [stableRole] } },
      ),
    ).resolves.toEqual({ where: originalWhere });

    await expect(
      cpoApplicationReadFilterGuard(
        { bizType: "expense", values: { where: originalWhere } },
        { userInfo: { userId: "21", ...unsupportedRoleSources } },
      ),
    ).resolves.toEqual({
      where: {
        $and: [originalWhere, { applicant_user_id: { $eq: "21" } }],
      },
    });
  });

  it("allows detail-wide access only through roles[].roleCode", async () => {
    const record = {
      id: 31,
      applicant_user_id: "someone-else",
      node_process_user: null,
    };

    await expect(
      cpoApplicationReadOneGuard(
        { bizType: "expense", result: record },
        { userInfo: { userId: "21", roles: [stableRole] } },
      ),
    ).resolves.toEqual(record);

    await expect(
      cpoApplicationReadOneGuard(
        { bizType: "expense", result: record },
        { userInfo: { userId: "21", ...unsupportedRoleSources } },
      ),
    ).rejects.toThrow("CPO_READ_FORBIDDEN:expense:31");
  });
});
