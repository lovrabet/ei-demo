# Expert Contract Risk Review Rules

## Method

For every finding, use: contract fact → consequence → recommendation → evidence location. Risks must arise from text, missing clauses, system conflicts, or performance evidence; avoid vague statements.

Review all dimensions:

| Dimension code | Key questions |
| --- | --- |
| `parties_authority` | Full legal names, credit codes, signing authority, seals, affiliate confusion |
| `subject_scope` | Subject, service boundaries, quantity, deliverables, exclusions |
| `amount_tax` | Total, tax inclusion/rate, repricing, extra costs |
| `payment_collection` | Advance ratio, milestones, receipt conditions, retention, account consistency |
| `delivery_acceptance` | Standards, acceptor, deadline, deemed acceptance, remediation |
| `invoice_refund` | Invoice type/timing, refund conditions/deadline, sequencing |
| `term_renewal_termination` | Effectiveness, term, renewal, notice, termination and post-termination handling |
| `breach_liability` | Penalties, damages, caps, indirect loss, unilateral exclusions |
| `ip_confidentiality_data` | Deliverable/background IP, license scope, confidentiality term, data security |
| `compliance_qualification` | Licenses, anti-bribery, subcontracting, labor, export/data compliance |
| `dispute_resolution` | Governing law, court/arbitration, notices, evidence form |
| `blanks_conflicts` | Blanks, handwritten edits, contradictions, missing appendices, nonexistent references |

## Risk Levels

- `critical`: core facts are indeterminate or potentially unlawful, including non-unique party, clearly abnormal seal/authority, amount/currency conflict, unlawful subject, or unexplained account/entity mismatch. Decision must be `legal_review_required` or `do_not_submit`; never submit or trigger funds automatically.
- `high`: potential material financial, delivery, liability, or IP loss, such as unsecured high advance payment, unilateral repricing or indefinite delay, unlimited/imbalanced liability, harmful ownership of core deliverables/data, renewal/exclusivity without exit, or a receivable contract without clear acceptance/collection basis. Unresolved high risk requires at least `pass_with_conditions`, normally `legal_review_required`.
- `medium`: weak controls mitigable by an addendum, confirmation, or internal control, such as vague payment date, missing acceptance deadline, unclear invoice timing/refund deadline, or uncapped extra costs.
- `low`: completeness reminders that do not affect the core transaction, such as missing contact/email or formatting blanks.

For payable contracts, check advance payment against verifiable deliverables, acceptance/invoice conditions, refund availability and timing, vendor/account consistency, and advance approval/budget for travel, government, audit, or third-party charges.

For receivable contracts, check unilateral acceptance or indefinite approval, invoice-before-long-payment terms, excessive credit period or missing late liability, unbounded scope, retention/refund/discount/damages erosion, and unreasonable restrictions on our deliverables, data, or suspension rights.

## Decision and Entry Gate

`risk_review.decision` is one of:

- `pass`: no unresolved high risk or material conflict.
- `pass_with_conditions`: save draft; complete listed conditions and obtain user confirmation before submission.
- `legal_review_required`: save a risk draft and refer to legal counsel/responsible owner; no automatic submission.
- `do_not_submit`: unacceptable or unverifiable key risk.

Derive `entry_gate`: failed structure/amount validation or unresolved critical risk → `blocked`; legal review/do-not-submit or unresolved high risk → `draft_only`; pass with conditions → `needs_confirmation`; clean pass → `ready`.

Each risk contains `category`, `level`, stable English `code`, clear English `title`, `evidence`, concrete `impact`, actionable `recommendation`, `resolution_status` (`open/accepted/mitigated/resolved`), and `blocks_submission`.

When there are no risks, fill `no_material_risks_reason` with reviewed dimensions and the basis for no material finding. This review supports business and legal collaboration but is not formal legal advice requiring licensed counsel.
