-- @lovrabet.sqlCode: 4d050189-a33eb743
-- @lovrabet.sqlName: cpoWorkbenchDashboard
-- @lovrabet.dbId: 10384
-- @lovrabet.dbName: oa-demo
-- @lovrabet.mode: sql
-- @lovrabet.syncedAt: 2026-08-11T11:04:13.539Z

SELECT
  'metric' AS section,
  'expense_amount_30d' AS metric_key,
  CAST(NULL AS CHAR(7)) AS period,
  'expense' AS biz_type,
  COUNT(*) AS record_count,
  COALESCE(SUM(reimbursable_cny_amount), 0) AS amount
FROM expense_application
WHERE is_deleted = 0
  AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
  AND status NOT IN ('draft', 'cancelled', 'rejected')

UNION ALL

SELECT
  'metric',
  'payment_amount_30d',
  CAST(NULL AS CHAR(7)),
  'payment',
  COUNT(*),
  COALESCE(SUM(amount), 0)
FROM payment_application
WHERE is_deleted = 0
  AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
  AND status NOT IN ('draft', 'cancelled', 'rejected', 'payment_failed')

UNION ALL

SELECT
  'metric',
  'contract_amount_30d',
  CAST(NULL AS CHAR(7)),
  'contract',
  COUNT(*),
  COALESCE(SUM(amount), 0)
FROM contract_application
WHERE is_deleted = 0
  AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
  AND status NOT IN ('draft', 'cancelled', 'rejected')

UNION ALL

SELECT
  'metric',
  'pending_tasks',
  CAST(NULL AS CHAR(7)),
  CAST(NULL AS CHAR(16)),
  COUNT(*),
  CAST(NULL AS DECIMAL(20, 2))
FROM biz_task
WHERE is_deleted = 0
  AND status = 'pending'

UNION ALL

SELECT
  'metric',
  'overdue_tasks',
  CAST(NULL AS CHAR(7)),
  CAST(NULL AS CHAR(16)),
  COUNT(*),
  CAST(NULL AS DECIMAL(20, 2))
FROM biz_task
WHERE is_deleted = 0
  AND status = 'pending'
  AND due_at IS NOT NULL
  AND due_at < NOW()

UNION ALL

SELECT
  'metric',
  'credential_risks',
  CAST(NULL AS CHAR(7)),
  'credential',
  COUNT(*),
  CAST(NULL AS DECIMAL(20, 2))
FROM company_credential
WHERE is_deleted = 0
  AND status IN ('expiring', 'expired')

UNION ALL

SELECT
  'workload',
  'pending_tasks',
  CAST(NULL AS CHAR(7)),
  biz_type,
  COUNT(*),
  CAST(NULL AS DECIMAL(20, 2))
FROM biz_task
WHERE is_deleted = 0
  AND status = 'pending'
GROUP BY biz_type

UNION ALL

SELECT
  'trend',
  'applications',
  DATE_FORMAT(created_at, '%Y-%m'),
  'expense',
  COUNT(*),
  COALESCE(SUM(reimbursable_cny_amount), 0)
FROM expense_application
WHERE is_deleted = 0
  AND created_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
  AND status NOT IN ('draft', 'cancelled', 'rejected')
GROUP BY DATE_FORMAT(created_at, '%Y-%m')

UNION ALL

SELECT
  'trend',
  'applications',
  DATE_FORMAT(created_at, '%Y-%m'),
  'contract',
  COUNT(*),
  COALESCE(SUM(amount), 0)
FROM contract_application
WHERE is_deleted = 0
  AND created_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
  AND status NOT IN ('draft', 'cancelled', 'rejected')
GROUP BY DATE_FORMAT(created_at, '%Y-%m')

UNION ALL

SELECT
  'trend',
  'applications',
  DATE_FORMAT(created_at, '%Y-%m'),
  'payment',
  COUNT(*),
  COALESCE(SUM(amount), 0)
FROM payment_application
WHERE is_deleted = 0
  AND created_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
  AND status NOT IN ('draft', 'cancelled', 'rejected', 'payment_failed')
GROUP BY DATE_FORMAT(created_at, '%Y-%m')

UNION ALL

SELECT
  'trend',
  'applications',
  DATE_FORMAT(created_at, '%Y-%m'),
  'invoice',
  COUNT(*),
  COALESCE(SUM(amount), 0)
FROM invoice_record
WHERE is_deleted = 0
  AND created_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
  AND status NOT IN ('draft', 'cancelled', 'rejected', 'invalid')
GROUP BY DATE_FORMAT(created_at, '%Y-%m')

UNION ALL

SELECT
  'trend',
  'applications',
  DATE_FORMAT(created_at, '%Y-%m'),
  'travel',
  COUNT(*),
  COALESCE(SUM(estimated_amount), 0)
FROM travel_application
WHERE is_deleted = 0
  AND created_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
  AND status NOT IN ('draft', 'cancelled')
GROUP BY DATE_FORMAT(created_at, '%Y-%m')

ORDER BY section, period, biz_type;
