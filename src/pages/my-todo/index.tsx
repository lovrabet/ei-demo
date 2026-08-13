/**
 * title: 审批待办
 * @modified 仅展示 Lovrabet 平台原生审批流待办（legacy 自建状态机已废弃）
 */
import React, { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  Card,
  Table,
  Select,
  Space,
  Button,
  Tag,
  Modal,
  Input,
  message,
  Empty,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ExclamationCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  CPO_BIZ_TYPE_LABEL,
  getCpoDetailPath,
} from "@/features/cpo-workflow/routes";
import { formatDateValue } from "@/features/cpo-application-detail/format";
import {
  approvePlatformTask,
  loadPlatformTodoSummaries,
  type PlatformTaskSummary,
} from "@/features/platform-flow/api";

type TodoRow = PlatformTaskSummary;

const PAGE_SIZE = 20;

type ApprovalTodoListProps = {
  embedded?: boolean;
  onTotalChange?: (total: number) => void;
};

export const ApprovalTodoList: React.FC<ApprovalTodoListProps> = ({
  embedded = false,
  onTotalChange,
}) => {
  const navigate = useNavigate();
  const [allRows, setAllRows] = useState<TodoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [bizTypeFilter, setBizTypeFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [actionModal, setActionModal] = useState<{
    item: TodoRow;
    approved: boolean;
  } | null>(null);
  const [comment, setComment] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const rows = await loadPlatformTodoSummaries();
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

  const submitAction = async () => {
    if (!actionModal) return;
    const { item, approved } = actionModal;
    try {
      await approvePlatformTask({
        taskId: item.platformTaskId,
        approved,
        comment: comment.trim(),
      });
      message.success(
        `${approved ? "已通过" : "已驳回"}：${item.title}`,
      );
      setActionModal(null);
      setComment("");
      load();
    } catch (e: any) {
      message.error(`执行失败：${e?.message || e}`);
    }
  };

  const columns: ColumnsType<TodoRow> = [
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
      title: "当前节点",
      dataIndex: "nodeName",
      width: 130,
      render: (v: string) => <Tag color="geekblue">{v}</Tag>,
    },
    {
      title: "业务标题",
      dataIndex: "title",
      render: (_: any, r: TodoRow) => {
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
      title: "金额",
      dataIndex: "amount",
      width: 120,
      align: "right",
      render: (v?: number) => (v ? `¥${Number(v).toLocaleString()}` : "-"),
    },
    {
      title: "当前状态",
      key: "status",
      width: 110,
      render: () => <Tag color="processing">审批中</Tag>,
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 160,
      render: (v: number) => (v ? formatDateValue(v, true) : "-"),
    },
    {
      title: "操作",
      key: "actions",
      width: 220,
      render: (_: any, r: TodoRow) => {
        const detailPath =
          r.bizType && r.bizId ? getCpoDetailPath(r.bizType, r.bizId) : "";
        return (
          <Space>
            {detailPath ? (
              <Button size="small" onClick={() => navigate(detailPath)}>
                查看
              </Button>
            ) : null}
            <Button
              size="small"
              type="primary"
              onClick={() => setActionModal({ item: r, approved: true })}
            >
              通过
            </Button>
            <Button
              size="small"
              danger
              onClick={() => setActionModal({ item: r, approved: false })}
            >
              驳回
            </Button>
          </Space>
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
    <>
      <Table
        rowKey="key"
        columns={columns}
        dataSource={paged}
        loading={loading}
        locale={{ emptyText: <Empty description="暂无待办" /> }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: filtered.length,
          showSizeChanger: false,
          onChange: (p) => setPage(p),
        }}
        size="middle"
        scroll={{ x: 1100 }}
      />

      <Modal
        title={
          actionModal
            ? `${actionModal.approved ? "通过" : "驳回"}：${actionModal.item.title}`
            : ""
        }
        open={!!actionModal}
        onCancel={() => {
          setActionModal(null);
          setComment("");
        }}
        onOk={submitAction}
        okText="确认"
        cancelText="取消"
      >
        <div style={{ marginBottom: 12 }}>
          <Space>
            <Tag color="blue">
              {CPO_BIZ_TYPE_LABEL[
                actionModal?.item.bizType as keyof typeof CPO_BIZ_TYPE_LABEL
              ] || actionModal?.item.bizType}
            </Tag>
            <Tag color="geekblue">{actionModal?.item.nodeName}</Tag>
            {actionModal?.item.amount ? (
              <span style={{ color: "#ff9500", fontWeight: 600 }}>
                ¥{Number(actionModal.item.amount).toLocaleString()}
              </span>
            ) : null}
          </Space>
        </div>
        <Input.TextArea
          rows={3}
          placeholder="审批意见（可选）"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </Modal>
    </>
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
          <ExclamationCircleOutlined style={{ color: "#ff9500" }} />
          待我审批
        </Space>
      }
      extra={toolbar}
    >
      {content}
    </Card>
  );
};

const MyTodoRoute: React.FC = () => (
  <Navigate replace to="/approval-center?tab=todo" />
);

export default MyTodoRoute;
