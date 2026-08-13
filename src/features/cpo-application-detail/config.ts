import type {
  ApplicationDetailConfig,
  CpoApplicationBizType,
  Document360ModuleDefinition,
} from "./types";

export const DETAIL_DESCRIPTION_COLUMNS = {
  xs: 1,
  sm: 2,
  md: 2,
  lg: 2,
  xl: 2,
  xxl: 2,
} as const;

export const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  submitted: "已提交",
  approved: "已通过",
  completed: "已完成",
  reviewed: "已审核",
  rejected: "审批驳回",
  signed: "已签署",
  archived: "已完成",
  voucher_created: "财务已制单",
  bank_review_pending: "网银待复核",
  bank_pending: "银行处理中",
  paid_confirmed: "已支付",
  payment_failed: "付款失败",
  pending: "待提交",
  used: "已使用",
  invalid: "无效",
  cancelled: "已作废",
};

export const TASK_TYPE_LABELS: Record<string, string> = {
  review: "审核",
  cc: "抄送",
  create_voucher: "制单",
  pay: "付款",
  bank_review: "网银复核",
  confirm: "确认",
  sign: "签署合同",
  archive: "历史归档",
  supplement_material: "补充材料",
};

export const ROLE_LABELS: Record<string, string> = {
  applicant: "申请人",
  reviewer: "审核员",
  cc: "抄送人",
  voucher_creator: "凭证创建员",
  payer: "付款员",
  confirmer: "确认人",
  admin: "管理员",
};

export const ACTION_LABELS: Record<string, string> = {
  submit: "提交",
  review_pass: "审核通过",
  review_reject: "审核驳回",
  cc_notify: "流程抄送",
  create_voucher: "完成制单",
  prepare_bank_order: "完成网银制单",
  submit_to_bank: "网银复核并提交",
  confirm_paid: "确认付款",
  confirm_legacy_paid: "按历史凭据确认为已支付",
  mark_payment_failed: "标记付款失败",
  sign: "确认签署完成",
  archive: "流程完成（历史）",
  withdraw: "撤回",
  cancel: "作废",
  print_summary_requested: "发起打印一页摘要",
  print_full_requested: "发起打印完整归档件",
  print_confirmed: "确认纸质打印完成",
  print_confirmation_revoked: "撤销打印确认",
};

export const ATTACHMENT_TYPE_LABELS: Record<string, string> = {
  invoice: "发票",
  invoice_application_material: "开票材料",
  contract_file: "合同文件",
  credential: "凭证",
  bank_receipt: "银行回单",
  approval_material: "审批材料",
  payroll_sheet: "工资发放表",
  other: "其他",
};

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  flight: "机票",
  hotel: "酒店",
  taxi: "出租车",
  train: "火车",
  meal: "餐饮",
  other: "其他",
};

export const COMPLIANCE_LABELS: Record<string, string> = {
  pending_review: "待审核",
  compliant: "合规",
  offset_required: "需抵扣",
  offset_provided: "已提供抵扣",
  non_compliant: "不合规",
};

export const OUR_ROLE_LABELS: Record<string, string> = {
  party_a: "甲方",
  party_b: "乙方",
};

const documentModule: Document360ModuleDefinition = {
  key: "document",
  label: "单据信息",
  area: "main",
  showWhenEmpty: true,
};

const executiveSummaryModule: Document360ModuleDefinition = {
  key: "executiveSummary",
  label: "经营摘要",
  area: "main",
};

const relatedDocumentsModule: Document360ModuleDefinition = {
  key: "relatedDocuments",
  label: "关联单据",
  area: "main",
};

const relationsModule: Document360ModuleDefinition = {
  key: "relations",
  label: "业务关系",
  area: "aside",
};

const attachmentsModule: Document360ModuleDefinition = {
  key: "attachments",
  label: "资料与附件",
  area: "full",
  showWhenEmpty: true,
};

const workflowModule: Document360ModuleDefinition = {
  key: "workflow",
  label: "流程与动态",
  area: "full",
  showWhenEmpty: true,
};

export const APPLICATION_DETAIL_CONFIG: Record<
  CpoApplicationBizType,
  ApplicationDetailConfig
