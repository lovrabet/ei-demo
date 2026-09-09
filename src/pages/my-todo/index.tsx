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
import { $i18n } from "@/i18n";

const t = (key: string, fallbackText: string) => $i18n.t(key, fallbackText);

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
      message.error(
        t("myTodo.loadFailed", `加载失败：${e?.message || e}`).replace(
          "{reason}",
          e?.message || String(e),
        ),
      );
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
        `${
          approved
            ? t("myTodo.resultApproved", "已通过")
            : t("myTodo.resultRejected", "已驳回")
        }：${item.title}`,
      );
      setActionModal(null);
      setComment("");
      load();
    } catch (e: any) {
      message.error(
        t("myTodo.actionFailed", `执行失败：${e?.message || e}`).replace(
          "{reason}",
          e?.message || String(e),
        ),
      );
    }
  };

  const columns: ColumnsType<TodoRow> = [
    {
      title: t("myTodo.columns.bizType", "业务类型"),
      dataIndex: "bizType",
      width: 90,
      render: (v: string) => (
        <Tag color="blue">
          {CPO_BIZ_TYPE_LABEL[v as keyof typeof CPO_BIZ_TYPE_LABEL] || v || "-"}
        </Tag>
      ),
    },
    {
      title: t("myTodo.columns.node", "当前节点"),
      dataIndex: "nodeName",
      width: 130,
      render: (v: string) => <Tag color="geekblue">{v}</Tag>,
    },
    {
      title: t("myTodo.columns.title", "业务标题"),
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
      title: t("myTodo.columns.amount", "金额"),
      dataIndex: "amount",
      width: 120,
      align: "right",
      render: (v?: number) => (v ? `¥${Number(v).toLocaleString()}` : "-"),
    },
    {
      title: t("myTodo.columns.status", "当前状态"),
      key: "status",
      width: 110,
      render: () => (
        <Tag color="processing">
          {t("myTodo.statusProcessing", "审批中")}
        </Tag>
      ),
    },
    {
      title: t("myTodo.columns.createdAt", "创建时间"),
      dataIndex: "createdAt",
      width: 160,
      render: (v: number) => (v ? formatDateValue(v, true) : "-"),
    },
    {
      title: t("myTodo.columns.actions", "操作"),
      key: "actions",
      width: 220,
      render: (_: any, r: TodoRow) => {
        const detailPath =
          r.bizType && r.bizId ? getCpoDetailPath(r.bizType, r.bizId) : "";
        return (
          <Space>
            {detailPath ? (
              <Button size="small" onClick={() => navigate(detailPath)}>
                {t("myTodo.view", "查看")}
              </Button>
            ) : null}
            <Button
              size="small"
              type="primary"
              onClick={() => setActionModal({ item: r, approved: true })}
            >
              {t("myTodo.actionLabels.reviewPass", "通过")}
            </Button>
            <Button
              size="small"
              danger
              onClick={() => setActionModal({ item: r, approved: false })}
            >
              {t("myTodo.actionLabels.reviewReject", "驳回")}
            </Button>
          </Space>
        );
      },
    },
  ];

  const toolbar = (
    <Space wrap>
      <Select
        placeholder={t("myTodo.filterBizType", "业务类型")}
        allowClear
        style={{ width: 120 }}
        value={bizTypeFilter || undefined}
        onChange={(v) => {
          setBizTypeFilter(v || "");
          setPage(1);
        }}
        options={[
          { value: "expense", label: t("myTodo.bizOptions.expense", "报销") },
          {
            value: "invoice_application",
            label: t("workflow.bizType.invoiceApplication", "销项开票申请"),
          },
          { value: "contract", label: t("myTodo.bizOptions.contract", "合同") },
          { value: "payment", label: t("myTodo.bizOptions.payment", "付款") },
          {
            value: "salary_payment",
            label: t("myTodo.bizOptions.salary_payment", "工资付款"),
          },
          {
            value: "travel",
            label: t("myTodo.bizOptions.travel", "差旅出行"),
          },
        ]}
      />
      <Button icon={<ReloadOutlined />} loading={loading} onClick={() => load()}>
        {t("myTodo.refresh", "刷新")}
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
        locale={{
          emptyText: <Empty description={t("myTodo.empty", "暂无待办")} />,
        }}
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
            ? `${
                actionModal.approved
                  ? t("myTodo.actionLabels.reviewPass", "通过")
                  : t("myTodo.actionLabels.reviewReject", "驳回")
              }：${actionModal.item.title}`
            : ""
        }
        open={!!actionModal}
        onCancel={() => {
          setActionModal(null);
          setComment("");
        }}
        onOk={submitAction}
        okText={t("myTodo.confirm", "确认")}
        cancelText={t("myTodo.cancel", "取消")}
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
          placeholder={t("myTodo.approvalCommentPlaceholder", "审批意见（可选）")}
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
          {t("myTodo.cardTitle", "待我审批")}
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
