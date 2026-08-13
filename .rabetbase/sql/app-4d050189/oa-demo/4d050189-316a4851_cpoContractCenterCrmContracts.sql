-- @lovrabet.sqlCode: 4d050189-316a4851
-- @lovrabet.sqlName: cpoContractCenterCrmContracts
-- @lovrabet.dbId: 10384
-- @lovrabet.dbName: oa-demo
-- @lovrabet.mode: sql
-- @lovrabet.syncedAt: 2026-08-11T11:04:54.454Z

-- 合同工作台 CRM 收款合同列表：合同 LEFT JOIN 客户公司取 company_name。
-- 替代原先 crmContract filter + crmCompany 全表扫描两次调用。
-- 日期/时间字段统一以毫秒时间戳返回，与 Instant API 序列化口径一致。

SELECT
  ct.id,
  ct.company_id,
  ct.contract_no,
  ct.title,
  ct.amount,
  ct.currency,
  ct.sign_status,
  UNIX_TIMESTAMP(ct.signed_date) * 1000 AS signed_date,
  UNIX_TIMESTAMP(ct.start_date) * 1000 AS start_date,
  UNIX_TIMESTAMP(ct.end_date) * 1000 AS end_date,
  ct.payment_periods,
  ct.cashflow_direction,
  ct.applicant_user_id,
  ct.applicant_name_snapshot,
  UNIX_TIMESTAMP(ct.submitted_at) * 1000 AS submitted_at,
  ct.workflow_managed,
  UNIX_TIMESTAMP(ct.created_at) * 1000 AS created_at,
  UNIX_TIMESTAMP(ct.updated_at) * 1000 AS updated_at,
  cp.name AS company_name
FROM crm_contract ct
LEFT JOIN crm_company cp ON cp.id = ct.company_id
ORDER BY ct.updated_at DESC, ct.id DESC;
