import type {
  ApplicationDetailConfig,
  ApplicationDetailConfigBizType,
  Document360ModuleDefinition,
} from "./types";
import { $i18n } from "@/i18n";

// 业务数据状态枚举使用稳定 code + i18n 回退中文：
// - STATUS_LABELS、TASK_TYPE_LABELS、ROLE_LABELS、ACTION_LABELS 等通过 i18n 维护，
//   旧代码如直接读取中文，应改用 i18n.t("workflow.statusLabels.xxx", "中文")。
const fallback = (key: string, defaultText: string) =>
  $i18n.t(key, defaultText);

export const DETAIL_DESCRIPTION_COLUMNS = {
  xs: 1,
  sm: 2,
  md: 2,
  lg: 2,
  xl: 2,
  xxl: 2,
} as const;

export const STATUS_LABELS: Record<string, string> = {
  draft: fallback("workflow.statusLabels.draft", "草稿"),
  submitted: fallback("workflow.statusLabels.submitted", "已提交"),
  approved: fallback("workflow.statusLabels.approved", "已通过"),
  completed: fallback("workflow.statusLabels.completed", "已完成"),
  reviewed: fallback("workflow.statusLabels.reviewed", "已审核"),
  rejected: fallback("workflow.statusLabels.rejected", "审批驳回"),
  signed: fallback("workflow.statusLabels.signed", "已签署"),
  archived: fallback("workflow.statusLabels.archived", "已完成"),
  voucher_created: fallback(
    "workflow.statusLabels.voucher_created",
    "财务已制单",
  ),
  bank_review_pending: fallback(
    "workflow.statusLabels.bank_review_pending",
    "网银待复核",
  ),
  bank_pending: fallback("workflow.statusLabels.bank_pending", "银行处理中"),
  paid_confirmed: fallback("workflow.statusLabels.paid_confirmed", "已支付"),
  payment_failed: fallback("workflow.statusLabels.payment_failed", "付款失败"),
  pending: fallback("workflow.statusLabels.pending", "待提交"),
  used: fallback("workflow.statusLabels.used", "已使用"),
  invalid: fallback("workflow.statusLabels.invalid", "无效"),
  cancelled: fallback("workflow.statusLabels.cancelled", "已作废"),
};

export const TASK_TYPE_LABELS: Record<string, string> = {
  review: fallback("workflow.taskTypeLabels.review", "审核"),
  cc: fallback("workflow.taskTypeLabels.cc", "抄送"),
  create_voucher: fallback("workflow.taskTypeLabels.create_voucher", "制单"),
  pay: fallback("workflow.taskTypeLabels.pay", "付款"),
  bank_review: fallback("workflow.taskTypeLabels.bank_review", "网银复核"),
  confirm: fallback("workflow.taskTypeLabels.confirm", "确认"),
  sign: fallback("workflow.taskTypeLabels.sign", "签署合同"),
  archive: fallback("workflow.taskTypeLabels.archive", "历史归档"),
  supplement_material: fallback(
    "workflow.taskTypeLabels.supplement_material",
    "补充材料",
  ),
};

export const ROLE_LABELS: Record<string, string> = {
  applicant: fallback("workflow.roleLabels.applicant", "申请人"),
  reviewer: fallback("workflow.roleLabels.reviewer", "审核员"),
  cc: fallback("workflow.roleLabels.cc", "抄送人"),
  voucher_creator: fallback(
    "workflow.roleLabels.voucher_creator",
    "凭证创建员",
  ),
  payer: fallback("workflow.roleLabels.payer", "付款员"),
  confirmer: fallback("workflow.roleLabels.confirmer", "确认人"),
  admin: fallback("workflow.roleLabels.admin", "管理员"),
};

export const ACTION_LABELS: Record<string, string> = {
  submit: fallback("workflow.actionLabels.submit", "提交"),
  review_pass: fallback("workflow.actionLabels.review_pass", "审核通过"),
  review_reject: fallback("workflow.actionLabels.review_reject", "审核驳回"),
  cc_notify: fallback("workflow.actionLabels.cc_notify", "流程抄送"),
  create_voucher: fallback("workflow.actionLabels.create_voucher", "完成制单"),
  prepare_bank_order: fallback(
    "workflow.actionLabels.prepare_bank_order",
    "完成网银制单",
  ),
  submit_to_bank: fallback(
    "workflow.actionLabels.submit_to_bank",
    "网银复核并提交",
  ),
  confirm_paid: fallback("workflow.actionLabels.confirm_paid", "确认付款"),
  confirm_legacy_paid: fallback(
    "workflow.actionLabels.confirm_legacy_paid",
    "按历史凭据确认为已支付",
  ),
  mark_payment_failed: fallback(
    "workflow.actionLabels.mark_payment_failed",
    "标记付款失败",
  ),
  sign: fallback("workflow.actionLabels.sign", "确认签署完成"),
  archive: fallback("workflow.actionLabels.archive", "流程完成（历史）"),
  withdraw: fallback("workflow.actionLabels.withdraw", "撤回"),
  cancel: fallback("workflow.actionLabels.cancel", "作废"),
  print_summary_requested: fallback(
    "workflow.actionLabels.print_summary_requested",
    "发起打印一页摘要",
  ),
  print_full_requested: fallback(
    "workflow.actionLabels.print_full_requested",
    "发起打印完整归档件",
  ),
  print_confirmed: fallback(
    "workflow.actionLabels.print_confirmed",
    "确认纸质打印完成",
  ),
  print_confirmation_revoked: fallback(
    "workflow.actionLabels.print_confirmation_revoked",
    "撤销打印确认",
  ),
};

