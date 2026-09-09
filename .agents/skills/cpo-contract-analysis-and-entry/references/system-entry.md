# System Entry and Data-correction Rules

## Application and Data Boundaries

- Lovrabet application: `app-4d050189`
- Payable contracts live in the Qizhi Yuntu Enterprise Intelligence System finance domain.
- Customer receipt contracts and receivable plans live in the CRM domain incorporated into this project. Access them through current-application Backend Functions; do not create a cross-application client.

| Business object | Table | Dataset code |
| --- | --- | --- |
| Contract | `contract_application` | `53869993f80f45ae8ef6cdf051d8e355` |
| Counterparty | `business_partner` | `68c70907e27c481cbefb96dd3906936e` |
| Payment plan | `contract_payment_plan` | `08e17d8ba3a24e938fef89816c8f4ccb` |
| Payment application | `payment_application` | `7da208a5059b4b13896d7c7ae29c8492` |
| Invoice | `invoice_record` | `fc11e2d760b94b2ca2ccf0485ed40ca8` |
| Invoice link | `biz_invoice_link` | `9dd0d102219145ddbb67d1c247a84fb9` |
| Attachment | `attachment` | `ab17964f0efd46f78cecb4969140f257` |

## Create a Payable Contract Draft

Check duplicates by name, counterparty, and amount and complete risk review, then call:

```bash
lovrabet bff exec --appcode app-4d050189 \
  --name cpoSaveDraft \
  --params '{
    "bizType":"contract",
    "values":{
      "contract_name":"Annual Certification Service Contract",
      "direction":"payable",
      "contract_type":"certification",
      "our_role":"party_a",
      "partner_id":123,
      "amount":60000,
      "currency":"CNY",
      "start_date":"2026-06-05",
      "end_date":null,
      "remark":"Application context: 2026 high-tech-enterprise certification service",
      "contract_assessment":"## Objective Assessment\n\nScope and amount are clear, and installment totals reconcile.\n\n## Action Items\n\n- Obtain the corresponding invoice after the initial payment\n- Retain deliverables and acceptance evidence\n\n## Risks and Treatment\n\n- **Medium risk**: audit-fee milestone unclear; obtain written confirmation before submission."
    }
  }' --format compress
```

Use returned `bizId` to synchronize plans:

```bash
lovrabet bff exec --appcode app-4d050189 \
  --name cpoSyncContractPaymentPlans \
  --params '{
    "contractId":123,
    "plans":[{
      "phase_no":1,
      "phase_name":"Initial Payment",
      "planned_amount":35000,
      "currency":"CNY",
      "planned_pay_date":"2026-06-09",
      "trigger_condition":"Pay after contract signing",
      "status":"pending",
      "remark":"Amount composition and date evidence"
    }]
  }' --format compress
```

`cpoSyncContractPaymentPlans` protects plans linked to applications or already processing; never bypass locks.

Inventory every supplied contract, addendum, signature page, and approval material before entry. Supplying files means they should be retained. Upload each unique file and store the returned persistent `filePath`, never a temporary preview URL:

```bash
lovrabet file upload --appcode app-4d050189 \
  --file "<absolute-contract-path>" --format compress
```

Create one relationship per file with `biz_type=contract`, real `biz_id`, and `attachment_type=contract_file`. Use meaningful filenames and keep IDs internal. Reread and require unique inputs = successful non-empty paths, expected links = actual links = readback matches, with exact name/path sets and no omission, extra, or duplicate. A reused path still needs a relationship to this contract. Stop submission and report discrepancies on failure.

Store the expert conclusion in Markdown `contract_assessment` with at least `## Objective Assessment` and `## Action Items`, plus `## Risks and Treatment` when needed. State overall level, decision, unresolved risks, and pre-submission conditions. Keep `remark` for application context only and complete risk JSON in the Skill result.

## Historical Corrections

For a safe ordinary update, locate one record through `lovrabet data filter/getOne`, call a controlled Backend Function or Instant API, and reread.

For locked history, paid plans, wrong-entity links, attachment migrations, multiple Datasets, or transactions, do not execute SQL in this runtime Skill. Return `needs_developer_migration` with business title/number/legal name, current and expected row counts, old/new values and page/evidence, installment and paid/received reconciliation, attachment name/hash/relationships, affected Dataset codes and readback queries, and a requirement for idempotent transactional migration using runtime database configuration.

Never accept, save, or output a database connection string. After developer migration, reread all affected Datasets through Lovrabet and verify platform-visible values and labels.

## Status and Facts

- An approved and signed contract may have workflow status `signed`; a signed contract under performance has `lifecycle_status=in_progress`.
- Mark a plan `paid` only with payment-confirmation evidence and actual amount/time.
- Completed approval alone does not prove bank payment. If historical migration uses `paid_confirmed`, state its evidence and any missing bank receipt.
- If an invoice is required but absent, retain the gap; never create a fictitious invoice.

## Customer Receipt Contracts

Use customer-contract, receivable-plan, customer-receipt, and outgoing-invoice models. Do not duplicate a customer contract in `contract_application`. Maintain it through current-application Backend Functions such as `cpoManageReceivableContract`, after reading the live contract. Store plans, actual receipts, and invoices separately; plan status is not proof of receipt.

## Submit for Approval

Default to draft save. Only on explicit request, set `submit=true` in final complete `cpoSaveDraft` and trigger Lovrabet Flow once; never call a legacy submit interface.

Before submission, reshow contract, risk and treatment, counterparty, amount, installments, and attachments, and confirm exact input/upload/link/readback reconciliation. Submit only with `entry_gate=ready`, passed attachments, and explicit authorization. Build the detail link from real returned `bizType/bizId`, reread details, and use contract name as link text.
