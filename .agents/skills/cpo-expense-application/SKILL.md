---
name: cpo-expense-application
displayName: Expense Application Assistant
description: "Create, save drafts, submit, or query expense applications from invoice files uploaded by the user in the Qizhi Yuntu Enterprise Intelligence System. Before creation or submission, upload the real invoice files and store each same file in both the expense attachment pool and invoice ledger. Never bypass controlled Backend Functions to write business tables directly."
example: "Create and submit an expense application from the invoice files I uploaded"
metadata:
  type: write
---

# Expense Application Assistant

## Workflow

```mermaid
flowchart TD
  Start([User supplies invoice files]) --> L1[Inventory files by name, size, and hash]
  L1 --> L2{Files readable?}
  L2 -- No --> Stop1([Stop and request real invoice files])
  L2 -- Yes --> L3[Parse invoice number, date, seller, and amount]
  L3 --> L4[Upload each file and obtain a real filePath]
  L4 --> L5{All uploads succeeded?}
  L5 -- No --> Stop2([Stop; never fabricate paths])
  L5 -- Yes --> L6[Read effective rules with cpoListEffectiveExpenseRules]
  L6 --> L7[Split expense lines and create items[].invoices relationships]
  L7 --> L8{Seller handling}
  L8 -- Link existing vendor --> L9a[Search vendor, get user confirmation, then link]
  L8 -- Record seller name only --> L9b[Save real seller_name with partner_source=manual]
  L9a --> L10[Add upload results to attachments]
  L9b --> L10
  L10 --> L11[Save draft with cpoSaveDraft]
  L11 --> L12[Reread with cpoGetBizTimeline]
  L12 --> L13{Input, upload, relationship, and readback counts match?}
  L13 -- No --> Stop3([Stop and report missing or duplicate files])
  L13 -- Yes --> L14{User explicitly requests submission?}
  L14 -- No --> E1([Return draft link and status])
  L14 -- Yes --> L15[Precheck duplicates with cpoCheckInvoiceDuplicates]
  L15 --> L16{Create and submit once with cpoSaveDraft submit=true}
  L16 -- DUPLICATE_INVOICE --> Stop4([Blocked because invoice is already used])
  L16 -- Success --> E2([Return submitted link and status])
```

## Purpose and Scope

Use this Skill to create, save, submit, query, or supplement expense applications. The page is `/expense-form`.

Maintain an auditable chain in which the application, expense lines, actual invoices, printed sellers, invoice files, and approval status agree. Saving a draft and submitting are separate actions; never describe “saved” as “submitted” or “approved.”

## Authoritative Interfaces and Data Boundaries

- AppCode: `app-4d050189`
- Expense application: Dataset `7851365c96244a1896e834daec447ddb`, table `expense_application`
- Attachments: Dataset `ab17964f0efd46f78cecb4969140f257`, table `attachment`
- Business partners: Dataset `68c70907e27c481cbefb96dd3906936e`, table `business_partner`
- Create/update drafts only with `cpoSaveDraft`; submit only by passing `submit=true` in the final confirmed complete request.
- Read effective rules only with `cpoListEffectiveExpenseRules` and details only with `cpoGetBizTimeline`.
- Query drafts through application page `/my-drafts`; do not call a legacy workflow draft interface.
- `cpoCheckInvoiceDuplicates` may precheck before submission; the server checks again during final submission.

Never call `data create/update/delete/batchCreate` directly on expense, line-item, invoice-ledger, or invoice-link tables. Instant API Policy blocks standard writes; UI disabling is only interaction guidance, while the real boundary is Policy, Lovrabet roles, and controlled Backend Functions.

`is_deleted` is a Lovrabet system field. Skills, pages, Backend Functions, Hooks, and scripts must not read, filter, default, or update it. Deletion must use Lovrabet model `delete`.

## Standard Procedure

1. Require readable real invoice files and inventory name, size, and available hash. Without files, stop and ask the user to upload; never offer to register now and attach later.
2. Parse each file for invoice number, date, seller, amount, and other printed facts.
3. Upload every unique file with `lovrabet file upload` and obtain a real `filePath`. Stop on any failure; never invent a path.
4. Read current rules through `cpoListEffectiveExpenseRules`.
5. Split expense lines by business item; do not combine them in primary-record notes.
6. Create explicit `items[].invoices` links, using the matching upload path in `items[].invoices[].file_path`.
7. Handle the printed seller as either a confirmed existing vendor relationship or a seller-name-only record.
8. Also add every upload result to `cpoSaveDraft.attachments`; upload each file only once.
9. Save with `cpoSaveDraft` and confirm returned attachment paths match uploads.
10. Reread with `cpoGetBizTimeline` and confirm every invoice path exists in both invoice facts and the expense attachment pool.
11. Reconcile input, upload, relationship, and readback counts and path sets. Stop on any missing, extra, or duplicate item.
12. Only on explicit submission, show the duplicate-check result and call complete `cpoSaveDraft(submit=true)` once after every gate passes.