export const ATTACHMENT_TYPE_LABELS: Record<string, string> = {
  invoice: fallback("applicationDetail.attachmentTypeLabels.invoice", "发票"),
  invoice_application_material: fallback(
    "applicationDetail.attachmentTypeLabels.invoice_application_material",
    "开票材料",
  ),
  contract_file: fallback(
    "applicationDetail.attachmentTypeLabels.contract_file",
    "合同文件",
  ),
  credential: fallback(
    "applicationDetail.attachmentTypeLabels.credential",
    "凭证",
  ),
  bank_receipt: fallback(
    "applicationDetail.attachmentTypeLabels.bank_receipt",
    "银行回单",
  ),
  approval_material: fallback(
    "applicationDetail.attachmentTypeLabels.approval_material",
    "审批材料",
  ),
  payroll_sheet: fallback(
    "applicationDetail.attachmentTypeLabels.payroll_sheet",
    "工资发放表",
  ),
  other: fallback("applicationDetail.attachmentTypeLabels.other", "其他"),
};

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  flight: fallback("applicationDetail.expenseCategoryLabels.flight", "机票"),
  hotel: fallback("applicationDetail.expenseCategoryLabels.hotel", "酒店"),
  taxi: fallback("applicationDetail.expenseCategoryLabels.taxi", "出租车"),
  train: fallback("applicationDetail.expenseCategoryLabels.train", "火车"),
  meal: fallback("applicationDetail.expenseCategoryLabels.meal", "餐饮"),
  other: fallback("applicationDetail.expenseCategoryLabels.other", "其他"),
};

export const COMPLIANCE_LABELS: Record<string, string> = {
  pending_review: fallback(
    "applicationDetail.complianceLabels.pending_review",
    "待审核",
  ),
  compliant: fallback("applicationDetail.complianceLabels.compliant", "合规"),
  offset_required: fallback(
    "applicationDetail.complianceLabels.offset_required",
    "需抵扣",
  ),
  offset_provided: fallback(
    "applicationDetail.complianceLabels.offset_provided",
    "已提供抵扣",
  ),
  non_compliant: fallback(
    "applicationDetail.complianceLabels.non_compliant",
    "不合规",
  ),
};

export const OUR_ROLE_LABELS: Record<string, string> = {
  party_a: fallback("applicationDetail.ourRoleLabels.party_a", "甲方"),
  party_b: fallback("applicationDetail.ourRoleLabels.party_b", "乙方"),
};

const documentModule: Document360ModuleDefinition = {
  key: "document",
  label: fallback("applicationDetail.modules.document", "单据信息"),
  area: "main",
  showWhenEmpty: true,
};

const executiveSummaryModule: Document360ModuleDefinition = {
  key: "executiveSummary",
  label: fallback("applicationDetail.modules.executiveSummary", "经营摘要"),
  area: "main",
};

const relatedDocumentsModule: Document360ModuleDefinition = {
  key: "relatedDocuments",
  label: fallback("applicationDetail.modules.relatedDocuments", "关联单据"),
  area: "main",
};

const relationsModule: Document360ModuleDefinition = {
  key: "relations",
  label: fallback("applicationDetail.modules.relations", "业务关系"),
  area: "aside",
};

const attachmentsModule: Document360ModuleDefinition = {
  key: "attachments",
  label: fallback("applicationDetail.modules.attachments", "资料与附件"),
  area: "full",
  showWhenEmpty: true,
};

const workflowModule: Document360ModuleDefinition = {
  key: "workflow",
  label: fallback("applicationDetail.modules.workflow", "流程与动态"),
  area: "full",
  showWhenEmpty: true,
};

export const APPLICATION_DETAIL_CONFIG: Record<
  ApplicationDetailConfigBizType,
  ApplicationDetailConfig
