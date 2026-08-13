/**
 * title: 合同工作台
 * @modified 2026-08-02
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Input,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  EyeOutlined,
  FileAddOutlined,
  ReloadOutlined,
  SearchOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import PageScaffold from "@/components/page-scaffold/PageScaffold";
import ProjectTabs from "@/components/project-tabs";
import { formatDateValue } from "@/features/cpo-application-detail/format";
import { fetchAppUsersMap } from "@/features/platform-flow/api";
import { getContractCenter } from "@/features/cpo-contract-center/api";
import type {
  ContractCenterResponse,
  ContractCenterRow,
  ContractCenterScope,
} from "@/features/cpo-contract-center/types";
import styles from "./index.module.css";

const { Text } = Typography;

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  sales: "销售",
  procurement: "采购",
  service: "服务",
  rent: "租赁",
  hr: "人力",
  certification: "认证",
  other: "其他",
};

const EMPTY_SUMMARY: ContractCenterResponse["summary"] = {
  contractCount: 0,
  amountsByCurrency: {},
  receivableCount: 0,
  payableCount: 0,
  pendingSignatureCount: 0,
  overduePaymentCount: 0,
  invoicePendingAmount: 0,
  invoicePendingContractCount: 0,
};

const EMPTY_COUNTS: ContractCenterResponse["scopeCounts"] = {
  all: 0,
  approval: 0,
  pendingSignature: 0,
  signed: 0,
  expiring: 0,
  voided: 0,
};

function money(value?: number, currency = "CNY") {
  const amount = Number(value || 0);
  const prefix = currency === "CNY" ? "¥" : `${currency} `;
  return `${prefix}${amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function workflowPresentation(row: ContractCenterRow) {
  const flow = String(row.flowStatus || "").toUpperCase();
  if (flow) {
    if (flow === "REJECTED") return { label: "已驳回", color: "error" };
    if (flow === "CANCELLED" || row.instanceStatus === "CANCELLED") {
      return { label: "已作废", color: "default" };
    }
    if (flow === "SUBMITTED") return { label: "审批中", color: "processing" };
    if (
      row.lifecycleStatus === "signed" ||
      ["signed", "archived", "completed"].includes(row.workflowStatus || "")
    ) {
      return { label: "已签署", color: "success" };
    }
    if (
      row.lifecycleStatus === "pending_signature" ||
      row.workflowStatus === "reviewed"
    ) {
      return { label: "待签署", color: "warning" };
    }
    return { label: "已通过", color: "success" };
  }
  if (["cancelled", "invalid"].includes(row.workflowStatus || "")) {
    return { label: "已作废", color: "default" };
  }
  if (row.currentTaskType === "sign") {
    return { label: "待签署", color: "warning" };
  }
  if (row.currentTaskType === "review") {
    return { label: "审批中", color: "processing" };
  }
  if (
    row.lifecycleStatus === "signed" ||
    ["signed", "archived", "completed"].includes(row.workflowStatus || "")
  ) {
    return { label: "已签署", color: "success" };
  }
  if (row.workflowStatus === "reviewed") {
    return { label: "待签署", color: "warning" };
  }
  if (row.workflowStatus === "draft") {
    return { label: "草稿", color: "default" };
  }
  if (row.workflowStatus === "rejected") {
    return { label: "已驳回", color: "error" };
  }
  return {
    label: row.workflowStatusLabel || row.workflowStatus || "状态待补",
    color: "processing",
  };
}

function formatCurrencySummary(amounts: Record<string, number>) {
  const entries = Object.entries(amounts).filter(([, amount]) => amount);
  if (!entries.length) return "¥0.00";
  return entries
    .map(([currency, amount]) => money(amount, currency))
    .join(" / ");
}

export default function ContractCenterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scope, setScope] = useState<ContractCenterScope>("all");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [contractType, setContractType] = useState("");
  const [direction, setDirection] = useState<"receivable" | "payable">(
    "receivable",
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<ContractCenterRow[]>([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [scopeCounts, setScopeCounts] = useState(EMPTY_COUNTS);
  const [total, setTotal] = useState(0);
  const [userNameMap, setUserNameMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetchAppUsersMap().then(setUserNameMap).catch(() => {});
  }, []);

  const resolveProcessorName = (row: ContractCenterRow) => {
    const ids = row.approverUserIds || [];
    if (!ids.length) return "";
    return ids.map((id) => userNameMap.get(id) || id).join("、");
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getContractCenter({
        scope,
        keyword,
        contractType,
        direction,
        page,
        pageSize,
      });
      setData(response.tableData);
      setSummary(response.summary);
      setScopeCounts(response.scopeCounts);
      setTotal(response.paging.totalCount);
    } catch (requestError) {
      const nextError =
        requestError instanceof Error
          ? requestError.message
          : "加载合同工作台失败";
      setError(nextError);
      message.error(nextError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [scope, keyword, contractType, direction, page, pageSize]);

  const scopeItems = useMemo(
    () => [
      { value: "all" as const, label: `全部 ${scopeCounts.all}` },
      { value: "approval" as const, label: `审批中 ${scopeCounts.approval}` },
      {
        value: "pending_signature" as const,
        label: `待签署 ${scopeCounts.pendingSignature}`,
      },
      { value: "signed" as const, label: `已签署 ${scopeCounts.signed}` },
      { value: "expiring" as const, label: `即将到期 ${scopeCounts.expiring}` },
      { value: "voided" as const, label: `已作废 ${scopeCounts.voided}` },
    ],
    [scopeCounts],
  );

  const businessTabs = [
    {
      value: "receivable" as const,
      label: "对外销售合同",
    },
    {
      value: "payable" as const,
      label: "外部服务合同",
    },
  ];
  const isSalesContract = direction === "receivable";

  const columns: ColumnsType<ContractCenterRow> = [
    {
      title: "合同",
      dataIndex: "contractName",
      width: 260,
      fixed: "left",
      render: (_, row) => (
        <div className={styles.primaryCell}>
          {row.detailPath ? (
            <button type="button" onClick={() => navigate(row.detailPath)}>
              {row.contractName}
            </button>
          ) : (
            <strong>{row.contractName}</strong>
          )}
          <small>
            {row.contractNo || "合同编号待补"} ·{" "}
            {CONTRACT_TYPE_LABELS[row.contractType || ""] ||
              row.contractTypeLabel ||
              "类型待补"}
          </small>
          <Space size={4}>
            <Tag color={row.direction === "receivable" ? "blue" : "gold"}>
              {row.direction === "receivable" ? "对外销售合同" : "外部服务合同"}
            </Tag>
            <Tag bordered={false}>{row.sourceLabel}</Tag>
          </Space>
        </div>
      ),
    },
    {
      title: "对方与期限",
      width: 230,
      render: (_, row) => (
        <div className={styles.stackCell}>
          <span>{row.partnerName}</span>
          <small>
            {formatDateValue(row.startDate) || "起始日待补"} 至{" "}
            {formatDateValue(row.endDate) || "长期 / 到期日待补"}
          </small>
          {row.liaisonName ? <small>合同对接：{row.liaisonName}</small> : null}
        </div>
      ),
    },
    {
      title: "审批与签署",
      width: 190,
      render: (_, row) => {
        const state = workflowPresentation(row);
        const processorName = resolveProcessorName(row);
        const isFlowRow = Boolean(row.flowStatus);
        return (
          <div className={styles.statusCell}>
            <Tag color={state.color}>{state.label}</Tag>
            {row.runningNode ? <small>{row.runningNode}</small> : null}
            {isFlowRow ? (
              processorName ? (
                <small>当前处理：{processorName}</small>
              ) : null
            ) : row.currentProcessorName ? (
              <small>当前处理：{row.currentProcessorName}</small>
            ) : row.signedAt ? (
              <small>签署于 {formatDateValue(row.signedAt)}</small>
            ) : null}
          </div>
        );
      },
    },
    {
      title: "合同金额",
      dataIndex: "amount",
      width: 150,
      align: "right",
      render: (_, row) => (
        <span className={styles.money}>{money(row.amount, row.currency)}</span>
      ),
    },
    {
      title: isSalesContract ? "收款进度" : "付款进度",
      width: 230,
      render: (_, row) => {
        if (row.direction === "receivable") {
          const basis = row.plannedAmount || row.amount;
          const percent =
            basis > 0
              ? Math.min(
                  Math.round(((row.receivedAmount || 0) / basis) * 100),
                  100,
                )
              : 0;
          return (
            <div className={styles.progressCell}>
              <span>
                {money(row.receivedAmount, row.currency)} /{" "}
                {money(basis, row.currency)}
              </span>
              <Progress percent={percent} size="small" showInfo={false} />
              <small>
                {row.receiptCount
                  ? `已登记 ${row.receiptCount} 笔回款${row.fullyReceived ? " · 已全额收款" : ""}`
                  : row.planCount
                    ? `${row.paidPlanCount}/${row.planCount} 期已收款`
                    : row.expectedPlanCount
                      ? `合同约定 ${row.expectedPlanCount} 期，期次待补全`
                      : "尚未配置收款计划"}
              </small>
            </div>
          );
        }
        const basis = row.plannedAmount || row.amount;
        const percent =
          basis > 0
            ? Math.min(Math.round((row.paidAmount / basis) * 100), 100)
            : 0;
        return (
          <div className={styles.progressCell}>
            <span>
              {money(row.paidAmount, row.currency)} /{" "}
              {money(basis, row.currency)}
            </span>
            <Progress percent={percent} size="small" showInfo={false} />
            <small>
              {row.paymentCount} 张付款单 · {row.paidPlanCount}/{row.planCount}{" "}
              期已付
            </small>
          </div>
        );
      },
    },
    {
      title: "关联发票",
      width: 165,
      render: (_, row) =>
        row.direction === "receivable" ? (
          <div className={styles.stackCell}>
            <span>{money(row.invoiceAmount, row.currency)}</span>
            <small>
              {row.invoiceCount
                ? `已关联 ${row.invoiceCount} 张销项发票`
                : "尚未关联销项发票"}
            </small>
          </div>
        ) : (
          <div className={styles.stackCell}>
            <span>{money(row.invoiceAmount, row.currency)}</span>
            <small>已关联 {row.invoiceCount} 张发票</small>
          </div>
        ),
    },
    {
      title: isSalesContract ? "下一收款" : "下一付款",
      width: 180,
      render: (_, row) =>
        row.direction === "receivable" ? (
          <div className={styles.stackCell}>
            <span>
              {row.nextPaymentName ||
                (row.planCount ? "待收款期次" : "暂无收款计划")}
            </span>
            {row.nextPaymentDate ? (
              <small
                className={row.overduePayment ? styles.overdue : undefined}
              >
                {row.overduePayment ? "已逾期 · " : "计划于 "}
                {formatDateValue(row.nextPaymentDate)}
              </small>
            ) : null}
          </div>
        ) : (
          <div className={styles.stackCell}>
            <span>
              {row.nextPaymentName ||
                (row.planCount ? "待付款期次" : "暂无付款计划")}
            </span>
            {row.nextPaymentDate ? (
              <small
                className={row.overduePayment ? styles.overdue : undefined}
              >
                {row.overduePayment ? "已逾期 · " : "计划于 "}
                {formatDateValue(row.nextPaymentDate)}
              </small>
            ) : null}
          </div>
        ),
    },
    {
      title: "操作",
      width: 168,
      fixed: "right",
      render: (_, row) => (
        <Space size={2}>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            disabled={!row.detailPath}
            onClick={() => row.detailPath && navigate(row.detailPath)}
          >
            详情
          </Button>
          <Button
            type="link"
            size="small"
            icon={<WalletOutlined />}
            disabled={
              row.direction === "receivable" ||
              !row.planCount ||
              ["cancelled", "invalid"].includes(row.workflowStatus || "")
            }
            onClick={() => navigate(`/payment-form?contractId=${row.id}`)}
          >
            付款
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <PageScaffold
      title="合同工作台"
      description="分别管理我方对外销售合同与外部供应商服务合同。"
      variant="list"
      density="compact"
      headerExtra={
        direction === "payable" ? (
          <Button
            type="primary"
            icon={<FileAddOutlined />}
            onClick={() => navigate("/contract-form")}
          >
            新建外部服务合同
          </Button>
        ) : (
          <Button
            type="primary"
            icon={<FileAddOutlined />}
            onClick={() => navigate("/sales-contract-form")}
          >
            新建对外销售合同
          </Button>
        )
      }
    >
      <ProjectTabs
        aria-label="合同业务类型"
        activeKey={direction}
        items={businessTabs.map((item) => ({
          key: item.value,
          label: item.label,
        }))}
        onChange={(key) => {
          setDirection(key as "receivable" | "payable");
          setScope("all");
          setPage(1);
        }}
      />

      <div className={styles.summaryStrip}>
        <div>
          <span>{isSalesContract ? "有效销售合同" : "有效服务合同"}</span>
          <strong>{summary.contractCount}</strong>
          <small>
            {isSalesContract ? "我方提供产品或服务" : "外部供应商提供服务"}
          </small>
        </div>
        <div>
          <span>合同金额</span>
          <strong className={styles.multiCurrency}>
            {formatCurrencySummary(summary.amountsByCurrency)}
          </strong>
          <small>按币种分别汇总</small>
        </div>
        <div>
          <span>待签署</span>
          <strong>{summary.pendingSignatureCount}</strong>
          <small>审批通过后等待签署</small>
        </div>
        <div
          className={
            summary.overduePaymentCount ? styles.summaryWarning : undefined
          }
        >
          <span>{isSalesContract ? "逾期收款计划" : "逾期付款计划"}</span>
          <strong>{summary.overduePaymentCount}</strong>
          <small>{isSalesContract ? "计划收款日已过" : "计划付款日已过"}</small>
        </div>
      </div>

      <section className={styles.listPanel}>
        <ProjectTabs
          className={styles.scopeTabs}
          aria-label="合同状态"
          activeKey={scope}
          items={scopeItems.map((item) => ({
            key: item.value,
            label: item.label,
          }))}
          onChange={(key) => {
            setScope(key as ContractCenterScope);
            setPage(1);
          }}
        />
        <div className={styles.toolbar}>
          <Input
            value={keywordInput}
            prefix={<SearchOutlined />}
            allowClear
            placeholder="搜索合同名称、编号、对方主体或负责人"
            onChange={(event) => setKeywordInput(event.target.value)}
            onPressEnter={() => {
              setKeyword(keywordInput.trim());
              setPage(1);
            }}
          />
          <Select
            value={contractType || undefined}
            allowClear
            placeholder="全部合同类型"
            options={Object.entries(CONTRACT_TYPE_LABELS).map(
              ([value, label]) => ({ value, label }),
            )}
            onChange={(value) => {
              setContractType(value || "");
              setPage(1);
            }}
          />
          <Space>
            <Button
              type="primary"
              onClick={() => {
                setKeyword(keywordInput.trim());
                setPage(1);
              }}
            >
              查询
            </Button>
            <Button
              icon={<ReloadOutlined />}
              aria-label="刷新"
              onClick={() => void load()}
            />
          </Space>
        </div>
        {error ? (
          <Alert
            type="error"
            showIcon
            message="合同数据加载失败"
            description={error}
            className={styles.alert}
          />
        ) : null}
        <Table<ContractCenterRow>
          rowKey={(row) => `${row.source}:${row.id}`}
          loading={loading}
          columns={columns}
          dataSource={data}
          scroll={{ x: 1800 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 份合同`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPageSize !== pageSize ? 1 : nextPage);
              setPageSize(nextPageSize);
            },
          }}
          locale={{
            emptyText: error ? "加载失败，请重试" : "暂无符合条件的合同",
          }}
        />
      </section>
      <Text type="secondary" className={styles.footnote}>
        {isSalesContract
          ? "收款进度按已确认的客户回款核销金额统计，收款计划只表示应收安排。"
          : "付款进度按已确认付款单统计，同一期拆成多张付款单时合并金额并保留真实单据数量。"}
      </Text>
    </PageScaffold>
  );
}

ContractCenterPage.displayName = "合同工作台";
