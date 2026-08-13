/**
 * title: 发票中心
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CopyOutlined,
  EyeOutlined,
  FileAddOutlined,
  InboxOutlined,
  FileTextOutlined,
  LinkOutlined,
  PaperClipOutlined,
  ReloadOutlined,
  SearchOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import PageScaffold from "@/components/page-scaffold/PageScaffold";
import ProjectTabs from "@/components/project-tabs";
import { getInvoiceCenter } from "@/features/cpo-invoice-center/api";
import type {
  InvoiceCenterResponse,
  InvoiceCenterRow,
  InvoiceCenterScope,
  InvoiceRelatedDocument,
} from "@/features/cpo-invoice-center/types";
import { formatDateValue } from "@/features/cpo-application-detail/format";
import { queryRuntimeFileUrl } from "@/features/attachments/api";
import styles from "./index.module.css";

const { Text } = Typography;

const DIRECTION_LABELS: Record<string, string> = {
  incoming: "对方开给我们",
  outgoing: "我们开给对方",
};

const PURPOSE_LABELS: Record<string, string> = {
  reimbursement: "员工报销",
  procurement: "采购 / 供应商",
  contract_payment: "合同付款",
  customer_billing: "客户开票",
  other: "其他",
};

const EMPTY_SUMMARY: InvoiceCenterResponse["summary"] = {
  invoiceCount: 0,
  activeInvoiceCount: 0,
  inactiveInvoiceCount: 0,
  incomingCount: 0,
  outgoingCount: 0,
  totalAmount: 0,
  allocatedAmount: 0,
  unallocatedAmount: 0,
  actionRequiredCount: 0,
};

function money(value?: number, currency = "CNY") {
  const amount = Number(value || 0);
  const prefix = currency === "CNY" ? "¥" : `${currency} `;
  return `${prefix}${amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function copyInvoiceNumber(invoiceNo?: string) {
  const value = String(invoiceNo || "").trim();
  if (!value) {
    message.warning("当前发票没有可复制的号码");
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const input = document.createElement("textarea");
      input.value = value;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    message.success("发票号码已复制");
  } catch {
    message.error("复制失败，请手动复制发票号码");
  }
}

function InvoiceAttachmentLink({ filePath }: { filePath?: string }) {
  const [opening, setOpening] = useState(false);
  const normalizedPath = String(filePath || "").trim();

  if (!normalizedPath) {
    return (
      <div className={styles.drawerAttachmentEmpty}>
        <PaperClipOutlined />
        <span>暂无发票附件</span>
      </div>
    );
  }

  const handleOpen = async () => {
    const previewWindow = window.open("about:blank", "_blank");
    if (previewWindow) previewWindow.opener = null;
    setOpening(true);

    try {
      const url = /^https?:\/\//i.test(normalizedPath)
        ? normalizedPath
        : await queryRuntimeFileUrl(normalizedPath);
      if (previewWindow) {
        previewWindow.location.replace(url);
      } else {
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (!opened) {
          message.warning("浏览器已阻止打开附件，请允许弹出窗口后重试");
        }
      }
    } catch (openError) {
      previewWindow?.close();
      message.error(
        `打开附件失败：${
          openError instanceof Error ? openError.message : String(openError)
        }`,
      );
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className={styles.drawerAttachmentCard}>
      <div className={styles.drawerAttachmentMeta}>
        <PaperClipOutlined />
        <div>
          <span>附件地址</span>
          <strong title={normalizedPath}>{normalizedPath}</strong>
        </div>
      </div>
      <Button
        type="primary"
        icon={<LinkOutlined />}
        loading={opening}
        aria-label="打开发票附件"
        onClick={() => void handleOpen()}
      >
        打开附件
      </Button>
    </div>
  );
}

function RelatedDocumentList({
  rows,
  onOpen,
}: {
  rows: InvoiceRelatedDocument[];
  onOpen: (path?: string) => void;
}) {
  if (!rows.length) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="暂未关联业务单据"
      />
    );
  }
  return (
    <div className={styles.drawerDocumentList}>
      {rows.map((item) => {
        const content = (
          <>
            <FileTextOutlined />
            <span>
              <small>{item.relationLabel}</small>
              <strong>{item.title}</strong>
              <em>
                {item.status || "状态未记录"}
                {item.amount ? ` · ${money(item.amount)}` : ""}
              </em>
            </span>
          </>
        );
        return item.path ? (
          <button
            type="button"
            key={item.key}
            className={styles.drawerDocument}
            onClick={() => onOpen(item.path)}
          >
            {content}
            <EyeOutlined />
          </button>
        ) : (
          <div
            key={item.key}
            className={`${styles.drawerDocument} ${styles.drawerDocumentStatic}`}
          >
            {content}
            <span aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
}

export default function InvoiceCenterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scope, setScope] = useState<InvoiceCenterScope>("all");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [purpose, setPurpose] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<InvoiceCenterRow[]>([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<InvoiceCenterRow>();

  const openPath = (path?: string) => {
    const target = String(path || "").trim();
    if (!target) return;
    if (/^https?:\/\//i.test(target)) {
      window.open(target, "_blank", "noopener,noreferrer");
      return;
    }
    navigate(target.startsWith("/") ? target : `/${target}`);
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getInvoiceCenter({
        scope,
        keyword,
        status,
        purpose,
        page,
        pageSize,
      });
      setData(response.tableData);
      setSummary(response.summary);
      setTotal(response.paging.totalCount);
    } catch (requestError) {
      const nextError =
        requestError instanceof Error
          ? requestError.message
          : "加载发票中心失败";
      setError(nextError);
      message.error(nextError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [scope, keyword, status, purpose, page, pageSize]);

  const scopeItems = useMemo(
    () => [
      { value: "all", label: `全部 ${summary.invoiceCount}` },
      { value: "incoming", label: `进项 ${summary.incomingCount}` },
      { value: "outgoing", label: `销项 ${summary.outgoingCount}` },
      {
        value: "action_required",
        label: `待处理 ${summary.actionRequiredCount}`,
      },
    ],
    [summary],
  );

  const columns: ColumnsType<InvoiceCenterRow> = [
    {
      title: "发票号码",
      dataIndex: "invoiceNo",
      width: 220,
      render: (_, record) => (
        <div className={styles.invoiceNumberCell}>
          <button
            type="button"
            className={styles.invoiceNumberButton}
            title={record.invoiceNo || "发票号码待补"}
            onClick={() => setSelected(record)}
          >
            {record.invoiceNo || "发票号码待补"}
          </button>
          {record.invoiceNo ? (
            <Tooltip title="复制发票号码">
              <Button
                className={styles.copyInvoiceNumber}
                type="text"
                size="small"
                icon={<CopyOutlined />}
                aria-label={`复制发票号码 ${record.invoiceNo}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void copyInvoiceNumber(record.invoiceNo);
                }}
              />
            </Tooltip>
          ) : null}
        </div>
      ),
    },
    {
      title: "发票标题",
      dataIndex: "title",
      width: 240,
      render: (value) => (
        <span className={styles.titleCell}>{value || "-"}</span>
      ),
    },
    {
      title: "分类",
      width: 190,
      render: (_, record) => (
        <div className={styles.classificationCell}>
          <Tag color={record.direction === "outgoing" ? "blue" : "gold"}>
            {record.direction
              ? DIRECTION_LABELS[record.direction] || record.direction
              : "方向待补"}
          </Tag>
          <Tag>{PURPOSE_LABELS[record.purpose || ""] || "用途待补"}</Tag>
        </div>
      ),
    },
    {
      title: "交易对手",
      dataIndex: "partnerName",
      width: 220,
      render: (value, record) => (
        <div className={styles.partnerCell}>
          <span>{value || "交易对手待补"}</span>
          <small>{record.direction === "outgoing" ? "购方" : "销方"}</small>
        </div>
      ),
    },
    {
      title: "票面 / 分摊",
      width: 190,
      align: "right",
      render: (_, record) => (
        <div className={styles.amountCell}>
          <span>{money(record.totalAmount, record.currency)}</span>
          <small>已分摊 {money(record.allocatedAmount, record.currency)}</small>
          {record.unallocatedAmount > 0 ? (
            <small className={styles.amountPending}>
              未分摊 {money(record.unallocatedAmount, record.currency)}
            </small>
          ) : null}
        </div>
      ),
    },
    {
      title: "业务关联",
      width: 250,
      render: (_, record) => (
        <div className={styles.relationCell}>
          {record.relatedDocuments.length ? (
            <>
              {record.relatedDocuments.slice(0, 2).map((item) => (
                item.path ? (
                  <button
                    type="button"
                    key={item.key}
                    className={`${styles.relationItem} ${styles.relationItemLink}`}
                    title={`查看${item.title}`}
                    onClick={() => openPath(item.path)}
                  >
                    <LinkOutlined />
                    <span>{item.title}</span>
                  </button>
                ) : (
                  <div
                    key={item.key}
                    className={styles.relationItem}
                    title={item.title}
                  >
                    <FileTextOutlined />
                    <span>{item.title}</span>
                  </div>
                )
              ))}
              {record.relatedDocuments.length > 2 ? (
                <small>另有 {record.relatedDocuments.length - 2} 项关联</small>
              ) : null}
            </>
          ) : (
            <Text type="secondary">未关联业务单据</Text>
          )}
        </div>
      ),
    },
    {
      title: "日期 / 业务归属",
      width: 150,
      render: (_, record) => (
        <div className={styles.statusCell}>
          <span>{formatDateValue(record.invoiceDate)}</span>
          <Tag color={record.usageStatusTone || "default"}>
            {record.usageStatusLabel || "待判断"}
          </Tag>
        </div>
      ),
    },
    {
      title: "待办",
      width: 92,
      align: "center",
      render: (_, record) =>
        record.actionReasons.length ? (
          <Tooltip title={record.actionReasons.join("；")}>
            <span className={styles.actionIndicator}>
              <WarningOutlined />
              {record.actionReasons.length}
            </span>
          </Tooltip>
        ) : (
          <Text type="secondary">无</Text>
        ),
    },
    {
      title: "操作",
      fixed: "right",
      width: 100,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => setSelected(record)}
        >
          查看
        </Button>
      ),
    },
  ];

  return (
    <PageScaffold
      title="发票中心"
      description="统一管理进项、销项、报销发票及其合同、付款和费用归属。"
      variant="list"
      density="compact"
      headerExtra={
        <Space wrap>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={load}>
            刷新
          </Button>
          <Button
            icon={<InboxOutlined />}
            onClick={() => navigate("/invoice-archive-form")}
          >
            录入进项发票
          </Button>
          <Button
            type="primary"
            icon={<FileAddOutlined />}
            onClick={() => navigate("/invoice-form")}
          >
            申请开票
          </Button>
        </Space>
      }
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          message="发票中心加载失败"
          description={error}
          action={<Button onClick={load}>重试</Button>}
        />
      ) : null}

      <section className={styles.summaryStrip} aria-label="发票概览">
        <div>
          <span>发票总数</span>
          <strong>{summary.invoiceCount}</strong>
          <small>
            业务有效 {summary.activeInvoiceCount} · 已失效{" "}
            {summary.inactiveInvoiceCount}
          </small>
        </div>
        <div>
          <span>票面总额</span>
          <strong>{money(summary.totalAmount)}</strong>
          <small>按业务有效发票汇总</small>
        </div>
        <div>
          <span>已分摊</span>
          <strong>{money(summary.allocatedAmount)}</strong>
          <small>已关联付款或报销</small>
        </div>
        <div
          className={summary.actionRequiredCount ? styles.summaryWarning : ""}
        >
          <span>待处理</span>
          <strong>{summary.actionRequiredCount}</strong>
          <small>未分摊、未分类或缺少关联</small>
        </div>
      </section>

      <section className={styles.listPanel}>
        <ProjectTabs
          className={styles.scopeTabs}
          aria-label="发票范围"
          activeKey={scope}
          items={scopeItems.map((item) => ({
            key: item.value,
            label: item.label,
          }))}
          onChange={(key) => {
            setScope(key as InvoiceCenterScope);
            setPage(1);
          }}
        />
        <div className={styles.toolbar}>
          <Input.Search
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索发票号、抬头、交易对手或关联合同"
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            onSearch={(value) => {
              setKeyword(value.trim());
              setPage(1);
            }}
          />
          <Select
            allowClear
            placeholder="业务用途"
            value={purpose || undefined}
            onChange={(value) => {
              setPurpose(value || "");
              setPage(1);
            }}
            options={Object.entries(PURPOSE_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <Select
            allowClear
            placeholder="流程状态"
            value={status || undefined}
            onChange={(value) => {
              setStatus(value || "");
              setPage(1);
            }}
            options={[
              { value: "draft", label: "草稿" },
              { value: "submitted", label: "审批中" },
              { value: "reviewed", label: "已审核 / 已归档" },
              { value: "rejected", label: "已驳回" },
              { value: "cancelled", label: "已作废" },
            ]}
          />
        </div>
        <Table<InvoiceCenterRow>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={data}
          scroll={{ x: 1480 }}
          locale={{ emptyText: <Empty description="暂无符合条件的发票" /> }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 张发票`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPageSize === pageSize ? nextPage : 1);
              setPageSize(nextPageSize);
            },
          }}
        />
      </section>

      <Drawer
        title="发票业务关系"
        width="min(560px, 100vw)"
        open={Boolean(selected)}
        onClose={() => setSelected(undefined)}
        extra={
          selected ? (
            <Button
              type="primary"
              icon={<EyeOutlined />}
              onClick={() => openPath(selected.detailPath)}
            >
              发票登记详情
            </Button>
          ) : null
        }
      >
        {selected ? (
          <div className={styles.drawerContent}>
            <header>
              <span>
                {DIRECTION_LABELS[selected.direction || ""] || "方向待补"} ·{" "}
                {PURPOSE_LABELS[selected.purpose || ""] || "用途待补"}
              </span>
              <h3>{selected.title}</h3>
              <p>{selected.invoiceNo || "发票号码待补"}</p>
            </header>
            <div className={styles.drawerFacts}>
              <div>
                <span>交易对手</span>
                <strong>{selected.partnerName || "待补"}</strong>
              </div>
              <div>
                <span>票面金额</span>
                <strong>
                  {money(selected.totalAmount, selected.currency)}
                </strong>
              </div>
              <div>
                <span>已分摊</span>
                <strong>
                  {money(selected.allocatedAmount, selected.currency)}
                </strong>
              </div>
              <div>
                <span>未分摊</span>
                <strong>
                  {money(selected.unallocatedAmount, selected.currency)}
                </strong>
              </div>
              <div>
                <span>业务归属</span>
                <strong>{selected.usageStatusLabel || "待判断"}</strong>
              </div>
              <div>
                <span>原登记流程</span>
                <strong>
                  {selected.workflowStatusLabel ||
                    selected.workflowStatus ||
                    "未记录"}
                </strong>
              </div>
            </div>
            <section className={styles.drawerAttachmentSection}>
              <h4>发票附件</h4>
              <InvoiceAttachmentLink filePath={selected.filePath} />
            </section>
            {selected.workflowStatus === "rejected" &&
            selected.relatedDocuments.length ? (
              <Alert
                type="info"
                showIcon
                message="登记流程与当前业务归属不同"
                description="这张发票原登记流程曾被驳回，但之后已被其他有效业务单据使用。发票中心以当前实际归属为主，原流程状态仅作为历史记录保留。"
              />
            ) : null}
            {selected.actionReasons.length ? (
              <Alert
                type="warning"
                showIcon
                message="这张发票仍有待处理事项"
                description={selected.actionReasons.join("；")}
              />
            ) : null}
            <section>
              <h4>关联业务单据</h4>
              <RelatedDocumentList
                rows={selected.relatedDocuments}
                onOpen={openPath}
              />
            </section>
          </div>
        ) : null}
      </Drawer>
    </PageScaffold>
  );
}
