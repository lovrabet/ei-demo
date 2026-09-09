# Output Contract

Every result must explicitly say either “review only; not executed” or “executed” so the user cannot mistake a recommendation for an applied action.

## Common Structure

```json
{
  "status": "success | no_op | partial_success | blocked | failed | needs_manual_check",
  "mode": "read_only | dry_run | confirmed",
  "summary": "Concise user-facing summary",
  "confirmationRequired": true,
  "scope": {
    "total": 0,
    "eligible": 0,
    "approveRecommended": 0,
    "askFirst": 0,
    "rejectRecommended": 0,
    "notEligible": 0
  },
  "approvalPlan": [],
  "changes": [],
  "verification": [],
  "warnings": [],
  "errors": [],
  "nextActions": []
}
```

Use `read_only` or `dry_run` with `confirmationRequired=true` in phase one. Keep `changes` empty and state “not yet approved.” Use `confirmed` in phase two only after explicit user confirmation.

## Per-item Approval Plan

Each `approvalPlan` item contains:

```json
{
  "businessType": "Contract Application",
  "title": "Service Contract Approval",
  "applicant": "Applicant Name",
  "amount": "¥10,000.00",
  "recommendation": "approve_recommended | ask_first | reject_recommended | not_eligible",
  "riskLevel": "none | low | medium | high | critical | unknown",
  "findings": ["Verified fact or risk indicator"],
  "questions": ["Question requiring confirmation"],
  "proposedAction": "review_pass | review_reject | none",
  "proposedComment": "Comment proposed for the workflow record"
}
```

Never use a database primary key, internal task ID, or `#<id>` as a title, label, or fallback. When no title exists, show “Related object title missing” and classify it as a data-quality issue.

## Execution Results

Each `changes` entry uses the business title to describe:

- the action performed;
- the new status returned by the workflow;
- a summary of the approval comment.

`verification` records facts read after the write, such as “original task removed from the current user's pending tasks,” “action record created,” or “next step created.” Do not merely repeat a BFF “success” response.

For partial success:

- set `status=partial_success`;
- list succeeded, failed, and unprocessed items separately;
- set `confirmationRequired=true`;
- tell the user that processing stopped and a fresh review and confirmation are required.

When the current user has no eligible approval tasks, use `no_op`. Do not add another user's task or an operation task to the result.

## Recommended User-facing Order

1. State in one sentence how many tasks were reviewed and whether anything was executed.
2. Items recommended for direct approval.
3. Items requiring questions, including the specific questions.
4. Items recommended for rejection, including the fundamental reason.
5. Ineligible items.
6. A precise confirmation question, such as “Approve the three items recommended for direct approval above?”
7. After execution, verification results for each item.

Contract risks must be prominent in the summary. Minor expense reminders may be concise, but fundamental issues must never be hidden.
