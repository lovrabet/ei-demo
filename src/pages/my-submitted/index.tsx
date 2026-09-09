/**
 * title: 我提交的流程
 * @modified 数据源切换为 Lovrabet 平台原生流程（/api/flow/process/submitted），
 *           legacy cpoGetMySubmittedList/cpoApplicantFlowAction 已废弃。
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  message,
  Modal,
  Select,
  Space,
  Tag,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  EyeOutlined,
  FileTextOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import ApplicationScopeTabs, {
  type ApplicationScopeTab,
} from "@/features/cpo-application-list/ApplicationScopeTabs";
import {
  CPO_BIZ_TYPE_LABEL,
  getCpoDetailPath,
} from "@/features/cpo-workflow/routes";
import { formatDateValue } from "@/features/cpo-application-detail/format";
import {
  cancelPlatformProcess,
  fetchBizSummaries,
  fetchPlatformSubmitted,
  PLATFORM_DATASET_BIZ_TYPE,
} from "@/features/platform-flow/api";
import { $i18n } from "@/i18n";
import styles from "./index.module.css";

const t = (key: string, fallbackText: string) => $i18n.t(key, fallbackText);

type SubmittedRow = {
  key: string;
  processInstanceId: string;
  bizType: string;
  bizId: number;
  flowName: string;
  title: string;
  amount?: number;
  applicantName: string;
  /** 流程实例状态：RUNNING / COMPLETED / CANCELLED */
  status: string;
  /** 业务表 flow_status：SUBMITTED / COMPLETED / REJECTED / CANCELLED */
  flowStatus: string;
  currentNodeNames: string;
  approverNames: string;
  startTime: number;
  endTime?: number;
  cancelReason?: string;
  scope: ApplicationScopeTab;
};

const bizTypeColor: Record<string, string> = {
  expense: "geekblue",
  invoice: "cyan",
  contract: "blue",
  crm_contract: "cyan",
  payment: "purple",
  salary_payment: "magenta",
  travel: "orange",
};

const PAGE_SIZE = 20;

function classify(status: string, flowStatus: string): ApplicationScopeTab {
  const s = (status || "").toUpperCase();
  const f = (flowStatus || "").toUpperCase();
  if (s === "CANCELLED" || f === "CANCELLED" || f === "REJECTED") {
    return "voided";
  }
  if (s === "RUNNING") return "active";
  return "completed";
}

function statusTag(row: SubmittedRow) {
  const s = (row.status || "").toUpperCase();
  const f = (row.flowStatus || "").toUpperCase();
  if (s === "CANCELLED" || f === "CANCELLED") {
    return <Tag>{t("mySubmitted.statusCancelled", "已撤销")}</Tag>;
  }
  if (f === "REJECTED")
    return (
      <Tag color="error">{t("mySubmitted.statusRejected", "已驳回")}</Tag>
    );
  if (s === "RUNNING")
    return (
      <Tag color="processing">
        {t("mySubmitted.statusProcessing", "审批中")}
      </Tag>
    );
  return (
    <Tag color="success">{t("mySubmitted.statusApproved", "已通过")}</Tag>
  );
}

