/**
 * CPO 数据集编码与业务类型映射（纯数据，无副作用）。
 *
 * [脚本描述] 维护 CPO 数据集 code、dataset_<code> 模型键约定、bizType -> 主单元信息映射
 * [脚本名称] cpoDatasetMap
 * [脚本类型] COMMON
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoDatasetMap.js
 *
 * @param {Object} params - 无需入参（保留占位以便 bff.execute 统一调用）。
 * @param {Object} context - 平台注入上下文（本脚本不使用）。
 * @returns {Promise<Object>} { DATASET_CODES, BIZ_TYPE_TO_DATASET, TABLE_TO_MODEL_KEY, SQL_CODES }。
 *   TABLE_TO_MODEL_KEY 用物理表名作为稳定业务语义键，屏蔽不同应用 dataset code 差异，便于模板化复用。
 *   SQL_CODES 用语义名屏蔽 sql code，避免 BFF 中硬编码 uuid。
 */
export default async function cpoDatasetMap(params, context) {
  const DATASET_CODES = {
    bizTask: "da9cddc0fd244545b94ae7cddfde21ea", // 数据集: 业务任务 | 数据表: biz_task
    bizRelation: "1a4139b6d59a493ea89111d936e27238", // 数据集: 业务关系 | 数据表: biz_relation
    bizActionRecord: "65619b5104e44f03b0dcea52b4d8c397", // 数据集: 业务操作日志 | 数据表: biz_action_record
    workflowStepConfig: "e541dc67b0b1410998c8c9c645f06f83", // 数据集: 工作流配置 | 数据表: cpo_workflow_step_config
    workflowActionConfig: "d3e59fb7cdf943e8af7e6edee5586cdd", // 数据集: 工作流动作配置 | 数据表: cpo_workflow_action_config
    workflowParticipant: "464ca3622eab43a3a4b4b4f23af26a8c", // 数据集: 工作流参与者 | 数据表: cpo_workflow_participant
    paymentApplication: "7da208a5059b4b13896d7c7ae29c8492", // 数据集: 付款申请 | 数据表: payment_application
    contractPaymentPlan: "08e17d8ba3a24e938fef89816c8f4ccb", // 数据集: 合同付款计划 | 数据表: contract_payment_plan
    salaryPaymentApplication: "235e11a9cb7945c8926b4d31fe64843f", // 数据集: 薪资发放申请 | 数据表: salary_payment_application
    salaryPaymentItem: "19ef166f3d2242a19911ccb8a5685bb8", // 数据集: 工资支付明细 | 数据表: salary_payment_item
    companyCredential: "b4a72c4ca0984102aba03a393063ba65", // 数据集: 公司资质 | 数据表: company_credential
    bizInvoiceLink: "9dd0d102219145ddbb67d1c247a84fb9", // 数据集: 发票关联 | 数据表: biz_invoice_link
    invoiceRecord: "fc11e2d760b94b2ca2ccf0485ed40ca8", // 数据集: 发票记录 | 数据表: invoice_record
    invoiceApplication: "ae51202c44e140828ba87e4571094d1a", // 数据集: 销项开票申请 | 数据表: invoice_application
    invoiceApplicationFulfillment: "392bcb15b9124da69bb8329eb5c4ecf2", // 数据集: 开票履约关系 | 数据表: invoice_application_fulfillment
    receivableInvoiceAllocation: "c8962eed35894816b4d7462986037299", // 数据集: 发票收款分摊 | 数据表: receivable_invoice_allocation
    contractApplication: "53869993f80f45ae8ef6cdf051d8e355", // 数据集: 合同申请 | 数据表: contract_application
    businessPartner: "68c70907e27c481cbefb96dd3906936e", // 数据集: 商业伙伴 | 数据表: business_partner
    crmCompany: "c095e4a857dd41bd9ef182617e9d634c", // 数据集: 客户公司 | CRM 数据表: crm_company
    crmContact: "a7f95d3929fe4c9fa0fb0fd863d1d4e6", // 数据集: 公司联系人 | CRM 数据表: crm_contact
    crmContract: "804e3a5ed3224074be329b9ed4799cc3", // 数据集: 客户收款合同 | CRM 数据表: crm_contract
    crmCustomerStatus: "3ac96b88e94249efb72f124e6d63a4e4", // 数据集: 客户状态字典 | CRM 数据表: crm_customer_status
    crmOpportunity: "07988c72b6754850b85aa75fdbbdb7e4", // 数据集: 销售机会 | CRM 数据表: crm_opportunity
    crmFollowUp: "ea8bb8be752b4d7685b3e341e559be9f", // 数据集: 跟进记录 | CRM 数据表: crm_follow_up
    crmOpportunityContact: "4f1b7c4a839f499497fa6a470538738c", // 数据集: 商机联系人 | CRM 数据表: crm_opportunity_contact
    crmOpportunityStage: "32c7c1597ba04cd69ae127b28473f624", // 数据集: 销售阶段 | CRM 数据表: crm_opportunity_stage
    crmReceivablePlan: "c4c7c35bfe244a78b08667e649b05640", // 数据集: 客户合同收款计划 | CRM 数据表: crm_contract_receivable_plan
    customerReceipt: "3397588fc01d446486b72b84960f3059", // 数据集: 客户回款记录 | 数据表: customer_receipt
    customerReceiptAllocation: "f6a08809699b437a830fcf96584d834a", // 数据集: 回款核销分配 | 数据表: customer_receipt_allocation
    travelApplication: "28494f18f334400c893576b6e168d3f6", // 数据集: 差旅申请 | 数据表: travel_application
    expenseItem: "d99c32ef07b749948cc24fd391f8fd2c", // 数据集: 报销明细 | 数据表: expense_item
    expenseRule: "d60179efd37846e380aafdd166a02871", // 数据集: 报销规则 | 数据表: expense_rule
    expenseApplication: "7851365c96244a1896e834daec447ddb", // 数据集: 报销申请 | 数据表: expense_application
    attachment: "ab17964f0efd46f78cecb4969140f257", // 数据集: 附件信息 | 数据表: attachment
    internalLegalEntity: "ab563bb9148947bfb751f8c1aff0d5c7", // 数据集: 我方主体 | 数据表: internal_legal_entity
    dictionary: "ecebe4f9726b46ccb19aaca00aa93dd0", // 数据集: 业务字典 | 数据表: cpo_dictionary
    quoteHeader: "f81a3a50b05544e3868b0f51add02b3d", // 数据集: 报价头 | 数据表: quote_header
    quoteCustomer: "8c5751592b664eb38b75f37f9a7ac7ba", // 数据集: 报价客户 | 数据表: quote_customer
    legalAgreement: "afcc8ccb0815418397fcbb5b5682a0c2", // 数据集: 法务协议 | 数据表: legal_agreement
  };

  // bizType -> 主单数据集元信息；标题/状态/金额/申请人/时间均为真实列名（来自 dataset detail）
  const BIZ_TYPE_TO_DATASET = {
    crm_contract: {
      bizType: "crm_contract",
      datasetCode: DATASET_CODES.crmContract,
      modelKey: `dataset_${DATASET_CODES.crmContract}`,
      titleField: "title",
      statusField: "sign_status",
      amountField: "amount",
      applicantField: "applicant_name_snapshot",
      updatedField: "updated_at",
      createdField: "created_at",
      hasSubmittedAt: true,
      workflowManagedField: "workflow_managed",
      signedAtField: "signed_date",
      signedAtDateOnly: true,
    },
    expense: {
      bizType: "expense",
      datasetCode: DATASET_CODES.expenseApplication,
      modelKey: `dataset_${DATASET_CODES.expenseApplication}`,
      titleField: "title",
      statusField: "status",
      // 报销列表统一展示最终实际可报销金额，而非票据金额汇总。
      amountField: "reimbursable_cny_amount",
      applicantField: "applicant_name_snapshot",
      updatedField: "updated_at",
      createdField: "created_at",
      hasSubmittedAt: true,
    },
    contract: {
      bizType: "contract",
      datasetCode: DATASET_CODES.contractApplication,
      modelKey: `dataset_${DATASET_CODES.contractApplication}`,
      titleField: "contract_name",
      statusField: "status",
      amountField: "amount",
      applicantField: "applicant_name_snapshot",
      updatedField: "updated_at",
      // 合同履约字段维护会刷新数据库 updated_at；列表应展示真实业务流程时间。
      businessUpdatedField: "lifecycle_updated_at",
      createdField: "created_at",
      hasSubmittedAt: true,
      signedAtField: "signed_at",
    },
    payment: {
      bizType: "payment",
      datasetCode: DATASET_CODES.paymentApplication,
      modelKey: `dataset_${DATASET_CODES.paymentApplication}`,
      titleField: "title",
      statusField: "status",
      amountField: "amount",
      applicantField: "applicant_name_snapshot",
      updatedField: "updated_at",
      createdField: "created_at",
      hasSubmittedAt: true,
    },
    salary_payment: {
      bizType: "salary_payment",
      datasetCode: DATASET_CODES.salaryPaymentApplication,
      modelKey: `dataset_${DATASET_CODES.salaryPaymentApplication}`,
      titleField: "title",
      statusField: "status",
      amountField: "amount",
      applicantField: "applicant_name_snapshot",
      updatedField: "updated_at",
      createdField: "created_at",
      hasSubmittedAt: true,
    },
    invoice: {
      bizType: "invoice",
      datasetCode: DATASET_CODES.invoiceRecord,
      modelKey: `dataset_${DATASET_CODES.invoiceRecord}`,
      titleField: "invoice_title",
      fallbackTitleFields: [
        "invoice_no",
        "partner_name_snapshot",
        "seller_name",
        "buyer_name",
      ],
      statusField: "status",
      amountField: "total_amount",
      applicantField: "applicant_name_snapshot",
      updatedField: "updated_at",
      createdField: "created_at",
      hasSubmittedAt: true,
    },
    invoice_application: {
      bizType: "invoice_application",
      datasetCode: DATASET_CODES.invoiceApplication,
      modelKey: `dataset_${DATASET_CODES.invoiceApplication}`,
      titleField: "application_title",
      fallbackTitleFields: [
        "application_no",
        "customer_name_snapshot",
        "contract_title_snapshot",
      ],
      statusField: "status",
      amountField: "requested_total_amount",
      applicantField: "applicant_name_snapshot",
      updatedField: "updated_at",
      createdField: "created_at",
      hasSubmittedAt: true,
    },
    travel: {
      bizType: "travel",
      datasetCode: DATASET_CODES.travelApplication,
      modelKey: `dataset_${DATASET_CODES.travelApplication}`,
      titleField: "title",
      statusField: "status",
      amountField: "estimated_amount",
      applicantField: "applicant_name_snapshot",
      updatedField: "updated_at",
      createdField: "created_at",
      hasSubmittedAt: true,
    },
    quote: {
      bizType: "quote",
      datasetCode: DATASET_CODES.quoteHeader,
      modelKey: `dataset_${DATASET_CODES.quoteHeader}`,
      titleField: "quote_title",
      statusField: "status",
      amountField: "total_amount",
      updatedField: "updated_at",
      createdField: "created_at",
      hasSubmittedAt: false,
    },
    legal_agreement: {
      bizType: "legal_agreement",
      datasetCode: DATASET_CODES.legalAgreement,
      modelKey: `dataset_${DATASET_CODES.legalAgreement}`,
      titleField: "agreement_title",
      statusField: "status",
      updatedField: "updated_at",
      createdField: "created_at",
      hasSubmittedAt: false,
    },
    crm_customer: {
      bizType: "crm_customer",
      datasetCode: DATASET_CODES.quoteCustomer,
      modelKey: `dataset_${DATASET_CODES.quoteCustomer}`,
      titleField: "customer_name",
      updatedField: "updated_at",
      createdField: "created_at",
      hasSubmittedAt: false,
    },
  };

  // 物理表名 -> modelKey 的稳定映射，屏蔽 dataset code 的应用级差异。
  // 模板被 clone 到新应用后，只要物理表名约定不变，BFF 代码无需改动。
  const TABLE_TO_MODEL_KEY = {
    attachment: `dataset_${DATASET_CODES.attachment}`,
    biz_action_record: `dataset_${DATASET_CODES.bizActionRecord}`,
    biz_invoice_link: `dataset_${DATASET_CODES.bizInvoiceLink}`,
    biz_relation: `dataset_${DATASET_CODES.bizRelation}`,
    biz_task: `dataset_${DATASET_CODES.bizTask}`,
    business_partner: `dataset_${DATASET_CODES.businessPartner}`,
    company_credential: `dataset_${DATASET_CODES.companyCredential}`,
    contract_application: `dataset_${DATASET_CODES.contractApplication}`,
    contract_payment_plan: `dataset_${DATASET_CODES.contractPaymentPlan}`,
    cpo_dictionary: `dataset_${DATASET_CODES.dictionary}`,
    cpo_workflow_action_config: `dataset_${DATASET_CODES.workflowActionConfig}`,
    cpo_workflow_participant: `dataset_${DATASET_CODES.workflowParticipant}`,
    cpo_workflow_step_config: `dataset_${DATASET_CODES.workflowStepConfig}`,
    crm_company: `dataset_${DATASET_CODES.crmCompany}`,
    crm_contact: `dataset_${DATASET_CODES.crmContact}`,
    crm_contract: `dataset_${DATASET_CODES.crmContract}`,
    crm_contract_receivable_plan: `dataset_${DATASET_CODES.crmReceivablePlan}`,
    crm_customer_status: `dataset_${DATASET_CODES.crmCustomerStatus}`,
    crm_follow_up: `dataset_${DATASET_CODES.crmFollowUp}`,
    crm_opportunity: `dataset_${DATASET_CODES.crmOpportunity}`,
    crm_opportunity_contact: `dataset_${DATASET_CODES.crmOpportunityContact}`,
    crm_opportunity_stage: `dataset_${DATASET_CODES.crmOpportunityStage}`,
    customer_receipt: `dataset_${DATASET_CODES.customerReceipt}`,
    customer_receipt_allocation: `dataset_${DATASET_CODES.customerReceiptAllocation}`,
    expense_application: `dataset_${DATASET_CODES.expenseApplication}`,
    expense_item: `dataset_${DATASET_CODES.expenseItem}`,
    expense_rule: `dataset_${DATASET_CODES.expenseRule}`,
    internal_legal_entity: `dataset_${DATASET_CODES.internalLegalEntity}`,
    invoice_application: `dataset_${DATASET_CODES.invoiceApplication}`,
    invoice_application_fulfillment: `dataset_${DATASET_CODES.invoiceApplicationFulfillment}`,
    invoice_record: `dataset_${DATASET_CODES.invoiceRecord}`,
    legal_agreement: `dataset_${DATASET_CODES.legalAgreement}`,
    payment_application: `dataset_${DATASET_CODES.paymentApplication}`,
    quote_customer: `dataset_${DATASET_CODES.quoteCustomer}`,
    quote_header: `dataset_${DATASET_CODES.quoteHeader}`,
    receivable_invoice_allocation: `dataset_${DATASET_CODES.receivableInvoiceAllocation}`,
    salary_payment_application: `dataset_${DATASET_CODES.salaryPaymentApplication}`,
    salary_payment_item: `dataset_${DATASET_CODES.salaryPaymentItem}`,
    travel_application: `dataset_${DATASET_CODES.travelApplication}`,
  };

  // 语义名 -> sql code，避免 BFF 中硬编码 uuid。
  const SQL_CODES = {
    customer360List: "4d050189-2a63c18c",
    workbenchDashboard: "4d050189-a33eb743",
    contractCenterCrmContracts: "4d050189-316a4851",
  };

  return { DATASET_CODES, BIZ_TYPE_TO_DATASET, TABLE_TO_MODEL_KEY, SQL_CODES };
}