Ask about missing facts that affect reimbursement amount, vendor relationship, or submission intent. Never guess.

## Primary Record and Line-item Contract

Pass only these business fields in `cpoSaveDraft.values`:

- `expense_type`: use the current business dictionary; do not permanently hardcode options in this Skill.
- `travel_type`: required for travel, `domestic` or `overseas`.
- `title`: clear required business title.
- `total_original_amount`, `total_cny_amount`, `reimbursable_cny_amount`: amounts in yuan.
- `payout_currency`: fixed to `CNY`.
- `remark`: optional primary-record notes.

Do not pass system fields such as `status`, `applicant_user_id`, `applicant_name_snapshot`, or `submitted_at`. Reimbursement defaults to the applicant's payroll card; never ask for, collect, or transmit employee bank-account information.

Pass expense lines in `items`:

- `id`: preserve for an existing draft; omit for a new line.
- `description`: concise identifiable business description.
- `cny_amount`, `reimbursable_cny_amount`.
- `invoices`: actual invoices used by the line; one line may link multiple invoices.
- `remark`: rule match, discount basis, filenames, or other detail.

The Backend Function recalculates primary totals from lines. Never rely on notes, title, or cabin fields to make the server infer amounts.

## Invoice Links, Seller, and Vendor

### Invoice Relationships

Invoices must be explicit in `items[].invoices`, not merely written into `remark`.

- For an existing ledger invoice, prefer `invoice_id`.
- For a new invoice, pass `invoice_no`, `seller_name`, amount, and file path; `cpoSaveDraft` creates a draft ledger entry before linking it.
- Expense-created invoices are registered by the server as incoming invoices for expense use.
- `biz_invoice_link` rows with `biz_type=expense_item` are authoritative one-to-many relationships.
- `expense_item.invoice_id` stores only the first actual invoice for legacy-page compatibility.

### Printed Seller Is a Fact; Vendor Link Is Optional

| Scenario | `seller_name` | `partner_id` | `partner_source` | `partner_name_snapshot` |
|---|---|---|---|---|
| Link existing vendor | Real printed name | Confirmed vendor record | `business_partner` | Vendor name |
| Record seller only | Real printed name | Omit | `manual` | Same as `seller_name` |

Seller-name-only means no vendor master data is created or linked. It is not a temporary vendor and does not require future conversion. A complete seller name is valid invoice information; do not say the counterparty is missing. Never use generic placeholders such as “invoice,” “receipt,” or “vendor” for `seller_name`.

### Match a Vendor

Query active suppliers, service providers, and individual counterparties by company name or unified credit code:

```bash
lovrabet --appcode app-4d050189 data filter \
  --code 68c70907e27c481cbefb96dd3906936e \
  --params '{
    "where": {
      "$and": [
        {"partner_type":{"$in":["supplier","service_provider","individual"]}},
        {"status":{"$eq":"active"}},
        {"$or":[
          {"name":{"$contain":"Alibaba Cloud"}},
          {"unified_credit_code":{"$contain":"Alibaba Cloud"}}
        ]}
      ]
    },
    "select":["id","name","partner_type","unified_credit_code","status"],
    "currentPage":1,
    "pageSize":20
  }'
```

For one exact match, show the company name and link only after user confirmation. For multiple/fuzzy matches, let the user choose by name and credit code, never by internal ID label. With no match, ask whether to create/link a vendor or record seller name only. Create a partner only on explicit request; never silently create one to finish an expense.

### Invoice Files and the Four-way Gate

Upload every local invoice file:

```bash
lovrabet file upload \
  --appcode app-4d050189 \
  --file "/workspace/invoice.pdf" \
  --format json
```

Use only returned `data.fileName`, `data.filePath`, `data.fileType`, and `data.sourceDir`. Upload each file once; the expense attachment pool and line-item invoice share its real path.

- Store primary attachments as `attachment_type=approval_material`.
- `attachments[].filePath` must equal matching `items[].invoices[].file_path`.
- Do not create a second `attachment_type=invoice` attachment for the same file.
- Never fabricate a path or replace upload with a number, filename, note, or “attach later” promise.
- Stop submission if upload, attachment persistence, or readback verification fails.

Count explicitly:

- `input_file_count`: unique files supplied for this application, using size/hash as well as name.
- `uploaded_file_count`: unique successful uploads with non-empty real paths.
- `associated_attachment_count`: returned attachments whose paths belong to this upload set; every input must also appear in its invoice relationship.
- `readback_match_count`: uploaded paths found in both invoice facts and the expense attachment pool after `cpoGetBizTimeline`.