const MySubmitted: React.FC = () => {
  const navigate = useNavigate();
  const [allRows, setAllRows] = useState<SubmittedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingKey, setActionLoadingKey] = useState("");
  const [bizTypeFilter, setBizTypeFilter] = useState<string>("");
  const [activeTab, setActiveTab] = useState<ApplicationScopeTab>("active");
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const { records } = await fetchPlatformSubmitted(1, 100);
      const summaries = await fetchBizSummaries(records);
      const rows: SubmittedRow[] = records.map((r) => {
        const bizType = PLATFORM_DATASET_BIZ_TYPE[r.datasetCode || ""] || "";
        const bizId = Number(r.dataId) || 0;
        const summary = summaries.get(`${r.datasetCode}:${bizId}`);
        const approvers = (r.currentNodes || [])
          .flatMap((n) => n.approvers || [])
          .map((a) => a.userName)
          .filter(Boolean);
        return {
          key: r.processInstanceId,
          processInstanceId: r.processInstanceId,
          bizType,
          bizId,
          flowName: r.flowName || "",
          title:
            summary?.title ||
            (r.flowName ? `${r.flowName} #${bizId}` : `#${bizId}`),
          amount: summary ? Number(summary.amount) || undefined : undefined,
          applicantName: summary?.applicant || "-",
          status: r.status || "",
          flowStatus: summary?.flowStatus || "",
          currentNodeNames: (r.currentNodeNames || []).join("、"),
          approverNames: approvers.join("、"),
          startTime: Number(r.startTime) || 0,
          endTime: Number(r.endTime) || undefined,
          cancelReason: r.cancelReason || undefined,
          scope: classify(r.status || "", summary?.flowStatus || ""),
        };
      });
      rows.sort((a, b) => b.startTime - a.startTime);
      setAllRows(rows);
      setPage(1);
    } catch (e: any) {
      message.error(
        t("mySubmitted.loadFailed", `加载失败：${e?.message || e}`).replace(
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

  const filtered = allRows.filter(
    (r) =>
      r.scope === activeTab && (!bizTypeFilter || r.bizType === bizTypeFilter),
  );
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const confirmCancel = (row: SubmittedRow) => {
    Modal.confirm({
      title: t("mySubmitted.confirmRevokeTitle", "确认撤销该流程？"),
      content: t(
        "mySubmitted.confirmRevokeContent",
        "撤销后流程终止，当前审批人的待办会被取消。",
      ),
      okText: t("mySubmitted.actions.revoke", "撤销"),
      okButtonProps: { danger: true },
      cancelText: t("mySubmitted.actions.cancelButton", "取消"),
      onOk: async () => {
        setActionLoadingKey(row.key);
        try {
          await cancelPlatformProcess({
            processInstanceId: row.processInstanceId,
            reason: t("mySubmitted.actions.revokeComment", "申请人撤销"),
          });
          message.success(t("mySubmitted.actions.revokeSuccess", "已撤销"));
          load();
        } catch (e: any) {
          message.error(
            t("mySubmitted.actions.revokeFail", `撤销失败：${e?.message || e}`).replace(
              "{reason}",
              e?.message || String(e),
            ),
          );
        } finally {
          setActionLoadingKey("");
        }
      },
    });
  };

  const columns: ColumnsType<SubmittedRow> = [
    {
      title: t("mySubmitted.columns.bizType", "业务类型"),
      dataIndex: "bizType",
      width: 110,
      render: (v: string) => (
        <Tag color={bizTypeColor[v]}>
          {CPO_BIZ_TYPE_LABEL[v as keyof typeof CPO_BIZ_TYPE_LABEL] || v || "-"}
        </Tag>
      ),
    },
    {
      title: t("mySubmitted.columns.title", "流程标题"),
      dataIndex: "title",
      width: 320,
      ellipsis: { showTitle: false },
      render: (v: string, r: SubmittedRow) => {
        const detailPath =
          r.bizType && r.bizId ? getCpoDetailPath(r.bizType, r.bizId) : "";
        return (
          <Tooltip title={v} placement="topLeft">
            {detailPath ? (
              <a
                className={styles.titleLink}
                href={detailPath}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(detailPath);
                }}
              >
                {v}
              </a>
            ) : (
              <span className={styles.titleText}>{v}</span>
            )}
          </Tooltip>
        );
      },
    },
    {
      title: t("mySubmitted.columns.flowStatus", "流程状态"),
      key: "flowStatus",
      width: 110,
      render: (_: unknown, row: SubmittedRow) => statusTag(row),
    },
    {
      title: t("mySubmitted.columns.currentNode", "当前节点 / 处理人"),
      key: "currentNode",
      width: 200,
      render: (_: any, r: SubmittedRow) => {
        if (r.scope !== "active") {
          return r.cancelReason ? (
            <span style={{ color: "#86868b" }}>{r.cancelReason}</span>
          ) : (
            "-"
          );
        }
        return (
          <div className={styles.processor}>
            <Tooltip title={r.approverNames}>
              <span className={styles.processorName}>
                {r.approverNames || "-"}
              </span>
            </Tooltip>
            {r.currentNodeNames ? <Tag>{r.currentNodeNames}</Tag> : null}
          </div>
        );
      },
    },
    {
      title: t("mySubmitted.columns.amount", "金额"),
      key: "amount",
      width: 130,
      align: "right",
      render: (_: any, r: SubmittedRow) => (
        <span className={styles.amount}>
          {r.amount ? `¥${Number(r.amount).toLocaleString()}` : "-"}
        </span>
      ),
    },
    {
      title: t("mySubmitted.columns.submittedAt", "提交时间"),
      dataIndex: "startTime",
      width: 170,
      render: (v: number) => (
        <span className={styles.time}>{v ? formatDateValue(v, true) : "-"}</span>
      ),
    },
    {
      title: t("mySubmitted.columns.actions", "操作"),
      key: "actions",
      width: 180,
      fixed: "right",
      render: (_: any, r: SubmittedRow) => {
        const detailPath =
          r.bizType && r.bizId ? getCpoDetailPath(r.bizType, r.bizId) : "";
        return (
          <Space className={styles.actions} size={6}>
            {detailPath ? (
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => navigate(detailPath)}
              >
                {t("mySubmitted.actions.view", "查看")}
              </Button>
            ) : null}
            {r.scope === "active" ? (
              <Button
                size="small"
                danger
                loading={actionLoadingKey === r.key}
                onClick={() => confirmCancel(r)}
              >
                {t("mySubmitted.actions.revoke", "撤销")}
              </Button>
            ) : null}
          </Space>
        );
      },
    },
  ];

  return (
    <Card
      className={styles.card}
      title={
        <Space className={styles.toolbar}>
          <FileTextOutlined style={{ color: "#1677ff" }} />
          {t("mySubmitted.title", "我提交的流程")}
        </Space>
      }
      extra={
        <Space>
          <Select
            placeholder={t("mySubmitted.filterBizType", "业务类型")}
            allowClear
            style={{ width: 120 }}
            value={bizTypeFilter || undefined}
            onChange={(v) => {
              setBizTypeFilter(v || "");
              setPage(1);
            }}
            options={[
              { value: "expense", label: t("mySubmitted.bizOptions.expense", "报销") },
              {
                value: "invoice_application",
                label: t("workflow.bizType.invoiceApplication", "销项开票申请"),
              },
              { value: "contract", label: t("mySubmitted.bizOptions.contract", "合同") },
              {
                value: "crm_contract",
                label: t("mySubmitted.bizOptions.crm_contract", "对外销售合同"),
              },
              { value: "payment", label: t("mySubmitted.bizOptions.payment", "付款") },
              {
                value: "salary_payment",
                label: t("mySubmitted.bizOptions.salary_payment", "工资付款"),
              },
              { value: "travel", label: t("mySubmitted.bizOptions.travel", "差旅出行") },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => load()} loading={loading}>
            {t("mySubmitted.refresh", "刷新")}
          </Button>
        </Space>
      }
    >
      <ApplicationScopeTabs<SubmittedRow>
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key);
          setPage(1);
        }}
        tabs={[
          {
            key: "active",
            label: `${t("mySubmitted.tabs.active", "进行中")} ${allRows.filter((r) => r.scope === "active").length}`,
            emptyDescription: t(
              "mySubmitted.tabs.activeEmpty",
              "暂无进行中的流程",
            ),
          },
          {
            key: "completed",
            label: `${t("mySubmitted.tabs.completed", "已完成")} ${allRows.filter((r) => r.scope === "completed").length}`,
            emptyDescription: t(
              "mySubmitted.tabs.completedEmpty",
              "暂无已完成流程",
            ),
          },
          {
            key: "voided",
            label: `${t("mySubmitted.tabs.voided", "驳回/废弃")} ${allRows.filter((r) => r.scope === "voided").length}`,
            emptyDescription: t(
              "mySubmitted.tabs.voidedEmpty",
              "暂无驳回或废弃的流程",
            ),
          },
        ]}
        tableProps={{
          className: styles.table,
          rowKey: "key",
          columns,
          dataSource: paged,
          loading,
          pagination: {
            current: page,
            pageSize: PAGE_SIZE,
            total: filtered.length,
            showSizeChanger: false,
            onChange: (p) => setPage(p),
          },
          size: "middle",
          scroll: { x: 1350 },
          tableLayout: "fixed",
        }}
      />
    </Card>
  );
};

export default MySubmitted;
