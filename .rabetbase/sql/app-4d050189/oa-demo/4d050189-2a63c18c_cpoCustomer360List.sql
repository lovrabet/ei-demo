-- @lovrabet.sqlCode: 4d050189-2a63c18c
-- @lovrabet.sqlName: cpoCustomer360List
-- @lovrabet.dbId: 10384
-- @lovrabet.dbName: oa-demo
-- @lovrabet.mode: sql
-- @lovrabet.syncedAt: 2026-08-11T11:04:53.829Z

-- 客户 360 客户列表：公司 + 客户状态名 + 商机数 + 合同数 + 合同总额，支持关键字模糊过滤。
-- 参数：keyword（可选，匹配 name/uscc/industry，大小写不敏感）
-- created_at/updated_at 以毫秒时间戳返回，与 Instant API 的序列化口径一致。

SELECT
  c.id,
  c.name,
  c.uscc,
  c.legal_rep,
  c.reg_capital,
  c.reg_capital_unit,
  c.founded_date,
  c.industry,
  c.business_scope,
  c.reg_address,
  c.status_code,
  UNIX_TIMESTAMP(c.created_at) * 1000 AS created_at,
  UNIX_TIMESTAMP(c.updated_at) * 1000 AS updated_at,
  cs.name AS status_name,
  (SELECT COUNT(*) FROM crm_opportunity o WHERE o.company_id = c.id) AS opportunity_count,
  (SELECT COUNT(*) FROM crm_contract ct WHERE ct.company_id = c.id) AS contract_count,
  (SELECT COALESCE(SUM(ct.amount), 0) FROM crm_contract ct WHERE ct.company_id = c.id) AS contract_amount
FROM crm_company c
LEFT JOIN crm_customer_status cs ON cs.code = c.status_code
WHERE #{keyword} IS NULL
   OR LOWER(c.name) LIKE CONCAT('%', LOWER(#{keyword}), '%')
   OR LOWER(c.uscc) LIKE CONCAT('%', LOWER(#{keyword}), '%')
   OR LOWER(c.industry) LIKE CONCAT('%', LOWER(#{keyword}), '%')
ORDER BY c.updated_at DESC, c.id DESC;
