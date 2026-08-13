/**
 * title: 工作台
 *
 * @modified 2026-07-19 接入业务模型聚合 SQL 与 Dashboard BFF
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Empty,
  Progress,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  theme,
} from "antd";
import {
  ArrowRightOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  FileAddOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  ReloadOutlined,
  RiseOutlined,
  SendOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import { lovrabetClient } from "@/api/client";
import {
  CPO_BIZ_TYPE_LABEL,
  getCpoDetailPath,
} from "@/features/cpo-workflow/routes";
import {
  loadPlatformTodoSummaries,
  type PlatformTaskSummary,
} from "@/features/platform-flow/api";
import styles from "./index.module.css";

type PersonalStats = {
  myTodoCount: number;
  myInitiatedCount: number;
  paymentBankPendingCount: number;
  expiringCredentialCount: number;
};

type OrganizationStats = {
  expenseAmount30d: number;
  expenseCount30d: number;
  paymentAmount30d: number;
  paymentCount30d: number;
  contractAmount30d: number;
  contractCount30d: number;
  pendingTaskCount: number;
  overdueTaskCount: number;
  credentialRiskCount: number;
};

type TrendPoint = {
  period: string;
  expense: number;
  contract: number;
  payment: number;
  invoice: number;
  travel: number;
  total: number;
};

type WorkloadItem = {
  bizType: string;
  count: number;
};

type DashboardData = PersonalStats & {
  personal: PersonalStats;
  actor: { userId: string; displayName: string };
  organization: OrganizationStats;
  trend: TrendPoint[];
  workload: WorkloadItem[];
  generatedAt: string;
};


const emptyPersonal: PersonalStats = {
  myTodoCount: 0,
  myInitiatedCount: 0,
  paymentBankPendingCount: 0,
  expiringCredentialCount: 0,
};

const emptyOrganization: OrganizationStats = {
  expenseAmount30d: 0,
  expenseCount30d: 0,
  paymentAmount30d: 0,
  paymentCount30d: 0,
  contractAmount30d: 0,
  contractCount30d: 0,
  pendingTaskCount: 0,
  overdueTaskCount: 0,
  credentialRiskCount: 0,
};

const bizTypeLabel: Record<string, string> = {
  ...CPO_BIZ_TYPE_LABEL,
  partner: "伙伴",
  credential: "资质",
};

const currencyFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  maximumFractionDigits: 0,
});

function formatCurrency(value: number) {
  return currencyFormatter.format(Number(value) || 0);
}

export function formatMonth(period: string) {
  if (!/^\d{4}-\d{1,2}$/.test(period)) return period;
  const [year, month] = period.split("-");
  const monthNumber = Number(month);
  if (monthNumber < 1 || monthNumber > 12) return period;
  return `${year.slice(-2)}年${monthNumber}月`;
}

function formatDateTime(value: string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

async function loadAllTodos(): Promise<PlatformTaskSummary[]> {
  return loadPlatformTodoSummaries();
}

const Workbench: React.FC = () => {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [todos, setTodos] = useState<PlatformTaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dashboardResult, todoResult] = await Promise.all([
        lovrabetClient.bff.execute<DashboardData>({
          scriptName: "cpoGetWorkbenchStats",
          params: {},
        }),
        loadAllTodos(),
      ]);
      setDashboard(dashboardResult);
      setTodos(todoResult);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "工作台数据加载失败",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const personal = dashboard?.personal || dashboard || emptyPersonal;
  const organization = dashboard?.organization || emptyOrganization;
  const trend = dashboard?.trend || [];
  const workload = dashboard?.workload || [];
  const overdueRatio = organization.pendingTaskCount
    ? Math.min(
        100,
        Math.round(
          (organization.overdueTaskCount / organization.pendingTaskCount) * 100,
        ),
      )
    : 0;

  const trendOption = useMemo(
    () => ({
      color: [
        token.colorPrimary,
        token.colorSuccess,
        token.colorWarning,
        token.colorInfo,
        token.colorError,
      ],
      tooltip: {
        trigger: "axis",
        backgroundColor: token.colorBgElevated,
        borderColor: token.colorBorderSecondary,
        textStyle: { color: token.colorText },
      },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: token.colorTextSecondary },
      },
      grid: { left: 12, right: 10, top: 42, bottom: 4, containLabel: true },
      xAxis: {
        type: "category",
        data: trend.map((item) => formatMonth(item.period)),
        axisLine: { lineStyle: { color: token.colorBorderSecondary } },
        axisTick: { show: false },
        axisLabel: { color: token.colorTextSecondary },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        splitLine: { lineStyle: { color: token.colorSplit } },
        axisLabel: { color: token.colorTextSecondary },
      },
      series: [
        {
          name: "报销",
          type: "bar",
          stack: "applications",
          barMaxWidth: 34,
          data: trend.map((item) => item.expense),
        },
        {
          name: "合同",
          type: "bar",
          stack: "applications",
          data: trend.map((item) => item.contract),
        },
        {
          name: "付款",
          type: "bar",
          stack: "applications",
          data: trend.map((item) => item.payment),
        },
        {
          name: "发票",
          type: "bar",
          stack: "applications",
          data: trend.map((item) => item.invoice),
        },
        {
          name: "差旅",
          type: "bar",
          stack: "applications",
          data: trend.map((item) => item.travel),
        },
      ],
    }),
    [token, trend],
  );

  const workloadOption = useMemo(
    () => ({
      color: [
        token.colorPrimary,
        token.colorSuccess,
        token.colorWarning,
        token.colorInfo,
        token.colorError,
      ],
      tooltip: {
        trigger: "item",
        formatter: "{b}<br/>{c} 项 · {d}%",
        backgroundColor: token.colorBgElevated,
        borderColor: token.colorBorderSecondary,
        textStyle: { color: token.colorText },
      },
      legend: {
        orient: "vertical",
        right: 2,
        top: "center",
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: token.colorTextSecondary },
      },
      series: [
        {
          type: "pie",
          radius: ["52%", "74%"],
          center: ["34%", "52%"],
          label: { show: false },
          data: workload.map((item) => ({
            name: bizTypeLabel[item.bizType] || item.bizType,
            value: item.count,
          })),
        },
      ],
    }),
    [token, workload],
  );

  const cssVariables = {
    "--dashboard-bg": token.colorBgLayout,
    "--dashboard-surface": token.colorBgContainer,
    "--dashboard-surface-alt": token.colorFillQuaternary,
    "--dashboard-border": token.colorBorderSecondary,
    "--dashboard-text": token.colorText,
    "--dashboard-text-secondary": token.colorTextSecondary,
    "--dashboard-primary": token.colorPrimary,
    "--dashboard-warning": token.colorWarning,
    "--dashboard-error": token.colorError,
    "--dashboard-success": token.colorSuccess,
    "--dashboard-shadow": token.boxShadowTertiary,
  } as React.CSSProperties;

  const openTodo = (item: PlatformTaskSummary) => {
    const detailPath = getCpoDetailPath(item.bizType, item.bizId);
    navigate(detailPath || "/approval-center?tab=todo");
  };

  return (
    <div className={styles.page} style={cssVariables}>
      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>CPO OPERATIONS</div>
          <h1>
            {dashboard?.actor?.displayName
              ? `${dashboard.actor.displayName}，业务工作台`
              : "业务工作台"}
          </h1>
          <p>集中查看个人任务、业务流量和资金事项。</p>
        </div>
        <div className={styles.heroActions}>
          <span className={styles.updatedAt}>
            数据更新于{" "}
            {dashboard?.generatedAt
              ? formatDateTime(dashboard.generatedAt)
              : "-"}
          </span>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            刷新
          </Button>
        </div>
      </header>

      {error ? (
        <Alert
          className={styles.alert}
          type="error"
          showIcon
          message="工作台数据暂时不可用"
          description={error}
          action={<Button onClick={load}>重新加载</Button>}
        />
      ) : null}

      {loading && !dashboard ? (
        <div className={styles.loadingPanel}>
          <Skeleton active paragraph={{ rows: 10 }} />
        </div>
      ) : (
        <>
          <section className={styles.statGrid} aria-label="个人工作概览">
            <StatCard
              icon={<ClockCircleOutlined />}
              label="审批待办"
              value={todos.length}
              detail="等待我处理的审批任务"
              tone="warning"
              onClick={() => navigate("/approval-center?tab=todo")}
            />
            <StatCard
              icon={<SendOutlined />}
              label="我发起的业务"
              value={personal.myInitiatedCount}
              detail="当前账号创建的申请"
              tone="primary"
              onClick={() => navigate("/my-submitted")}
            />
            <StatCard
              icon={<WalletOutlined />}
              label="付款待确认"
              value={personal.paymentBankPendingCount}
              detail="银行处理中待回执"
              tone="success"
              onClick={() => navigate("/payment-form")}
            />
            <StatCard
              icon={<FileProtectOutlined />}
              label="资质提醒"
              value={personal.expiringCredentialCount}
              detail="即将到期的公司资质"
              tone="error"
              onClick={() => navigate("/credential-form")}
            />
          </section>

          <section className={`${styles.panel} ${styles.todoPanel}`}>
            <PanelHeader
              title="最近待办"
              subtitle={`当前共 ${todos.length} 项，按创建时间倒序`}
              extra={
                <Button
                  type="link"
                  onClick={() => navigate("/approval-center?tab=todo")}
                >
                  查看全部 <ArrowRightOutlined />
                </Button>
              }
            />
            {todos.length ? (
              <div className={styles.todoList}>
                {todos.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={styles.todoRow}
                    onClick={() => openTodo(item)}
                  >
                    <div className={styles.todoMarker} />
                    <div className={styles.todoMain}>
                      <div className={styles.todoTags}>
                        <Tag color="blue">
                          {bizTypeLabel[item.bizType] || item.bizType}
                        </Tag>
                        <Tag color="geekblue">{item.nodeName}</Tag>
                      </div>
                      <strong>{item.title}</strong>
                      <span>{item.applicantName || "申请人未记录"}</span>
                    </div>
                    <div className={styles.todoMeta}>
                      {item.amount ? (
                        <b>{formatCurrency(item.amount)}</b>
                      ) : null}
                      <time>{formatDateTime(item.createdAt)}</time>
                    </div>
                    <Tooltip title="查看详情">
                      <ArrowRightOutlined className={styles.todoArrow} />
                    </Tooltip>
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无待办"
              />
            )}
          </section>

          <section className={styles.primaryGrid}>
            <article className={`${styles.panel} ${styles.trendPanel}`}>
              <PanelHeader
                title="申请趋势"
                subtitle="近 6 个月业务申请量，按类型堆叠"
                extra={
                  <Tag color="blue">{trend.at(-1)?.total || 0} 项 / 本月</Tag>
                }
              />
              {trend.some((item) => item.total > 0) ? (
                <ReactECharts
                  option={trendOption}
                  style={{ height: 300 }}
                  notMerge
                />
              ) : (
                <Empty
                  className={styles.chartEmpty}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无申请趋势"
                />
              )}
            </article>

            <article className={styles.panel}>
              <PanelHeader
                title="近 30 日金额"
                subtitle="按申请创建时间汇总，单位为人民币"
              />
              <div className={styles.amountList}>
                <AmountRow
                  label="报销申请"
                  amount={organization.expenseAmount30d}
                  count={organization.expenseCount30d}
                  color={token.colorPrimary}
                />
                <AmountRow
                  label="付款申请"
                  amount={organization.paymentAmount30d}
                  count={organization.paymentCount30d}
                  color={token.colorSuccess}
                />
                <AmountRow
                  label="合同申请"
                  amount={organization.contractAmount30d}
                  count={organization.contractCount30d}
                  color={token.colorWarning}
                />
              </div>
              <div className={styles.amountFootnote}>
                已排除已取消、已驳回和失败记录
              </div>
            </article>
          </section>

          <section className={styles.secondaryGrid}>
            <article className={styles.panel}>
              <PanelHeader
                title="待办构成"
                subtitle={`全局当前待办 ${organization.pendingTaskCount} 项`}
              />
              {workload.length ? (
                <ReactECharts
                  option={workloadOption}
                  style={{ height: 260 }}
                  notMerge
                />
              ) : (
                <Empty
                  className={styles.chartEmpty}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无待办任务"
                />
              )}
            </article>

            <article className={styles.panel}>
              <PanelHeader
                title="风险与提醒"
                subtitle="根据任务截止时间和资质状态识别"
              />
              <div className={styles.riskList}>
                <div className={styles.riskItem}>
                  <div className={styles.riskIcon} data-tone="warning">
                    <ExclamationCircleOutlined />
                  </div>
                  <div className={styles.riskContent}>
                    <div className={styles.riskTopline}>
                      <span>逾期待办</span>
                      <strong>{organization.overdueTaskCount}</strong>
                    </div>
                    <Progress
                      percent={overdueRatio}
                      showInfo={false}
                      strokeColor={token.colorWarning}
                      size="small"
                    />
                    <small>占全部待办 {overdueRatio}%</small>
                  </div>
                </div>
                <div className={styles.riskItem}>
                  <div className={styles.riskIcon} data-tone="error">
                    <FileProtectOutlined />
                  </div>
                  <div className={styles.riskContent}>
                    <div className={styles.riskTopline}>
                      <span>资质风险</span>
                      <strong>{organization.credentialRiskCount}</strong>
                    </div>
                    <p>包含即将到期和已过期资质</p>
                  </div>
                </div>
              </div>

              <div className={styles.quickActions}>
                <button type="button" onClick={() => navigate("/expense-form")}>
                  <FileAddOutlined />
                  新建报销
                </button>
                <button type="button" onClick={() => navigate("/payment-form")}>
                  <WalletOutlined />
                  新建付款
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/contract-form")}
                >
                  <FileTextOutlined />
                  新建合同
                </button>
              </div>
            </article>
          </section>
        </>
      )}
    </div>
  );
};

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
  tone: "primary" | "success" | "warning" | "error";
  onClick: () => void;
}> = ({ icon, label, value, detail, tone, onClick }) => (
  <button
    type="button"
    className={styles.statCard}
    data-tone={tone}
    onClick={onClick}
  >
    <div className={styles.statIcon}>{icon}</div>
    <div className={styles.statContent}>
      <span>{label}</span>
      <strong>{value.toLocaleString("zh-CN")}</strong>
      <small>{detail}</small>
    </div>
    <RiseOutlined className={styles.statArrow} />
  </button>
);

const PanelHeader: React.FC<{
  title: string;
  subtitle: string;
  extra?: React.ReactNode;
}> = ({ title, subtitle, extra }) => (
  <div className={styles.panelHeader}>
    <div>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
    {extra ? <div>{extra}</div> : null}
  </div>
);

const AmountRow: React.FC<{
  label: string;
  amount: number;
  count: number;
  color: string;
}> = ({ label, amount, count, color }) => (
  <div className={styles.amountRow}>
    <span className={styles.amountDot} style={{ backgroundColor: color }} />
    <div>
      <span>{label}</span>
      <small>{count} 笔申请</small>
    </div>
    <strong>{formatCurrency(amount)}</strong>
  </div>
);

Workbench.displayName = "业务工作台";

export default Workbench;
