# Output and Structured-analysis Contract

## Analysis JSON

Use this structure; unknown facts are `null`, never guessed:

```json
{
  "intent": "analyze",
  "source": {
    "files": ["/absolute/path/contract.pdf"],
    "page_count": 7,
    "sha256": ["..."],
    "evidence_notes": ["Version sealed by both parties"]
  },
  "contract": {
    "name": "High-tech Enterprise Certification Service Contract",
    "document_contract_no": null,
    "system_contract_no": "FS-202606050002",
    "direction": "payable",
    "contract_type": "certification",
    "our_role": "party_a",
    "currency": "CNY",
    "total_amount": 60000,
    "sign_date": "2026-06-05",
    "start_date": "2026-06-05",
    "end_date": null,
    "term_text": "Until completion of the agreed services",
    "contract_assessment": "## Objective Assessment\n\nThe service objective is clear and totals reconcile.\n\n## Action Items\n\n- Obtain the invoice after initial payment\n- Confirm deliverables and acceptance in writing\n\n## Risks and Treatment\n\n- **Medium risk**: the audit-fee milestone is unclear; confirm it before submission."
  },
  "parties": [
    {"role": "party_a", "name": "Hangzhou Qizhi Yuntu Technology Co., Ltd.", "is_our_entity": true},
    {"role": "party_b", "name": "Example Intellectual Property Co., Ltd.", "is_our_entity": false}
  ],
  "service_items": [
    {"name": "High-tech enterprise certification", "quantity": null, "amount": 20000, "evidence": "Page 2, 2.1"},
    {"name": "Invention patent fast-track review", "quantity": 1, "amount": 20000, "evidence": "Page 2, 2.1"},
    {"name": "Software copyright", "quantity": 12, "amount": 5000, "evidence": "Page 2, 2.1"},
    {"name": "High-tech audit", "quantity": 3, "amount": 15000, "evidence": "Page 2, 2.1 and 2.2.1"}
  ],
  "payment_plans": [
    {
      "phase_no": 1,
      "phase_name": "Initial Comprehensive Service Fee",
      "amount": 35000,
      "currency": "CNY",
      "planned_pay_date": "2026-06-09",
      "date_basis": "historical_record",
      "trigger_condition": "Pay after signing",
      "status": "paid",
      "evidence": "Page 2, 2.1.1 and 2.1.2; payment approval",
      "payment_evidence": {"type": "paid_confirmed_record", "title": "Initial service fee of 35,000"}
    },
    {
      "phase_no": 2,
      "phase_name": "High-tech Audit Fee",
      "amount": 15000,
      "currency": "CNY",
      "planned_pay_date": null,
      "date_basis": "unknown",
      "trigger_condition": "Complete annual and three special audits; confirm exact timing before payment",
      "status": "pending",
      "evidence": "Page 2, 2.1 and 2.2.1",
      "payment_evidence": null
    },
    {
      "phase_no": 3,
      "phase_name": "Certification Final Payment",
      "amount": 10000,
      "currency": "CNY",
      "planned_pay_date": null,
      "date_basis": "explicit",
      "trigger_condition": "Within three days after certification approval and government publication",
      "status": "pending",
      "evidence": "Page 2, 2.1.1",
      "payment_evidence": null
    }
  ],
  "counterparty": {
    "name": "Example Intellectual Property Co., Ltd.",
    "unified_credit_code": null,
    "contact_name": "Example Contact",
    "contact_phone": "19906837869",
    "contact_email": null,
    "address": "Example Address",
    "bank_name": "Example Bank",
    "bank_account": "1202021209980376743",
    "missing_fields": ["unified_credit_code", "contact_email"]
  },
  "invoice": {
    "clause": "Issue a standard VAT invoice within five business days after each receipt",
    "matched_records": [],
    "missing_evidence": ["Initial-payment invoice"]
  },
  "risk_review": {
    "overall_level": "medium",
    "decision": "pass_with_conditions",
    "reviewed_dimensions": [
      "parties_authority", "subject_scope", "amount_tax", "payment_collection",
      "delivery_acceptance", "invoice_refund", "term_renewal_termination",
      "breach_liability", "ip_confidentiality_data", "compliance_qualification",
      "dispute_resolution", "blanks_conflicts"
    ],
    "summary": "A draft may be saved, but the audit-fee milestone needs confirmation.",
    "conditions": ["Confirm the audit-fee payment trigger before submission"],
    "no_material_risks_reason": null
  },
  "risks": [{
    "category": "payment_collection",
    "level": "medium",
    "code": "AUDIT_PAYMENT_DATE_UNKNOWN",
    "title": "Audit-fee milestone is unclear",
    "evidence": "Page 2, 2.1 and 2.2.1",
    "impact": "May cause a dispute over timing or premature payment",
    "recommendation": "Obtain written confirmation from the counterparty before submission",
    "resolution_status": "open",
    "blocks_submission": true
  }]
}
```

`intent` is `analyze`, `record`, or `correct`. For write tasks, use `record` or `correct`; the validator applies stricter counterparty payment-data requirements.

`contract.contract_assessment` is the Markdown stored in contract master data and must contain `## Objective Assessment` and `## Action Items`, plus `## Risks and Treatment` when needed. It supports quick approval/performance reading but never replaces structured `risk_review` and `risks` evidence.

## User-facing Result Order

1. Status: `analysis_only`, `needs_confirmation`, `ready_to_record`, `needs_developer_migration`, `written_verified`, or `failed`.
2. Contract summary: parties, direction, amount, signing, and term.
3. Risk decision: overall level, submission eligibility, key risks, impacts, recommendations, and storable assessment Markdown.
4. Service and installment table with amount, date/trigger, status, and evidence.
5. Counterparty completeness: verified, corrected, and missing fields.
6. System result by title/business number, with a clickable detail link after save or submission.
7. Follow-ups: legal review, addendum, bank receipt, invoice, credit code, or ambiguous dates.

Never show `Partner #36`, `Payment #10`, Dataset primary keys, or relationship IDs. If no business title can be resolved, show “Related object title missing” and correct the aggregate query.

## Detail Links

Build links only from actual returned `bizType/bizId`; IDs appear only inside the URL:

```markdown
[View “High-tech Enterprise Certification Service Contract”](https://app-4d050189.app.lovrabet.com/application-detail/contract/123)
[View “Annual Customer Service Contract”](https://app-4d050189.app.lovrabet.com/application-detail/crm_contract/456)
```

Use contract name or a clear business number as link text. Reread through current-application contract details and verify title, direction, amount, and status. If readback fails, retain the link from the successful response and list unverified fields.
