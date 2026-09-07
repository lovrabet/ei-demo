/**
 * CPO 业务类型元数据（纯数据，无副作用）。
 *
 * [脚本描述] 维护 bizType -> 物理表与业务展示字段映射；数据集由平台按物理表解析
 * [脚本名称] cpoDatasetMap
 * [脚本类型] COMMON
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoDatasetMap.js
 * [依赖数据集] 无
 * [调用 BF] 无
 * [执行 SQL] 无
 * [副作用] 无
 *
 * @param {Object} params 无需入参（保留占位以便 bff.execute 统一调用）
 * @param {Object} context 平台注入上下文（本脚本不使用）
 * @returns {Promise<{BIZ_TYPE_TO_DATASET: Object}>} 业务类型元数据
 */
export default async function cpoDatasetMap(params, context) {
  const BIZ_TYPE_TO_DATASET = {
    crm_contract: {
      bizType: "crm_contract",
      tableName: "crm_contract",
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
      tableName: "expense_application",
      titleField: "title",
      statusField: "status",
      amountField: "reimbursable_cny_amount",
      applicantField: "applicant_name_snapshot",
      updatedField: "updated_at",
      createdField: "created_at",
      hasSubmittedAt: true,
    },
    contract: {
      bizType: "contract",
      tableName: "contract_application",
      titleField: "contract_name",
      statusField: "status",
      amountField: "amount",
      applicantField: "applicant_name_snapshot",
      updatedField: "updated_at",
      businessUpdatedField: "lifecycle_updated_at",
      createdField: "created_at",
      hasSubmittedAt: true,
      signedAtField: "signed_at",
    },
    payment: {
      bizType: "payment",
      tableName: "payment_application",
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
      tableName: "salary_payment_application",
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
      tableName: "invoice_record",
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
      tableName: "invoice_application",
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
      tableName: "travel_application",
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
      tableName: "quote_header",
      titleField: "quote_title",
      statusField: "status",
      amountField: "total_amount",
      updatedField: "updated_at",
      createdField: "created_at",
      hasSubmittedAt: false,
    },
    legal_agreement: {
      bizType: "legal_agreement",
      tableName: "legal_agreement",
      titleField: "agreement_title",
      statusField: "status",
      updatedField: "updated_at",
      createdField: "created_at",
      hasSubmittedAt: false,
    },
    crm_customer: {
      bizType: "crm_customer",
      tableName: "quote_customer",
      titleField: "customer_name",
      updatedField: "updated_at",
      createdField: "created_at",
      hasSubmittedAt: false,
    },
  };

  return { BIZ_TYPE_TO_DATASET };
}
