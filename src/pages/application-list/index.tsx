/**
 * title: 申请单汇总
 * @modified 流程管理员集中查看全部非草稿申请单
 */
import React, { useEffect, useState } from "react";
import { Button, Card, Input, message, Select, Space, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  EyeOutlined,
  FileSearchOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { YtUserSelect } from "@yuntoo/components";
import { LOVRABET_APP_CODE } from "@/api/api";
import { lovrabetClient } from "@/api/client";
import ApplicationScopeTabs, {
  type ApplicationScopeTab,
} from "@/features/cpo-application-list/ApplicationScopeTabs";
import { formatDateValue } from "@/features/cpo-application-detail/format";
import { ApplicationFlowStatusTag } from "@/features/cpo-workflow/WorkflowStatusTag";
import {
  fetchAppUsersMap,
  platformFlowStatusMeta,
} from "@/features/platform-flow/api";
import {
  CPO_BIZ_TYPE_LABEL,
  CPO_BANK_STATUS_COLOR,
  CPO_BANK_STATUS_LABEL,
  CPO_STATUS_LABEL,
  getCpoDetailPath,
} from "@/features/cpo-workflow/routes";
import styles from "./index.module.css";

type ApplicationRow = {
  id: number;
  bizType:
    | "expense"
    | "invoice"
    | "contract"
    | "crm_contract"
    | "payment"
    | "salary_payment"
    | "travel";
  bizId: number;
  title: string;
  status: string;
  /** 平台流回写：flow_status（SUBMITTED/COMPLETED/REJECTED/CANCELLED），仅平台绑定主单有值 */
  flowStatus?: string;
  instanceStatus?: string;
  processInstanceId?: string;
  runningNode?: string;
  approverUserIds?: string[];
  bankStatus?: string;
  amount?: number;
  currency?: string;
  applicantUserId?: string;
  applicantName?: string;
  submittedAt?: string | number;
  createdAt?: string | number;
  updatedAt?: string | number;
  detailPath?: string;
  currentTaskId?: number | string;
  currentTaskType?: string;
  currentTaskTitle?: string;
  currentProcessorUserId?: string;
  currentProcessorName?: string;
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

const businessTypeOptions = Object.entries(CPO_BIZ_TYPE_LABEL).map(
  ([value, label]) => ({ value, label }),
);

const statusOptions = Object.entries(CPO_STATUS_LABEL)
  .filter(
    ([value]) =>
      ![
        "draft",
        "rejected",
        "cancelled",
        "invalid",
        "paid_confirmed",
        "signed",
        "archived",
        "used",
        "completed",
      ].includes(value),
  )
  .map(([value, label]) => ({ value, label }));

function formatAmount(row: ApplicationRow) {
  if (row.amount === undefined || row.amount === null) return "-";
  const prefix =
    row.currency && row.currency !== "CNY" ? `${row.currency} ` : "¥";
  return `${prefix}${Number(row.amount).toLocaleString("zh-CN")}`;
}

function detailPathOf(row: ApplicationRow) {
  return row.detailPath || getCpoDetailPath(row.bizType, row.bizId);
}

const ApplicationList: React.FC = () => {
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [bizType, setBizType] = useState("");
  const [applicantUserId, setApplicantUserId] = useState("");
  const [status, setStatus] = useState("");
  const [activeTab, setActiveTab] = useState<ApplicationScopeTab>("active");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [userNameMap, setUserNameMap] = useState<Map<string, string>>(new Map());
  const [paging, setPaging] = useState({
    currentPage: 1,
    pageSize: 20,
    totalCount: 0,
  });

  useEffect(() => {
    fetchAppUsersMap().then(setUserNameMap).catch(() => {});
  }, []);

  const resolveProcessorName = (row: ApplicationRow) => {
    const ids = row.approverUserIds || [];
    if (!ids.length) return "";
    return ids.map((id) => userNameMap.get(id) || id).join("、");
  };

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const response = await lovrabetClient.bff.execute<{
        scope: "application_reader";
        paging: typeof paging;
        tableData: ApplicationRow[];
      }>({
        scriptName: "cpoGetApplicationList",
        params: {
          bizType,
          scope: activeTab,
          status: activeTab === "active" ? status : "",
          applicantUserId,
          keyword,
          page,
          pageSize: paging.pageSize,
        },
      });
      setRows(response.tableData || []);
      setPaging(
        response.paging || {
          currentPage: page,
          pageSize: 20,
          totalCount: 0,
        },
      );
    } catch (error: any) {
      const reason = String(error?.message || error);
      message.error(
        reason.includes("CPO_APPLICATION_LIST_ACCESS_REQUIRED") ||
          reason.includes("CPO_WORKFLOW_ADMIN_REQUIRED")
          ? "仅流程管理员或财务顾问组成员可查看申请单汇总"
          : `加载失败：${reason}`,
      );
      setRows([]);
      setPaging((current) => ({
        ...current,
        currentPage: page,
        totalCount: 0,
      }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, applicantUserId, bizType, status, keyword]);

  const columns: ColumnsType<ApplicationRow> = [
    {
      title: "序号",
      key: "sequence",
      width: 72,
      align: "center",
      render: (_, __, index) =>
        (paging.currentPage - 1) * paging.pageSize + index + 1,
    },
    {
      title: "业务类型",
      dataIndex: "bizType",
      width: 110,
      render: (value: string) => (
        <Tag color={bizTypeColor[value]}>
          {CPO_BIZ_TYPE_LABEL[value as keyof typeof CPO_BIZ_TYPE_LABEL] ||
            value}
        </Tag>
      ),
    },
    {
      title: "申请单标题",
      dataIndex: "title",
      minWidth: 220,
      render: (value: string, row) => (
        <a href={detailPathOf(row)} target="_blank" rel="noopener noreferrer">
          {value}
        </a>
      ),
    },
    {
      title: "流程状态",
      key: "flowStatus",
      width: 160,
      render: (_, row) => {
        if (row.flowStatus) {
          if (row.instanceStatus === "CANCELLED") {
            return <Tag>已撤销</Tag>;
          }
          const meta = platformFlowStatusMeta(row.flowStatus);
          return <Tag color={meta.color}>{meta.label}</Tag>;
        }
        return <ApplicationFlowStatusTag value={row} />;
      },
    },
    {
      title: "当前处理人",
      key: "currentProcessor",
      width: 170,
      render: (_, row) => {
        if (row.flowStatus) {
          const name = resolveProcessorName(row);
          if (!name) return "-";
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span>{name}</span>
              {row.runningNode ? <Tag>{row.runningNode}</Tag> : null}
            </div>
          );
        }
        const legacy = row.currentProcessorName || row.currentProcessorUserId;
        return legacy || "-";
      },
    },
    {
      title: "资金状态",
      key: "bankStatus",
      width: 140,
      render: (_, row) =>
        row.bankStatus ? (
          <Tag color={CPO_BANK_STATUS_COLOR[row.bankStatus] || "default"}>
            {CPO_BANK_STATUS_LABEL[row.bankStatus] || row.bankStatus}
          </Tag>
        ) : (
          "-"
        ),
    },
    {
      title: "金额",
      key: "amount",
      width: 140,
      align: "right",
      render: (_, row) => formatAmount(row),
    },
    {
      title: "申请人",
      dataIndex: "applicantName",
      width: 130,
      render: (value: string, row) => value || row.applicantUserId || "-",
    },
    {
      title: "提交/业务时间",
      key: "flowTime",
      width: 180,
      render: (_, row) =>
        formatDateValue(
          row.submittedAt || row.updatedAt || row.createdAt,
          true,
        ),
    },
    {
      title: "操作",
      key: "actions",
      width: 90,
      fixed: "right",
      render: (_, row) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          href={detailPathOf(row)}
          target="_blank"
          rel="noopener noreferrer"
        >
          查看
        </Button>
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <FileSearchOutlined style={{ color: "#1677ff" }} />
          申请单汇总
        </Space>
      }
      extra={
        <Button
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={() => load(paging.currentPage)}
        >
          刷新
        </Button>
      }
    >
      <ApplicationScopeTabs<ApplicationRow>
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key);
          setPaging((current) => ({ ...current, currentPage: 1 }));
        }}
        afterTabs={
          <div
            className={[
              styles.filterBar,
              activeTab === "active" ? "" : styles.filterBarCompact,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label="申请单筛选"
          >
            <label className={styles.filterField}>
              <span>业务类型</span>
              <Select
                placeholder="全部业务类型"
                allowClear
                value={bizType || undefined}
                options={businessTypeOptions}
                onChange={(value) => setBizType(value || "")}
              />
            </label>
            <div className={styles.filterField}>
              <span>申请人</span>
              <YtUserSelect
                appCode={LOVRABET_APP_CODE}
                value={applicantUserId ? [applicantUserId] : []}
                maxCount={1}
                maxTagCount={1}
                placeholder="全部申请人"
                onChange={(values) => setApplicantUserId(values[0] || "")}
              />
            </div>
            {activeTab === "active" ? (
              <label className={styles.filterField}>
                <span>单据状态</span>
                <Select
                  placeholder="全部进行中状态"
                  allowClear
                  value={status || undefined}
                  options={statusOptions}
                  onChange={(value) => setStatus(value || "")}
                />
              </label>
            ) : null}
            <label className={`${styles.filterField} ${styles.keywordField}`}>
              <span>关键词</span>
              <Input.Search
                allowClear
                placeholder="标题或单号"
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                onSearch={(value) => setKeyword(value.trim())}
              />
            </label>
          </div>
        }
        tabs={[
          {
            key: "active",
            label: "进行中",
            emptyDescription: "暂无进行中的申请单",
          },
          {
            key: "completed",
            label: "已完成",
            emptyDescription: "暂无已完成申请单",
          },
          {
            key: "voided",
            label: "驳回/废弃",
            emptyDescription: "暂无驳回或废弃的申请单",
          },
        ]}
        tableProps={{
          rowKey: (row) => `${row.bizType}-${row.bizId}`,
          columns,
          dataSource: rows,
          loading,
          scroll: { x: 1442 },
          pagination: {
            current: paging.currentPage,
            pageSize: paging.pageSize,
            total: paging.totalCount,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
            onChange: load,
          },
        }}
      />
    </Card>
  );
};

ApplicationList.displayName = "申请单汇总";

export default ApplicationList;