> = {
  expense: {
    label: "报销申请",
    editPath: (id) => `/expense-form?id=${id}`,
    maxWidth: 1320,
    amountField: "reimbursable_cny_amount",
    currencyField: "payout_currency",
    sections: [
      {
        title: "申请信息",
        fields: [
          { name: "title", label: "报销标题" },
          { name: "applicant_name_snapshot", label: "申请人" },
          {
            name: "expense_type_label",
            label: "费用类型",
          },
          {
            name: "travel_type",
            label: "出差类型",
            options: { domestic: "国内", overseas: "海外" },
          },
          { name: "status", label: "状态", options: STATUS_LABELS },
          { name: "submitted_at", label: "提交时间", format: "datetime" },
        ],
      },
      {
        title: "金额与支付",
        fields: [
          {
            name: "total_original_amount",
            label: "原始总金额",
            format: "money",
            currencyField: "payout_currency",
          },
          { name: "total_cny_amount", label: "人民币总额", format: "money" },
          {
            name: "reimbursable_cny_amount",
            label: "可报销金额",
            format: "money",
          },
          { name: "payout_currency", label: "支付币种" },
          { name: "remark", label: "备注", span: 2 },
        ],
      },
      {
        title: "银行处理",
        fields: [
          {
            name: "bank_status",
            label: "银行状态",
            options: {
              not_submitted: "待网银制单",
              bank_review_pending: "网银待复核",
              bank_pending: "银行处理中",
              paid_confirmed: "已支付",
              payment_failed: "付款失败",
            },
          },
          {
            name: "bank_submitted_at",
            label: "提交银行时间",
            format: "datetime",
          },
          {
            name: "bank_confirmed_at",
            label: "确认付款时间",
            format: "datetime",
          },
          { name: "bank_confirmed_by_name_snapshot", label: "确认人" },
          { name: "last_action_at", label: "最后操作时间", format: "datetime" },
        ],
      },
    ],
    modules: [
      executiveSummaryModule,
      documentModule,
      {
        key: "expenseItems",
        label: "报销明细",
        area: "main",
        showWhenEmpty: true,
      },
      {
        key: "invoiceLinks",
        label: "关联发票",
        area: "main",
        showWhenEmpty: true,
      },
      relatedDocumentsModule,
      attachmentsModule,
      workflowModule,
    ],
  },
  invoice: {
    label: "发票",
    editPath: (id) => `/invoice-form?id=${id}`,
    maxWidth: 1320,
    amountField: "total_amount",
    currencyField: "currency",
    sections: [
      {
        title: "发票信息",
        fields: [
          { name: "invoice_title", label: "发票标题" },
          {
            name: "request_type",
            label: "记录类型",
            options: {
              customer_invoice: "客户发票",
              service_provider_invoice: "供应商发票",
            },
          },
          {
            name: "invoice_direction",
            label: "发票方向",
            options: { incoming: "对方开给我们", outgoing: "我们开给对方" },
          },
          {
            name: "invoice_purpose",
            label: "发票用途",
            options: {
              reimbursement: "员工报销",
              procurement: "采购/供应商",
              contract_payment: "合同付款核销",
              customer_billing: "客户开票",
              other: "其他",
            },
          },
          { name: "applicant_name_snapshot", label: "申请人" },
          { name: "status", label: "状态", options: STATUS_LABELS },
          {
            name: "partner_source",
            label: "合作方来源",
            options: {
              crm_customer: "CRM 客户",
              business_partner: "业务伙伴",
              manual: "仅记录名称",
            },
          },
          { name: "partner_name_snapshot", label: "合作方" },
          { name: "contract_id", label: "关联合同" },
          { name: "submitted_at", label: "提交时间", format: "datetime" },
        ],
      },
      {
        title: "票面与金额",
        fields: [
          { name: "invoice_no", label: "发票号码" },
          { name: "invoice_date", label: "发票日期", format: "date" },
          {
            name: "invoice_region",
            label: "发票区域",
            options: {
              mainland_china: "中国大陆",
              overseas: "海外",
              unknown: "未知",
            },
          },
          {
            name: "invoice_type",
            label: "发票类型",
            options: {
              vat_special: "增值税专用发票",
              vat_normal: "增值税普通发票",
              e_ticket: "电子票据",
              receipt: "收据",
              other: "其他",
            },
          },
          {
            name: "amount",
            label: "不含税金额",
            format: "money",
            currencyField: "currency",
          },
          { name: "tax_rate", label: "税率", format: "percent" },
          {
            name: "tax_amount",
            label: "税额",
            format: "money",
            currencyField: "currency",
          },
          {
            name: "total_amount",
            label: "价税合计",
            format: "money",
            currencyField: "currency",
          },
          { name: "currency", label: "币种" },
          { name: "invoice_content", label: "开票内容", span: 2 },
        ],
      },
      {
        title: "购买方与接收信息",
        fields: [
          { name: "buyer_name", label: "购买方名称" },
          { name: "buyer_tax_no", label: "购买方税号" },
          { name: "buyer_address_phone", label: "地址电话", span: 2 },
          { name: "buyer_bank_account", label: "银行账户", span: 2 },
          {
            name: "invoice_medium",
            label: "发票介质",
            options: { electronic: "电子", paper: "纸质", other: "其他" },
          },
          { name: "receiver_name", label: "接收人" },
          { name: "receiver_phone", label: "接收电话" },
          { name: "receiver_email", label: "接收邮箱" },
          { name: "remark", label: "备注", span: 2 },
        ],
      },
    ],
    modules: [
      executiveSummaryModule,
      documentModule,
      {
        key: "paymentPlans",
        label: "关联合同付款计划",
        area: "main",
      },
      relatedDocumentsModule,
      relationsModule,
      attachmentsModule,
      workflowModule,
    ],
  },
  invoice_application: {
    label: "销项开票申请",
    editPath: (id) => `/invoice-form?id=${id}`,
    maxWidth: 1320,
    amountField: "requested_total_amount",
    currencyField: "currency",
    sections: [
      {
        title: "申请信息",
        fields: [
          { name: "application_no", label: "申请编号" },
          { name: "application_title", label: "申请标题" },
          { name: "applicant_name_snapshot", label: "申请人" },
          { name: "customer_name_snapshot", label: "客户" },
          { name: "contract_title_snapshot", label: "销售合同" },
          { name: "status", label: "状态", options: STATUS_LABELS },
          { name: "submitted_at", label: "提交时间", format: "datetime" },
        ],
      },
      {
        title: "拟开票金额",
        fields: [
          {
            name: "requested_amount",
            label: "不含税金额",
            format: "money",
            currencyField: "currency",
          },
          { name: "tax_rate", label: "税率", format: "percent" },
          {
            name: "requested_tax_amount",
            label: "税额",
            format: "money",
            currencyField: "currency",
          },
          {
            name: "requested_total_amount",
            label: "价税合计",
            format: "money",
            currencyField: "currency",
          },
          { name: "currency", label: "币种" },
          { name: "invoice_content", label: "开票内容", span: 2 },
          {
            name: "payment_condition_snapshot",
            label: "收款前置条件",
            span: 2,
          },
        ],
      },
      {
        title: "购销与接收信息",
        fields: [
          { name: "seller_name", label: "销售方名称" },
          { name: "buyer_name", label: "购买方名称" },
          { name: "buyer_tax_no", label: "购买方税号" },
          { name: "buyer_address_phone", label: "购买方地址电话", span: 2 },
          { name: "buyer_bank_account", label: "购买方银行账户", span: 2 },
          {
            name: "invoice_type",
            label: "发票类型",
            options: {
              vat_special: "增值税专用发票",
              vat_normal: "增值税普通发票",
              other: "其他",
            },
          },
          {
            name: "invoice_medium",
            label: "交付形式",
            options: { electronic: "电子", paper: "纸质", other: "其他" },
          },
          { name: "receiver_name", label: "收票人" },
          { name: "receiver_phone", label: "收票手机号" },
          { name: "receiver_email", label: "收票邮箱" },
          { name: "remark", label: "备注", span: 2 },
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
    label: "合同申请",
    editPath: (id) => `/contract-form?id=${id}`,
    maxWidth: 1320,
    amountField: "amount",
    currencyField: "currency",
    sections: [
      {
        title: "合同信息",
        fields: [
          { name: "contract_name", label: "合同名称" },
          {
            name: "contract_type",
            label: "合同业务类型",
            options: {
              sales: "销售合同",
              procurement: "采购合同",
              service: "服务合同",
              rent: "租赁合同",
              hr: "人力合同",
              certification: "认证合同",
              other: "其他合同",
            },
          },
          {
            name: "direction",
            label: "资金方向",
            options: {
              receivable: "收款合同（我们服务客户）",
              payable: "付款合同（供应商服务我们）",
              outbound: "收款合同（历史值）",
              inbound: "付款合同（历史值）",
            },
          },
          { name: "our_role", label: "我方角色", options: OUR_ROLE_LABELS },
          {
            name: "payment_requirement",
            label: "付款要求",
            options: {
              required: "需要付款",
              not_required: "无需付款",
              unknown: "待确认",
            },
          },
          { name: "partner_id", label: "合作方" },
          { name: "status", label: "状态", options: STATUS_LABELS },
          { name: "submitted_at", label: "提交时间", format: "datetime" },
          {
            name: "lifecycle_status",
            label: "履约状态",
            options: {
              pending_signature: "待签署",
              signed: "已签署",
              in_progress: "进行中",
              completed: "已完成",
            },
          },
          {
            name: "amount",
            label: "合同金额",
            format: "money",
            currencyField: "currency",
          },
          { name: "currency", label: "币种" },
          { name: "start_date", label: "开始日期", format: "date" },
          { name: "end_date", label: "结束日期", format: "date" },
          { name: "signed_at", label: "签署时间", format: "datetime" },
        ],
      },
      {
        title: "经办信息",
        fields: [
          { name: "applicant_name_snapshot", label: "申请人" },
          { name: "liaison_name_snapshot", label: "联络人" },
          { name: "remark", label: "备注", span: 2 },
        ],
      },
      {
        title: "合同评价与注意事项",
        fields: [
          {
            name: "contract_assessment",
            label: "合同专家结论",
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
        label: "付款计划",
        area: "main",
        showWhenEmpty: true,
      },
      {
        key: "invoiceLinks",
        label: "关联发票",
        area: "main",
      },
      relatedDocumentsModule,
      relationsModule,
      attachmentsModule,
      workflowModule,
    ],
  },
  payment: {
    label: "付款申请",
    editPath: (id) => `/payment-form?id=${id}`,
    maxWidth: 1320,
    amountField: "amount",
    currencyField: "currency",
    sections: [
      {
        title: "付款信息",
        fields: [
          { name: "title", label: "付款标题" },
          {
            name: "payment_type",
            label: "付款类型",
            options: { vendor_payment: "供应商付款" },
          },
          { name: "partner_id", label: "合作方" },
          { name: "contract_id", label: "关联合同" },
          { name: "status", label: "状态", options: STATUS_LABELS },
          { name: "submitted_at", label: "提交时间", format: "datetime" },
          {
            name: "amount",
            label: "付款金额",
            format: "money",
            currencyField: "currency",
          },
          { name: "currency", label: "币种" },
          { name: "expected_pay_date", label: "预期付款日", format: "date" },
          { name: "applicant_name_snapshot", label: "申请人" },
          { name: "liaison_name_snapshot", label: "联络人" },
        ],
      },
      {
        title: "付款阶段",
        fields: [
          { name: "payment_phase_no", label: "阶段号" },
          { name: "payment_phase_name", label: "阶段名称" },
          { name: "total_phase_count", label: "总阶段数" },
          { name: "phase_trigger_condition", label: "触发条件", span: 2 },
        ],
      },
      {
        title: "银行处理",
        fields: [
          {
            name: "bank_status",
            label: "银行状态",
            options: {
              not_submitted: "待网银制单",
              bank_review_pending: "网银待复核",
              bank_pending: "银行处理中",
              paid_confirmed: "已支付",
              payment_failed: "付款失败",
            },
          },
          { name: "bank_account_snapshot", label: "银行账户", span: 2 },
          {
            name: "bank_submitted_at",
            label: "提交银行时间",
            format: "datetime",
          },
          {
            name: "bank_confirmed_at",
            label: "确认付款时间",
            format: "datetime",
          },
          { name: "bank_confirmed_by_name_snapshot", label: "确认人" },
          { name: "current_owner_name_snapshot", label: "当前负责人" },
          { name: "last_action_at", label: "最后操作时间", format: "datetime" },
          { name: "remark", label: "备注", span: 2 },
        ],
      },
    ],
    modules: [
      executiveSummaryModule,
      documentModule,
      {
        key: "paymentPlans",
        label: "合同付款全景",
        area: "main",
      },
      {
        key: "invoiceLinks",
        label: "发票覆盖",
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
    label: "工资付款申请",
    editPath: (id) => `/salary-payment-form?id=${id}`,
    maxWidth: 1320,
    amountField: "amount",
    currencyField: "currency",
    sections: [
      {
        title: "工资付款信息",
        fields: [
          { name: "title", label: "付款事由", span: 2 },
          { name: "applicant_name_snapshot", label: "申请人" },
          { name: "status", label: "状态", options: STATUS_LABELS },
          { name: "submitted_at", label: "提交时间", format: "datetime" },
          { name: "payroll_month", label: "工资月份", format: "date" },
          {
            name: "employee_count",
            label: "合计发薪人数",
          },
          {
            name: "amount",
            label: "付款总额",
            format: "money",
            currencyField: "currency",
          },
          { name: "expected_pay_date", label: "付款日期", format: "date" },
          { name: "remark", label: "备注", span: 2 },
        ],
      },
      {
        title: "银行处理",
        fields: [
          {
            name: "bank_status",
            label: "银行状态",
            options: {
              not_submitted: "待网银制单",
              bank_review_pending: "网银待复核",
              bank_pending: "银行处理中",
              paid_confirmed: "已支付",
              payment_failed: "付款失败",
            },
          },
          {
            name: "bank_submitted_at",
            label: "提交银行时间",
            format: "datetime",
          },
          {
            name: "bank_confirmed_at",
            label: "确认付款时间",
            format: "datetime",
          },
          {
            name: "bank_confirmed_by_name_snapshot",
            label: "确认人",
          },
          { name: "current_owner_name_snapshot", label: "当前负责人" },
          {
            name: "last_action_at",
            label: "最后操作时间",
            format: "datetime",
          },
        ],
      },
    ],
    modules: [
      documentModule,
      {
        key: "salaryItems",
        label: "付款明细",
        area: "main",
        showWhenEmpty: true,
      },
      attachmentsModule,
      workflowModule,
    ],
  },
  travel: {
    label: "差旅申请",
    editPath: (id) => `/travel-form?id=${id}`,
    maxWidth: 1320,
    amountField: "estimated_amount",
    currencyField: "currency",
    sections: [
      {
        title: "行程信息",
        fields: [
          { name: "title", label: "差旅标题" },
          {
            name: "travel_type",
            label: "差旅类型",
            options: { business: "商务出差" },
          },
          {
            name: "trip_region",
            label: "出差区域",
            options: { domestic: "国内", overseas: "海外" },
          },
          { name: "status", label: "状态", options: STATUS_LABELS },
          { name: "origin_city", label: "出发城市" },
          { name: "destination_city", label: "目的城市" },
          { name: "start_date", label: "开始日期", format: "date" },
          { name: "end_date", label: "结束日期", format: "date" },
          { name: "travel_reason", label: "出差原因", span: 2 },
        ],
      },
      {
        title: "人员与项目",
        fields: [
          { name: "applicant_name_snapshot", label: "申请人" },
          { name: "companions_json", label: "同行人", format: "companions" },
          { name: "project_name", label: "项目名称" },
          { name: "partner_id", label: "合作方" },
        ],
      },
      {
        title: "预算与安排",
        fields: [
          {
            name: "estimated_amount",
            label: "预估金额",
            format: "money",
            currencyField: "currency",
          },
          { name: "currency", label: "币种" },
          {
            name: "transport_type",
            label: "交通工具",
            options: { train: "火车" },
          },
          { name: "hotel_needed", label: "需要酒店", format: "boolean" },
          { name: "submitted_at", label: "提交时间", format: "datetime" },
          { name: "remark", label: "备注", span: 2 },
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
