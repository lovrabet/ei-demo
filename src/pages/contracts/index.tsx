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
import { $i18n } from "@/i18n";

const t = (key: string, fallbackText: string) => $i18n.t(key, fallbackText);

const { Text } = Typography;

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  sales: t("contracts.contractType.sales", "销售"),
  procurement: t("contracts.contractType.procurement", "采购"),
  service: t("contracts.contractType.service", "服务"),
  rent: t("contracts.contractType.rent", "租赁"),
  hr: t("contracts.contractType.hr", "人力"),
  certification: t("contracts.contractType.certification", "认证"),
  other: t("contracts.contractType.other", "其他"),
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
    if (flow === "REJECTED") {
      return { label: t("contracts.status.rejected", "已驳回"), color: "error" };
    }
    if (flow === "CANCELLED" || row.instanceStatus === "CANCELLED") {
      return { label: t("contracts.status.voided", "已作废"), color: "default" };
    }
    if (flow === "SUBMITTED") {
      return { label: t("contracts.status.approval", "审批中"), color: "processing" };
    }
    if (
      row.lifecycleStatus === "signed" ||
      ["signed", "archived", "completed"].includes(row.workflowStatus || "")
    ) {
      return { label: t("contracts.status.signed", "已签署"), color: "success" };
    }
    if (
      row.lifecycleStatus === "pending_signature" ||
      row.workflowStatus === "reviewed"
    ) {
      return {
        label: t("contracts.status.pendingSignature", "待签署"),
        color: "warning",
      };
    }
    return { label: t("contracts.status.approved", "已通过"), color: "success" };
  }
  if (["cancelled", "invalid"].includes(row.workflowStatus || "")) {
    return { label: t("contracts.status.voided", "已作废"), color: "default" };
  }
  if (row.currentTaskType === "sign") {
    return {
      label: t("contracts.status.pendingSignature", "待签署"),
      color: "warning",
    };
  }
  if (row.currentTaskType === "review") {
    return { label: t("contracts.status.approval", "审批中"), color: "processing" };
  }
  if (
    row.lifecycleStatus === "signed" ||
    ["signed", "archived", "completed"].includes(row.workflowStatus || "")
  ) {
    return { label: t("contracts.status.signed", "已签署"), color: "success" };
  }
  if (row.workflowStatus === "reviewed") {
    return {
      label: t("contracts.status.pendingSignature", "待签署"),
      color: "warning",
    };
  }
  if (row.workflowStatus === "draft") {
    return { label: t("contracts.status.draft", "草稿"), color: "default" };
  }
  if (row.workflowStatus === "rejected") {
    return { label: t("contracts.status.rejected", "已驳回"), color: "error" };
  }
  return {
    label:
      row.workflowStatusLabel ||
      row.workflowStatus ||
      t("contracts.status.pending", "状态待补"),
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
          : t("contracts.loadFailed", "加载合同工作台失败");
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
      {
        value: "all" as const,
        label: t("contracts.scope.all", "全部 {count}").replace(
          "{count}",
          String(scopeCounts.all),
        ),
      },
      {
        value: "approval" as const,
        label: t("contracts.scope.approval", "审批中 {count}").replace(
          "{count}",
          String(scopeCounts.approval),
        ),
      },
      {
        value: "pending_signature" as const,
        label: t("contracts.scope.pendingSignature", "待签署 {count}").replace(
          "{count}",
          String(scopeCounts.pendingSignature),
        ),
      },
      {
        value: "signed" as const,
        label: t("contracts.scope.signed", "已签署 {count}").replace(
          "{count}",
          String(scopeCounts.signed),
        ),
      },
      {
        value: "expiring" as const,
        label: t("contracts.scope.expiring", "即将到期 {count}").replace(
          "{count}",
          String(scopeCounts.expiring),
        ),
      },
      {
        value: "voided" as const,
        label: t("contracts.scope.voided", "已作废 {count}").replace(
          "{count}",
          String(scopeCounts.voided),
        ),
      },
    ],
    [scopeCounts],
  );

  const businessTabs = [
    {
      value: "receivable" as const,
      label: t("contracts.direction.receivable", "对外销售合同"),
    },
    {
      value: "payable" as const,
      label: t("contracts.direction.payable", "外部服务合同"),
    },
  ];
  const isSalesContract = direction === "receivable";

  const columns: ColumnsType<ContractCenterRow> = [
    {
      title: t("contracts.columns.contract", "合同"),
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
            {(row.contractNo || t("contracts.contractNoPending", "合同编号待补")) +
              " · " +
              (CONTRACT_TYPE_LABELS[row.contractType || ""] ||
                row.contractTypeLabel ||
                t("contracts.typePending", "类型待补"))}
          </small>
          <Space size={4}>
            <Tag color={row.direction === "receivable" ? "blue" : "gold"}>
              {row.direction === "receivable"
                ? t("contracts.direction.receivable", "对外销售合同")
                : t("contracts.direction.payable", "外部服务合同")}
            </Tag>
            <Tag bordered={false}>{row.sourceLabel}</Tag>
          </Space>
        </div>
      ),
    },
    {
      title: t("contracts.columns.partner", "对方与期限"),
      width: 230,
      render: (_, row) => (
        <div className={styles.stackCell}>
          <span>{row.partnerName}</span>
          <small>
            {(formatDateValue(row.startDate) ||
              t("contracts.startDatePending", "起始日待补")) +
              " " +
              t("contracts.toSeparator", "至") +
              " " +
              (formatDateValue(row.endDate) ||
                t("contracts.endDatePending", "长期 / 到期日待补"))}
          </small>
          {row.liaisonName ? (
            <small>
              {t("contracts.liaison", "合同对接：{name}").replace(
                "{name}",
                row.liaisonName,
              )}
            </small>
          ) : null}
        </div>
      ),
    },
    {
      title: t("contracts.columns.approvalAndSign", "审批与签署"),
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
                <small>
                  {t("contracts.currentProcessor", "当前处理：{name}").replace(
                    "{name}",
                    processorName,
                  )}
                </small>
              ) : null
            ) : row.currentProcessorName ? (
              <small>
                {t("contracts.currentProcessor", "当前处理：{name}").replace(
                  "{name}",
                  row.currentProcessorName,
                )}
              </small>
            ) : row.signedAt ? (
              <small>
                {t("contracts.signedAt", "签署于 {date}").replace(
                  "{date}",
                  formatDateValue(row.signedAt),
                )}
              </small>
            ) : null}
          </div>
        );
      },
    },
    {
      title: t("contracts.columns.amount", "合同金额"),
      dataIndex: "amount",
      width: 150,
      align: "right",
      render: (_, row) => (
        <span className={styles.money}>{money(row.amount, row.currency)}</span>
      ),
    },
    {
      title: isSalesContract
        ? t("contracts.columns.receiptProgress", "收款进度")
        : t("contracts.columns.paymentProgress", "付款进度"),
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
                  ? t(
                      "contracts.receiptProgressDetail",
                      "已登记 {count} 笔回款{full}",
                    )
                      .replace("{count}", String(row.receiptCount))
                      .replace(
                        "{full}",
                        row.fullyReceived
                          ? t("contracts.fullyReceived", " · 已全额收款")
                          : "",
                      )
                  : row.planCount
                    ? t("contracts.planReceivedProgress", "{paid}/{total} 期已收款")
                        .replace("{paid}", String(row.paidPlanCount))
                        .replace("{total}", String(row.planCount))
                    : row.expectedPlanCount
                      ? t(
                          "contracts.expectedPlanCount",
                          "合同约定 {count} 期，期次待补全",
                        ).replace("{count}", String(row.expectedPlanCount))
                      : t("contracts.noReceiptPlan", "尚未配置收款计划")}
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
              {t("contracts.paymentCount", "{count} 张付款单").replace(
                "{count}",
                String(row.paymentCount),
              ) +
                " · " +
                t("contracts.paidPlanProgress", "{paid}/{total} 期已付")
                  .replace("{paid}", String(row.paidPlanCount))
                  .replace("{total}", String(row.planCount))}
            </small>
          </div>
        );
      },
    },
    {
      title: t("contracts.columns.relatedInvoices", "关联发票"),
      width: 165,
      render: (_, row) =>
        row.direction === "receivable" ? (
          <div className={styles.stackCell}>
            <span>{money(row.invoiceAmount, row.currency)}</span>
            <small>
              {row.invoiceCount
                ? t(
                    "contracts.relatedSalesInvoices",
                    "已关联 {count} 张销项发票",
                  ).replace("{count}", String(row.invoiceCount))
                : t("contracts.noSalesInvoiceLink", "尚未关联销项发票")}
            </small>
          </div>
        ) : (
          <div className={styles.stackCell}>
            <span>{money(row.invoiceAmount, row.currency)}</span>
            <small>
              {t("contracts.relatedInvoicesCount", "已关联 {count} 张发票").replace(
                "{count}",
                String(row.invoiceCount),
              )}
            </small>
          </div>
        ),
    },
    {
      title: isSalesContract
        ? t("contracts.columns.nextReceipt", "下一收款")
        : t("contracts.columns.nextPayment", "下一付款"),
      width: 180,
      render: (_, row) =>
        row.direction === "receivable" ? (
          <div className={styles.stackCell}>
            <span>
              {row.nextPaymentName ||
                (row.planCount
                  ? t("contracts.pendingReceiptPhase", "待收款期次")
                  : t("contracts.noReceiptPlan", "暂无收款计划"))}
            </span>
            {row.nextPaymentDate ? (
              <small
                className={row.overduePayment ? styles.overdue : undefined}
              >
                {(row.overduePayment
                  ? t("contracts.overduePrefix", "已逾期 · ")
                  : t("contracts.scheduledPrefix", "计划于 ")) +
                  formatDateValue(row.nextPaymentDate)}
              </small>
            ) : null}
          </div>
        ) : (
          <div className={styles.stackCell}>
            <span>
              {row.nextPaymentName ||
                (row.planCount
                  ? t("contracts.pendingPaymentPhase", "待付款期次")
                  : t("contracts.noPaymentPlan", "暂无付款计划"))}
            </span>
            {row.nextPaymentDate ? (
              <small
                className={row.overduePayment ? styles.overdue : undefined}
              >
                {(row.overduePayment
                  ? t("contracts.overduePrefix", "已逾期 · ")
                  : t("contracts.scheduledPrefix", "计划于 ")) +
                  formatDateValue(row.nextPaymentDate)}
              </small>
            ) : null}
          </div>
        ),
    },
    {
      title: t("contracts.columns.actions", "操作"),
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
            {t("contracts.actions.detail", "详情")}
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
            {t("contracts.actions.pay", "付款")}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <PageScaffold
      title={t("contracts.pageTitle", "合同工作台")}
      description={t(
        "contracts.pageDescription",
        "分别管理我方对外销售合同与外部供应商服务合同。",
      )}
      variant="list"
      density="compact"
      headerExtra={
        direction === "payable" ? (
          <Button
            type="primary"
            icon={<FileAddOutlined />}
            onClick={() => navigate("/contract-form")}
          >
            {t("contracts.actions.newPayable", "新建外部服务合同")}
          </Button>
        ) : (
          <Button
            type="primary"
            icon={<FileAddOutlined />}
            onClick={() => navigate("/sales-contract-form")}
          >
            {t("contracts.actions.newReceivable", "新建对外销售合同")}
          </Button>
        )
      }
    >
      <ProjectTabs
        aria-label={t("contracts.directionAria", "合同业务类型")}
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
          <span>
            {isSalesContract
              ? t("contracts.summary.activeSales", "有效销售合同")
              : t("contracts.summary.activeService", "有效服务合同")}
          </span>
          <strong>{summary.contractCount}</strong>
          <small>
            {isSalesContract
              ? t("contracts.summary.activeSalesDetail", "我方提供产品或服务")
              : t("contracts.summary.activeServiceDetail", "外部供应商提供服务")}
          </small>
        </div>
        <div>
          <span>{t("contracts.summary.amount", "合同金额")}</span>
          <strong className={styles.multiCurrency}>
            {formatCurrencySummary(summary.amountsByCurrency)}
          </strong>
          <small>{t("contracts.summary.amountDetail", "按币种分别汇总")}</small>
        </div>
        <div>
          <span>{t("contracts.summary.pendingSignature", "待签署")}</span>
          <strong>{summary.pendingSignatureCount}</strong>
          <small>
            {t("contracts.summary.pendingSignatureDetail", "审批通过后等待签署")}
          </small>
        </div>
        <div
          className={
            summary.overduePaymentCount ? styles.summaryWarning : undefined
          }
        >
          <span>
            {isSalesContract
              ? t("contracts.summary.overdueReceipt", "逾期收款计划")
              : t("contracts.summary.overduePayment", "逾期付款计划")}
          </span>
          <strong>{summary.overduePaymentCount}</strong>
          <small>
            {isSalesContract
              ? t("contracts.summary.overdueReceiptDetail", "计划收款日已过")
              : t("contracts.summary.overduePaymentDetail", "计划付款日已过")}
          </small>
        </div>
      </div>

      <section className={styles.listPanel}>
        <ProjectTabs
          className={styles.scopeTabs}
          aria-label={t("contracts.statusAria", "合同状态")}
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
            placeholder={t(
              "contracts.searchPlaceholder",
              "搜索合同名称、编号、对方主体或负责人",
            )}
            onChange={(event) => setKeywordInput(event.target.value)}
            onPressEnter={() => {
              setKeyword(keywordInput.trim());
              setPage(1);
            }}
          />
          <Select
            value={contractType || undefined}
            allowClear
            placeholder={t("contracts.contractType.all", "全部合同类型")}
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
              {t("contracts.actions.search", "查询")}
            </Button>
            <Button
              icon={<ReloadOutlined />}
              aria-label={t("contracts.actions.refresh", "刷新")}
              onClick={() => void load()}
            />
          </Space>
        </div>
        {error ? (
          <Alert
            type="error"
            showIcon
            message={t("contracts.loadError", "合同数据加载失败")}
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
            showTotal: (count) =>
              t("contracts.totalContracts", "共 {count} 份合同").replace(
                "{count}",
                String(count),
              ),
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPageSize !== pageSize ? 1 : nextPage);
              setPageSize(nextPageSize);
            },
          }}
          locale={{
            emptyText: error
              ? t("contracts.emptyError", "加载失败，请重试")
              : t("contracts.empty", "暂无符合条件的合同"),
          }}
        />
      </section>
      <Text type="secondary" className={styles.footnote}>
        {isSalesContract
          ? t(
              "contracts.footnote.receivable",
              "收款进度按已确认的客户回款核销金额统计，收款计划只表示应收安排。",
            )
          : t(
              "contracts.footnote.payable",
              "付款进度按已确认付款单统计，同一期拆成多张付款单时合并金额并保留真实单据数量。",
            )}
      </Text>
    </PageScaffold>
  );
}

ContractCenterPage.displayName = "合同工作台";