Require all four counts and filename/path sets to match one-to-one, with no omission, extra item, or duplicate link. An uploaded but unlinked file is not success.

For existing applications, use `expenseItems[].invoice_links[].invoice` as invoice facts. An empty `partner_id` does not mean the invoice or seller is missing. Warn that seller information is incomplete only when both `seller_name` and `partner_name_snapshot` are empty. Check completeness through `invoice.file_path` and the identical path in the expense attachment pool.

## Effective Expense Rules

Before automatic entry, review assistance, or amount explanation:

```bash
lovrabet --appcode app-4d050189 bff exec \
  --name cpoListEffectiveExpenseRules \
  --params '{"expenseType":"travel","category":"flight"}'
```

Evaluate ascending `priority`:

- `ratio`: `reimbursable_cny_amount = cny_amount * reimburse_ratio`.
- `full`: reimburse the invoice amount.
- `fixed_limit`: do not exceed `limit_amount`.
- `manual_review`: do not force a calculation; mark for manual confirmation.
- Use the lowest `priority` when multiple rules match.
- If no rule is effective, stop automatic calculation and ask for rules to be maintained first.

Put matched `rule_code` or `rule_name` in line-item notes. The rule table is authoritative; never permanently hardcode cabin ratios, caps, or communication-expense policy in this Skill.

## Create or Update a Draft

```bash
lovrabet --appcode app-4d050189 bff exec \
  --name cpoSaveDraft \
  --params '{
    "bizType":"expense",
    "values":{
      "expense_type":"telecom",
      "title":"July Office Telephone Expense",
      "total_original_amount":298.40,
      "total_cny_amount":298.40,
      "reimbursable_cny_amount":298.40,
      "payout_currency":"CNY"
    },
    "items":[{
      "description":"Office telephone service",
      "cny_amount":298.40,
      "reimbursable_cny_amount":298.40,
      "invoices":[{
        "invoice_no":"26337000000680239545",
        "invoice_date":"2026-08-03",
        "seller_name":"Example Telecom Company",
        "partner_source":"manual",
        "partner_name_snapshot":"Example Telecom Company",
        "total_amount":298.40,
        "file_path":"20260803/26337000000680239545.pdf"
      }],
      "remark":"Matched the current office communication expense rule"
    }],
    "attachments":[{
      "fileName":"26337000000680239545.pdf",
      "filePath":"20260803/26337000000680239545.pdf",
      "fileType":"application/pdf"
    }]
  }'
```

The attachment and invoice path must come from the same upload and match exactly. Confirm that `cpoSaveDraft` returns that attachment path; otherwise stop. Before updating or resubmitting, call `cpoGetBizTimeline` and map retained `expenseItems[].id` and `invoice_links` back to `items[].id` and `items[].invoices`. The Backend Function synchronizes items and links incrementally and removes omitted old items/links through Lovrabet `delete`.

## Duplicate Check and Submission

```bash
lovrabet --appcode app-4d050189 bff exec \
  --name cpoCheckInvoiceDuplicates \
  --params '{"expenseId":123}'
```

Only on explicit user request, add `"submit":true` to the complete `cpoSaveDraft` parameters. Never save a draft and call a legacy submit interface. The server rejects same-application duplicates, duplicate ledger records, or invoices used by another valid expense with `DUPLICATE_INVOICE`.

Every line must have at least one actual invoice; every invoice needs a non-empty `file_path` also present in the primary `approval_material` attachment pool. Missing data produces `SUBMIT_REQUIRED_MISSING:expense:*`; path conflicts produce `SUBMIT_CONFLICT:expense:invoice_attachment:*`. Although ordinary incomplete drafts are allowed in the UI, this Skill must not create an invoice-based expense draft without successfully uploaded and persisted real invoice files.

## Post-write Verification and Result Wording

```bash
lovrabet --appcode app-4d050189 bff exec \
  --name cpoGetBizTimeline \
  --params '{"bizType":"expense","bizId":123}'
```

Verify title, amount, status, every line and reimbursable amount, invoice-link count/number/allocation, seller and optional vendor relationship, matching invoice/attachment paths, and all four file counts.

Build the detail URL from real `bizType` and `bizId` returned by save/submit, and use the business title as link text:

```markdown
[View “July Office Telephone Expense”](https://app-4d050189.app.lovrabet.com/application-detail/expense/123)
```

Status wording: `draft` is editable; `submitted` is under approval; `rejected` may be corrected and resubmitted; `reviewed` and later states are not editable by an ordinary applicant. Determine completion from the current task. Void or withdraw through `cpoApplicantFlowAction`, never by updating `status` directly. If post-write readback fails, return the link from the successful response and explicitly list unverified amount, status, or relationships.
