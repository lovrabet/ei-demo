import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ApartmentOutlined,
  BankOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ExportOutlined,
  ExclamationCircleOutlined,
  FileOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  PaperClipOutlined,
  RightOutlined,
  RollbackOutlined,
  ScheduleOutlined,
  StopOutlined,
  SettingOutlined,
  DeleteOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import { queryRuntimeFileUrl } from "@/features/attachments/api";
import PlatformFlowPanel from "@/features/platform-flow/PlatformFlowPanel";
import MarkdownContent from "@/components/markdown-content";
import ProjectTabs from "@/components/project-tabs";
import {
  advanceApplicationWorkflow,
  getApplicationDetail,
  listDocument360Options,
  manageDocument360,
} from "./api";
import {
  ACTION_LABELS,
  APPLICATION_DETAIL_CONFIG,
  ATTACHMENT_TYPE_LABELS,
  COMPLIANCE_LABELS,
  DETAIL_DESCRIPTION_COLUMNS,
  EXPENSE_CATEGORY_LABELS,
  STATUS_LABELS,
  TASK_TYPE_LABELS,
} from "./config";
import {
  formatDateValue,
  formatDetailValue,
  getVisibleWorkflowPlanRows,
  isHistoricalPaidCompletion,
  isWorkflowJourneyCompleted,
  selectCurrentTask,
  splitWorkflowJourneyActions,
} from "./format";
import type {
  ApplicationDetailConfig,
  ApplicationDetailResponse,
  AttachmentRecord,
  ContractPaymentLinkRecord,
  ContractPaymentPlanRecord,
  CounterpartyPortfolio,
  CounterpartyPortfolioItem,
  CpoApplicationBizType,
  Document360ModuleDefinition,
  Document360ModuleKey,
  Document360Option,
  ExecutiveMetric,
  ExecutiveRisk,
  ExpenseItemRecord,
  InvoiceLinkRecord,
  RelatedDocumentRecord,
  SalaryPaymentItemRecord,
  WorkflowAvailableAction,
  WorkflowAction,
  WorkflowPlanStep,
} from "./types";
import styles from "./ApplicationDetailView.module.css";

const RELATION_TYPE_LABELS: Record<string, string> = {
  actual: "实际使用",
  offset: "冲销",
  supplier_invoice: "供应商发票",
  receipt: "收据",
  proof: "证明",
};

const PAYMENT_PLAN_STATUS_LABELS: Record<string, string> = {
  pending: "待支付",
  processing: "支付处理中",
  paid: "已支付",
  not_required: "无需支付",
  cancelled: "已取消",
};

const PAYMENT_PLAN_STATUS_COLORS: Record<string, string> = {
  processing: "processing",
  paid: "success",
  not_required: "default",
  cancelled: "error",
};

const CONTRACT_LIFECYCLE_LABELS: Record<string, string> = {
  pending_signature: "待签署",
  signed: "已签署",
  in_progress: "进行中",
  completed: "已完成",
};

function text(value: unknown) {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

function labelText(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "label" in value &&
    typeof value.label === "string"
  ) {
    return value.label;
  }
  return text(value);
}

function formatPlanMoney(value: unknown, currency: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: String(currency || "CNY"),
    minimumFractionDigits: 2,
  }).format(amount);
}

function firstDisplayValue(...values: unknown[]) {
  const value = values.find(
    (item) => item !== undefined && item !== null && String(item).trim() !== "",
  );
  return text(value);
}

export function getPaymentPlanLinks(
  row: ContractPaymentPlanRecord,
): ContractPaymentLinkRecord[] {
  if (Array.isArray(row.linked_payments) && row.linked_payments.length) {
    return row.linked_payments.filter((payment) => Number(payment.id) > 0);
  }
  if (!Number(row.linked_payment_application_id)) return [];
  return [
    {
      id: row.linked_payment_application_id as number | string,
      title: row.linked_payment_title,
      amount: row.linked_payment_amount,
      currency: row.linked_payment_currency,
      status: row.linked_payment_status,
    },
  ];
}

export function getPaymentPlanLinkLabel(
  row: ContractPaymentPlanRecord,
  payment?: ContractPaymentLinkRecord,
) {
  const linkedPayment = payment || getPaymentPlanLinks(row)[0];
  if (linkedPayment?.title) return linkedPayment.title;
  if (row.phase_name) return `${row.phase_name}付款申请`;
  if (row.phase_no) return `第 ${row.phase_no} 期付款申请`;
  return "关联付款标题缺失";
}

export function getPaymentPlanLinkMeta(
  row: ContractPaymentPlanRecord,
  payment?: ContractPaymentLinkRecord,
) {
  const linkedPayment = payment || getPaymentPlanLinks(row)[0];
  const amount = formatPlanMoney(
    linkedPayment?.amount ?? row.actual_paid_amount ?? row.planned_amount,
    linkedPayment?.currency || row.currency,
  );
  const linkedStatus = String(linkedPayment?.status || "");
  const status = linkedStatus
    ? STATUS_LABELS[linkedStatus] || text(linkedStatus)
    : PAYMENT_PLAN_STATUS_LABELS[String(row.status || "")] || text(row.status);
  return status === "-" ? amount : `${amount} · ${status}`;
}

function humanizeExpenseRemark(value: unknown) {
  const raw = text(value);
  if (raw === "-") return [];

  return raw
    .split(/[；;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const normalized = item
        .replace(
          /\s*[（(]发票台账无记录，?\s*invoice_id\s*留空[）)]/gi,
          "（未匹配发票台账）",
        )
        .replace(
          /命中兜底规则\s*expense_unclear_manual_review/gi,
          "费用归类需人工核对",
        );
      const invoiceMatch = normalized.match(
        /^发票号\s+([0-9A-Za-z-]+)(?:[（(]([^）)]+)[）)])?$/,
      );
      if (invoiceMatch) {
        return {
          kind: "invoice",
          label: "发票号",
          value: invoiceMatch[1],
          meta: invoiceMatch[2] || "",
        };
      }
      const sellerMatch = normalized.match(/^销售方[：:]\s*(.+)$/);
      if (sellerMatch) {
        return {
          kind: "seller",
          label: "销售方",
          value: sellerMatch[1],
          meta: "",
        };
      }
      const fileMatch = normalized.match(/^对应发票\s+(.+)$/);
      if (fileMatch) {
        return {
          kind: "file",
          label: "对应文件",
          value: fileMatch[1],
          meta: "",
        };
      }
      return {
        kind: normalized.includes("人工") ? "review" : "other",
        label: normalized.includes("人工") ? "核对提示" : "备注",
        value: normalized,
        meta: "",
      };
    });
}

