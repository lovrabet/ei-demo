# Runtime Contract

## Runtime Entry Point

- AppCode: `app-4d050189`
- Backend Function: `cpoCheckInvoiceDuplicates`
- Request: `{ "expenseId": number }` or `{ "invoiceNos": string[] }`
- Response: `{ expenseId, checkedInvoiceCount, invoiceNos, hasDuplicates, duplicates }`

Duplicate-check rules are maintained centrally on the server. Lovrabet controls the visibility of deleted records. The Skill must not reproduce the rules by reading datasets, construct or manipulate platform-managed fields, or directly invoke data-write APIs.

## Authorization and Credentials

- Call the Backend Function with the current Lovrabet login.
- Do not read, output, or store AccessKeys, cookies, signed URLs, or any other plaintext credentials.
- Stop when authorization is insufficient. Do not switch accounts, modify local configuration, or use Instant API to bypass authorization.

## Read-Only Boundary

This Skill is read-only:

- Do not update invoice status.
- Do not delete duplicate ledger records or invoice relationships.
- Do not modify or submit expense applications.
- Do not treat a successful preliminary invoice check as a successful submission.

When an expense application is formally created and submitted, `cpoSaveDraft(submit=true)` calls the same server-side guard again. If a duplicate is found, it returns `DUPLICATE_INVOICE` and rejects creation.

## Verification

Only produce a conclusion when the Backend Function succeeds and `hasDuplicates` is explicitly boolean. If that field is absent, some records are not visible, or the call fails, use `needs_manual_check` or `failed`.