> = {
  expense: {
    label: fallback("applicationDetail.bizTypes.expense", "报销申请"),
    editPath: (id) => `/expense-form?id=${id}`,
    maxWidth: 1320,
    amountField: "reimbursable_cny_amount",
    currencyField: "payout_currency",
    sections: [
      {
        title: fallback(
          "applicationDetail.expense.sectionApplicationInfo",
          "申请信息",
        ),
        fields: [
          {
            name: "title",
            label: fallback("applicationDetail.expense.fieldTitle", "报销标题"),
          },
          {
            name: "project_name",
            label: fallback(
              "applicationDetail.expense.fieldProjectName",
              "项目名称",
            ),
          },
          {
            name: "applicant_name_snapshot",
            label: fallback("common.applicant", "申请人"),
          },
          {
            name: "expense_type_label",
            label: fallback(
              "applicationDetail.expense.fieldExpenseType",
              "费用类型",
            ),
          },
          {
            name: "travel_type",
            label: fallback(
              "applicationDetail.expense.fieldTravelType",
              "出差类型",
            ),
            options: {
              domestic: fallback(
                "applicationDetail.expense.optionsDomestic",
                "国内",
              ),
              overseas: fallback(
                "applicationDetail.expense.optionsOverseas",
                "海外",
              ),
            },
          },
          {
            name: "status",
            label: fallback("common.status", "状态"),
            options: STATUS_LABELS,
          },
          {
            name: "submitted_at",
            label: fallback("common.submitTime", "提交时间"),
            format: "datetime",
          },
        ],
      },
      {
        title: fallback(
          "applicationDetail.expense.sectionAmountPayment",
          "金额与支付",
        ),
        fields: [
          {
            name: "total_original_amount",
            label: fallback(
              "applicationDetail.expense.fieldTotalOriginal",
              "原始总金额",
            ),
            format: "money",
            currencyField: "payout_currency",
          },
          {
            name: "total_cny_amount",
            label: fallback(
              "applicationDetail.expense.fieldTotalCny",
              "人民币总额",
            ),
            format: "money",
          },
          {
            name: "reimbursable_cny_amount",
            label: fallback(
              "applicationDetail.expense.fieldReimbursable",
              "可报销金额",
            ),
            format: "money",
          },
          {
            name: "payout_currency",
            label: fallback(
              "applicationDetail.expense.fieldPayoutCurrency",
              "支付币种",
            ),
          },
          {
            name: "remark",
            label: fallback("common.remark", "备注"),
            span: 2,
          },
        ],
      },
      {
        title: fallback(
          "applicationDetail.expense.sectionBankProcessing",
          "银行处理",
        ),
        fields: [
          {
            name: "bank_status",
            label: fallback(
              "applicationDetail.expense.fieldBankStatus",
              "银行状态",
            ),
            options: {
              not_submitted: fallback(
                "applicationDetail.expense.optionsBankStatus.not_submitted",
                "待网银制单",
              ),
              bank_review_pending: fallback(
                "applicationDetail.expense.optionsBankStatus.bank_review_pending",
                "网银待复核",
              ),
              bank_pending: fallback(
                "applicationDetail.expense.optionsBankStatus.bank_pending",
                "银行处理中",
              ),
              paid_confirmed: fallback(
                "applicationDetail.expense.optionsBankStatus.paid_confirmed",
                "已支付",
              ),
              payment_failed: fallback(
                "applicationDetail.expense.optionsBankStatus.payment_failed",
                "付款失败",
              ),
            },
          },
          {
            name: "bank_submitted_at",
            label: fallback(
              "applicationDetail.expense.fieldBankSubmittedAt",
              "提交银行时间",
            ),
            format: "datetime",
          },
          {
            name: "bank_confirmed_at",
            label: fallback(
              "applicationDetail.expense.fieldBankConfirmedAt",
              "确认付款时间",
            ),
            format: "datetime",
          },
          {
            name: "bank_confirmed_by_name_snapshot",
            label: fallback(
              "applicationDetail.expense.fieldBankConfirmedBy",
              "确认人",
            ),
          },
          {
            name: "last_action_at",
            label: fallback(
              "applicationDetail.expense.fieldLastActionAt",
              "最后操作时间",
            ),
            format: "datetime",
          },
        ],
      },
    ],
    modules: [
      executiveSummaryModule,
      documentModule,
      {
        key: "expenseItems",
        label: fallback("applicationDetail.modules.expenseItems", "报销明细"),
        area: "main",
        showWhenEmpty: true,
      },
      {
        key: "invoiceLinks",
        label: fallback(
          "applicationDetail.expense.moduleInvoiceLinks",
          "关联发票",
        ),
        area: "main",
        showWhenEmpty: true,
      },
      relatedDocumentsModule,
      attachmentsModule,
      workflowModule,
    ],
  },
  invoice: {
    label: fallback("applicationDetail.bizTypes.invoice", "发票"),
    editPath: (id) => `/invoice-form?id=${id}`,
    maxWidth: 1320,
    amountField: "total_amount",
    currencyField: "currency",
    sections: [
      {
        title: fallback(
          "applicationDetail.invoice.sectionInvoiceInfo",
          "发票信息",
        ),
        fields: [
          {
            name: "invoice_title",
            label: fallback(
              "applicationDetail.invoice.fieldInvoiceTitle",
              "发票标题",
            ),
          },
          {
            name: "request_type",
            label: fallback(
              "applicationDetail.invoice.fieldRequestType",
              "记录类型",
            ),
            options: {
              customer_invoice: fallback(
                "applicationDetail.invoice.optionsRequestType.customer_invoice",
                "客户发票",
              ),
              service_provider_invoice: fallback(
                "applicationDetail.invoice.optionsRequestType.service_provider_invoice",
                "供应商发票",
              ),
            },
          },
          {
            name: "invoice_direction",
            label: fallback(
              "applicationDetail.invoice.fieldInvoiceDirection",
              "发票方向",
            ),
            options: {
              incoming: fallback(
                "applicationDetail.invoice.optionsInvoiceDirection.incoming",
                "对方开给我们",
              ),
              outgoing: fallback(
                "applicationDetail.invoice.optionsInvoiceDirection.outgoing",
                "我们开给对方",
              ),
            },
          },
          {
            name: "invoice_purpose",
            label: fallback(
              "applicationDetail.invoice.fieldInvoicePurpose",
              "发票用途",
            ),
            options: {
              reimbursement: fallback(
                "applicationDetail.invoice.optionsInvoicePurpose.reimbursement",
                "员工报销",
              ),
              procurement: fallback(
                "applicationDetail.invoice.optionsInvoicePurpose.procurement",
                "采购/供应商",
              ),
              contract_payment: fallback(
                "applicationDetail.invoice.optionsInvoicePurpose.contract_payment",
                "合同付款核销",
              ),
              customer_billing: fallback(
                "applicationDetail.invoice.optionsInvoicePurpose.customer_billing",
                "客户开票",
              ),
              other: fallback(
                "applicationDetail.invoice.optionsInvoicePurpose.other",
                "其他",
              ),
            },
          },
          {
            name: "applicant_name_snapshot",
            label: fallback("common.applicant", "申请人"),
          },
          {
            name: "status",
            label: fallback("common.status", "状态"),
            options: STATUS_LABELS,
          },
          {
            name: "partner_source",
            label: fallback(
              "applicationDetail.invoice.fieldPartnerSource",
              "合作方来源",
            ),
            options: {
              crm_customer: fallback(
                "applicationDetail.invoice.optionsPartnerSource.crm_customer",
                "CRM 客户",
              ),
              business_partner: fallback(
                "applicationDetail.invoice.optionsPartnerSource.business_partner",
                "业务伙伴",
              ),
              manual: fallback(
                "applicationDetail.invoice.optionsPartnerSource.manual",
                "仅记录名称",
              ),
            },
          },
          {
            name: "partner_name_snapshot",
            label: fallback(
              "applicationDetail.invoice.fieldPartnerName",
              "合作方",
            ),
          },
          {
            name: "contract_id",
            label: fallback(
              "applicationDetail.invoice.fieldContract",
              "关联合同",
            ),
          },
          {
            name: "submitted_at",
            label: fallback("common.submitTime", "提交时间"),
            format: "datetime",
          },
        ],
      },
      {
        title: fallback(
          "applicationDetail.invoice.sectionInvoiceContent",
          "票面与金额",
        ),
        fields: [
          {
            name: "invoice_no",
            label: fallback(
              "applicationDetail.invoice.fieldInvoiceNo",
              "发票号码",
            ),
          },
          {
            name: "invoice_date",
            label: fallback(
              "applicationDetail.invoice.fieldInvoiceDate",
              "发票日期",
            ),
            format: "date",
          },
          {
            name: "invoice_region",
            label: fallback(
              "applicationDetail.invoice.fieldInvoiceRegion",
              "发票区域",
            ),
            options: {
              mainland_china: fallback(
                "applicationDetail.invoice.optionsInvoiceRegion.mainland_china",
                "中国大陆",
              ),
              overseas: fallback(
                "applicationDetail.invoice.optionsInvoiceRegion.overseas",
                "海外",
              ),
              unknown: fallback(
                "applicationDetail.invoice.optionsInvoiceRegion.unknown",
                "未知",
              ),
            },
          },
          {
            name: "invoice_type",
            label: fallback(
              "applicationDetail.invoice.fieldInvoiceType",
              "发票类型",
            ),
            options: {
              vat_special: fallback(
                "applicationDetail.invoice.optionsInvoiceType.vat_special",
                "增值税专用发票",
              ),
              vat_normal: fallback(
                "applicationDetail.invoice.optionsInvoiceType.vat_normal",
                "增值税普通发票",
              ),
              e_ticket: fallback(
                "applicationDetail.invoice.optionsInvoiceType.e_ticket",
                "电子票据",
              ),
              receipt: fallback(
                "applicationDetail.invoice.optionsInvoiceType.receipt",
                "收据",
              ),
              other: fallback(
                "applicationDetail.invoice.optionsInvoiceType.other",
                "其他",
              ),
            },
          },
          {
            name: "amount",
            label: fallback(
              "applicationDetail.invoice.fieldAmount",
              "不含税金额",
            ),
            format: "money",
            currencyField: "currency",
          },
          {
            name: "tax_rate",
            label: fallback("applicationDetail.invoice.fieldTaxRate", "税率"),
            format: "percent",
          },
          {
            name: "tax_amount",
            label: fallback("applicationDetail.invoice.fieldTaxAmount", "税额"),
            format: "money",
            currencyField: "currency",
          },
          {
            name: "total_amount",
            label: fallback(
              "applicationDetail.invoice.fieldTotalAmount",
              "价税合计",
            ),
            format: "money",
            currencyField: "currency",
          },
          {
            name: "currency",
            label: fallback("applicationDetail.invoice.fieldCurrency", "币种"),
          },
          {
            name: "invoice_content",
            label: fallback(
              "applicationDetail.invoice.fieldInvoiceContent",
              "开票内容",
            ),
            span: 2,
          },
        ],
      },
      {
        title: fallback(
          "applicationDetail.invoice.sectionBuyerReceiver",
          "购买方与接收信息",
        ),
        fields: [
          {
            name: "buyer_name",
            label: fallback(
              "applicationDetail.invoice.fieldBuyerName",
              "购买方名称",
            ),
          },
          {
            name: "buyer_tax_no",
            label: fallback(
              "applicationDetail.invoice.fieldBuyerTaxNo",
              "购买方税号",
            ),
          },
          {
            name: "buyer_address_phone",
            label: fallback(
              "applicationDetail.invoice.fieldBuyerAddressPhone",
              "地址电话",
            ),
            span: 2,
          },
          {
            name: "buyer_bank_account",
            label: fallback(
              "applicationDetail.invoice.fieldBuyerBankAccount",
              "银行账户",
            ),
            span: 2,
          },
          {
            name: "invoice_medium",
            label: fallback(
              "applicationDetail.invoice.fieldInvoiceMedium",
              "发票介质",
            ),
            options: {
              electronic: fallback(
                "applicationDetail.invoice.optionsInvoiceMedium.electronic",
                "电子",
              ),
              paper: fallback(
                "applicationDetail.invoice.optionsInvoiceMedium.paper",
                "纸质",
              ),
              other: fallback(
                "applicationDetail.invoice.optionsInvoiceMedium.other",
                "其他",
              ),
            },
          },
          {
            name: "receiver_name",
            label: fallback(
              "applicationDetail.invoice.fieldReceiverName",
              "接收人",
            ),
          },
          {
            name: "receiver_phone",
            label: fallback(
              "applicationDetail.invoice.fieldReceiverPhone",
              "接收电话",
            ),
          },
          {
            name: "receiver_email",
            label: fallback(
              "applicationDetail.invoice.fieldReceiverEmail",
              "接收邮箱",
            ),
          },
          {
            name: "remark",
            label: fallback("common.remark", "备注"),
            span: 2,
          },
        ],
      },
    ],
    modules: [
      executiveSummaryModule,
      documentModule,
      {
        key: "paymentPlans",
        label: fallback(
          "applicationDetail.invoice.modulePaymentPlans",
          "关联合同付款计划",
        ),
        area: "main",
      },
      relatedDocumentsModule,
      relationsModule,
      attachmentsModule,
      workflowModule,
    ],
  },
  invoice_application: {
    label: fallback(
      "applicationDetail.bizTypes.invoice_application",
      "销项开票申请",
    ),
    editPath: (id) => `/invoice-form?id=${id}`,
    maxWidth: 1320,
    amountField: "requested_total_amount",
    currencyField: "currency",
    sections: [
      {
        title: fallback(
          "applicationDetail.invoiceApplication.sectionApplicationInfo",
          "申请信息",
        ),
        fields: [
          {
            name: "application_no",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldApplicationNo",
              "申请编号",
            ),
          },
          {
            name: "application_title",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldApplicationTitle",
              "申请标题",
            ),
          },
          {
            name: "applicant_name_snapshot",
            label: fallback("common.applicant", "申请人"),
          },
          {
            name: "customer_name_snapshot",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldCustomer",
              "客户",
            ),
          },
          {
            name: "contract_title_snapshot",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldSalesContract",
              "销售合同",
            ),
          },
          {
            name: "status",
            label: fallback("common.status", "状态"),
            options: STATUS_LABELS,
          },
          {
            name: "submitted_at",
            label: fallback("common.submitTime", "提交时间"),
            format: "datetime",
          },
        ],
      },
      {
        title: fallback(
          "applicationDetail.invoiceApplication.sectionRequestedAmount",
          "拟开票金额",
        ),
        fields: [
          {
            name: "requested_amount",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldRequestedAmount",
              "不含税金额",
            ),
            format: "money",
            currencyField: "currency",
          },
          {
            name: "tax_rate",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldTaxRate",
              "税率",
            ),
            format: "percent",
          },
          {
            name: "requested_tax_amount",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldRequestedTaxAmount",
              "税额",
            ),
            format: "money",
            currencyField: "currency",
          },
          {
            name: "requested_total_amount",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldRequestedTotalAmount",
              "价税合计",
            ),
            format: "money",
            currencyField: "currency",
          },
          {
            name: "currency",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldCurrency",
              "币种",
            ),
          },
          {
            name: "invoice_content",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldInvoiceContent",
              "开票内容",
            ),
            span: 2,
          },
          {
            name: "payment_condition_snapshot",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldPaymentCondition",
              "收款前置条件",
            ),
            span: 2,
          },
        ],
      },
      {
        title: fallback(
          "applicationDetail.invoiceApplication.sectionSalePurchase",
          "购销与接收信息",
        ),
        fields: [
          {
            name: "seller_name",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldSellerName",
              "销售方名称",
            ),
          },
          {
            name: "buyer_name",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldBuyerName",
              "购买方名称",
            ),
          },
          {
            name: "buyer_tax_no",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldBuyerTaxNo",
              "购买方税号",
            ),
          },
          {
            name: "buyer_address_phone",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldBuyerAddressPhone",
              "购买方地址电话",
            ),
            span: 2,
          },
          {
            name: "buyer_bank_account",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldBuyerBankAccount",
              "购买方银行账户",
            ),
            span: 2,
          },
          {
            name: "invoice_type",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldInvoiceType",
              "发票类型",
            ),
            options: {
              vat_special: fallback(
                "applicationDetail.invoiceApplication.optionsInvoiceType.vat_special",
                "增值税专用发票",
              ),
              vat_normal: fallback(
                "applicationDetail.invoiceApplication.optionsInvoiceType.vat_normal",
                "增值税普通发票",
              ),
              other: fallback(
                "applicationDetail.invoiceApplication.optionsInvoiceType.other",
                "其他",
              ),
            },
          },
          {
            name: "invoice_medium",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldDeliveryMedium",
              "交付形式",
            ),
            options: {
              electronic: fallback(
                "applicationDetail.invoiceApplication.optionsDeliveryMedium.electronic",
                "电子",
              ),
              paper: fallback(
                "applicationDetail.invoiceApplication.optionsDeliveryMedium.paper",
                "纸质",
              ),
              other: fallback(
                "applicationDetail.invoiceApplication.optionsDeliveryMedium.other",
                "其他",
              ),
            },
          },
          {
            name: "receiver_name",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldReceiverName",
              "收票人",
            ),
          },
          {
            name: "receiver_phone",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldReceiverPhone",
              "收票手机号",
            ),
          },
          {
            name: "receiver_email",
            label: fallback(
              "applicationDetail.invoiceApplication.fieldReceiverEmail",
              "收票邮箱",
            ),
          },
          {
            name: "remark",
            label: fallback("common.remark", "备注"),
            span: 2,
          },
        ],
      },
    ],
    modules: [
      executiveSummaryModule,
      documentModule,
      relatedDocumentsModule,
      relationsModule,
      attachmentsModule,
      workflowModule,
    ],
  },
  contract: {
    label: fallback("applicationDetail.bizTypes.contract", "合同申请"),
    editPath: (id) => `/contract-form?id=${id}`,
    maxWidth: 1320,
    amountField: "amount",
    currencyField: "currency",
    sections: [
      {
        title: fallback(
          "applicationDetail.contract.sectionContractInfo",
          "合同信息",
        ),
        fields: [
          {
            name: "contract_name",
            label: fallback(
              "applicationDetail.contract.fieldContractName",
              "合同名称",
            ),
          },
          {
            name: "contract_type",
            label: fallback(
              "applicationDetail.contract.fieldContractType",
              "合同业务类型",
            ),
            options: {
              sales: fallback(
                "applicationDetail.contract.optionsContractType.sales",
                "销售合同",
              ),
              procurement: fallback(
                "applicationDetail.contract.optionsContractType.procurement",
                "采购合同",
              ),
              service: fallback(
                "applicationDetail.contract.optionsContractType.service",
                "服务合同",
              ),
              rent: fallback(
                "applicationDetail.contract.optionsContractType.rent",
                "租赁合同",
              ),
              hr: fallback(
                "applicationDetail.contract.optionsContractType.hr",
                "人力合同",
              ),
              certification: fallback(
                "applicationDetail.contract.optionsContractType.certification",
                "认证合同",
              ),
              other: fallback(
                "applicationDetail.contract.optionsContractType.other",
                "其他合同",
              ),
            },
          },
          {
            name: "direction",
            label: fallback(
              "applicationDetail.contract.fieldDirection",
              "资金方向",
            ),
            options: {
              receivable: fallback(
                "applicationDetail.contract.optionsDirection.receivable",
                "收款合同（我们服务客户）",
              ),
              payable: fallback(
                "applicationDetail.contract.optionsDirection.payable",
                "付款合同（供应商服务我们）",
              ),
              outbound: fallback(
                "applicationDetail.contract.optionsDirection.outbound",
                "收款合同（历史值）",
              ),
              inbound: fallback(
                "applicationDetail.contract.optionsDirection.inbound",
                "付款合同（历史值）",
              ),
            },
          },
          {
            name: "our_role",
            label: fallback(
              "applicationDetail.contract.fieldOurRole",
              "我方角色",
            ),
            options: OUR_ROLE_LABELS,
          },
          {
            name: "payment_requirement",
            label: fallback(
              "applicationDetail.contract.fieldPaymentRequirement",
              "付款要求",
            ),
            options: {
              required: fallback(
                "applicationDetail.contract.optionsPaymentRequirement.required",
                "需要付款",
              ),
              not_required: fallback(
                "applicationDetail.contract.optionsPaymentRequirement.not_required",
                "无需付款",
              ),
              unknown: fallback(
                "applicationDetail.contract.optionsPaymentRequirement.unknown",
                "待确认",
              ),
            },
          },
          {
            name: "partner_id",
            label: fallback(
              "applicationDetail.contract.fieldPartner",
              "合作方",
            ),
          },
          {
            name: "status",
            label: fallback("common.status", "状态"),
            options: STATUS_LABELS,
          },
          {
            name: "submitted_at",
            label: fallback("common.submitTime", "提交时间"),
            format: "datetime",
          },
          {
            name: "lifecycle_status",
            label: fallback(
              "applicationDetail.contract.fieldLifecycleStatus",
              "履约状态",
            ),
            options: {
              pending_signature: fallback(
                "applicationDetail.contract.optionsLifecycleStatus.pending_signature",
                "待签署",
              ),
              signed: fallback(
                "applicationDetail.contract.optionsLifecycleStatus.signed",
                "已签署",
              ),
              in_progress: fallback(
                "applicationDetail.contract.optionsLifecycleStatus.in_progress",
                "进行中",
              ),
              completed: fallback(
                "applicationDetail.contract.optionsLifecycleStatus.completed",
                "已完成",
              ),
            },
          },
          {
            name: "amount",
            label: fallback(
              "applicationDetail.contract.fieldContractAmount",
              "合同金额",
            ),
            format: "money",
            currencyField: "currency",
          },
          {
            name: "currency",
            label: fallback("applicationDetail.contract.fieldCurrency", "币种"),
          },
          {
            name: "start_date",
            label: fallback(
              "applicationDetail.contract.fieldStartDate",
              "开始日期",
            ),
            format: "date",
          },
          {
            name: "end_date",
            label: fallback(
              "applicationDetail.contract.fieldEndDate",
              "结束日期",
            ),
            format: "date",
          },
          {
            name: "signed_at",
            label: fallback(
              "applicationDetail.contract.fieldSignedAt",
              "签署时间",
            ),
            format: "datetime",
          },
        ],
      },
      {
        title: fallback(
          "applicationDetail.contract.sectionHandlerInfo",
          "经办信息",
        ),
        fields: [
          {
            name: "applicant_name_snapshot",
            label: fallback("common.applicant", "申请人"),
          },
          {
            name: "liaison_name_snapshot",
            label: fallback(
              "applicationDetail.contract.fieldLiaison",
              "联络人",
            ),
          },
          {
            name: "remark",
            label: fallback("common.remark", "备注"),
            span: 2,
          },
        ],
      },
      {
        title: fallback(
          "applicationDetail.contract.sectionContractReview",
          "合同评价与注意事项",
        ),
        fields: [
          {
            name: "contract_assessment",
            label: fallback(
              "applicationDetail.contract.fieldContractAssessment",
              "合同专家结论",
            ),
            format: "markdown",
            span: 2,
          },
        ],
      },
    ],
    modules: [
      executiveSummaryModule,
      documentModule,
      {
        key: "paymentPlans",
        label: fallback(
          "applicationDetail.contract.modulePaymentPlans",
          "付款计划",
        ),
        area: "main",
        showWhenEmpty: true,
      },
      {
        key: "invoiceLinks",
        label: fallback("applicationDetail.modules.invoiceLinks", "关联发票"),
        area: "main",
      },
      relatedDocumentsModule,
      relationsModule,
      attachmentsModule,
      workflowModule,
    ],
  },
  payment: {
    label: fallback("applicationDetail.bizTypes.payment", "付款申请"),
    editPath: (id) => `/payment-form?id=${id}`,
    maxWidth: 1320,
    amountField: "amount",
    currencyField: "currency",
    sections: [
      {
        title: fallback(
          "applicationDetail.payment.sectionPaymentInfo",
          "付款信息",
        ),
        fields: [
          {
            name: "title",
            label: fallback("applicationDetail.payment.fieldTitle", "付款标题"),
          },
          {
            name: "project_name",
            label: fallback(
              "applicationDetail.payment.fieldProjectName",
              "项目名称",
            ),
          },
          {
            name: "payment_type",
            label: fallback(
              "applicationDetail.payment.fieldPaymentType",
              "付款类型",
            ),
            options: {
              vendor_payment: fallback(
                "applicationDetail.payment.optionsPaymentType.vendor_payment",
                "供应商付款",
              ),
            },
          },
          {
            name: "partner_id",
            label: fallback("applicationDetail.payment.fieldPartner", "合作方"),
          },
          {
            name: "contract_id",
            label: fallback(
              "applicationDetail.payment.fieldContract",
              "关联合同",
            ),
          },
          {
            name: "status",
            label: fallback("common.status", "状态"),
            options: STATUS_LABELS,
          },
          {
            name: "submitted_at",
            label: fallback("common.submitTime", "提交时间"),
            format: "datetime",
          },
          {
            name: "amount",
            label: fallback(
              "applicationDetail.payment.fieldPaymentAmount",
              "付款金额",
            ),
            format: "money",
            currencyField: "currency",
          },
          {
            name: "currency",
            label: fallback("common.currency", "币种"),
          },
          {
            name: "expected_pay_date",
            label: fallback(
              "applicationDetail.payment.fieldExpectedPayDate",
              "预期付款日",
            ),
            format: "date",
          },
          {
            name: "applicant_name_snapshot",
            label: fallback("common.applicant", "申请人"),
          },
          {
            name: "liaison_name_snapshot",
            label: fallback("applicationDetail.payment.fieldLiaison", "联络人"),
          },
        ],
      },
      {
        title: fallback(
          "applicationDetail.payment.sectionPaymentPhase",
          "付款阶段",
        ),
        fields: [
          {
            name: "payment_phase_no",
            label: fallback(
              "applicationDetail.payment.fieldPaymentPhaseNo",
              "阶段号",
            ),
          },
          {
            name: "payment_phase_name",
            label: fallback(
              "applicationDetail.payment.fieldPaymentPhaseName",
              "阶段名称",
            ),
          },
          {
            name: "total_phase_count",
            label: fallback(
              "applicationDetail.payment.fieldTotalPhaseCount",
              "总阶段数",
            ),
          },
          {
            name: "phase_trigger_condition",
            label: fallback(
              "applicationDetail.payment.fieldPhaseTriggerCondition",
              "触发条件",
            ),
            span: 2,
          },
        ],
      },
      {
        title: fallback(
          "applicationDetail.payment.sectionBankProcessing",
          "银行处理",
        ),
        fields: [
          {
            name: "bank_status",
            label: fallback(
              "applicationDetail.payment.fieldBankStatus",
              "银行状态",
            ),
            options: {
              not_submitted: fallback(
                "applicationDetail.payment.optionsBankStatus.not_submitted",
                "待网银制单",
              ),
              bank_review_pending: fallback(
                "applicationDetail.payment.optionsBankStatus.bank_review_pending",
                "网银待复核",
              ),
              bank_pending: fallback(
                "applicationDetail.payment.optionsBankStatus.bank_pending",
                "银行处理中",
              ),
              paid_confirmed: fallback(
                "applicationDetail.payment.optionsBankStatus.paid_confirmed",
                "已支付",
              ),
              payment_failed: fallback(
                "applicationDetail.payment.optionsBankStatus.payment_failed",
                "付款失败",
              ),
            },
          },
          {
            name: "bank_account_snapshot",
            label: fallback(
              "applicationDetail.payment.fieldBankAccount",
              "银行账户",
            ),
            span: 2,
          },
          {
            name: "bank_submitted_at",
            label: fallback(
              "applicationDetail.payment.fieldBankSubmittedAt",
              "提交银行时间",
            ),
            format: "datetime",
          },
          {
            name: "bank_confirmed_at",
            label: fallback(
              "applicationDetail.payment.fieldBankConfirmedAt",
              "确认付款时间",
            ),
            format: "datetime",
          },
          {
            name: "bank_confirmed_by_name_snapshot",
            label: fallback(
              "applicationDetail.payment.fieldBankConfirmedBy",
              "确认人",
            ),
          },
          {
            name: "current_owner_name_snapshot",
            label: fallback(
              "applicationDetail.payment.fieldCurrentOwner",
              "当前负责人",
            ),
          },
          {
            name: "last_action_at",
            label: fallback(
              "applicationDetail.payment.fieldLastActionAt",
              "最后操作时间",
            ),
            format: "datetime",
          },
          {
            name: "remark",
            label: fallback("common.remark", "备注"),
            span: 2,
          },
        ],
      },
    ],
    modules: [
      executiveSummaryModule,
      documentModule,
      {
        key: "paymentPlans",
        label: fallback(
          "applicationDetail.payment.modulePaymentPlans",
          "合同付款全景",
        ),
        area: "main",
      },
      {
        key: "invoiceLinks",
        label: fallback(
          "applicationDetail.payment.moduleInvoiceLinks",
          "发票覆盖",
        ),
        area: "main",
        showWhenEmpty: true,
      },
      relatedDocumentsModule,
      relationsModule,
      attachmentsModule,
      workflowModule,
    ],
  },
  salary_payment: {
    label: fallback(
      "applicationDetail.bizTypes.salary_payment",
      "工资付款申请",
    ),
    editPath: (id) => `/salary-payment-form?id=${id}`,
    maxWidth: 1320,
    amountField: "amount",
    currencyField: "currency",
    sections: [
      {
        title: fallback(
          "applicationDetail.salaryPayment.sectionSalaryInfo",
          "工资付款信息",
        ),
        fields: [
          {
            name: "title",
            label: fallback(
              "applicationDetail.salaryPayment.fieldTitle",
              "付款事由",
            ),
            span: 2,
          },
          {
            name: "applicant_name_snapshot",
            label: fallback("common.applicant", "申请人"),
          },
          {
            name: "status",
            label: fallback("common.status", "状态"),
            options: STATUS_LABELS,
          },
          {
            name: "submitted_at",
            label: fallback("common.submitTime", "提交时间"),
            format: "datetime",
          },
          {
            name: "payroll_month",
            label: fallback(
              "applicationDetail.salaryPayment.fieldPayrollMonth",
              "工资月份",
            ),
            format: "date",
          },
          {
            name: "employee_count",
            label: fallback(
              "applicationDetail.salaryPayment.fieldEmployeeCount",
              "合计发薪人数",
            ),
          },
          {
            name: "amount",
            label: fallback(
              "applicationDetail.salaryPayment.fieldAmount",
              "付款总额",
            ),
            format: "money",
            currencyField: "currency",
          },
          {
            name: "expected_pay_date",
            label: fallback(
              "applicationDetail.salaryPayment.fieldExpectedPayDate",
              "付款日期",
            ),
            format: "date",
          },
          {
            name: "remark",
            label: fallback("common.remark", "备注"),
            span: 2,
          },
        ],
      },
      {
        title: fallback(
          "applicationDetail.salaryPayment.sectionBankProcessing",
          "银行处理",
        ),
        fields: [
          {
            name: "bank_status",
            label: fallback(
              "applicationDetail.salaryPayment.fieldBankStatus",
              "银行状态",
            ),
            options: {
              not_submitted: fallback(
                "applicationDetail.salaryPayment.optionsBankStatus.not_submitted",
                "待网银制单",
              ),
              bank_review_pending: fallback(
                "applicationDetail.salaryPayment.optionsBankStatus.bank_review_pending",
                "网银待复核",
              ),
              bank_pending: fallback(
                "applicationDetail.salaryPayment.optionsBankStatus.bank_pending",
                "银行处理中",
              ),
              paid_confirmed: fallback(
                "applicationDetail.salaryPayment.optionsBankStatus.paid_confirmed",
                "已支付",
              ),
              payment_failed: fallback(
                "applicationDetail.salaryPayment.optionsBankStatus.payment_failed",
                "付款失败",
              ),
            },
          },
          {
            name: "bank_submitted_at",
            label: fallback(
              "applicationDetail.salaryPayment.fieldBankSubmittedAt",
              "提交银行时间",
            ),
            format: "datetime",
          },
          {
            name: "bank_confirmed_at",
            label: fallback(
              "applicationDetail.salaryPayment.fieldBankConfirmedAt",
              "确认付款时间",
            ),
            format: "datetime",
          },
          {
            name: "bank_confirmed_by_name_snapshot",
            label: fallback(
              "applicationDetail.salaryPayment.fieldBankConfirmedBy",
              "确认人",
            ),
          },
          {
            name: "current_owner_name_snapshot",
            label: fallback(
              "applicationDetail.salaryPayment.fieldCurrentOwner",
              "当前负责人",
            ),
          },
          {
            name: "last_action_at",
            label: fallback(
              "applicationDetail.salaryPayment.fieldLastActionAt",
              "最后操作时间",
            ),
            format: "datetime",
          },
        ],
      },
    ],
    modules: [
      documentModule,
      {
        key: "salaryItems",
        label: fallback("applicationDetail.modules.salaryItems", "付款明细"),
        area: "main",
        showWhenEmpty: true,
      },
      attachmentsModule,
      workflowModule,
    ],
  },
  travel: {
    label: fallback("applicationDetail.bizTypes.travel", "差旅申请"),
    editPath: (id) => `/travel-form?id=${id}`,
    maxWidth: 1320,
    amountField: "estimated_amount",
    currencyField: "currency",
    sections: [
      {
        title: fallback("applicationDetail.travel.sectionTripInfo", "行程信息"),
        fields: [
          {
            name: "title",
            label: fallback("applicationDetail.travel.fieldTitle", "差旅标题"),
          },
          {
            name: "travel_type",
            label: fallback(
              "applicationDetail.travel.fieldTravelType",
              "差旅类型",
            ),
            options: {
              business: fallback(
                "applicationDetail.travel.optionsTravelType.business",
                "商务出差",
              ),
            },
          },
          {
            name: "trip_region",
            label: fallback(
              "applicationDetail.travel.fieldTripRegion",
              "出差区域",
            ),
            options: {
              domestic: fallback(
                "applicationDetail.travel.optionsTripRegion.domestic",
                "国内",
              ),
              overseas: fallback(
                "applicationDetail.travel.optionsTripRegion.overseas",
                "海外",
              ),
            },
          },
          {
            name: "status",
            label: fallback("common.status", "状态"),
            options: STATUS_LABELS,
          },
          {
            name: "origin_city",
            label: fallback(
              "applicationDetail.travel.fieldOriginCity",
              "出发城市",
            ),
          },
          {
            name: "destination_city",
            label: fallback(
              "applicationDetail.travel.fieldDestinationCity",
              "目的城市",
            ),
          },
          {
            name: "start_date",
            label: fallback(
              "applicationDetail.travel.fieldStartDate",
              "开始日期",
            ),
            format: "date",
          },
          {
            name: "end_date",
            label: fallback(
              "applicationDetail.travel.fieldEndDate",
              "结束日期",
            ),
            format: "date",
          },
          {
            name: "travel_reason",
            label: fallback(
              "applicationDetail.travel.fieldTravelReason",
              "出差原因",
            ),
            span: 2,
          },
        ],
      },
      {
        title: fallback(
          "applicationDetail.travel.sectionPeopleProject",
          "人员与项目",
        ),
        fields: [
          {
            name: "applicant_name_snapshot",
            label: fallback("common.applicant", "申请人"),
          },
          {
            name: "companions_json",
            label: fallback(
              "applicationDetail.travel.fieldCompanions",
              "同行人",
            ),
            format: "companions",
          },
          {
            name: "project_name",
            label: fallback(
              "applicationDetail.travel.fieldProjectName",
              "项目名称",
            ),
          },
          {
            name: "partner_id",
            label: fallback("applicationDetail.travel.fieldPartner", "合作方"),
          },
        ],
      },
      {
        title: fallback("applicationDetail.travel.sectionBudget", "预算与安排"),
        fields: [
          {
            name: "estimated_amount",
            label: fallback(
              "applicationDetail.travel.fieldEstimatedAmount",
              "预估金额",
            ),
            format: "money",
            currencyField: "currency",
          },
          {
            name: "currency",
            label: fallback("common.currency", "币种"),
          },
          {
            name: "transport_type",
            label: fallback(
              "applicationDetail.travel.fieldTransportType",
              "交通工具",
            ),
            options: {
              train: fallback(
                "applicationDetail.travel.optionsTransportType.train",
                "火车",
              ),
            },
          },
          {
            name: "hotel_needed",
            label: fallback(
              "applicationDetail.travel.fieldHotelNeeded",
              "需要酒店",
            ),
            format: "boolean",
          },
          {
            name: "submitted_at",
            label: fallback("common.submitTime", "提交时间"),
            format: "datetime",
          },
          {
            name: "remark",
            label: fallback("common.remark", "备注"),
            span: 2,
          },
        ],
      },
    ],
    modules: [
      documentModule,
      relationsModule,
      attachmentsModule,
      workflowModule,
    ],
  },
};
