import React from "react";
import MarkdownContent from "@/components/markdown-content";
import {
  ACTION_LABELS,
  APPLICATION_DETAIL_CONFIG,
  ATTACHMENT_TYPE_LABELS,
  COMPLIANCE_LABELS,
  EXPENSE_CATEGORY_LABELS,
  STATUS_LABELS,
} from "./config";
import {
  formatDateValue,
  formatDetailValue,
  sortActionsAscending,
} from "./format";
import type {
  ApplicationDetailResponse,
  CpoApplicationBizType,
  DetailField,
  DetailSection,
} from "./types";
import styles from "./ApplicationDetailView.module.css";

type PrintViewProps = {
  detail: ApplicationDetailResponse;
  bizType: CpoApplicationBizType;
  mode: ApplicationDetailPrintMode;
};

export type ApplicationDetailPrintMode = "summary" | "full";

const PAYMENT_PLAN_STATUS_LABELS: Record<string, string> = {
  pending: "待支付",
  processing: "支付处理中",
  paid: "已支付",
  not_required: "无需支付",
  cancelled: "已取消",
};

const SALARY_PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_card: "银行卡",
  bank_transfer: "银行转账",
  other: "其他",
};

const SUMMARY_FIELD_NAMES: Partial<Record<CpoApplicationBizType, string[]>> = {
  expense: [
    "expense_type_label",
    "travel_type",
    "total_cny_amount",
    "reimbursable_cny_amount",
    "payout_currency",
    "bank_status",
    "remark",
  ],
  invoice: [
    "invoice_direction",
    "partner_name_snapshot",
    "contract_id",
    "invoice_no",
    "invoice_date",
    "invoice_type",
    "amount",
    "tax_amount",
    "total_amount",
    "currency",
    "buyer_name",
    "buyer_tax_no",
  ],
  invoice_application: [
    "application_no",
    "customer_name_snapshot",
    "contract_title_snapshot",
    "requested_amount",
    "requested_tax_amount",
    "requested_total_amount",
    "currency",
    "invoice_type",
    "invoice_content",
    "payment_condition_snapshot",
  ],
  contract: [
    "contract_type",
    "direction",
    "partner_id",
    "amount",
    "currency",
    "start_date",
    "end_date",
    "lifecycle_status",
    "liaison_name_snapshot",
    "remark",
  ],
  payment: [
    "payment_type",
    "partner_id",
    "contract_id",
    "amount",
    "currency",
    "expected_pay_date",
    "payment_phase_name",
    "bank_status",
    "liaison_name_snapshot",
    "remark",
  ],
  salary_payment: [
    "payroll_month",
    "employee_count",
    "amount",
    "expected_pay_date",
    "bank_status",
    "remark",
  ],
  travel: [
    "travel_type",
    "trip_region",
    "origin_city",
    "destination_city",
    "start_date",
    "end_date",
    "project_name",
    "partner_id",
    "estimated_amount",
    "currency",
    "travel_reason",
  ],
};

const SUMMARY_APPROVAL_LIMIT = 6;

function printText(value: unknown, missing = "-") {
  if (value === undefined || value === null || String(value).trim() === "") {
    return missing;
  }
  return String(value);
}

function businessNumber(detail: ApplicationDetailResponse) {
  const fields = [
    "application_no",
    "expense_no",
    "payment_no",
    "salary_payment_no",
    "contract_no",
    "invoice_no",
    "travel_no",
    "business_no",
  ];
  const value = fields.map((field) => detail.biz[field]).find(Boolean);
  return printText(value, "业务编号缺失");
}

function relationValue(fieldName: string, detail: ApplicationDetailResponse) {
  if (fieldName === "partner_id") {
    return printText(detail.related.partner?.name, "关联对象标题缺失");
  }
  if (fieldName === "contract_id") {
    return printText(
      detail.related.contract?.contract_name,
      "关联对象标题缺失",
    );
  }
  return undefined;
}

