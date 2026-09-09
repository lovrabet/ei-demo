# Output Contract

The final response contains:

- `status`: `success | no_op | blocked | failed | needs_manual_check`
- `mode`: always `read_only`
- `summary`: one sentence stating whether duplicates were found
- `scope`: expense application ID or invoice numbers
- `duplicates`: duplicate invoices; each item includes the invoice number, reason, and conflicting expense applications
- `warnings`: limitations such as invoices without a number, missing ledger records, or insufficient authorization
- `nextActions`: review conflicting records, remove an incorrect relationship, or contact Finance; never clean up automatically

Mapping rules:

- Check completed and duplicates found: `success`
- Check completed and no duplicates found: `no_op`
- Missing input or insufficient authorization: `blocked`
- Backend Function call failed: `failed`
- Incomplete response or an invoice without a number cannot be confirmed: `needs_manual_check`

Example:

```yaml
status: success
mode: read_only
summary: 1 duplicate invoice found
scope: Expense application #14
duplicates:
  - invoiceNo: "26337000000590589880"
    reasons: [used_by_other_expense]
    conflictingExpenses:
      - expenseId: 11
        title: July communication expense reimbursement
        status: submitted
warnings: []
nextActions:
  - Open expense application #11 and verify the original attachment and invoice relationship
  - After confirming an incorrect relationship, ask an authorized person to resolve it
```
