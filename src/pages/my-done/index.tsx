/**
 * title: 审批已办
 * @modified 仅展示 Lovrabet 平台原生审批流已办（legacy 自建状态机已废弃）
 */
import React, { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Card, Table, Tag, Space, Button, Select, Empty, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { CheckCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  CPO_BIZ_TYPE_LABEL,
  getCpoDetailPath,
} from "@/features/cpo-workflow/routes";
import { formatDateValue } from "@/features/cpo-application-detail/format";
import {
  fetchPlatformDone,
  summarizePlatformTasks,
  type PlatformTaskSummary,
} from "@/features/platform-flow/api";

type DoneRow = PlatformTaskSummary & {
  completedBy: string;
  completedAt: number;
};

const PAGE_SIZE = 20;

async function loadDoneRows(): Promise<DoneRow[]> {
  const { records } = await fetchPlatformDone(1, 100);
  const summaries = await summarizePlatformTasks(records);
  return summaries
    .map((row, i) => ({
      ...row,
      completedBy: records[i]?.assigneeName || "",
      completedAt:
        Number(records[i]?.endTime) || Number(records[i]?.createTime) || 0,
    }))
    .sort((a, b) => b.completedAt - a.completedAt);
}

type ApprovalDoneListProps = {
  embedded?: boolean;
  onTotalChange?: (total: number) => void;
};

export const ApprovalDoneList: React.FC<ApprovalDoneListProps> = ({
  embedded = false,
  onTotalChange,
}) => {
  const navigate = useNavigate();
  const [allRows, setAllRows] = useState<DoneRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [bizTypeFilter, setBizTypeFilter] = useState<string>("");
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await loadDoneRows();
      setAllRows(rows);
      setPage(1);
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
    ? allRows.filter((r) => r.bizType === bizTypeFilter)
    : allRows;
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    onTotalChange?.(filtered.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length]);

  const columns: ColumnsType<DoneRow> = [
    {
      title: "业务类型",
      dataIndex: "bizType",
      width: 90,
      render: (v: string) => (
        <Tag color="blue">
          {CPO_BIZ_TYPE_LABEL[v as keyof typeof CPO_BIZ_TYPE_LABEL] || v || "-"}
        </Tag>
      ),
    },
    {
      title: "已完成节点",
      dataIndex: "nodeName",
      width: 130,
      render: (v: string) => <Tag color="geekblue">{v}</Tag>,
    },
    {
      title: "业务标题",
      dataIndex: "title",
      render: (_: any, r: DoneRow) => {
        const detailPath =
          r.bizType && r.bizId ? getCpoDetailPath(r.bizType, r.bizId) : "";
        return (
          <div>
            <div style={{ fontWeight: 500 }}>
              {detailPath ? (
                <a href={detailPath} target="_blank" rel="noopener noreferrer">
                  {r.title}
                </a>
              ) : (
                r.title
              )}
            </div>
            <div style={{ fontSize: 12, color: "#86868b" }}>
              {r.applicantName || "-"} · {r.flowName}
            </div>
          </div>
        );
      },
    },
    {
      title: "完成人",
      dataIndex: "completedBy",
      width: 120,
      render: (v?: string) => v || "-",
    },
    {
      title: "完成时间",
      dataIndex: "completedAt",
      width: 160,
      render: (v: number) => (v ? formatDateValue(v, true) : "-"),
    },
    {
      title: "操作",
      key: "actions",
      width: 90,
      render: (_: any, r: DoneRow) => {
        const detailPath =
          r.bizType && r.bizId ? getCpoDetailPath(r.bizType, r.bizId) : "";
        return detailPath ? (
          <Button size="small" onClick={() => navigate(detailPath)}>
            查看
          </Button>
        ) : (
          "-"
        );
      },
    },
  ];

  const toolbar = (
    <Space wrap>
      <Select
        placeholder="业务类型"
        allowClear
        style={{ width: 120 }}
        value={bizTypeFilter || undefined}
        onChange={(v) => {
          setBizTypeFilter(v || "");
          setPage(1);
        }}
        options={[
          { value: "expense", label: "报销" },
          { value: "invoice", label: "发票" },
          { value: "contract", label: "合同" },
          { value: "payment", label: "付款" },
          { value: "salary_payment", label: "工资付款" },
          { value: "travel", label: "差旅出行" },
        ]}
      />
      <Button icon={<ReloadOutlined />} loading={loading} onClick={() => load()}>
        刷新
      </Button>
    </Space>
  );

  const content = (
    <Table
      rowKey="key"
      columns={columns}
      dataSource={paged}
      loading={loading}
      locale={{ emptyText: <Empty description="暂无已办" /> }}
      pagination={{
        current: page,
        pageSize: PAGE_SIZE,
        total: filtered.length,
        showSizeChanger: false,
        onChange: (p) => setPage(p),
      }}
      size="middle"
      scroll={{ x: 1000 }}
    />
  );

  if (embedded) {
    return (
      <>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 16,
          }}
        >
          {toolbar}
        </div>
        {content}
      </>
    );
  }

  return (
    <Card
      title={
        <Space>
          <CheckCircleOutlined style={{ color: "#34c759" }} />
          我已审批
        </Space>
      }
      extra={toolbar}
    >
      {content}
    </Card>
  );
};

const MyDoneRoute: React.FC = () => (
  <Navigate replace to="/approval-center?tab=done" />
);

export default MyDoneRoute;