function printableValue(field: DetailField, detail: ApplicationDetailResponse) {
  return (
    relationValue(field.name, detail) ??
    formatDetailValue(detail.biz[field.name], field, detail.biz)
  );
}

function sectionRows(section: DetailSection) {
  const rows: DetailField[][] = [];
  let pending: DetailField[] = [];
  section.fields.forEach((field) => {
    if (field.span === 2) {
      if (pending.length) rows.push(pending);
      rows.push([field]);
      pending = [];
      return;
    }
    pending.push(field);
    if (pending.length === 2) {
      rows.push(pending);
      pending = [];
    }
  });
  if (pending.length) rows.push(pending);
  return rows;
}

function PrintValue({
  field,
  detail,
}: {
  field: DetailField;
  detail: ApplicationDetailResponse;
}) {
  if (field.format === "markdown") {
    return (
      <MarkdownContent
        value={detail.biz[field.name]}
        className={styles.financePrintMarkdown}
      />
    );
  }
  return <>{printableValue(field, detail)}</>;
}

function InformationSection({
  section,
  detail,
  amountField,
}: {
  section: DetailSection;
  detail: ApplicationDetailResponse;
  amountField: string;
}) {
  return (
    <section className={styles.financePrintSection}>
      <h2>{section.title}</h2>
      <table className={styles.financeInfoTable}>
        <tbody>
          {sectionRows(section).map((row, rowIndex) => {
            const fullRow = row.length === 1 && row[0].span === 2;
            return (
              <tr key={`${section.title}-${rowIndex}`}>
                {row.map((field) => (
                  <React.Fragment key={field.name}>
                    <th>{field.label}</th>
                    <td
                      className={
                        field.name === amountField
                          ? styles.financePrimaryAmount
                          : undefined
                      }
                      colSpan={fullRow ? 3 : 1}
                    >
                      <PrintValue field={field} detail={detail} />
                    </td>
                  </React.Fragment>
                ))}
                {!fullRow && row.length === 1 ? (
                  <>
                    <th />
                    <td />
                  </>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function money(value: unknown, currency: unknown = "CNY") {
  return formatDetailValue(
    value,
    {
      name: "amount",
      label: "金额",
      format: "money",
      currencyField: "currency",
    },
    { currency },
  );
}

function ExpensePrintTable({ detail }: { detail: ApplicationDetailResponse }) {
  if (!detail.expenseItems.length) return null;
  return (
    <section className={styles.financePrintSection}>
      <h2>报销明细</h2>
      <table className={styles.financeDataTable}>
        <thead>
          <tr>
            <th>发生日期</th>
            <th>费用类别</th>
            <th>费用说明</th>
            <th>原币金额</th>
            <th>人民币金额</th>
            <th>可报销金额</th>
            <th>合规状态</th>
          </tr>
        </thead>
        <tbody>
          {detail.expenseItems.map((item, index) => (
            <tr key={String(item.id || index)}>
              <td>{formatDateValue(item.occurred_date)}</td>
              <td>
                {EXPENSE_CATEGORY_LABELS[String(item.category || "")] ||
                  printText(item.category)}
              </td>
              <td>{printText(item.description)}</td>
              <td className={styles.financeNumberCell}>
                {money(item.original_amount, item.original_currency)}
              </td>
              <td className={styles.financeNumberCell}>
                {money(item.cny_amount)}
              </td>
              <td className={styles.financeNumberCell}>
                {money(item.reimbursable_cny_amount)}
              </td>
              <td>
                {COMPLIANCE_LABELS[String(item.compliance_status || "")] ||
                  printText(item.compliance_status)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SalaryPrintTable({ detail }: { detail: ApplicationDetailResponse }) {
  if (!detail.salaryItems.length) return null;
  const totalAmount = detail.salaryItems.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );
  const totalEmployees = detail.salaryItems.reduce(
    (sum, item) => sum + Number(item.employee_count || 0),
    0,
  );
  return (
    <section className={styles.financePrintSection}>
      <h2>付款明细</h2>
      <table className={styles.financeDataTable}>
        <thead>
          <tr>
            <th>付款公司</th>
            <th>支付项目</th>
            <th>发薪人数</th>
            <th>付款方式</th>
            <th>付款金额</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {detail.salaryItems.map((item, index) => (
            <tr key={String(item.id || index)}>
              <td>
                {printText(
                  item.internal_legal_entity_name_snapshot,
                  "付款公司名称缺失",
                )}
              </td>
              <td>{printText(item.payment_project)}</td>
              <td className={styles.financeNumberCell}>
                {printText(item.employee_count)}
              </td>
              <td>
                {SALARY_PAYMENT_METHOD_LABELS[
                  String(item.payment_method || "")
                ] || printText(item.payment_method)}
              </td>
              <td className={styles.financeNumberCell}>
                {money(item.amount, item.currency)}
              </td>
              <td>{printText(item.remark)}</td>
            </tr>
          ))}
          <tr className={styles.financeTotalRow}>
            <th colSpan={2}>合计</th>
            <td className={styles.financeNumberCell}>{totalEmployees}</td>
            <td />
            <td className={styles.financeNumberCell}>
              {money(totalAmount, "CNY")}
            </td>
            <td />
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function PaymentPlanPrintTable({
  detail,
}: {
  detail: ApplicationDetailResponse;
}) {
  const rows = detail.contractPaymentPlans || [];
  if (!rows.length) return null;
  return (
    <section className={styles.financePrintSection}>
      <h2>付款计划</h2>
      <table className={styles.financeDataTable}>
        <thead>
          <tr>
            <th>期次</th>
            <th>计划付款日</th>
            <th>计划金额</th>
            <th>触发条件</th>
            <th>付款状态</th>
            <th>实付金额</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, index) => (
            <tr key={String(item.id || index)}>
              <td>
                {printText(
                  item.phase_name ||
                    (item.phase_no ? `第 ${item.phase_no} 期` : undefined),
                )}
              </td>
              <td>{formatDateValue(item.planned_pay_date)}</td>
              <td className={styles.financeNumberCell}>
                {money(item.planned_amount, item.currency)}
              </td>
              <td>{printText(item.trigger_condition)}</td>
              <td>
                {PAYMENT_PLAN_STATUS_LABELS[String(item.status || "")] ||
                  printText(item.status)}
              </td>
              <td className={styles.financeNumberCell}>
                {money(item.actual_paid_amount, item.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function InvoicePrintTable({ detail }: { detail: ApplicationDetailResponse }) {
  if (!detail.invoiceLinks.length) return null;
  return (
    <section className={styles.financePrintSection}>
      <h2>关联发票</h2>
      <table className={styles.financeDataTable}>
        <thead>
          <tr>
            <th>发票号码</th>
            <th>销售方</th>
            <th>价税合计</th>
            <th>本单使用金额</th>
            <th>关联时间</th>
          </tr>
        </thead>
        <tbody>
          {detail.invoiceLinks.map((item, index) => (
            <tr key={String(item.id || index)}>
              <td>{printText(item.invoice?.invoice_no, "发票号码缺失")}</td>
              <td>{printText(item.invoice?.seller_name, "销售方名称缺失")}</td>
              <td className={styles.financeNumberCell}>
                {money(item.invoice?.total_amount)}
              </td>
              <td className={styles.financeNumberCell}>
                {money(item.amount_used)}
              </td>
              <td>{formatDateValue(item.created_at, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ApprovalPrintTable({ detail }: { detail: ApplicationDetailResponse }) {
  const actions = sortActionsAscending(detail.actions);
  return (
    <section className={styles.financePrintSection}>
      <h2>审批记录</h2>
      <table className={styles.financeDataTable}>
        <thead>
          <tr>
            <th>操作</th>
            <th>处理人</th>
            <th>处理结果</th>
            <th>处理时间</th>
            <th>意见</th>
          </tr>
        </thead>
        <tbody>
          {actions.length ? (
            actions.map((action, index) => (
              <tr key={String(action.id || index)}>
                <td>
                  {ACTION_LABELS[action.action || ""] ||
                    printText(action.action)}
                </td>
                <td>
                  {printText(
                    action.actor_name_snapshot ||
                      (action.action === "submit"
                        ? detail.summary.applicantName
                        : undefined),
                    "处理人姓名缺失",
                  )}
                </td>
                <td>
                  {STATUS_LABELS[action.to_status || ""] ||
                    ACTION_LABELS[action.action || ""] ||
                    "已记录"}
                </td>
                <td>{formatDateValue(action.created_at, true)}</td>
                <td>{printText(action.comment)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className={styles.financeEmptyCell}>
                暂无审批记录
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function AttachmentPrintTable({
  detail,
}: {
  detail: ApplicationDetailResponse;
}) {
  if (!detail.attachments.length) return null;
  return (
    <section className={styles.financePrintSection}>
      <h2>附件清单</h2>
      <table className={styles.financeDataTable}>
        <thead>
          <tr>
            <th>附件类型</th>
            <th>文件名称</th>
            <th>上传人</th>
            <th>上传时间</th>
          </tr>
        </thead>
        <tbody>
          {detail.attachments.map((item, index) => (
            <tr key={String(item.id || item.file_name || index)}>
              <td>
                {ATTACHMENT_TYPE_LABELS[String(item.attachment_type || "")] ||
                  printText(item.attachment_type)}
              </td>
              <td>{printText(item.file_name, "附件名称缺失")}</td>
              <td>{printText(item.uploaded_by)}</td>
              <td>{formatDateValue(item.created_at, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function summaryFields(bizType: CpoApplicationBizType) {
  const config = APPLICATION_DETAIL_CONFIG[bizType];
  const fields = config.sections.flatMap((section) => section.fields);
  const fieldsByName = new Map(fields.map((field) => [field.name, field]));
  return (SUMMARY_FIELD_NAMES[bizType] || [])
    .map((fieldName) => fieldsByName.get(fieldName))
    .filter((field): field is DetailField => Boolean(field));
}

function compactText(value: unknown, maxLength = 48) {
  const text = printText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function compactList(values: unknown[], unit: "张" | "份", limit = 4) {
  const normalized = values
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!normalized.length) return "-";
  const visible = normalized.slice(0, limit);
  const remaining = normalized.length - visible.length;
  return `${visible.join("、")}${remaining > 0 ? `；另 ${remaining} ${unit}详见电子档案` : ""}`;
}

function SummaryPrintValue({
  field,
  detail,
}: {
  field: DetailField;
  detail: ApplicationDetailResponse;
}) {
  return <>{compactText(printableValue(field, detail), 88)}</>;
}

function SummaryInformationTable({
  detail,
  bizType,
}: {
  detail: ApplicationDetailResponse;
  bizType: CpoApplicationBizType;
}) {
  const fields = summaryFields(bizType);
  const rows: DetailField[][] = [];
  fields.forEach((field) => {
    const previousRow = rows[rows.length - 1];
    if (
      field.span === 2 ||
      !previousRow ||
      previousRow.length === 2 ||
      previousRow[0].span === 2
    ) {
      rows.push([field]);
    } else {
      previousRow.push(field);
    }
  });

  return (
    <section className={styles.financeSummarySection}>
      <h2>核心业务信息</h2>
      <table className={styles.financeSummaryInfoTable}>
        <tbody>
          {rows.map((row, rowIndex) => {
            const fullRow = row.length === 1 && row[0].span === 2;
            return (
              <tr key={`summary-field-${rowIndex}`}>
                {row.map((field) => (
                  <React.Fragment key={field.name}>
                    <th>{field.label}</th>
                    <td colSpan={fullRow ? 3 : 1}>
                      <SummaryPrintValue field={field} detail={detail} />
                    </td>
                  </React.Fragment>
                ))}
                {!fullRow && row.length === 1 ? (
                  <>
                    <th />
                    <td />
                  </>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function SummaryMetrics({ detail }: { detail: ApplicationDetailResponse }) {
  const detailCount =
    detail.expenseItems.length +
    detail.salaryItems.length +
    (detail.contractPaymentPlans || []).length;
  const metrics = [
    { label: "业务明细", value: `${detailCount} 条` },
    { label: "关联发票", value: `${detail.invoiceLinks.length} 张` },
    { label: "归档附件", value: `${detail.attachments.length} 份` },
    { label: "审批记录", value: `${detail.actions.length} 条` },
  ];
  return (
    <dl className={styles.financeSummaryMetrics} aria-label="单据资料汇总">
      {metrics.map((metric) => (
        <div key={metric.label}>
          <dt>{metric.label}</dt>
          <dd>{metric.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SummaryArchiveIndex({
  detail,
}: {
  detail: ApplicationDetailResponse;
}) {
  const invoiceLabels = detail.invoiceLinks.map((item) => {
    const invoiceNumber = String(item.invoice?.invoice_no || "").trim();
    const sellerName = String(item.invoice?.seller_name || "").trim();
    if (invoiceNumber && sellerName) return `${invoiceNumber} · ${sellerName}`;
    return invoiceNumber || sellerName || "发票号码及销售方缺失";
  });
  const attachmentLabels = detail.attachments.map(
    (item) => String(item.file_name || "").trim() || "附件名称缺失",
  );
  return (
    <section className={styles.financeSummarySection}>
      <h2>票据与电子档案索引</h2>
      <table className={styles.financeSummaryIndexTable}>
        <tbody>
          <tr>
            <th>发票索引</th>
            <td>{compactList(invoiceLabels, "张")}</td>
            <th>附件索引</th>
            <td>{compactList(attachmentLabels, "份")}</td>
          </tr>
          <tr>
            <th>单据索引</th>
            <td>{businessNumber(detail)}</td>
            <th>归档说明</th>
            <td>完整明细、审批意见及原始凭证详见系统电子档案</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function summaryApprovalActions(detail: ApplicationDetailResponse) {
  const actions = sortActionsAscending(detail.actions);
  if (actions.length <= SUMMARY_APPROVAL_LIMIT) return actions;
  return [...actions.slice(0, 2), ...actions.slice(-4)];
}

function SummaryApprovalTable({
  detail,
}: {
  detail: ApplicationDetailResponse;
}) {
  const actions = sortActionsAscending(detail.actions);
  const visibleActions = summaryApprovalActions(detail);
  return (
    <section className={styles.financeSummarySection}>
      <div className={styles.financeSummarySectionHeading}>
        <h2>审签摘要</h2>
        {actions.length > SUMMARY_APPROVAL_LIMIT ? (
          <span>共 {actions.length} 条，单页展示首 2 条及末 4 条</span>
        ) : null}
      </div>
      <table className={styles.financeSummaryApprovalTable}>
        <thead>
          <tr>
            <th>环节</th>
            <th>处理人</th>
            <th>结果</th>
            <th>处理时间</th>
            <th>意见摘要</th>
          </tr>
        </thead>
        <tbody>
          {visibleActions.length ? (
            visibleActions.map((action, index) => (
              <tr key={String(action.id || index)}>
                <td>
                  {ACTION_LABELS[action.action || ""] ||
                    printText(action.action)}
                </td>
                <td>
                  {printText(
                    action.actor_name_snapshot ||
                      (action.action === "submit"
                        ? detail.summary.applicantName
                        : undefined),
                    "处理人姓名缺失",
                  )}
                </td>
                <td>
                  {STATUS_LABELS[action.to_status || ""] ||
                    ACTION_LABELS[action.action || ""] ||
                    "已记录"}
                </td>
                <td>{formatDateValue(action.created_at, true)}</td>
                <td>{compactText(action.comment)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className={styles.financeEmptyCell}>
                暂无审批记录
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function ApplicationDetailSummaryPrintView({
  detail,
  bizType,
}: Omit<PrintViewProps, "mode">) {
  const config = APPLICATION_DETAIL_CONFIG[bizType];
  const status =
    STATUS_LABELS[detail.summary.status || ""] ||
    printText(detail.summary.status);
  const submittedAt =
    detail.biz.submitted_at ||
    detail.biz.created_at ||
    detail.summary.updatedAt;
  return (
    <article
      className={`${styles.financePrintSheet} ${styles.financeSummarySheet}`}
      aria-label="财务单据单页摘要"
      data-application-detail-print-view="true"
    >
      <header className={styles.financePrintHeader}>
        <h1>{config.label}</h1>
        <p>{detail.summary.title}</p>
        <div className={styles.financePrintMeta}>
          <span>单据编号：{businessNumber(detail)}</span>
          <span>单据状态：{status}</span>
          <span>
            申请人：
            {printText(detail.summary.applicantName, "申请人姓名缺失")}
          </span>
          <span>申请时间：{formatDateValue(submittedAt, true)}</span>
          <span>打印时间：{formatDateValue(Date.now(), true)}</span>
        </div>
      </header>
      <SummaryMetrics detail={detail} />
      <SummaryInformationTable detail={detail} bizType={bizType} />
      <SummaryArchiveIndex detail={detail} />
      <SummaryApprovalTable detail={detail} />
      <footer className={styles.financePrintFooter}>
        <span>本页为财务审批摘要 · 电子档案索引：{businessNumber(detail)}</span>
        <span>请与电子原始凭证、完整明细及审批记录一并归档</span>
      </footer>
    </article>
  );
}

function ApplicationDetailFullPrintView({
  detail,
  bizType,
}: Omit<PrintViewProps, "mode">) {
  const config = APPLICATION_DETAIL_CONFIG[bizType];
  const status =
    STATUS_LABELS[detail.summary.status || ""] ||
    printText(detail.summary.status);
  const submittedAt =
    detail.biz.submitted_at ||
    detail.biz.created_at ||
    detail.summary.updatedAt;

  return (
    <article
      className={`${styles.financePrintSheet} ${styles.financeFullPrintSheet}`}
      aria-label="财务单据完整归档件"
      data-application-detail-print-view="true"
    >
      <header className={styles.financePrintHeader}>
        <h1>{config.label}</h1>
        <p>{detail.summary.title}</p>
        <div className={styles.financePrintMeta}>
          <span>单据编号：{businessNumber(detail)}</span>
          <span>单据状态：{status}</span>
          <span>
            申请人：
            {printText(detail.summary.applicantName, "申请人姓名缺失")}
          </span>
          <span>申请时间：{formatDateValue(submittedAt, true)}</span>
          <span>打印时间：{formatDateValue(Date.now(), true)}</span>
        </div>
      </header>

      {config.sections.map((section) => (
        <InformationSection
          key={section.title}
          section={section}
          detail={detail}
          amountField={config.amountField}
        />
      ))}
      <ExpensePrintTable detail={detail} />
      <SalaryPrintTable detail={detail} />
      <PaymentPlanPrintTable detail={detail} />
      <InvoicePrintTable detail={detail} />
      <AttachmentPrintTable detail={detail} />
      <ApprovalPrintTable detail={detail} />

      <footer className={styles.financePrintFooter}>
        <span>本单据由启智云图企业智能系统生成</span>
        <span>请与原始附件及审批记录一并归档</span>
      </footer>
    </article>
  );
}

export default function ApplicationDetailPrintView({
  detail,
  bizType,
  mode,
}: PrintViewProps) {
  if (mode === "full") {
    return <ApplicationDetailFullPrintView detail={detail} bizType={bizType} />;
  }
  return (
    <ApplicationDetailSummaryPrintView detail={detail} bizType={bizType} />
  );
}