function ExpenseRemarkRow({ value }: { value: unknown }) {
  const details = humanizeExpenseRemark(value);
  if (!details.length) return null;

  return (
    <div className={styles.remarkRow} aria-label="备注">
      <div className={styles.remarkContent}>
        {details.map((item, index) => (
          <div
            className={styles.remarkDetailItem}
            data-kind={item.kind}
            key={`${index}-${item.label}-${item.value}`}
          >
            <span className={styles.remarkDetailLabel}>{item.label}</span>
            <span className={styles.remarkDetailValue}>
              {item.value}
              {item.meta ? (
                <span className={styles.remarkDetailMeta}>{item.meta}</span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function expenseItemKey(row: ExpenseItemRecord) {
  return String(row.id || `${row.occurred_date}-${row.description}`);
}

function statusColor(status?: string) {
  if (
    [
      "approved",
      "completed",
      "reviewed",
      "signed",
      "archived",
      "paid_confirmed",
      "done",
    ].includes(status || "")
  ) {
    return "success";
  }
  if (["rejected", "payment_failed"].includes(status || "")) return "error";
  if (["cancelled", "invalid"].includes(status || "")) return "default";
  if (["submitted", "bank_pending", "pending"].includes(status || ""))
    return "processing";
  return "default";
}

function formatRelationField(
  fieldName: string,
  value: unknown,
  related: ApplicationDetailResponse["related"],
): string | undefined {
  if (fieldName === "partner_id") {
    const partner = related.partner;
    if (partner?.name) return String(partner.name);
    return value || partner?.id ? "关联对象标题缺失" : "-";
  }
  if (fieldName === "contract_id") {
    const contract = related.contract;
    if (contract?.contract_name) return String(contract.contract_name);
    return value || contract?.id ? "关联对象标题缺失" : "-";
  }
  return undefined;
}

function ModuleHeading({
  id,
  title,
  meta,
}: {
  id: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className={styles.moduleHeading}>
      <h2 id={id} className={styles.sectionTitle}>
        {title}
      </h2>
      {meta ? <div className={styles.moduleMeta}>{meta}</div> : null}
    </div>
  );
}

function formatExecutiveMetric(metric: ExecutiveMetric) {
  if (metric.format === "money") {
    return formatPlanMoney(metric.value, metric.currency);
  }
  if (metric.format === "number") {
    return new Intl.NumberFormat("zh-CN").format(Number(metric.value) || 0);
  }
  return text(metric.value);
}

function ExecutiveSummary({
  metrics,
  risks,
  label,
}: {
  metrics: ExecutiveMetric[];
  risks: ExecutiveRisk[];
  label: string;
}) {
  return (
    <section
      id="document-360-executiveSummary"
      className={`${styles.module} ${styles.executiveModule}`}
      aria-labelledby="document-360-executiveSummary-heading"
    >
      <ModuleHeading
        id="document-360-executiveSummary-heading"
        title={label}
        meta={risks.length ? `${risks.length} 项需关注` : "当前无明显异常"}
      />
      <div className={styles.executiveMetrics}>
        {metrics.map((metric) => (
          <div
            className={styles.executiveMetric}
            data-tone={metric.tone || "neutral"}
            key={metric.key}
          >
            <span>{metric.label}</span>
            <strong>{formatExecutiveMetric(metric)}</strong>
            {metric.description ? <small>{metric.description}</small> : null}
          </div>
        ))}
      </div>
      {risks.length ? (
        <div className={styles.executiveRisks} aria-label="经营风险提示">
          {risks.map((risk) => (
            <div
              className={styles.executiveRisk}
              data-level={risk.level}
              key={risk.key}
            >
              {risk.level === "warning" || risk.level === "error" ? (
                <ExclamationCircleOutlined />
              ) : (
                <InfoCircleOutlined />
              )}
              <div>
                <strong>{risk.title}</strong>
                <span>{risk.description}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

type ManagedRelationType =
  | "payment_invoice"
  | "originates_from_quote"
  | "covered_by_nda"
  | "serves_customer";

const MANAGED_RELATION_LABELS: Record<ManagedRelationType, string> = {
  payment_invoice: "付款核销发票",
  originates_from_quote: "来源报价",
  covered_by_nda: "前置保密协议",
  serves_customer: "服务客户",
};

function optionLabel(option: Document360Option) {
  const amount =
    option.amount !== undefined
      ? formatPlanMoney(option.amount, option.currency)
      : "";
  const available =
    option.availableAmount !== undefined
      ? `可用 ${formatPlanMoney(option.availableAmount, option.currency)}`
      : "";
  return [option.label, option.secondary, amount, available]
    .filter(Boolean)
    .join(" · ");
}

function Document360ManagementPanel({
  detail,
  onChanged,
}: {
  detail: ApplicationDetailResponse;
  onChanged?: () => Promise<void> | void;
}) {
  const capabilities = detail.management?.capabilities || [];
  const canManage = Boolean(
    detail.management?.canManage && capabilities.length,
  );
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [options, setOptions] = useState<
    Partial<Record<ManagedRelationType, Document360Option[]>>
  >({});
  const [selectedRelations, setSelectedRelations] = useState<
    Partial<Record<ManagedRelationType, number>>
  >({});
  const [lifecycleStatus, setLifecycleStatus] = useState(
    String(detail.biz.lifecycle_status || "pending_signature"),
  );
  const [invoiceDirection, setInvoiceDirection] = useState(
    String(detail.biz.invoice_direction || "incoming"),
  );
  const [invoicePurpose, setInvoicePurpose] = useState(
    String(detail.biz.invoice_purpose || "other"),
  );
  const [allocationInvoiceId, setAllocationInvoiceId] = useState<number>();
  const [allocationAmount, setAllocationAmount] = useState<number>();

  const reload = async () => {
    await onChanged?.();
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    setLifecycleStatus(
      String(detail.biz.lifecycle_status || "pending_signature"),
    );
    setInvoiceDirection(String(detail.biz.invoice_direction || "incoming"));
    setInvoicePurpose(String(detail.biz.invoice_purpose || "other"));
    setSelectedRelations(
      Object.fromEntries(
        (detail.businessContext?.relatedDocuments || [])
          .filter((item) =>
            [
              "originates_from_quote",
              "covered_by_nda",
              "serves_customer",
            ].includes(item.relationType),
          )
          .map((item) => [item.relationType, item.bizId]),
      ),
    );
    const relationTypes: ManagedRelationType[] = [
      ...(capabilities.includes("payment_invoice_allocation")
        ? (["payment_invoice"] as ManagedRelationType[])
        : []),
      ...(capabilities.includes("contract_relations")
        ? ([
            "originates_from_quote",
            "covered_by_nda",
            "serves_customer",
          ] as ManagedRelationType[])
        : []),
    ];
    if (!relationTypes.length) return;
    let active = true;
    setLoading(true);
    void Promise.all(
      relationTypes.map(async (relationType) => [
        relationType,
        await listDocument360Options({ relationType, pageSize: 200 }),
      ]),
    )
      .then((entries) => {
        if (active) {
          setOptions(
            Object.fromEntries(entries) as Partial<
              Record<ManagedRelationType, Document360Option[]>
            >,
          );
        }
      })
      .catch((error: any) =>
        message.error(`加载可关联对象失败：${error?.message || error}`),
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [capabilities, detail, open]);

  if (!canManage) return null;

  const saveLifecycle = async () => {
    setSavingKey("lifecycle");
    try {
      await manageDocument360({
        operation: "update_contract_lifecycle",
        bizId: detail.summary.bizId,
        lifecycleStatus,
      });
      message.success("履约状态已更新");
      await reload();
    } catch (error: any) {
      message.error(`更新失败：${error?.message || error}`);
    } finally {
      setSavingKey("");
    }
  };

  const saveInvoiceClassification = async () => {
    setSavingKey("classification");
    try {
      await manageDocument360({
        operation: "update_invoice_classification",
        bizId: detail.summary.bizId,
        invoiceDirection,
        invoicePurpose,
      });
      message.success("发票分类已更新");
      await reload();
    } catch (error: any) {
      message.error(`更新失败：${error?.message || error}`);
    } finally {
      setSavingKey("");
    }
  };

  const saveContractRelation = async (relationType: ManagedRelationType) => {
    const targetBizId = selectedRelations[relationType];
    const existing = detail.businessContext?.relatedDocuments.find(
      (item) => item.relationType === relationType,
    );
    setSavingKey(relationType);
    try {
      if (targetBizId) {
        const target = (options[relationType] || []).find(
          (item) => item.value === targetBizId,
        );
        await manageDocument360({
          operation: "set_contract_relation",
          bizId: detail.summary.bizId,
          relationType,
          targetBizType: target?.bizType,
          targetBizId,
        });
      } else if (existing?.relationId) {
        await manageDocument360({
          operation: "remove_contract_relation",
          relationId: existing.relationId,
        });
      } else {
        return;
      }
      message.success(`${MANAGED_RELATION_LABELS[relationType]}已更新`);
      await reload();
    } catch (error: any) {
      message.error(`更新失败：${error?.message || error}`);
    } finally {
      setSavingKey("");
    }
  };

  const allocateInvoice = async () => {
    if (!allocationInvoiceId || !allocationAmount) {
      message.warning("请选择发票并填写核销金额");
      return;
    }
    setSavingKey("payment_invoice");
    try {
      await manageDocument360({
        operation: "allocate_invoice",
        bizId: detail.summary.bizId,
        invoiceId: allocationInvoiceId,
        amountUsed: allocationAmount,
      });
      message.success("发票核销关系已保存");
      await reload();
    } catch (error: any) {
      message.error(`关联失败：${error?.message || error}`);
    } finally {
      setSavingKey("");
    }
  };

  const removeAllocation = async (linkId: number) => {
    setSavingKey(`link:${linkId}`);
    try {
      await manageDocument360({
        operation: "remove_invoice_allocation",
        linkId,
      });
      message.success("已解除发票核销");
      await reload();
    } catch (error: any) {
      message.error(`解除失败：${error?.message || error}`);
    } finally {
      setSavingKey("");
    }
  };

  const selectedInvoice = (options.payment_invoice || []).find(
    (item) => item.value === allocationInvoiceId,
  );

  return (
    <>
      <div className={styles.managementLauncher}>
        <div>
          <SettingOutlined />
          <span>
            <strong>单据关系管理</strong>
            <small>维护履约、发票核销和上下游业务关系</small>
          </span>
        </div>
        <Button onClick={() => setOpen(true)}>管理</Button>
      </div>
      <Drawer
        title="单据关系与经营状态"
        width="min(620px, 100vw)"
        open={open}
        onClose={() => setOpen(false)}
      >
        <Spin spinning={loading}>
          <div className={styles.managementSections}>
            {capabilities.includes("contract_lifecycle") ? (
              <section className={styles.managementSection}>
                <h3>合同履约状态</h3>
                <p>审批状态与合同实际履约状态分开维护。</p>
                <div className={styles.managementRow}>
                  <Select
                    value={lifecycleStatus}
                    onChange={setLifecycleStatus}
                    options={[
                      { value: "pending_signature", label: "待签署" },
                      { value: "signed", label: "已签署" },
                      { value: "in_progress", label: "进行中" },
                      { value: "completed", label: "已完成" },
                    ]}
                  />
                  <Button
                    type="primary"
                    loading={savingKey === "lifecycle"}
                    onClick={saveLifecycle}
                  >
                    保存
                  </Button>
                </div>
              </section>
            ) : null}

            {capabilities.includes("invoice_classification") ? (
              <section className={styles.managementSection}>
                <h3>发票业务分类</h3>
                <p>区分进项、销项及发票实际用途，用于统一台账。</p>
                <div className={styles.managementStack}>
                  <Select
                    value={invoiceDirection}
                    onChange={setInvoiceDirection}
                    options={[
                      { value: "incoming", label: "对方开给我们" },
                      { value: "outgoing", label: "我们开给对方" },
                    ]}
                  />
                  <Select
                    value={invoicePurpose}
                    onChange={setInvoicePurpose}
                    options={[
                      { value: "reimbursement", label: "员工报销" },
                      { value: "procurement", label: "采购/供应商" },
                      { value: "contract_payment", label: "合同付款核销" },
                      { value: "customer_billing", label: "客户开票" },
                      { value: "other", label: "其他" },
                    ]}
                  />
                  <Button
                    type="primary"
                    loading={savingKey === "classification"}
                    onClick={saveInvoiceClassification}
                  >
                    保存分类
                  </Button>
                </div>
              </section>
            ) : null}

            {capabilities.includes("contract_relations")
              ? (
                  [
                    "originates_from_quote",
                    "covered_by_nda",
                    "serves_customer",
                  ] as ManagedRelationType[]
                ).map((relationType) => (
                  <section
                    className={styles.managementSection}
                    key={relationType}
                  >
                    <h3>{MANAGED_RELATION_LABELS[relationType]}</h3>
                    <div className={styles.managementRow}>
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        placeholder={`选择${MANAGED_RELATION_LABELS[relationType]}`}
                        value={selectedRelations[relationType]}
                        onChange={(value) =>
                          setSelectedRelations((current) => ({
                            ...current,
                            [relationType]: value,
                          }))
                        }
                        options={(options[relationType] || []).map(
                          (option) => ({
                            value: option.value,
                            label: optionLabel(option),
                          }),
                        )}
                      />
                      <Button
                        type="primary"
                        loading={savingKey === relationType}
                        onClick={() => saveContractRelation(relationType)}
                      >
                        保存
                      </Button>
                    </div>
                  </section>
                ))
              : null}

            {capabilities.includes("payment_invoice_allocation") ? (
              <section className={styles.managementSection}>
                <h3>付款发票核销</h3>
                <p>一张发票可以分摊给多笔付款，但累计核销不能超过票面金额。</p>
                <div className={styles.managementStack}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="选择待核销发票"
                    value={allocationInvoiceId}
                    onChange={(value) => {
                      setAllocationInvoiceId(value);
                      const option = (options.payment_invoice || []).find(
                        (item) => item.value === value,
                      );
                      const paymentGap = Math.max(
                        Number(detail.biz.amount || 0) -
                          detail.invoiceLinks.reduce(
                            (sum, link) =>
                              sum + (Number(link.amount_used) || 0),
                            0,
                          ),
                        0,
                      );
                      setAllocationAmount(
                        Math.min(
                          Number(option?.availableAmount || 0),
                          paymentGap,
                        ),
                      );
                    }}
                    options={(options.payment_invoice || []).map((option) => ({
                      value: option.value,
                      label: optionLabel(option),
                    }))}
                  />
                  <InputNumber
                    min={0.01}
                    precision={2}
                    style={{ width: "100%" }}
                    addonAfter={selectedInvoice?.currency || "CNY"}
                    value={allocationAmount}
                    onChange={(value) =>
                      setAllocationAmount(
                        value === null ? undefined : Number(value),
                      )
                    }
                    placeholder="本次核销金额"
                  />
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    loading={savingKey === "payment_invoice"}
                    onClick={allocateInvoice}
                  >
                    关联并核销
                  </Button>
                </div>
                {detail.invoiceLinks.length ? (
                  <div className={styles.managementAllocations}>
                    {detail.invoiceLinks.map((link) => (
                      <div key={String(link.id)}>
                        <span>
                          <strong>
                            {link.invoice?.invoice_title ||
                              link.invoice?.invoice_no ||
                              link.invoice?.seller_name ||
                              "发票信息缺失"}
                          </strong>
                          <small>
                            已核销{" "}
                            {formatPlanMoney(
                              link.amount_used,
                              detail.biz.currency,
                            )}
                          </small>
                        </span>
                        <Popconfirm
                          title="解除这条发票核销关系？"
                          okText="解除"
                          cancelText="取消"
                          onConfirm={() => removeAllocation(Number(link.id))}
                        >
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            loading={savingKey === `link:${link.id}`}
                          />
                        </Popconfirm>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        </Spin>
      </Drawer>
    </>
  );
}

const RELATED_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  expense: "报销",
  invoice: "发票",
  invoice_application: "销项开票申请",
  contract: "合同",
  payment: "付款",
  salary_payment: "工资付款",
  travel: "差旅",
  quote: "报价",
  legal_agreement: "法务协议",
  crm_customer: "CRM 客户",
};

function isApplicationBizType(
  value: RelatedDocumentRecord["bizType"],
): value is CpoApplicationBizType {
  return Object.prototype.hasOwnProperty.call(APPLICATION_DETAIL_CONFIG, value);
}

function RelatedDocumentDrawer({
  selected,
  onClose,
}: {
  selected: RelatedDocumentRecord | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ApplicationDetailResponse>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!selected) {
      setDetail(undefined);
      setLoading(false);
      setError("");
      return () => {
        active = false;
      };
    }

    setDetail(undefined);
    if (!isApplicationBizType(selected.bizType)) {
      setLoading(false);
      setError("");
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setError("");
    void getApplicationDetail(selected.bizType, selected.bizId)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof Error
            ? reason.message
            : String(reason || "加载失败"),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selected]);

  const config =
    selected && isApplicationBizType(selected.bizType)
      ? APPLICATION_DETAIL_CONFIG[selected.bizType]
      : null;
  const drawerFields =
    detail && config
      ? config.sections
          .flatMap((section) => section.fields)
          .filter((field) => field.name !== config.amountField)
          .slice(0, 7)
      : [];

  return (
    <Drawer
      className={styles.relatedDocumentDrawer}
      title={
        selected
          ? `${RELATED_DOCUMENT_TYPE_LABELS[selected.bizType]}详情`
          : "关联单据"
      }
      width="min(540px, 100vw)"
      open={Boolean(selected)}
      onClose={onClose}
      extra={
        selected &&
        (selected.externalPath || isApplicationBizType(selected.bizType)) ? (
          <Link
            className={styles.paymentDrawerFullLink}
            to={
              selected.externalPath ||
              `/application-detail/${selected.bizType}/${selected.bizId}`
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            完整单据
            <ExportOutlined />
          </Link>
        ) : null
      }
    >
      <Spin spinning={loading}>
        {error ? (
          <Alert
            type="warning"
            showIcon
            message="关联单据加载失败"
            description={error}
          />
        ) : null}
        {!loading && !error && detail && config ? (
          <div className={styles.relatedDocumentDrawerContent}>
            <div className={styles.relatedDocumentDrawerHeading}>
              <span>{config.label}</span>
              <h3>{detail.summary.title}</h3>
              <div>
                <Tag color={statusColor(detail.summary.status)}>
                  {STATUS_LABELS[detail.summary.status || ""] ||
                    text(detail.summary.status)}
                </Tag>
                {detail.summary.amount !== undefined ? (
                  <strong>
                    {formatPlanMoney(
                      detail.summary.amount,
                      detail.biz[config.currencyField || "currency"],
                    )}
                  </strong>
                ) : null}
              </div>
            </div>
            <Descriptions
              className={styles.paymentDrawerDescriptions}
              column={1}
              size="small"
              colon={false}
              items={drawerFields.map((field) => ({
                key: field.name,
                label: field.label,
                children:
                  formatRelationField(
                    field.name,
                    detail.biz[field.name],
                    detail.related,
                  ) ??
                  formatDetailValue(detail.biz[field.name], field, detail.biz),
              }))}
            />
            <div className={styles.relatedDocumentDrawerCounts}>
              <span>
                <strong>{detail.invoiceLinks.length}</strong> 条发票关联
              </span>
              <span>
                <strong>{detail.attachments.length}</strong> 个附件
              </span>
              <span>
                <strong>{detail.actions.length}</strong> 条动态
              </span>
            </div>
            <Link
              className={styles.paymentDrawerOpenPage}
              to={`/application-detail/${selected.bizType}/${selected.bizId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExportOutlined />
              在新窗口打开完整单据
            </Link>
          </div>
        ) : null}
        {!loading &&
        !error &&
        selected &&
        !isApplicationBizType(selected.bizType) ? (
          <div className={styles.relatedDocumentDrawerContent}>
            <div className={styles.relatedDocumentDrawerHeading}>
              <span>{RELATED_DOCUMENT_TYPE_LABELS[selected.bizType]}</span>
              <h3>{selected.title}</h3>
              <div>
                {selected.status ? <Tag>{selected.status}</Tag> : null}
                {selected.amount ? (
                  <strong>
                    {formatPlanMoney(selected.amount, selected.currency)}
                  </strong>
                ) : null}
              </div>
            </div>
            <Descriptions
              className={styles.paymentDrawerDescriptions}
              column={1}
              size="small"
              colon={false}
              items={Object.entries(selected.details || {})
                .filter(([, value]) => value !== undefined && value !== "")
                .map(([label, value]) => ({
                  key: label,
                  label,
                  children: text(value),
                }))}
            />
            {selected.externalPath ? (
              <Link
                className={styles.paymentDrawerOpenPage}
                to={selected.externalPath}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExportOutlined />
                在新窗口打开业务页面
              </Link>
            ) : null}
          </div>
        ) : null}
      </Spin>
    </Drawer>
  );
}

function RelatedDocuments({
  rows,
  label,
}: {
  rows: RelatedDocumentRecord[];
  label: string;
}) {
  const [selected, setSelected] = useState<RelatedDocumentRecord | null>(null);
  const groupedRows = rows.reduce(
    (groups, row) => {
      (groups[row.bizType] ||= []).push(row);
      return groups;
    },
    {} as Partial<Record<string, RelatedDocumentRecord[]>>,
  );

  return (
    <>
      <section
        id="document-360-relatedDocuments"
        className={styles.module}
        aria-labelledby="document-360-relatedDocuments-heading"
      >
        <ModuleHeading
          id="document-360-relatedDocuments-heading"
          title={label}
          meta={rows.length ? `共 ${rows.length} 项` : undefined}
        />
        {rows.length ? (
          <div className={styles.relatedDocumentGroups}>
            {Object.entries(groupedRows).map(([bizType, documents]) => (
              <div className={styles.relatedDocumentGroup} key={bizType}>
                <div className={styles.relatedDocumentGroupTitle}>
                  {RELATED_DOCUMENT_TYPE_LABELS[bizType] || bizType}
                  <span>{documents?.length || 0}</span>
                </div>
                <div className={styles.relatedDocumentList}>
                  {(documents || []).map((document) => (
                    <button
                      className={styles.relatedDocumentItem}
                      type="button"
                      key={document.key}
                      onClick={() => setSelected(document)}
                    >
                      <FileTextOutlined />
                      <span className={styles.relatedDocumentMain}>
                        <strong>{document.title}</strong>
                        <small>
                          {document.subtitle ||
                            RELATED_DOCUMENT_TYPE_LABELS[document.bizType]}
                        </small>
                      </span>
                      <span className={styles.relatedDocumentMeta}>
                        {document.amount ? (
                          <strong>
                            {formatPlanMoney(
                              document.amount,
                              document.currency,
                            )}
                          </strong>
                        ) : null}
                        <small>
                          {STATUS_LABELS[document.status || ""] ||
                            text(document.status)}
                        </small>
                      </span>
                      <RightOutlined />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无关联单据"
          />
        )}
      </section>
      <RelatedDocumentDrawer
        selected={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

function Document360Overview({
  detail,
  config,
  currentTask,
}: {
  detail: ApplicationDetailResponse;
  config: ApplicationDetailConfig;
  currentTask?: ApplicationDetailResponse["currentTask"];
}) {
  const primaryField = config.sections
    .flatMap((section) => section.fields)
    .find((field) => field.name === config.amountField);
  const amountValue =
    detail.biz[config.amountField] ?? detail.summary.amount ?? undefined;
  const amountText = primaryField
    ? formatDetailValue(amountValue, primaryField, detail.biz)
    : text(amountValue);
  const taskLabel = currentTask
    ? TASK_TYPE_LABELS[currentTask.task_type || ""] ||
      text(currentTask.workflow_step_name || currentTask.title)
    : "暂无待处理任务";
  const handler = currentTask
    ? text(currentTask.assignee_name_snapshot) || "处理人姓名缺失"
    : "-";

  return (
    <section
      id="document-360-overview"
      className={styles.overviewHero}
      aria-labelledby="document-360-overview-heading"
    >
      <div className={styles.overviewAmount}>
        <h2
          id="document-360-overview-heading"
          className={styles.overviewTypeTitle}
        >
          {config.label}
        </h2>
        <div className={styles.overviewAmountLabel}>
          {primaryField?.label || "单据金额"}
        </div>
        <div className={styles.overviewAmountValue}>{amountText}</div>
        <Tag
          className={styles.overviewStatus}
          color={statusColor(detail.summary.status)}
        >
          {STATUS_LABELS[detail.summary.status || ""] ||
            text(detail.summary.status)}
        </Tag>
      </div>

      <div className={styles.overviewFacts}>
        <div className={styles.overviewFact}>
          <UserOutlined />
          <span>申请人</span>
          <strong>{text(detail.summary.applicantName)}</strong>
        </div>
        <div className={styles.overviewFact}>
          <ScheduleOutlined />
          <span>当前任务</span>
          <strong>{taskLabel}</strong>
        </div>
        <div className={styles.overviewFact}>
          <ApartmentOutlined />
          <span>当前处理人</span>
          <strong>{handler}</strong>
        </div>
        <div className={styles.overviewFact}>
          <ClockCircleOutlined />
          <span>最近更新</span>
          <strong>{formatDateValue(detail.summary.updatedAt, true)}</strong>
        </div>
      </div>

      <div className={styles.overviewCounters} aria-label="关联资料摘要">
        <span>
          <strong>{detail.invoiceLinks.length}</strong> 条发票关联
        </span>
        <span>
          <strong>{detail.attachments.length}</strong> 个附件
        </span>
        <span>
          <strong>{detail.actions.length}</strong> 条业务动态
        </span>
      </div>
    </section>
  );
}

function DocumentInformation({
  detail,
  config,
  label,
}: {
  detail: ApplicationDetailResponse;
  config: ApplicationDetailConfig;
  label: string;
}) {
  return (
    <section
      id="document-360-document"
      className={styles.module}
      aria-labelledby="document-360-document-heading"
    >
      <ModuleHeading id="document-360-document-heading" title={label} />
      {config.sections.map((section, index) => (
        <div className={styles.fieldGroup} key={section.title}>
          <h3 className={index === 0 ? styles.srOnly : styles.subsectionTitle}>
            {section.title}
          </h3>
          <Descriptions
            column={DETAIL_DESCRIPTION_COLUMNS}
            size="small"
            bordered={false}
          >
            {section.fields.map((field) => {
              const isPrimaryAmount = field.name === config.amountField;
              const relationValue = formatRelationField(
                field.name,
                detail.biz[field.name],
                detail.related,
              );
              const formattedValue =
                relationValue ??
                formatDetailValue(detail.biz[field.name], field, detail.biz);
              return (
                <Descriptions.Item
                  key={field.name}
                  label={field.label}
                  span={field.span === 2 ? 2 : 1}
                >
                  {field.format === "markdown" ? (
                    <MarkdownContent
                      value={detail.biz[field.name]}
                      className={styles.markdownDetail}
                    />
                  ) : (
                    <span
                      className={`${styles.longText} ${
                        isPrimaryAmount ? styles.inlinePrimaryAmount : ""
                      }`}
                    >
                      {formattedValue}
                    </span>
                  )}
                </Descriptions.Item>
              );
            })}
          </Descriptions>
        </div>
      ))}
    </section>
  );
}

function AttachmentOpenButton({
  filePath,
  label = "查看",
  showIcon = true,
  className,
}: {
  filePath: string;
  label?: React.ReactNode;
  showIcon?: boolean;
  className?: string;
}) {
  const [opening, setOpening] = useState(false);

  const handleOpen = async () => {
    const previewWindow = window.open("about:blank", "_blank");
    if (previewWindow) previewWindow.opener = null;
    setOpening(true);

    try {
      const url = /^https?:\/\//i.test(filePath)
        ? filePath
        : await queryRuntimeFileUrl(filePath);
      if (previewWindow) {
        previewWindow.location.replace(url);
      } else {
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (!opened)
          message.warning("浏览器已阻止打开附件，请允许弹出窗口后重试");
      }
    } catch (error: any) {
      previewWindow?.close();
      message.error(`打开附件失败：${error?.message || error}`);
    } finally {
      setOpening(false);
    }
  };

  return (
    <Button
      className={className}
      type="link"
      size="small"
      icon={showIcon ? <LinkOutlined /> : undefined}
      loading={opening}
      onClick={handleOpen}
    >
      {label}
    </Button>
  );
}

function RelatedDetails({
  detail,
  label,
}: {
  detail: ApplicationDetailResponse;
  label: string;
}) {
  const { partner, contract, paymentPlan, bankReceipt } = detail.related;
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const portfolio = detail.businessContext?.counterpartyPortfolio;
  if (!partner && !contract && !paymentPlan && !bankReceipt) return null;

  return (
    <section
      id="document-360-relations"
      className={`${styles.module} ${styles.asideModule}`}
      aria-labelledby="document-360-relations-heading"
    >
      <ModuleHeading
        id="document-360-relations-heading"
        title={label}
        meta="围绕当前单据"
      />
      <div className={styles.relationList}>
        {partner ? (
          <button
            type="button"
            className={`${styles.relationItem} ${portfolio ? styles.relationLink : ""}`}
            disabled={!portfolio}
            onClick={() => setPortfolioOpen(true)}
          >
            <ApartmentOutlined className={styles.relationIcon} />
            <div>
              <span>合作方</span>
              <strong>{text(partner.name)}</strong>
              <small>
                {labelText(partner.partner_type_label || partner.partner_type)}
              </small>
              {portfolio ? (
                <small className={styles.relationHint}>
                  {portfolio.summary.contractCount} 份合同 ·{" "}
                  {portfolio.summary.paymentCount} 笔付款 · 查看企业业务全景
                </small>
              ) : null}
            </div>
            {portfolio ? <RightOutlined /> : null}
          </button>
        ) : null}
        {contract ? (
          <Link
            className={`${styles.relationItem} ${styles.relationLink}`}
            to={`/application-detail/contract/${contract.id}`}
          >
            <FileTextOutlined className={styles.relationIcon} />
            <div>
              <span>关联合同</span>
              <strong>{text(contract.contract_name)}</strong>
              <small>
                {formatPlanMoney(contract.amount, contract.currency)}
                {" · "}
                {STATUS_LABELS[String(contract.status || "")] ||
                  text(contract.status)}
              </small>
              <small>
                {CONTRACT_LIFECYCLE_LABELS[
                  String(contract.lifecycle_status || "")
                ] || text(contract.lifecycle_status)}
                {contract.start_date || contract.end_date
                  ? ` · ${formatDateValue(contract.start_date)} 至 ${formatDateValue(contract.end_date)}`
                  : ""}
              </small>
            </div>
          </Link>
        ) : null}
        {paymentPlan ? (
          <div className={styles.relationItem}>
            <ScheduleOutlined className={styles.relationIcon} />
            <div>
              <span>付款期次</span>
              <strong>
                {paymentPlan.phase_name ||
                  (paymentPlan.phase_no
                    ? `第 ${paymentPlan.phase_no} 期`
                    : "付款期次名称缺失")}
              </strong>
              <small>
                {formatPlanMoney(
                  paymentPlan.planned_amount,
                  paymentPlan.currency,
                )}
                {" · "}
                {PAYMENT_PLAN_STATUS_LABELS[paymentPlan.status || ""] ||
                  text(paymentPlan.status)}
              </small>
            </div>
          </div>
        ) : null}
        {bankReceipt ? (
          <div className={styles.relationItem}>
            <BankOutlined className={styles.relationIcon} />
            <div>
              <span>银行回单</span>
              {bankReceipt.file_path ? (
                <AttachmentOpenButton
                  filePath={String(bankReceipt.file_path)}
                  label={
                    <strong className={styles.attachmentName}>
                      {text(bankReceipt.file_name)}
                    </strong>
                  }
                />
              ) : (
                <strong>{text(bankReceipt.file_name)}</strong>
              )}
            </div>
          </div>
        ) : null}
      </div>
      <CounterpartyPortfolioDrawer
        portfolio={portfolio}
        open={portfolioOpen}
        onClose={() => setPortfolioOpen(false)}
      />
    </section>
  );
}

const PORTFOLIO_GROUP_LABELS = {
  contracts: "合同",
  quotes: "报价",
  payments: "付款",
  invoices: "发票",
} as const;

function openPortfolioDocument(item: CounterpartyPortfolioItem) {
  if (!item.externalPath) return;
  window.open(item.externalPath, "_blank", "noopener,noreferrer");
}

function CounterpartyPortfolioRows({
  rows,
}: {
  rows: CounterpartyPortfolioItem[];
}) {
  if (!rows.length) {
    return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无记录" />
    );
  }
  return (
    <div className={styles.portfolioRows}>
      {rows.map((item) => (
        <button
          type="button"
          className={styles.portfolioRow}
          key={item.key}
          onClick={() => openPortfolioDocument(item)}
        >
          <FileTextOutlined />
          <span className={styles.portfolioRowMain}>
            <strong>{item.title}</strong>
            <small>{item.subtitle || formatDateValue(item.date)}</small>
            {item.matchBasis === "exact_customer_name" ? (
              <em>按客户名称精确匹配</em>
            ) : item.matchBasis === "explicit_business_relation" ? (
              <em>来自合同业务关系</em>
            ) : null}
          </span>
          <span className={styles.portfolioRowMeta}>
            {item.amount ? (
              <strong>{formatPlanMoney(item.amount, item.currency)}</strong>
            ) : null}
            <small>
              {CONTRACT_LIFECYCLE_LABELS[item.status || ""] ||
                STATUS_LABELS[item.status || ""] ||
                text(item.status)}
            </small>
          </span>
          <ExportOutlined />
        </button>
      ))}
    </div>
  );
}

function CounterpartyPortfolioDrawer({
  portfolio,
  open,
  onClose,
}: {
  portfolio?: CounterpartyPortfolio;
  open: boolean;
  onClose: () => void;
}) {
  if (!portfolio) return null;
  const { partner, summary, groups } = portfolio;
  return (
    <Drawer
      title="交易对手 360"
      width="min(720px, 100vw)"
      open={open}
      onClose={onClose}
    >
      <div className={styles.portfolioContent}>
        <header className={styles.portfolioHeader}>
          <div>
            <span>
              {[labelText(partner.type), partner.source]
                .filter((value) => value && value !== "-")
                .join(" · ") || "商业伙伴"}
            </span>
            <h3>{partner.name}</h3>
            <p>
              {[
                labelText(partner.type),
                partner.contactName,
                partner.contactPhone,
              ]
                .filter((value) => value && value !== "-")
                .join(" · ") || "暂无联系人信息"}
            </p>
          </div>
          {partner.status ? <Tag>{labelText(partner.status)}</Tag> : null}
        </header>

        <section
          className={styles.portfolioSummary}
          aria-label="交易对手业务汇总"
        >
          <div>
            <span>合同</span>
            <strong>{summary.contractCount}</strong>
            <small>{formatPlanMoney(summary.contractAmount, "CNY")}</small>
          </div>
          <div>
            <span>累计付款</span>
            <strong>{formatPlanMoney(summary.paymentAmount, "CNY")}</strong>
            <small>{summary.paymentCount} 笔</small>
          </div>
          <div>
            <span>发票</span>
            <strong>{formatPlanMoney(summary.invoiceAmount, "CNY")}</strong>
            <small>{summary.invoiceCount} 张</small>
          </div>
          <div data-warning={summary.invoiceUnallocatedAmount > 0}>
            <span>未分摊票额</span>
            <strong>
              {formatPlanMoney(summary.invoiceUnallocatedAmount, "CNY")}
            </strong>
            <small>{summary.quoteCount} 份历史报价</small>
          </div>
        </section>

        <ProjectTabs
          className={styles.portfolioTabs}
          items={(
            Object.keys(PORTFOLIO_GROUP_LABELS) as Array<
              keyof typeof PORTFOLIO_GROUP_LABELS
            >
          ).map((key) => ({
            key,
            label: `${PORTFOLIO_GROUP_LABELS[key]} ${groups[key].length}`,
            children: <CounterpartyPortfolioRows rows={groups[key]} />,
          }))}
        />
        {portfolio.matchNote ? (
          <p className={styles.portfolioMatchNote}>
            <InfoCircleOutlined />
            {portfolio.matchNote}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}

function ContractPaymentPlans({
  rows,
  label,
  currentPaymentPlanId,
}: {
  rows: ContractPaymentPlanRecord[];
  label: string;
  currentPaymentPlanId?: number;
}) {
  const [selectedPayment, setSelectedPayment] = useState<{
    plan: ContractPaymentPlanRecord;
    payment: ContractPaymentLinkRecord;
  } | null>(null);
  const [paymentDetail, setPaymentDetail] =
    useState<ApplicationDetailResponse>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const selectedPlan = selectedPayment?.plan || null;
  const selectedPaymentId = Number(selectedPayment?.payment.id || 0);

  useEffect(() => {
    let active = true;
    if (!selectedPaymentId) {
      setPaymentDetail(undefined);
      setDetailError("");
      setDetailLoading(false);
      return () => {
        active = false;
      };
    }

    setPaymentDetail(undefined);
    setDetailError("");
    setDetailLoading(true);
    void getApplicationDetail("payment", selectedPaymentId)
      .then((result) => {
        if (active) setPaymentDetail(result);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setDetailError(
          error instanceof Error ? error.message : String(error || "加载失败"),
        );
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedPaymentId]);

  const closeDrawer = () => setSelectedPayment(null);
  const paymentBiz = paymentDetail?.biz || {};
  const partner = paymentDetail?.related.partner || {};
  const contract = paymentDetail?.related.contract || {};
  const paymentPlan = paymentDetail?.related.paymentPlan || selectedPlan || {};
  const paymentPhase = [
    paymentBiz.payment_phase_no
      ? `第 ${paymentBiz.payment_phase_no} 期`
      : paymentPlan.phase_no
        ? `第 ${paymentPlan.phase_no} 期`
        : "",
    paymentBiz.payment_phase_name || paymentPlan.phase_name,
  ]
    .filter(Boolean)
    .join(" · ");
  const paymentStatus = String(
    paymentDetail?.summary.status || paymentBiz.status || "",
  );

  return (
    <>
      <section
        id="document-360-paymentPlans"
        className={styles.module}
        aria-labelledby="document-360-paymentPlans-heading"
      >
        <ModuleHeading
          id="document-360-paymentPlans-heading"
          title={label}
          meta={rows.length ? `共 ${rows.length} 个期次` : undefined}
        />
        {rows.length ? (
          <Table<ContractPaymentPlanRecord>
            size="small"
            pagination={false}
            rowKey={(row) => String(row.id)}
            rowClassName={(row) =>
              Number(row.id) === Number(currentPaymentPlanId)
                ? styles.currentPaymentPlanRow
                : ""
            }
            dataSource={rows}
            scroll={{ x: 980 }}
            columns={[
              {
                title: "期次",
                key: "phase",
                width: 150,
                render: (_, row) => (
                  <Space size={6} wrap>
                    <span>
                      {[
                        row.phase_no ? `第 ${row.phase_no} 期` : "",
                        row.phase_name,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "-"}
                    </span>
                    {Number(row.id) === Number(currentPaymentPlanId) ? (
                      <Tag color="processing">当前</Tag>
                    ) : null}
                  </Space>
                ),
              },
              {
                title: "计划金额",
                key: "planned_amount",
                width: 140,
                render: (_, row) =>
                  formatPlanMoney(row.planned_amount, row.currency),
              },
              {
                title: "计划付款日",
                dataIndex: "planned_pay_date",
                width: 130,
                render: (value) => formatDateValue(value),
              },
              {
                title: "状态",
                dataIndex: "status",
                width: 110,
                render: (value) => (
                  <Tag color={PAYMENT_PLAN_STATUS_COLORS[String(value)]}>
                    {PAYMENT_PLAN_STATUS_LABELS[String(value)] || text(value)}
                  </Tag>
                ),
              },
              {
                title: "触发条件",
                dataIndex: "trigger_condition",
                render: (value) => text(value),
              },
              {
                title: "关联付款",
                key: "linked_payments",
                width: 240,
                render: (_, row) => {
                  const linkedPayments = getPaymentPlanLinks(row);
                  return linkedPayments.length ? (
                    <div className={styles.paymentLinkList}>
                      {linkedPayments.map((payment) => (
                        <button
                          key={String(payment.id)}
                          className={styles.paymentLink}
                          type="button"
                          onClick={() =>
                            setSelectedPayment({ plan: row, payment })
                          }
                          aria-label={`查看${getPaymentPlanLinkLabel(row, payment)}详情`}
                        >
                          <span className={styles.paymentLinkText}>
                            {getPaymentPlanLinkLabel(row, payment)}
                          </span>
                          <span className={styles.paymentLinkMeta}>
                            {getPaymentPlanLinkMeta(row, payment)}
                          </span>
                          <RightOutlined className={styles.paymentLinkArrow} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    "-"
                  );
                },
              },
            ]}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="当前合同未设置付款计划"
          />
        )}
      </section>

      <Drawer
        className={styles.paymentDrawer}
        title="付款申请详情"
        width="min(520px, 100vw)"
        open={Boolean(selectedPayment)}
        onClose={closeDrawer}
        extra={
          selectedPaymentId ? (
            <Link
              className={styles.paymentDrawerFullLink}
              to={`/application-detail/payment/${selectedPaymentId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              完整单据
              <ExportOutlined />
            </Link>
          ) : null
        }
      >
        <Spin spinning={detailLoading}>
          {detailError ? (
            <Alert
              type="warning"
              showIcon
              message="付款详情加载失败"
              description={detailError}
            />
          ) : null}

          {!detailLoading && !detailError && paymentDetail ? (
            <div className={styles.paymentDrawerContent}>
              <div className={styles.paymentDrawerSummary}>
                <div className={styles.paymentDrawerTitleRow}>
                  <h3>{paymentDetail.summary.title || "付款申请"}</h3>
                  <Tag
                    color={
                      ["approved", "completed"].includes(paymentStatus)
                        ? "success"
                        : paymentStatus === "rejected"
                          ? "error"
                          : "processing"
                    }
                  >
                    {STATUS_LABELS[paymentStatus] || text(paymentStatus)}
                  </Tag>
                </div>
                <span>申请金额</span>
                <strong>
                  {formatPlanMoney(
                    paymentDetail.summary.amount ?? paymentBiz.amount,
                    paymentBiz.currency,
                  )}
                </strong>
              </div>

              <Descriptions
                className={styles.paymentDrawerDescriptions}
                column={1}
                size="small"
                colon={false}
                items={[
                  {
                    key: "partner",
                    label: "付款对象",
                    children: firstDisplayValue(
                      partner.partner_name,
                      partner.name,
                      partner.company_name,
                      paymentBiz.partner_name_snapshot,
                      paymentBiz.payee_name,
                    ),
                  },
                  {
                    key: "account",
                    label: "对公账户",
                    children: text(paymentBiz.bank_account_snapshot),
                  },
                  {
                    key: "phase",
                    label: "付款期次",
                    children: paymentPhase || "-",
                  },
                  {
                    key: "contract",
                    label: "关联合同",
                    children: firstDisplayValue(
                      contract.contract_name,
                      contract.title,
                      paymentBiz.contract_name_snapshot,
                      paymentBiz.contract_id,
                    ),
                  },
                  {
                    key: "applicant",
                    label: "申请人",
                    children: firstDisplayValue(
                      paymentDetail.summary.applicantName,
                      paymentBiz.applicant_name_snapshot,
                    ),
                  },
                  {
                    key: "submitted",
                    label: "申请时间",
                    children: formatDateValue(
                      paymentBiz.submitted_at || paymentBiz.created_at,
                      true,
                    ),
                  },
                  {
                    key: "paid",
                    label: "实际付款日",
                    children: formatDateValue(
                      paymentBiz.bank_confirmed_at ||
                        paymentPlan.actual_paid_at,
                      true,
                    ),
                  },
                  {
                    key: "invoice",
                    label: "发票状态",
                    children: paymentDetail.invoiceLinks.length
                      ? `已关联 ${paymentDetail.invoiceLinks.length} 张发票`
                      : "暂未关联发票",
                  },
                ]}
              />

              <div className={styles.paymentDrawerAttachments}>
                <div className={styles.paymentDrawerSectionHeading}>
                  <span>附件</span>
                  <span>{paymentDetail.attachments.length} 个文件</span>
                </div>
                {paymentDetail.attachments.length ? (
                  paymentDetail.attachments.map((attachment) => (
                    <div
                      className={styles.paymentDrawerAttachment}
                      key={String(
                        attachment.id ||
                          attachment.file_path ||
                          attachment.file_name,
                      )}
                    >
                      <FileOutlined />
                      {attachment.file_path ? (
                        <AttachmentOpenButton
                          className={styles.paymentDrawerAttachmentButton}
                          filePath={String(attachment.file_path)}
                          showIcon={false}
                          label={text(attachment.file_name)}
                        />
                      ) : (
                        <span>{text(attachment.file_name)}</span>
                      )}
                    </div>
                  ))
                ) : (
                  <span className={styles.muted}>暂无附件</span>
                )}
              </div>

              <Link
                className={styles.paymentDrawerOpenPage}
                to={`/application-detail/payment/${selectedPaymentId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExportOutlined />
                在新窗口打开完整单据
              </Link>
            </div>
          ) : null}
        </Spin>
      </Drawer>
    </>
  );
}

function ExpenseItems({ rows }: { rows: ExpenseItemRecord[] }) {
  const columns: ColumnsType<ExpenseItemRecord> = [
    {
      title: "发生日期",
      dataIndex: "occurred_date",
      width: 110,
      render: (value) => formatDateValue(value),
    },
    {
      title: "费用类别",
      dataIndex: "category",
      width: 100,
      render: (value) =>
        EXPENSE_CATEGORY_LABELS[String(value || "")] || text(value),
    },
    {
      title: "说明",
      dataIndex: "description",
      width: 220,
      render: (value) => <span className={styles.longText}>{text(value)}</span>,
    },
    {
      title: "原币金额",
      key: "originalAmount",
      align: "right",
      width: 140,
      render: (_, row) =>
        formatDetailValue(
          row.original_amount,
          {
            name: "original_amount",
            label: "原币金额",
            format: "money",
            currencyField: "original_currency",
          },
          row,
        ),
    },
    {
      title: "人民币金额",
      dataIndex: "cny_amount",
      align: "right",
      width: 130,
      render: (value) =>
        formatDetailValue(value, {
          name: "cny_amount",
          label: "人民币金额",
          format: "money",
        }),
    },
    {
      title: "可报销金额",
      dataIndex: "reimbursable_cny_amount",
      align: "right",
      width: 140,
      render: (value) =>
        formatDetailValue(value, {
          name: "reimbursable_cny_amount",
          label: "可报销金额",
          format: "money",
        }),
    },
    {
      title: "合规状态",
      dataIndex: "compliance_status",
      width: 110,
      render: (value) => (
        <Tag
          color={
            value === "non_compliant"
              ? "error"
              : value === "compliant"
                ? "success"
                : "default"
          }
        >
          {COMPLIANCE_LABELS[String(value || "")] || text(value)}
        </Tag>
      ),
    },
  ];

  const rowsWithRemarks = rows
    .filter((row) => humanizeExpenseRemark(row.remark).length > 0)
    .map(expenseItemKey);

  return (
    <section
      id="document-360-expenseItems"
      className={styles.module}
      aria-labelledby="document-360-expenseItems-heading"
    >
      <ModuleHeading
        id="document-360-expenseItems-heading"
        title="报销明细"
        meta={rows.length ? `共 ${rows.length} 项` : undefined}
      />
      {rows.length ? (
        <div className={styles.tableWrap}>
          <Table
            className={styles.expenseTable}
            rowKey={expenseItemKey}
            columns={columns}
            dataSource={rows}
            pagination={false}
            size="small"
            expandable={{
              expandedRowKeys: rowsWithRemarks,
              expandedRowRender: (row) => (
                <ExpenseRemarkRow value={row.remark} />
              ),
              rowExpandable: (row) =>
                humanizeExpenseRemark(row.remark).length > 0,
              showExpandColumn: false,
            }}
            scroll={{ x: 950 }}
          />
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无报销明细"
        />
      )}
    </section>
  );
}

const SALARY_PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_card: "银行卡",
  bank_transfer: "银行转账",
  other: "其他",
};

function SalaryPaymentItems({ rows }: { rows: SalaryPaymentItemRecord[] }) {
  const columns: ColumnsType<SalaryPaymentItemRecord> = [
    {
      title: "付款公司",
      dataIndex: "internal_legal_entity_name_snapshot",
      width: 220,
      render: (value) => <span className={styles.longText}>{text(value)}</span>,
    },
    {
      title: "支付项目",
      dataIndex: "payment_project",
      width: 220,
      render: (value) => <span className={styles.longText}>{text(value)}</span>,
    },
    {
      title: "付款金额",
      dataIndex: "amount",
      align: "right",
      width: 150,
      render: (value, row) =>
        formatDetailValue(
          value,
          {
            name: "amount",
            label: "付款金额",
            format: "money",
            currencyField: "currency",
          },
          row,
        ),
    },
    {
      title: "付款方式",
      dataIndex: "payment_method",
      width: 110,
      render: (value) =>
        SALARY_PAYMENT_METHOD_LABELS[String(value || "")] || text(value),
    },
    {
      title: "发薪人数",
      dataIndex: "employee_count",
      align: "right",
      width: 100,
      render: (value) => text(value),
    },
    {
      title: "备注",
      dataIndex: "remark",
      width: 180,
      render: (value) => <span className={styles.longText}>{text(value)}</span>,
    },
  ];

  return (
    <section
      id="document-360-salaryItems"
      className={styles.module}
      aria-labelledby="document-360-salaryItems-heading"
    >
      <ModuleHeading
        id="document-360-salaryItems-heading"
        title="付款明细"
        meta={rows.length ? `共 ${rows.length} 个付款主体` : undefined}
      />
      {rows.length ? (
        <div className={styles.tableWrap}>
          <Table
            rowKey={(row) => String(row.id)}
            columns={columns}
            dataSource={rows}
            pagination={false}
            size="small"
            summary={(currentRows) => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}>
                  <strong>合计（{currentRows.length} 个付款主体）</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <strong>
                    {formatDetailValue(
                      currentRows.reduce(
                        (sum, row) => sum + Number(row.amount || 0),
                        0,
                      ),
                      {
                        name: "amount",
                        label: "付款总额",
                        format: "money",
                        currencyField: "currency",
                      },
                      { currency: "CNY" },
                    )}
                  </strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} />
                <Table.Summary.Cell index={4} align="right">
                  {currentRows.reduce(
                    (sum, row) => sum + Number(row.employee_count || 0),
                    0,
                  )}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} />
              </Table.Summary.Row>
            )}
            scroll={{ x: 980 }}
          />
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无工资付款明细"
        />
      )}
    </section>
  );
}

function InvoiceLinks({
  rows,
  label,
  bizType,
}: {
  rows: InvoiceLinkRecord[];
  label: string;
  bizType: CpoApplicationBizType;
}) {
  const columns: ColumnsType<InvoiceLinkRecord> = [
    {
      title: "发票号码",
      width: 230,
      render: (_, row) => row.invoice?.invoice_no || "发票号码缺失",
    },
    {
      title: "销售方",
      width: 240,
      render: (_, row) => text(row.invoice?.seller_name),
    },
    {
      title: "发票附件",
      width: 300,
      render: (_, row) => {
        const attachment = row.attachment;
        if (!attachment?.file_path) return "-";
        return (
          <AttachmentOpenButton
            filePath={String(attachment.file_path)}
            label={
              <span className={styles.invoiceAttachmentName}>
                {text(attachment.file_name)}
              </span>
            }
          />
        );
      },
    },
    {
      title: "关联类型",
      dataIndex: "relation_type",
      width: 130,
      render: (value) =>
        RELATION_TYPE_LABELS[String(value || "")] || text(value),
    },
    {
      title: "使用金额",
      dataIndex: "amount_used",
      width: 140,
      align: "right",
      render: (value) =>
        formatDetailValue(value, {
          name: "amount_used",
          label: "使用金额",
          format: "money",
        }),
    },
    {
      title: "关联时间",
      dataIndex: "created_at",
      width: 160,
      render: (value) => formatDateValue(value, true),
    },
  ];
  const allocatedAmount = rows.reduce(
    (sum, row) => sum + Number(row.amount_used || 0),
    0,
  );
  return (
    <section
      id="document-360-invoiceLinks"
      className={styles.module}
      aria-labelledby="document-360-invoiceLinks-heading"
    >
      <ModuleHeading
        id="document-360-invoiceLinks-heading"
        title={label}
        meta={
          rows.length
            ? `${rows.length} 张 · 已分摊 ${formatPlanMoney(
                allocatedAmount,
                "CNY",
              )}`
            : undefined
        }
      />
      {rows.length ? (
        <div className={styles.tableWrap}>
          <Table
            rowKey={(row) =>
              String(row.id || `${row.invoice_id}-${row.relation_type}`)
            }
            columns={columns}
            dataSource={rows}
            pagination={false}
            size="small"
            scroll={{ x: 1150 }}
          />
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            bizType === "payment"
              ? "暂未关联发票，付款完成后仍可继续补票"
              : "暂未关联发票"
          }
        />
      )}
    </section>
  );
}

function Attachments({
  rows,
  label,
}: {
  rows: AttachmentRecord[];
  label: string;
}) {
  return (
    <section
      id="document-360-attachments"
      className={styles.module}
      aria-labelledby="document-360-attachments-heading"
    >
      <ModuleHeading
        id="document-360-attachments-heading"
        title={
          <Space size={8}>
            <PaperClipOutlined />
            {label}
          </Space>
        }
        meta={rows.length ? `${rows.length} 个文件` : undefined}
      />
      {rows.length ? (
        <div className={styles.attachmentList}>
          {rows.map((item) => {
            const fileName = text(item.file_name);
            return (
              <article
                className={styles.attachmentItem}
                key={String(item.id || item.file_path || item.file_name)}
              >
                <FileOutlined className={styles.attachmentFileIcon} />
                <div className={styles.attachmentContent}>
                  {item.file_path ? (
                    <AttachmentOpenButton
                      className={styles.attachmentOpenButton}
                      filePath={String(item.file_path)}
                      showIcon={false}
                      label={
                        <span
                          className={styles.attachmentFileName}
                          title={fileName}
                        >
                          {fileName}
                        </span>
                      }
                    />
                  ) : (
                    <span
                      className={styles.attachmentFileName}
                      title={fileName}
                    >
                      {fileName}
                    </span>
                  )}
                  <div className={styles.attachmentMeta}>
                    <Tag bordered={false}>
                      {ATTACHMENT_TYPE_LABELS[
                        String(item.attachment_type || "")
                      ] || text(item.attachment_type)}
                    </Tag>
                    <span>{text(item.uploaded_by)}</span>
                    <time>{formatDateValue(item.created_at, true)}</time>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无附件" />
      )}
    </section>
  );
}

const WORKFLOW_PLAN_STATE_LABELS: Record<WorkflowPlanStep["state"], string> = {
  upcoming: "待流转",
  current: "当前节点",
  completed: "已通过",
  notified: "已抄送",
  rejected: "已驳回",
  cancelled: "已取消",
};

const HISTORY_ACTION_STATE_LABELS: Record<string, string> = {
  submit: "已提交",
  withdraw: "已撤回",
  cancel: "已作废",
  review_pass: "已通过",
  review_reject: "已驳回",
  cc_notify: "已抄送",
  confirm_legacy_paid: "已支付",
  print_summary_requested: "待确认",
  print_full_requested: "待确认",
  print_confirmed: "已确认",
  print_confirmation_revoked: "已撤销",
};

function historyActionColor(action?: string) {
  if (action === "withdraw") return "orange";
  if (action === "review_reject") return "error";
  if (action === "print_confirmation_revoked") return "error";
  if (
    ["print_summary_requested", "print_full_requested"].includes(action || "")
  ) {
    return "orange";
  }
  if (["review_pass", "confirm_legacy_paid"].includes(action || "")) {
    return "success";
  }
  if (action === "print_confirmed") return "success";
  if (action === "cc_notify") return "blue";
  return action === "submit" ? "success" : "default";
}

function historyActionIcon(action?: string) {
  if (action === "withdraw") {
    return <RollbackOutlined className={styles.withdrawActionIcon} />;
  }
  if (action === "cancel") {
    return <StopOutlined className={styles.cancelActionIcon} />;
  }
  if (action === "review_reject") {
    return <CloseCircleOutlined className={styles.rejectActionIcon} />;
  }
  return undefined;
}

function workflowStepStatus(state: WorkflowPlanStep["state"]) {
  if (state === "current") return "process" as const;
  if (state === "completed" || state === "notified") return "finish" as const;
  if (state === "rejected") return "error" as const;
  return "wait" as const;
}

function workflowStepStateLabel(step: WorkflowPlanStep) {
  if (step.state === "completed" && step.taskType !== "review") {
    return "已完成";
  }
  return WORKFLOW_PLAN_STATE_LABELS[step.state];
}

function WorkflowPlan({
  rows,
  actions,
  applicantName,
  applicationStatus,
}: {
  rows: WorkflowPlanStep[];
  actions: WorkflowAction[];
  applicantName?: string;
  applicationStatus?: string;
}) {
  const { historicalActions, currentSubmitAction } =
    splitWorkflowJourneyActions(actions, applicationStatus);
  const showRejectedNotice =
    applicationStatus === "rejected" &&
    !rows.some((step) => step.state === "rejected");
  const showCompletedNotice = isWorkflowJourneyCompleted(
    rows,
    applicationStatus,
  );
  if (
    !rows.length &&
    !currentSubmitAction &&
    !historicalActions.length &&
    !showCompletedNotice
  ) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="暂未配置审批流程"
      />
    );
  }

  return (
    <Steps
      className={styles.workflowPlan}
      direction="vertical"
      size="small"
      items={[
        ...historicalActions.map((action) => ({
          status: "finish" as const,
          icon: historyActionIcon(action.action),
          title: (
            <Space size={[8, 4]} wrap>
              <strong>
                {ACTION_LABELS[action.action || ""] || text(action.action)}
              </strong>
              <Tag color={historyActionColor(action.action)}>
                {HISTORY_ACTION_STATE_LABELS[action.action || ""] || "已记录"}
              </Tag>
            </Space>
          ),
          description: (
            <div className={styles.workflowStepDescription}>
              <Space size={[12, 4]} wrap>
                <span>
                  操作人：
                  {text(action.actor_name_snapshot || action.actor_user_id)}
                </span>
                <span>时间：{formatDateValue(action.created_at, true)}</span>
                {action.from_status || action.to_status ? (
                  <span>
                    {STATUS_LABELS[action.from_status || ""] ||
                      text(action.from_status)}
                    {" 到 "}
                    {STATUS_LABELS[action.to_status || ""] ||
                      text(action.to_status)}
                  </span>
                ) : null}
              </Space>
              {action.comment ? (
                <div className={styles.workflowConclusion}>
                  <span>{text(action.comment)}</span>
                </div>
              ) : null}
            </div>
          ),
        })),
        ...(currentSubmitAction
          ? [
              {
                status: "finish" as const,
                title: (
                  <Space size={[8, 4]} wrap>
                    <strong>提交申请</strong>
                    <Tag color="success">已提交</Tag>
                  </Space>
                ),
                description: (
                  <div className={styles.workflowStepDescription}>
                    <Space size={[12, 4]} wrap>
                      <span>
                        申请人：
                        {text(
                          currentSubmitAction.actor_name_snapshot ||
                            applicantName ||
                            currentSubmitAction.actor_user_id,
                        )}
                      </span>
                      <span>
                        提交：
                        {formatDateValue(currentSubmitAction.created_at, true)}
                      </span>
                    </Space>
                    {currentSubmitAction.comment ? (
                      <div className={styles.workflowConclusion}>
                        <span>{text(currentSubmitAction.comment)}</span>
                      </div>
                    ) : null}
                  </div>
                ),
              },
            ]
          : []),
        ...rows.map((step) => ({
          status: workflowStepStatus(step.state),
          title: (
            <Space size={[8, 4]} wrap>
              <strong>{step.stepName}</strong>
              <Tag
                color={
                  step.state === "current"
                    ? "processing"
                    : step.state === "completed"
                      ? "success"
                      : step.state === "notified"
                        ? "blue"
                        : step.state === "rejected"
                          ? "error"
                          : undefined
                }
              >
                {workflowStepStateLabel(step)}
              </Tag>
              {Number(step.attempts) > 1 ? (
                <span>第 {step.attempts} 次</span>
              ) : null}
            </Space>
          ),
          description: (
            <div className={styles.workflowStepDescription}>
              <Space size={[12, 4]} wrap>
                <span>
                  {step.nodeType === "cc"
                    ? "抄送人"
                    : step.taskType === "review"
                      ? "审批人"
                      : "处理人"}
                  ：{text(step.assigneeName || step.assigneeUserId)}
                </span>
                {step.completedAt ? (
                  <span>完成：{formatDateValue(step.completedAt, true)}</span>
                ) : step.startedAt ? (
                  <span>到达：{formatDateValue(step.startedAt, true)}</span>
                ) : null}
              </Space>
              {step.conclusion ? (
                <div className={styles.workflowConclusion}>
                  <strong>
                    {ACTION_LABELS[step.conclusion.action || ""] ||
                      text(step.conclusion.action)}
                  </strong>
                  {step.nodeType !== "cc" ? (
                    <span>
                      {text(
                        step.conclusion.actorName ||
                          step.conclusion.actorUserId,
                      )}
                    </span>
                  ) : null}
                  {step.conclusion.comment ? (
                    <span>{text(step.conclusion.comment)}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ),
        })),
        ...(showRejectedNotice
          ? [
              {
                status: "error" as const,
                icon: (
                  <CloseCircleOutlined className={styles.rejectActionIcon} />
                ),
                title: (
                  <Space size={[8, 4]} wrap>
                    <strong>流程已驳回</strong>
                    <Tag color="error">已终止</Tag>
                  </Space>
                ),
                description: "后续审批节点不再流转",
              },
            ]
          : []),
        ...(showCompletedNotice
          ? [
              {
                status: "finish" as const,
                title: (
                  <Space size={[8, 4]} wrap>
                    <strong>流程已完成</strong>
                    <Tag color="success">已完成</Tag>
                  </Space>
                ),
                description: "所有流程节点均已处理完成",
              },
            ]
          : []),
      ]}
    />
  );
}

function WorkflowModule({
  detail,
  label,
}: {
  detail: ApplicationDetailResponse;
  label: string;
}) {
  const isHistoricalCompletion = isHistoricalPaidCompletion(
    detail.actions,
    detail.summary.status,
  );
  const workflowPlanRows = getVisibleWorkflowPlanRows(
    detail.workflowPlan,
    detail.actions,
    detail.summary.status,
  );
  const workflowCompleted = isWorkflowJourneyCompleted(
    workflowPlanRows,
    detail.summary.status,
  );
  const terminalStatusMeta =
    detail.summary.status === "rejected"
      ? "流程已驳回"
      : ["cancelled", "invalid"].includes(detail.summary.status || "")
        ? "流程已作废"
        : undefined;

  return (
    <section
      id="document-360-workflow"
      className={`${styles.module} ${styles.workflowModule}`}
      aria-labelledby="document-360-workflow-heading"
    >
      <ModuleHeading
        id="document-360-workflow-heading"
        title={label}
        meta={
          isHistoricalCompletion
            ? "历史付款已确认"
            : workflowCompleted
              ? "流程已完成"
              : terminalStatusMeta ||
                (workflowPlanRows.length
                  ? `${workflowPlanRows.length} 个流程节点`
                  : undefined)
        }
      />
      <WorkflowPlan
        rows={workflowPlanRows}
        actions={detail.actions}
        applicantName={detail.summary.applicantName}
        applicationStatus={detail.summary.status}
      />
    </section>
  );
}

function WorkflowActionBar({
  detail,
  bizType,
  onChanged,
}: {
  detail: ApplicationDetailResponse;
  bizType: CpoApplicationBizType;
  onChanged?: () => Promise<void> | void;
}) {
  const [selectedAction, setSelectedAction] =
    useState<WorkflowAvailableAction | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dock = dockRef.current;
    const root = dock?.closest(`.${styles.root}`) as HTMLElement | null;
    if (!dock || !root) return;

    const syncDockBounds = () => {
      const rect = root.getBoundingClientRect();
      const gutter = window.innerWidth <= 768 ? 8 : 12;
      const left = Math.max(rect.left, gutter);
      const right = Math.min(rect.right, window.innerWidth - gutter);
      dock.style.setProperty("--action-dock-left", `${left}px`);
      dock.style.setProperty(
        "--action-dock-width",
        `${Math.max(right - left, 0)}px`,
      );
    };

    syncDockBounds();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(syncDockBounds);
    observer?.observe(root);
    window.addEventListener("resize", syncDockBounds);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncDockBounds);
    };
  }, [detail.canAct, detail.availableActions.length]);

  if (!detail.canAct || !detail.availableActions.length) {
    return null;
  }

  const submitAction = async () => {
    if (!selectedAction) return;
    if (selectedAction.commentRequired && !comment.trim()) {
      message.warning("请填写操作原因");
      return;
    }
    setSubmitting(true);
    try {
      await advanceApplicationWorkflow({
        bizType,
        bizId: detail.summary.bizId,
        ...(detail.currentTask?.id ? { taskId: detail.currentTask.id } : {}),
        action: selectedAction.action,
        comment: comment.trim(),
      });
      message.success(`已${selectedAction.label}`);
      setSelectedAction(null);
      setComment("");
      await onChanged?.();
    } catch (error: any) {
      message.error(`流程操作失败：${error?.message || error}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className={styles.workflowActionDock} ref={dockRef}>
        <footer className={styles.workflowActionBar} aria-label="流程操作">
          <div className={styles.workflowActionInfo}>
            <div className={styles.workflowActionTitle}>流程操作</div>
            <div className={styles.muted}>
              当前节点：
              {text(
                detail.currentTask?.workflow_step_name ||
                  detail.currentTask?.title ||
                  detail.currentTask?.task_type ||
                  "待处理",
              )}
            </div>
          </div>
          <Space className={styles.workflowActionButtons} size={8} wrap>
            {detail.availableActions.map((action) => (
              <Button
                key={action.action}
                type={
                  action.adminOverride
                    ? "primary"
                    : action.danger
                      ? "default"
                      : "primary"
                }
                danger={action.adminOverride ? false : action.danger}
                className={
                  action.adminOverride
                    ? styles.adminOverrideActionButton
                    : undefined
                }
                onClick={() => setSelectedAction(action)}
              >
                {action.label}
                {action.adminOverride ? (
                  <Tooltip
                    title={
                      action.adminOverrideReason ||
                      "当前不是你的操作节点，但因应用管理员权限可见并可操作。"
                    }
                  >
                    <QuestionCircleOutlined
                      className={styles.adminOverrideHintIcon}
                      aria-label="管理员代操作说明"
                      onClick={(event) => event.stopPropagation()}
                    />
                  </Tooltip>
                ) : null}
              </Button>
            ))}
          </Space>
        </footer>
      </div>
      <Modal
        title={selectedAction ? selectedAction.label : "操作确认"}
        open={Boolean(selectedAction)}
        okText="确认"
        cancelText="取消"
        confirmLoading={submitting}
        onOk={submitAction}
        onCancel={() => {
          if (submitting) return;
          setSelectedAction(null);
          setComment("");
        }}
      >
        {selectedAction?.adminOverride ? (
          <Alert
            className={styles.adminOverrideAlert}
            type="warning"
            showIcon
            message="管理员代操作"
            description={
              selectedAction.adminOverrideReason ||
              "当前不是你的操作节点，但因应用管理员权限可见并可操作。"
            }
          />
        ) : null}
        <Input.TextArea
          rows={4}
          value={comment}
          placeholder={
            selectedAction?.commentRequired
              ? "请填写操作原因（必填）"
              : "填写操作备注（可选）"
          }
          onChange={(event) => setComment(event.target.value)}
        />
      </Modal>
    </>
  );
}

type ApplicationDetailViewProps = {
  detail: ApplicationDetailResponse;
  bizType: CpoApplicationBizType;
  onWorkflowChanged?: () => Promise<void> | void;
};

export default function ApplicationDetailView({
  detail,
  bizType,
  onWorkflowChanged,
}: ApplicationDetailViewProps) {
  const config = APPLICATION_DETAIL_CONFIG[bizType];
  // 平台原生审批流：主单 CREATE 被平台拦截发起审批后带 process_instance_id
  const platformPiid = text(detail.biz.process_instance_id);
  const currentTask = useMemo(
    () => selectCurrentTask(detail.tasks),
    [detail.tasks],
  );
  const businessContext = detail.businessContext || {
    metrics: [],
    risks: [],
    relatedDocuments: [],
  };
  const modulePresence: Record<Document360ModuleKey, boolean> = {
    executiveSummary: Boolean(
      businessContext.metrics.length || businessContext.risks.length,
    ),
    document: true,
    relations: Boolean(
      detail.related.partner ||
      detail.related.contract ||
      detail.related.paymentPlan ||
      detail.related.bankReceipt,
    ),
    relatedDocuments: Boolean(businessContext.relatedDocuments.length),
    paymentPlans: Boolean(detail.contractPaymentPlans?.length),
    expenseItems: Boolean(detail.expenseItems.length),
    salaryItems: Boolean(detail.salaryItems?.length),
    invoiceLinks: Boolean(detail.invoiceLinks.length),
    attachments: Boolean(detail.attachments.length),
    // 平台流记录改由 PlatformFlowPanel 渲染平台时间线，隐藏 legacy 静态旅程配置
    workflow:
      Boolean(detail.workflowPlan.length || detail.actions.length) &&
      !platformPiid,
  };
  const visibleModules = config.modules.filter(
    (module) => module.showWhenEmpty || modulePresence[module.key],
  );
  const hasActionDock = Boolean(
    detail.canAct && detail.availableActions.length,
  );
  const modulesByArea = {
    main: visibleModules.filter((module) => module.area === "main"),
    aside: visibleModules.filter((module) => module.area === "aside"),
    full: visibleModules.filter((module) => module.area === "full"),
  };
  const moduleRenderers: Record<
    Document360ModuleKey,
    (module: Document360ModuleDefinition) => React.ReactNode
  > = {
    executiveSummary: (module) => (
      <ExecutiveSummary
        metrics={businessContext.metrics}
        risks={businessContext.risks}
        label={module.label}
      />
    ),
    document: (module) => (
      <DocumentInformation
        detail={detail}
        config={config}
        label={module.label}
      />
    ),
    relations: (module) => (
      <RelatedDetails detail={detail} label={module.label} />
    ),
    relatedDocuments: (module) => (
      <RelatedDocuments
        rows={businessContext.relatedDocuments}
        label={module.label}
      />
    ),
    paymentPlans: (module) => (
      <ContractPaymentPlans
        rows={detail.contractPaymentPlans || []}
        label={module.label}
        currentPaymentPlanId={
          bizType === "payment"
            ? Number(detail.biz.payment_plan_id || 0)
            : undefined
        }
      />
    ),
    expenseItems: () => <ExpenseItems rows={detail.expenseItems} />,
    salaryItems: () => <SalaryPaymentItems rows={detail.salaryItems || []} />,
    invoiceLinks: (module) => (
      <InvoiceLinks
        rows={detail.invoiceLinks}
        label={module.label}
        bizType={bizType}
      />
    ),
    attachments: (module) => (
      <Attachments rows={detail.attachments} label={module.label} />
    ),
    workflow: (module) => (
      <WorkflowModule detail={detail} label={module.label} />
    ),
  };

  const renderModule = (module: Document360ModuleDefinition) => (
    <React.Fragment key={module.key}>
      {moduleRenderers[module.key](module)}
    </React.Fragment>
  );

  return (
    <div
      className={`${styles.root} ${
        hasActionDock ? styles.rootHasActionDock : ""
      }`}
    >
      <Document360Overview
        detail={detail}
        config={config}
        currentTask={currentTask}
      />
      <Document360ManagementPanel
        detail={detail}
        onChanged={onWorkflowChanged}
      />

      <div
        className={`${styles.workspace} ${
          modulesByArea.aside.length ? "" : styles.workspaceSingle
        }`}
      >
        <main className={styles.mainColumn}>
          {modulesByArea.main.map(renderModule)}
        </main>
        <aside className={styles.asideColumn} aria-label="单据上下文">
          {modulesByArea.aside.map(renderModule)}
        </aside>
      </div>

      <div className={styles.fullColumn}>
        {modulesByArea.full.map(renderModule)}
      </div>
      {platformPiid ? (
        <PlatformFlowPanel
          processInstanceId={platformPiid}
          flowStatus={text(detail.biz.flow_status)}
          instanceStatus={text(detail.biz.instance_status)}
          runningNode={text(detail.biz.running_node)}
          onChanged={onWorkflowChanged}
        />
      ) : null}
      <WorkflowActionBar
        detail={detail}
        bizType={bizType}
        onChanged={onWorkflowChanged}
      />
    </div>
  );
}

ApplicationDetailView.displayName = "单据 360";
