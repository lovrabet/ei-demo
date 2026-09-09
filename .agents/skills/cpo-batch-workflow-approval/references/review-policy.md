# Review and Risk Policy

The goal is to provide auditable recommendations appropriate to the business type, not to replace final professional judgment by legal, finance, or management.

## General Review

Confirm each of the following:

1. The current task truly belongs to the current user, and its workflow status matches its available actions.
2. The applicant, business purpose, amount, currency, payer/payee, and key dates are identifiable.
3. The primary record, line items, attachments, invoices, and related documents have no obvious conflict.
4. There is no known duplicate, payee mismatch, clearly non-business purpose, conflict of interest, commercial bribery, legal violation, or indication of fabrication.
5. Supporting materials are sufficient to understand what this approval authorizes.
6. Existing workflow actions, risk indicators, and the applicant's explanation have been addressed.

Risk levels:

- `critical`: a fundamental issue with entity, authorization, amount, subject matter, or legality, or a risk of unacceptable loss.
- `high`: potential for material financial, performance, liability, intellectual-property, or compliance loss.
- `medium`: an important information gap, ambiguity, or weak control that can usually be resolved with clarification or conditions.
- `low`: a minor completeness, formatting, or follow-up reminder that does not prevent basic understanding or compliance.
- `none`: no risk requiring special attention was found.
- `unknown`: a key check is incomplete, so no conclusion can be reached.

Recommendation mapping:

- `none/low` with no fundamental issue: `approve_recommended`.
- `medium`: normally `ask_first`; approval with a reminder is acceptable only when controls are clear and the issue does not affect the substance, with stricter treatment for contracts.
- `high/critical/unknown`: never recommend direct approval; choose `ask_first` or `reject_recommended` based on whether remediation is possible.
- Workflow eligibility not met: `not_eligible`.

## Expenses: Pragmatic but Firm on Fundamentals

The companies served by the Qizhi Yuntu Enterprise Intelligence System are in an early growth stage. Expense approval should focus on a genuine business purpose, traceable amount, and absence of fundamental problems. Do not turn minor formatting or documentation defects into rejection grounds.

Direct approval is generally recommended when:

- the business purpose is reasonable and related to company operations;
- amounts, expense details, and payee are materially consistent;
- no known duplicate invoice or reimbursement is found;
- there is no clearly personal use, fabrication, conflict of interest, or abnormal payee;
- attachments are sufficient to understand the expense even if categorization, naming, or description is imperfect.

Company communication expenses are reimbursed in full when legitimately incurred. Do not raise risks based on a ratio, cap, or possible excess unless an independent issue exists, such as duplication, non-business use, or an amount/entity mismatch.

Ask first when:

- a key document needed to determine purpose, amount, or payee is missing;
- duplicate checking is incomplete or finds a suspected duplicate;
- the applicant, actual payer, invoice buyer name, and payee conflict without explanation;
- split transactions, unusual clustering, or round amounts appear without a reasonable explanation;
- the expense appears personal and its business connection is unexplained.

Recommend rejection only for fundamental issues such as clear fabrication, duplicate reimbursement, non-business use, legal violations, or a serious entity mismatch. Inaccurate attachment categories, brief descriptions, or missing configured policy rules alone are not rejection grounds.

## Contracts: Strict Risk Disclosure

Read the original contract attachment and any existing `contract_assessment`, and review:

- contracting entities, signing authority, and execution method;
- subject matter, scope of work, deliverables, milestones, and acceptance criteria;
- amount, tax rate, payment terms, invoicing, refunds, and price adjustments;
- intellectual property, confidentiality, data security, and rights to use deliverables;
- breach liability, liability caps, exclusions, warranties, and insurance;
- change, suspension, cancellation, termination, and exit arrangements;
- industry compliance, anti-bribery, sanctions, and other applicable requirements;
- governing law, dispute resolution, jurisdiction, and notices.

If the original contract is missing or unreadable, or key pages or appendices are incomplete, set risk to `unknown` and ask first.

The following are generally `high/critical` and must not be recommended for direct approval:

- unclear entities or signing authority, or conflicts in amount, subject matter, or payee;
- advance payment without clear delivery, acceptance, refund, or recovery arrangements;
- unlimited liability, unilateral exclusions, excessive breach liability, or materially imbalanced responsibility;
- unreasonable transfer of core intellectual-property, data, or confidentiality rights;
- unilateral change or termination rights for the counterparty without company exit or refund protection;
- signals of illegality, commercial bribery, sanctions exposure, or a material conflict of interest.

For `medium` contract risks, ask first and propose actionable revisions, an addendum, or approval conditions. Approval after explicit user confirmation is appropriate only when the business owner accepts the risk, controls can be implemented, and no fundamental entity, amount, or legality issue exists. Record the risks and conditions in the approval comment.

`low` risks may be recommended for approval, but reminders must remain visible. Never use “early-stage company” as a reason to ignore material contract risk.

## Other Business Types

- Payment: verify the contract/application basis, payment conditions, payee, amount, invoice or exception rationale; prevent duplicate or uncontrolled early payment.
- Invoice: verify number, direction, amount, issuing entity, business linkage, and duplicates; highlight a missing direction or insufficient linkage.
- Travel: apply the pragmatic expense principles while checking the real itinerary, business purpose, amount, and duplicate spend.
- Payroll payment: verify batch total, headcount, detail reconciliation, paying entity, and minimization of sensitive information; do not expose individual salary details in user-facing output.
- CRM contract: apply the same contract risk policy, using the contract text and payment, invoice, and receipt relationships aggregated by the system.

## Wording Rules

- State only facts supported by evidence. Say “risk indicator found” or “confirmation required,” rather than directly alleging fraud or illegality.
- Distinguish “no duplicate found” from “duplicate check not completed.”
- Business context supplied by the user may reduce a risk level but cannot erase an observed fact.
- Use company names, contract names, application titles, invoice numbers, and other business labels in user-facing output. Do not use internal IDs as labels.
