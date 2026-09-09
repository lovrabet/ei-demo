---
name: cpo-batch-workflow-approval
displayName: Batch Approval Review Assistant
description: "Batch-review the current user's own approval tasks in the Qizhi Yuntu Enterprise Intelligence System, identify compliance and business risks, recommend approving directly or asking follow-up questions, and process them safely after user confirmation. Applies to expense, contract, payment, invoice, travel, payroll, and similar business approvals; not for signing, payment execution, voucher preparation, or archiving steps."
example: "Review all my pending approvals, list risks and items that can be approved directly, then process them in a batch after I confirm"
metadata:
  type: write
---

# Batch Approval Review Assistant

Review first, obtain confirmation second, and process last. Never interpret “take a look at my pending tasks” as approval authorization, and never treat a risk recommendation as user authorization.

Read these files in full before starting:

- [Runtime Contract](references/runtime-contract.md)
- [Review and Risk Policy](references/review-policy.md)
- [Output Contract](references/output-contract.md)

## Workflow

```mermaid
flowchart TD
  Start([User requests a pending-task review]) --> P1[Get the user's tasks from Lovrabet /my-todo, up to 20 per batch]
  P1 --> P2[Call cpoGetBizTimeline for full business context on each item]
  P2 --> P3{Determine each recommendation}
  P3 -- approve_recommended --> C1[Recommend direct approval]
  P3 -- ask_first --> C2[Recommend asking first]
  P3 -- reject_recommended --> C3[Recommend rejection]
  P3 -- not_eligible --> C4[Currently ineligible]
  C1 --> P4[Show approval plan and request confirmation]
  C2 --> P4
  C3 --> P4
  C4 --> P4
  P4 --> P5{User explicitly confirms?}
  P5 -- No --> E1([End without processing])
  P5 -- Yes --> P6[Revalidate ownership, eligibility, and unchanged key facts item by item]
  P6 --> P7{Validation passes?}
  P7 -- No --> P8[Reclassify as not_eligible or ask_first and stop that item]
  P7 -- Yes --> P9[Approve or reject each item through the Lovrabet Flow task]
  P9 --> P10[Verify with cpoGetBizTimeline and refresh pending tasks after each write]
  P10 --> P11{Any item failed?}
  P11 -- Yes --> Stop([Stop remaining writes and report succeeded, failed, and unprocessed items])
  P11 -- No --> E2([Batch complete: output all three result groups])
```

## Scope

Process only tasks that meet all of these conditions:

1. The task comes from Lovrabet `/my-todo` and is still assigned to the current user.
2. The platform task type is approval.
3. The platform Flow panel still shows that the current user can process it.
4. The pending task exposes the approve or reject action to be performed.

Signing, payment execution, payment confirmation, voucher preparation, archiving, and similar operation steps are outside this Skill. Even when they appear in “My Pending Tasks,” list them as ineligible and do not process them for the user.

Review and process no more than 20 tasks at a time. For more than 20 tasks, use stable ordering and batches. Finish reviewing and confirming the current batch without silently truncating the list.

## Phase 1: Read-only Review

### 1. Get the Current User's Pending Tasks

Read all platform tasks from the application `/my-todo` page. If the user specifies a business type, range, or keyword, narrow the current user's tasks only; never expand the scope to another user's tasks.

Preserve the source order within the batch. Keep `taskId`, `bizType`, and `bizId` internally for calls and correlation. In user-facing output, show clear business information such as the title, applicant, amount, and business type; do not expose database primary keys or internal IDs.

### 2. Get Complete Business Context

Call `cpoGetBizTimeline` for each candidate and use the platform Flow panel to confirm the current task and available actions. Check the primary business record, applicant, amount, attachments, invoice links, line items, and related business objects.

Never approve from the pending-task summary alone. For contracts, inspect the original contract attachment and any existing `contract_assessment`. For expenses, inspect expense lines, attachments, invoices, and effective rules. When necessary, call the expense-rule and invoice-duplicate-check BFFs described in the [Runtime Contract](references/runtime-contract.md).

### 3. Determine Each Recommendation

Following the [Review and Risk Policy](references/review-policy.md), assign every task one of:

- `approve_recommended`: direct approval is recommended.
- `ask_first`: key facts are missing, or a risk requires confirmation from the applicant or business owner.
- `reject_recommended`: a fundamental, material, or unacceptable issue warrants rejection.
- `not_eligible`: the task is stale, reassigned, not a review step, or currently unavailable.

Every recommendation must include supporting facts, risk level, open questions, and a concise comment proposed for the approval record. Use `unknown` when information is insufficient; do not speculate.

### 4. Show the Approval Plan and Request Confirmation

First output the read-only review using the [Output Contract](references/output-contract.md), clearly separating:

- recommended for direct approval;
- recommended for follow-up questions;
- recommended for rejection;
- currently ineligible.

By default, include only `approve_recommended` items in the proposed approval list. Do not mix in question, rejection, or ineligible items.

The user must explicitly confirm which business items to process. Responses such as “approve the items recommended for direct approval above” or “approve all except that contract” count as authorization. Clarify ambiguous responses first. Batch rejection requires explicit item-by-item confirmation and a reason from the user; never reject automatically from the model's recommendation.

Before execution, `scripts/validate_batch_plan.py` may validate the plan. Do not perform writes if validation fails.

## Phase 2: Process After Confirmation

### 1. Revalidate Each Item

Process serially, never concurrently. Before each write, reread the current user's platform tasks and `cpoGetBizTimeline`. Confirm the task is still assigned to the current user, remains actionable, and has no material change in key amount, title, or risk information.

If anything changed, reclassify the item as `not_eligible` or `ask_first`, stop processing that item, and tell the user. Never rely on a stale snapshot.

### 2. Process Only Through Lovrabet Flow

Process each item in the platform approval panel under `/my-todo`. For approvals, write a concise, factual, auditable comment. For rejections, write the specific reason confirmed by the user only after item-level authorization. Do not call legacy workflow Backend Functions.

Never update business status, task status, action records, or `is_deleted` directly. Never simulate workflow progression by creating, updating, or deleting Dataset records.

### 3. Verify After Every Write

Immediately refresh platform tasks and reread `cpoGetBizTimeline` after each item. Confirm the original task is no longer pending and the platform callback has synchronized the business status.

If one item fails, stop all remaining writes in the batch and report succeeded, failed, and unprocessed items separately. Do not retry automatically until the status has been reread and the user confirms again.

## Approval Comment Requirements

Approval comments must contain only verified facts, primary risks, and the approval or rejection basis. Do not include internal IDs, database field dumps, or unrelated sensitive personal information.

A recommendation to approve does not mean “risk-free.” Contract comments must retain key risks and follow-up control conditions. Minor expense-document or formatting reminders may be recorded in an approval comment, but do not invent policy violations.
