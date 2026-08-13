/**
 * title: 我的草稿
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  Empty,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { lovrabetClient } from "@/api/client";
import { CPO_BIZ_TYPE_LABEL } from "@/features/cpo-workflow/routes";

type DraftRow = {
  id: number;
  bizType:
    | "contract"
    | "crm_contract"
    | "payment"
    | "salary_payment"
    | "expense"
    | "invoice"
    | "travel";
  bizId: number;
  title: string;
  status: string;
  applicant_name_snapshot: string;
  applicant_user_id: string;
  amount?: number;
  currency?: string;
  created_at: number | string;
  updated_at: number | string;
  editPath: string;
};

const bizTypeColor: Record<string, string> = {
  contract: "blue",
  crm_contract: "cyan",
  payment: "purple",
  salary_payment: "magenta",
  expense: "geekblue",
  invoice: "cyan",
  travel: "orange",
};

const MyDrafts: React.FC = () => {
  const navigate = useNavigate();
  const [list, setList] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteLoadingKey, setDeleteLoadingKey] = useState("");
  const [bizTypeFilter, setBizTypeFilter] = useState<string>("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await lovrabetClient.bff.execute<{
        tableData: DraftRow[];
        paging: { currentPage: number; pageSize: number; totalCount: number };
      }>({
        scriptName: "cpoGetMyDrafts",
        params: { pageSize: 100 },
      });
      setList(res.tableData || []);
    } catch (e: any) {
      message.error(`加载失败：${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = bizTypeFilter
    ? list.filter((r) => r.bizType === bizTypeFilter)
    : list;

  const deleteDraft = async (row: DraftRow) => {
    const loadingKey = `${row.bizType}-${row.bizId}`;
    setDeleteLoadingKey(loadingKey);
    try {
      await lovrabetClient.bff.execute({
        scriptName: "cpoApplicantFlowAction",
        params: {
          bizType: row.bizType,
          bizId: row.bizId,
          action: "delete_draft",
          comment: "删除草稿",
        },
      });
      message.success("删除成功");
      load();
    } catch (e: any) {
      message.error(`删除失败：${e?.message || e}`);
    } finally {
      setDeleteLoadingKey("");
    }
  };

  const confirmDeleteDraft = (row: DraftRow) => {
    Modal.confirm({
      title: "确认删除该草稿？",
      content: "删除后该草稿会从列表中移除，不能继续编辑。",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => deleteDraft(row),
    });
  };

  const columns: ColumnsType<DraftRow> = [
    {
      title: "业务类型",
      dataIndex: "bizType",
      width: 110,
      render: (v: string) => (
        <Tag color={bizTypeColor[v]}>
          {CPO_BIZ_TYPE_LABEL[v as keyof typeof CPO_BIZ_TYPE_LABEL] || v}
        </Tag>
      ),
    },
    {
      title: "标题",
      dataIndex: "title",
      render: (v: string, r: DraftRow) => (
        <a
          onClick={(e) => {
            e.preventDefault();
            navigate(r.editPath);
          }}
        >
          {v}
        </a>
      ),
    },
    {
      title: "金额",
      dataIndex: "amount",
      width: 140,
      align: "right",
      render: (_: any, r: DraftRow) =>
        r.amount ? `¥${Number(r.amount).toLocaleString()}` : "-",
    },
    {
      title: "申请人",
      dataIndex: "applicant_name_snapshot",
      width: 120,
      render: (v: string) => v || "-",
    },
    {
      title: "最后更新",
      dataIndex: "updated_at",
      width: 160,
      render: (v: number | string) =>
        v ? new Date(v as any).toLocaleString("zh-CN") : "-",
    },
    {
      title: "操作",
      key: "actions",
      width: 190,
      render: (_: any, r: DraftRow) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(r.editPath)}
          >
            继续编辑
          </Button>
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            loading={deleteLoadingKey === `${r.bizType}-${r.bizId}`}
            onClick={() => confirmDeleteDraft(r)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <FileTextOutlined style={{ color: "#1677ff" }} />
          我的草稿
        </Space>
      }
      extra={
        <Space>
          <Select
            placeholder="业务类型"
            allowClear
            style={{ width: 120 }}
            value={bizTypeFilter || undefined}
            onChange={(v) => setBizTypeFilter(v || "")}
            options={[
              { value: "contract", label: "合同" },
              { value: "crm_contract", label: "对外销售合同" },
              { value: "payment", label: "付款" },
              { value: "salary_payment", label: "工资付款" },
              { value: "expense", label: "报销" },
              { value: "travel", label: "差旅出行" },
              { value: "invoice", label: "发票" },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            刷新
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={loading}
        locale={{ emptyText: <Empty description="暂无草稿" /> }}
        pagination={false}
        size="middle"
      />
    </Card>
  );
};

export default MyDrafts;
