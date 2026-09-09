import { describe, expect, it, vi } from "vitest";

import cpoPolicyRead from "../../../.rabetbase/bff/app-4d050189/COMMON/cpoPolicyRead.js";

const mainConfig = {
  mode: "main",
  resource: "expenseApplication",
  tableName: "expense_application",
  bizType: "expense",
};

function contextWith(
  userInfo: Record<string, unknown>,
  tables: Record<string, Record<string, unknown>>,
) {
  return {
    userInfo,
    client: {
      models: {
        byTable: (tableName: string) => tables[tableName],
      },
    },
  };
}

describe("cpoPolicyRead", () => {
  it("restricts normal-user list queries to the applicant", async () => {
    const filter = vi.fn().mockResolvedValue({ tableData: [] });
    const context = contextWith(
      { userId: "11", roles: [] },
      { expense_application: { filter, getOne: vi.fn() } },
    );

    await cpoPolicyRead(
      {
        config: mainConfig,
        request: { where: { status: { $eq: "submitted" } } },
      },
      context,
    );

    expect(filter).toHaveBeenCalledWith({
      where: {
        $and: [
          { status: { $eq: "submitted" } },
          { applicant_user_id: { $eq: "11" } },
        ],
      },
    });
  });

  it("allows finance advisors to retain the original query", async () => {
    const filter = vi.fn().mockResolvedValue({ tableData: [] });
    const context = contextWith(
      { userId: "12", roles: [{ roleCode: "oa_demo_finance_advisor" }] },
      { expense_application: { filter, getOne: vi.fn() } },
    );
    const where = { status: { $eq: "submitted" } };

    await cpoPolicyRead({ config: mainConfig, request: { where } }, context);

    expect(filter).toHaveBeenCalledWith({ where });
  });

  it("does not grant read-all access to workflow administrators", async () => {
    const filter = vi.fn().mockResolvedValue({ tableData: [] });
    const context = contextWith(
      { userId: "13", roles: [{ roleCode: "oa_demo_workflow_admin" }] },
      { expense_application: { filter, getOne: vi.fn() } },
    );

    await cpoPolicyRead(
      { config: mainConfig, request: { where: {} } },
      context,
    );

    expect(filter).toHaveBeenCalledWith({
      where: {
        $and: [{}, { applicant_user_id: { $eq: "13" } }],
      },
    });
  });

  it("does not grant access through non-platform role fields or values", async () => {
    const context = contextWith(
      {
        userId: "12",
        roleCodes: ["oa_demo_finance_advisor"],
        roles: [
          { roleCode: "finance_advisor" },
          { roleCode: "OA_DEMO_FINANCE_ADVISOR" },
          { roleId: 2964 },
          { code: "oa_demo_finance_advisor" },
          "oa_demo_finance_advisor",
        ],
      },
      {
        expense_application: {
          filter: vi.fn(),
          getOne: vi.fn().mockResolvedValue({
            id: 1,
            applicant_user_id: "11",
          }),
        },
      },
    );

    await expect(
      cpoPolicyRead(
        {
          request: { id: 1 },
          config: {
            mode: "main",
            tableName: "expense_application",
            resource: "expense",
          },
        },
        context,
      ),
    ).rejects.toThrow("CPO_READ_FORBIDDEN:expense:1");
  });

  it("allows a platform Flow candidate group to read a detail record", async () => {
    const record = {
      id: 8,
      applicant_user_id: "someone-else",
      node_process_user: JSON.stringify({
        candidateGroups: [{ roleCode: "oa_demo_finance_reviewer" }],
      }),
    };
    const context = contextWith(
      { userId: "14", roles: [{ roleCode: "oa_demo_finance_reviewer" }] },
      {
        expense_application: {
          filter: vi.fn(),
          getOne: vi.fn().mockResolvedValue(record),
        },
      },
    );

    await expect(
      cpoPolicyRead({ config: mainConfig, request: { id: 8 } }, context),
    ).resolves.toEqual(record);
  });

  it("rejects Flow candidate groups that do not expose roleCode", async () => {
    const record = {
      id: 8,
      applicant_user_id: "someone-else",
      node_process_user: JSON.stringify({
        candidateGroups: [
          { code: "oa_demo_finance_reviewer" },
          "oa_demo_finance_reviewer",
        ],
      }),
    };
    const context = contextWith(
      { userId: "14", roles: [{ roleCode: "oa_demo_finance_reviewer" }] },
      {
        expense_application: {
          filter: vi.fn(),
          getOne: vi.fn().mockResolvedValue(record),
        },
      },
    );

    await expect(
      cpoPolicyRead({ config: mainConfig, request: { id: 8 } }, context),
    ).rejects.toThrow("CPO_READ_FORBIDDEN:expenseApplication:8");
  });

  it("rejects unrelated users from detail records", async () => {
    const context = contextWith(
      { userId: "15", roles: [] },
      {
        expense_application: {
          filter: vi.fn(),
          getOne: vi.fn().mockResolvedValue({
            id: 9,
            applicant_user_id: "someone-else",
          }),
        },
      },
    );

    await expect(
      cpoPolicyRead({ config: mainConfig, request: { id: 9 } }, context),
    ).rejects.toThrow("CPO_READ_FORBIDDEN:expenseApplication:9");
  });

  it("lets an authorized approver list children of a visible parent", async () => {
    const childFilter = vi.fn().mockResolvedValue({ tableData: [] });
    const context = contextWith(
      { userId: "16", roles: [] },
      {
        expense_item: { filter: childFilter, getOne: vi.fn() },
        expense_application: {
          filter: vi.fn(),
          getOne: vi.fn().mockResolvedValue({
            id: 10,
            applicant_user_id: "someone-else",
            node_process_user: JSON.stringify({ assignees: ["16"] }),
          }),
        },
      },
    );

    await cpoPolicyRead(
      {
        config: {
          mode: "child",
          resource: "expenseItem",
          tableName: "expense_item",
          parentTableName: "expense_application",
          parentField: "expense_id",
          parentBizType: "expense",
        },
        request: { where: { expense_id: { $eq: 10 } } },
      },
      context,
    );

    expect(childFilter).toHaveBeenCalledWith({
      where: {
        $and: [{ expense_id: { $eq: 10 } }, { expense_id: { $in: [10] } }],
      },
    });
  });

  it("filters attachment reads through their owning application", async () => {
    const attachmentFilter = vi.fn().mockResolvedValue({ tableData: [] });
    const context = contextWith(
      { userId: "17", roles: [] },
      {
        attachment: { filter: attachmentFilter, getOne: vi.fn() },
        payment_application: {
          getOne: vi.fn().mockResolvedValue({
            id: 12,
            applicant_user_id: "17",
          }),
        },
      },
    );

    await cpoPolicyRead(
      {
        config: {
          mode: "polymorphic_child",
          resource: "attachment",
          tableName: "attachment",
          bizTypeField: "biz_type",
          bizIdField: "biz_id",
        },
        request: {
          where: {
            biz_type: { $eq: "payment" },
            biz_id: { $eq: 12 },
          },
        },
      },
      context,
    );

    expect(attachmentFilter).toHaveBeenCalledWith({
      where: {
        $and: [
          {
            biz_type: { $eq: "payment" },
            biz_id: { $eq: 12 },
          },
          { biz_type: { $eq: "payment" } },
          { biz_id: { $in: [12] } },
        ],
      },
    });
  });

  it("returns no polymorphic children when a normal user omits the parent", async () => {
    const attachmentFilter = vi.fn().mockResolvedValue({ tableData: [] });
    const context = contextWith(
      { userId: "18", roles: [] },
      { attachment: { filter: attachmentFilter, getOne: vi.fn() } },
    );

    await cpoPolicyRead(
      {
        config: {
          mode: "polymorphic_child",
          resource: "attachment",
          tableName: "attachment",
          bizTypeField: "biz_type",
          bizIdField: "biz_id",
        },
        request: { where: {} },
      },
      context,
    );

    expect(attachmentFilter).toHaveBeenCalledWith({
      where: { $and: [{}, { id: { $in: [-1] } }] },
    });
  });
});
