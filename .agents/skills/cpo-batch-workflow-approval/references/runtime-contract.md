# Runtime Contract

This Skill targets Qizhi Yuntu Enterprise Intelligence System application `app-4d050189`. Identity, permission, current assignee, and workflow status are governed by live validation from Lovrabet Flow.

## Core Relationships

- Pending tasks, completed tasks, and approval actions come from the Lovrabet Flow API; do not read or write `biz_task`.
- `biz_action_record` is retained only for business auditing and is not a workflow state machine.
- `biz_relation` connects contracts, payments, invoices, expenses, and other business objects.
- Attachments, invoice links, expense lines, salary lines, and contract payment plans are read through the aggregated business timeline.
- Internal IDs are only for API parameters, data relationships, and idempotency checks; never use them as user-facing names.

Do not bypass these relationships to infer data, and do not reverse-lookup a business record by title and then modify its underlying table.

## Read the Current User's Pending Tasks

Open application page `/my-todo` to read Lovrabet Flow tasks. The page calls platform `/api/approve/todo` and enriches summaries in batches by Dataset and business ID. Do not call a legacy custom pending-task Backend Function, and do not infer the current assignee from business-table status.

## Read the Business Timeline

```bash
lovrabet bff exec cpoGetBizTimeline \
  --appcode app-4d050189 \
  --params '{"bizType":"<bizType>","bizId":"<bizId>"}' \
  --format json
```

Important response fields:

- `biz`, `summary`: primary business record and summary.
- Platform Flow panel: workflow nodes and action history.
- `attachments`, `invoiceLinks`: attachments and invoice links.
- `expenseItems`, `salaryItems`, `contractPaymentPlans`: business details.
- `businessContext.metrics`, `businessContext.risks`, `relatedDocuments`: aggregated metrics, existing risk indicators, and related documents.
- `related`: partners, contracts, payment plans, bank receipts, and other related objects.

Only a task that the platform pending-task page still shows as actionable by the current user may be processed. If the task, amount, applicant, attachments, or risk status changes, form a new recommendation.

## Expense-specific Reads

To check applicable expense rules:

```bash
lovrabet bff exec cpoListEffectiveExpenseRules \
  --appcode app-4d050189 \
  --params '{}' \
  --format json
```

To check invoice duplicates, prefer the expense application selector:

```bash
lovrabet bff exec cpoCheckInvoiceDuplicates \
  --appcode app-4d050189 \
  --params '{"expenseId":"<expenseId>"}' \
  --format json
```

When only invoice numbers are available, pass `invoiceNos`. If duplicate checking is unavailable or ledger coverage is incomplete, report “duplicate verification not completed,” never “confirmed no duplicates.”

## Advance Workflow

Approval may only be completed through platform `/api/flow/approve` on the Lovrabet `/my-todo` page. Both approval and rejection require explicit item-level confirmation from the user. The platform validates the current task, assignee, and workflow status. If the task has already been processed, the assignee changed, or status conflicts, stop the remaining batch and reread pending tasks.

## Safety and Recovery

- Process at most 20 items per batch, strictly serially.
- Reread before and verify immediately after every write.
- Never retry a write blindly; first determine whether the server already advanced the task.
- Never directly update primary business tables, platform workflow data, audit tables, or system fields.
- `is_deleted` is a system field maintained by Lovrabet. Instant API deletion uses platform delete. Reading this field with database semantics is permitted only for explicit low-level SQL that bypasses Instant API; this Skill never modifies it through SQL.
- Commands and scripts must never persist passwords, tokens, complete DSNs, or temporary client configuration.
