# Contract Verification Rules

## Evidence Hierarchy

Use, from highest to lowest priority:

1. Contract body, appendices, and addenda sealed by both parties.
2. Bank receipts, official invoices, government publications, and other performance evidence.
3. Original fields and attachments from completed approvals.
4. Existing master data and historical migration records.
5. Facts explicitly confirmed by the user but not yet supported by attachments.
6. Public information and reasonable inference.

Lower-priority evidence never overrides higher-priority evidence. Public information may assist verification but cannot replace contractual payee or account terms. Record every inference as a risk or open confirmation.

## Page-by-page Checklist

- Cover: name, number, parties, and background.
- Pricing table: service items, quantity, unit price, total, tax, free items, and notes.
- Payment: advance/progress/acceptance/final/retention payments, refunds, and triggers.
- Performance: start/end rules, deliverables, acceptance, renewal, and maximum service period.
- Finance and tax: invoice type/timing, rate, and extra charges.
- Risk terms: breach, termination, refund, confidentiality, IP, and disputes.
- Account information: account name, bank, and number; verify digit by digit from the image.
- Signature page: seals, signatures, dates, and execution location.

Render every page of a scan. An empty `pdftotext` result from a file without a text layer does not mean the contract is blank.

## Cash-flow Direction

| Business Fact | Direction | Plan |
| --- | --- | --- |
| Counterparty provides services and our company pays | `payable` | Payment plan |
| Our company provides services and counterparty pays | `receivable` | Receipt plan |

Party A is not necessarily the payer and Party B is not necessarily the payee. Read price and payment-obligation clauses.

## Installment Breakdown

1. Prefer explicit amount plus date, or amount plus trigger.
2. Service items paid at the same time/on the same trigger may share an installment, retaining components in notes.
3. When a specific clause conflicts with a general one, use the specific clause and record the conflict.
4. Do not invent dates for “paid in sequence” or “by progress”; create trigger-based plans and mark for confirmation.
5. Contract total must equal valid plan total. Free items are zero and counted once.
6. Never infer paid status from completed approval. Accept bank receipts, bank confirmation, reliable historical payment confirmation, or explicit user confirmation, while stating evidence strength.
7. Date basis is `explicit`, `historical_record`, `user_confirmed`, `inferred`, or `unknown`.
8. Preserve ambiguous “N days after signing” language when calendar versus business days is unspecified.

## Contract Term

Do not rewrite event-based terms such as “until completion” as fixed dates. “Up to three years” is a cap, not a certain end date. A handwritten date precise to a day may use `00:00:00`, with precision stated in notes.

## Counterparty Verification

- Match legal names exactly; do not interchange affiliated companies sharing a brand or contact.
- For payable contracts, verify account name, bank, and account number; store the number as a string preserving leading zeros.
- Add a unified credit code only from a business license, reliable master data, or authoritative registry.
- Distinguish registered, office, and mailing addresses, or note the source when the model has no separate fields.
- A contact from approval materials is a business contact, not the legal representative.

## Invoices and Attachments

- Determine incoming/outgoing invoice direction, type, and timing from the contract.
- “Invoice required” does not mean one exists; query ledger, relationships, and attachments separately.
- Reuse storage paths for identical file hashes while creating the correct business relationship.
- A template and a mutually sealed version are different evidence; retain the sealed version in contract master data.

## Blocking Conditions

Do not automatically write final relationships or payment status when totals disagree; legal entity is not unique; account is unreadable or conflicts without superior evidence; direction is unclear; paid/received/invoiced status lacks evidence; or a target contract, payment, or attachment matches multiple active records.
