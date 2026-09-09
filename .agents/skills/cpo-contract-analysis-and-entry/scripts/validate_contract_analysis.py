#!/usr/bin/env python3
"""Validate structured contract analysis before Lovrabet entry."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any


DATE_BASIS = {"explicit", "historical_record", "user_confirmed", "inferred", "unknown"}
PLAN_STATUS = {"pending", "processing", "paid", "paid_confirmed", "not_required", "cancelled"}
DIRECTIONS = {"payable", "receivable"}
INTENTS = {"analyze", "record", "correct"}
RISK_LEVELS = {"critical", "high", "medium", "low"}
RISK_DECISIONS = {"pass", "pass_with_conditions", "legal_review_required", "do_not_submit"}
RISK_RESOLUTION_STATUS = {"open", "accepted", "mitigated", "resolved"}
MANDATORY_RISK_DIMENSIONS = {
    "parties_authority",
    "subject_scope",
    "amount_tax",
    "payment_collection",
    "delivery_acceptance",
    "invoice_refund",
    "term_renewal_termination",
    "breach_liability",
    "ip_confidentiality_data",
    "compliance_qualification",
    "dispute_resolution",
    "blanks_conflicts",
}
RISK_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}
INTERNAL_LABEL = re.compile(r"(?:Partner|Payment|Invoice|Contract|Customer|Record|\u4f19\u4f34|\u4ed8\u6b3e|\u53d1\u7968|\u5408\u540c|\u5ba2\u6237|\u8bb0\u5f55)\s*#\s*\d+", re.IGNORECASE)


def decimal_value(value: Any, path: str, errors: list[dict[str, str]]) -> Decimal:
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        errors.append({"code": "INVALID_AMOUNT", "path": path, "message": "Amount must be numeric"})
        return Decimal("0")
    if number < 0:
        errors.append({"code": "NEGATIVE_AMOUNT", "path": path, "message": "Amount cannot be negative"})
    return number


def valid_date(value: Any) -> bool:
    if value in (None, ""):
        return True
    try:
        date.fromisoformat(str(value))
        return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(value)))
    except ValueError:
        return False


def issue(target: list[dict[str, str]], code: str, path: str, message: str) -> None:
    target.append({"code": code, "path": path, "message": message})


def load_payload(path: str) -> dict[str, Any]:
    if path == "-":
        value = json.load(sys.stdin)
    else:
        with Path(path).open("r", encoding="utf-8") as handle:
            value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError("analysis root must be a JSON object")
    return value


def validate(payload: dict[str, Any]) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []

    intent = str(payload.get("intent") or "analyze")
    if intent not in INTENTS:
        issue(errors, "INVALID_INTENT", "intent", "intent must be analyze, record, or correct")

    source = payload.get("source") if isinstance(payload.get("source"), dict) else {}
    files = source.get("files") if isinstance(source.get("files"), list) else []
    if not files or not all(isinstance(item, str) and item.strip() for item in files):
        issue(errors, "SOURCE_FILE_REQUIRED", "source.files", "At least one contract file is required")
    page_count = source.get("page_count")
    if not isinstance(page_count, int) or page_count <= 0:
        issue(warnings, "PAGE_COUNT_MISSING", "source.page_count", "Record the page count and verify every contract page")

    contract = payload.get("contract") if isinstance(payload.get("contract"), dict) else {}
    name = str(contract.get("name") or "").strip()
    if not name:
        issue(errors, "CONTRACT_NAME_REQUIRED", "contract.name", "Contract name is required")
    direction = str(contract.get("direction") or "")
    if direction not in DIRECTIONS:
        issue(errors, "DIRECTION_REQUIRED", "contract.direction", "Direction must be payable or receivable")
    currency = str(contract.get("currency") or "").upper()
    if not re.fullmatch(r"[A-Z]{3}", currency):
        issue(errors, "INVALID_CURRENCY", "contract.currency", "Currency must use a three-letter ISO code")
    total = decimal_value(contract.get("total_amount"), "contract.total_amount", errors)
    if total <= 0:
        issue(errors, "TOTAL_AMOUNT_REQUIRED", "contract.total_amount", "Contract total must be greater than zero")
    for field in ("sign_date", "start_date", "end_date"):
        if not valid_date(contract.get(field)):
            issue(errors, "INVALID_DATE", f"contract.{field}", "Date must be YYYY-MM-DD or null")
    contract_assessment = contract.get("contract_assessment")
    if not isinstance(contract_assessment, str) or not contract_assessment.strip():
        issue(
            errors,
            "CONTRACT_ASSESSMENT_REQUIRED",
            "contract.contract_assessment",
            "A Markdown assessment suitable for contract master data is required",
        )
    else:
        if not re.search(r"^##\s+Objective Assessment\s*$", contract_assessment, re.MULTILINE):
            issue(
                errors,
                "CONTRACT_ASSESSMENT_OBJECTIVE_SECTION_REQUIRED",
                "contract.contract_assessment",
                "Markdown must contain the heading '## Objective Assessment'",
            )
        if not re.search(r"^##\s+Action Items\s*$", contract_assessment, re.MULTILINE):
            issue(
                errors,
                "CONTRACT_ASSESSMENT_ATTENTION_SECTION_REQUIRED",
                "contract.contract_assessment",
                "Markdown must contain the heading '## Action Items'",
            )
        if len(contract_assessment) > 10000:
            issue(
                errors,
                "CONTRACT_ASSESSMENT_TOO_LONG",
                "contract.contract_assessment",
                "Contract assessment must not exceed 10,000 characters",
            )

    parties = payload.get("parties") if isinstance(payload.get("parties"), list) else []
    named_parties = [item for item in parties if isinstance(item, dict) and str(item.get("name") or "").strip()]
    if len(named_parties) < 2:
        issue(errors, "PARTIES_INCOMPLETE", "parties", "At least two parties with full legal names are required")
    if sum(bool(item.get("is_our_entity")) for item in named_parties) != 1:
        issue(errors, "OUR_ENTITY_AMBIGUOUS", "parties", "Exactly one party must be marked as our entity")

    service_items = payload.get("service_items") if isinstance(payload.get("service_items"), list) else []
    service_total = Decimal("0")
    for index, item in enumerate(service_items):
        if not isinstance(item, dict) or not str(item.get("name") or "").strip():
            issue(errors, "SERVICE_NAME_REQUIRED", f"service_items[{index}]", "Every service item requires a name")
            continue
        service_total += decimal_value(item.get("amount", 0), f"service_items[{index}].amount", errors)
        if not str(item.get("evidence") or "").strip():
            issue(warnings, "SERVICE_EVIDENCE_MISSING", f"service_items[{index}].evidence", "Record a page or clause reference")
    if service_items and service_total != total:
        issue(errors, "SERVICE_TOTAL_MISMATCH", "service_items", f"Service-item total {service_total} differs from contract total {total}")

    plans = payload.get("payment_plans") if isinstance(payload.get("payment_plans"), list) else []
    if not plans:
        issue(errors, "PAYMENT_PLANS_REQUIRED", "payment_plans", "Payment or receipt plans covering the contract total are required")
    phase_numbers: list[int] = []
    plan_total = Decimal("0")
    paid_total = Decimal("0")
    for index, plan in enumerate(plans):
        path = f"payment_plans[{index}]"
        if not isinstance(plan, dict):
            issue(errors, "INVALID_PLAN", path, "An installment must be an object")
            continue
        phase_no = plan.get("phase_no")
        if not isinstance(phase_no, int) or phase_no <= 0:
            issue(errors, "INVALID_PHASE_NO", f"{path}.phase_no", "Installment number must be a positive integer")
        else:
            phase_numbers.append(phase_no)
        amount = decimal_value(plan.get("amount"), f"{path}.amount", errors)
        if amount <= 0:
            issue(errors, "PLAN_AMOUNT_REQUIRED", f"{path}.amount", "Each installment amount must be greater than zero")
        plan_total += amount
        status = str(plan.get("status") or "pending")
        if status not in PLAN_STATUS:
            issue(errors, "INVALID_PLAN_STATUS", f"{path}.status", "Unsupported plan status")
        planned_date = plan.get("planned_pay_date")
        if not valid_date(planned_date):
            issue(errors, "INVALID_DATE", f"{path}.planned_pay_date", "Planned date must be YYYY-MM-DD or null")
        date_basis = str(plan.get("date_basis") or "unknown")
        if date_basis not in DATE_BASIS:
            issue(errors, "INVALID_DATE_BASIS", f"{path}.date_basis", "Unsupported date basis")
        if planned_date and date_basis in {"inferred", "unknown"}:
            issue(warnings, "UNVERIFIED_PLAN_DATE", f"{path}.planned_pay_date", "An inferred date cannot be an unexplained contract fact")
        if not planned_date and not str(plan.get("trigger_condition") or "").strip():
            issue(errors, "PLAN_TRIGGER_REQUIRED", path, "A trigger condition is required when no planned date exists")
        if not str(plan.get("evidence") or "").strip():
            issue(warnings, "PLAN_EVIDENCE_MISSING", f"{path}.evidence", "Record installment evidence")
        if status in {"paid", "paid_confirmed"}:
            paid_total += amount
            evidence = plan.get("payment_evidence")
            if not isinstance(evidence, dict) or not str(evidence.get("type") or "").strip():
                issue(errors, "PAID_EVIDENCE_REQUIRED", f"{path}.payment_evidence", "A paid installment requires a payment evidence type")

    if len(set(phase_numbers)) != len(phase_numbers):
        issue(errors, "DUPLICATE_PHASE_NO", "payment_plans", "Installment numbers must be unique")
    if phase_numbers and sorted(phase_numbers) != list(range(1, len(phase_numbers) + 1)):
        issue(warnings, "NON_SEQUENTIAL_PHASES", "payment_plans", "Use consecutive installment numbers starting at 1")
    if plans and plan_total != total:
        issue(errors, "PLAN_TOTAL_MISMATCH", "payment_plans", f"Installment total {plan_total} differs from contract total {total}")

    counterparty = payload.get("counterparty") if isinstance(payload.get("counterparty"), dict) else {}
    if not str(counterparty.get("name") or "").strip():
        issue(errors, "COUNTERPARTY_NAME_REQUIRED", "counterparty.name", "Counterparty legal name is required")
    if intent in {"record", "correct"} and direction == "payable":
        if not str(counterparty.get("bank_name") or "").strip():
            issue(errors, "BANK_NAME_REQUIRED", "counterparty.bank_name", "Verify the bank before recording a payable contract")
        if not str(counterparty.get("bank_account") or "").strip():
            issue(errors, "BANK_ACCOUNT_REQUIRED", "counterparty.bank_account", "Verify the payee account before recording a payable contract")
    missing_fields = counterparty.get("missing_fields") if isinstance(counterparty.get("missing_fields"), list) else []
    for field in missing_fields:
        issue(warnings, "COUNTERPARTY_FIELD_MISSING", f"counterparty.{field}", f"Counterparty field is missing: {field}")

    invoice = payload.get("invoice") if isinstance(payload.get("invoice"), dict) else {}
    if not str(invoice.get("clause") or "").strip():
        issue(warnings, "INVOICE_CLAUSE_MISSING", "invoice.clause", "No invoice clause was extracted")

    risk_review = payload.get("risk_review") if isinstance(payload.get("risk_review"), dict) else {}
    overall_level = str(risk_review.get("overall_level") or "")
    if overall_level not in RISK_LEVELS:
        issue(errors, "RISK_LEVEL_REQUIRED", "risk_review.overall_level", "Overall risk must be critical, high, medium, or low")
    decision = str(risk_review.get("decision") or "")
    if decision not in RISK_DECISIONS:
        issue(errors, "RISK_DECISION_REQUIRED", "risk_review.decision", "A contract risk decision is required")
    if not str(risk_review.get("summary") or "").strip():
        issue(errors, "RISK_SUMMARY_REQUIRED", "risk_review.summary", "An expert risk summary is required")
    reviewed_dimensions = risk_review.get("reviewed_dimensions")
    reviewed_set = set(reviewed_dimensions) if isinstance(reviewed_dimensions, list) else set()
    missing_dimensions = sorted(MANDATORY_RISK_DIMENSIONS - reviewed_set)
    if missing_dimensions:
        issue(errors, "RISK_DIMENSIONS_INCOMPLETE", "risk_review.reviewed_dimensions", f"Required review dimensions missing: {','.join(missing_dimensions)}")
    conditions = risk_review.get("conditions") if isinstance(risk_review.get("conditions"), list) else []
    if decision == "pass_with_conditions" and not any(str(item).strip() for item in conditions):
        issue(errors, "RISK_CONDITIONS_REQUIRED", "risk_review.conditions", "Conditional approval requires pre-submission conditions")

    risks = payload.get("risks") if isinstance(payload.get("risks"), list) else []
    unresolved_critical = False
    unresolved_high = False
    unresolved_blocking = False
    highest_risk_rank = 0
    for index, risk in enumerate(risks):
        path = f"risks[{index}]"
        if not isinstance(risk, dict):
            issue(errors, "INVALID_RISK", path, "A risk must be an object")
            continue
        category = str(risk.get("category") or "")
        if category not in MANDATORY_RISK_DIMENSIONS:
            issue(errors, "INVALID_RISK_CATEGORY", f"{path}.category", "Risk category is not a required review dimension")
        level = str(risk.get("level") or "")
        if level not in RISK_LEVELS:
            issue(errors, "INVALID_RISK_LEVEL", f"{path}.level", "Unsupported risk level")
        else:
            highest_risk_rank = max(highest_risk_rank, RISK_RANK[level])
        for field, label in (
            ("code", "stable risk code"),
            ("title", "risk title"),
            ("evidence", "page, clause, or missing fact"),
            ("impact", "specific impact"),
            ("recommendation", "treatment recommendation"),
        ):
            if not str(risk.get(field) or "").strip():
                issue(errors, "RISK_FIELD_REQUIRED", f"{path}.{field}", f"Required field: {label}")
        resolution_status = str(risk.get("resolution_status") or "")
        if resolution_status not in RISK_RESOLUTION_STATUS:
            issue(errors, "INVALID_RISK_RESOLUTION", f"{path}.resolution_status", "Unsupported risk resolution status")
        blocks_submission = risk.get("blocks_submission")
        if not isinstance(blocks_submission, bool):
            issue(errors, "RISK_BLOCK_FLAG_REQUIRED", f"{path}.blocks_submission", "State explicitly whether the risk blocks submission")
        unresolved = resolution_status == "open"
        if unresolved and level == "critical":
            unresolved_critical = True
            if blocks_submission is not True:
                issue(errors, "CRITICAL_RISK_MUST_BLOCK", path, "An unresolved critical risk must block submission")
        if unresolved and level == "high":
            unresolved_high = True
        if unresolved and blocks_submission is True:
            unresolved_blocking = True

    if not risks and not str(risk_review.get("no_material_risks_reason") or "").strip():
        issue(errors, "NO_RISK_REASON_REQUIRED", "risk_review.no_material_risks_reason", "When no risk is found, explain the basis for the complete review")
    if risks and isinstance(contract_assessment, str) and not re.search(
        r"^##\s+Risks and Treatment\s*$", contract_assessment, re.MULTILINE
    ):
        issue(
            errors,
            "CONTRACT_ASSESSMENT_RISK_SECTION_REQUIRED",
            "contract.contract_assessment",
            "When risks exist, Markdown must contain the heading '## Risks and Treatment'",
        )
    if overall_level in RISK_RANK and highest_risk_rank > RISK_RANK[overall_level]:
        issue(errors, "OVERALL_RISK_UNDERSTATED", "risk_review.overall_level", "Overall risk is lower than an identified item risk")
    if unresolved_critical and decision not in {"legal_review_required", "do_not_submit"}:
        issue(errors, "CRITICAL_RISK_DECISION_INVALID", "risk_review.decision", "Unresolved critical risk requires legal review or no submission")
    if unresolved_critical and intent in {"record", "correct"}:
        issue(errors, "CRITICAL_RISK_UNRESOLVED", "risks", "Unresolved critical risk permits analysis only, not entry or correction")
    if unresolved_high and decision == "pass":
        issue(errors, "HIGH_RISK_DECISION_INVALID", "risk_review.decision", "Unresolved high risk cannot pass directly")

    if errors or unresolved_critical:
        entry_gate = "blocked"
    elif decision in {"legal_review_required", "do_not_submit"} or unresolved_high:
        entry_gate = "draft_only"
    elif decision == "pass_with_conditions" or unresolved_blocking:
        entry_gate = "needs_confirmation"
    else:
        entry_gate = "ready"

    def scan_labels(value: Any, path: str = "") -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                scan_labels(child, f"{path}.{key}" if path else key)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                scan_labels(child, f"{path}[{index}]")
        elif isinstance(value, str) and INTERNAL_LABEL.search(value):
            issue(errors, "INTERNAL_ID_LABEL", path, "User-facing titles cannot use an internal #ID")

    scan_labels(payload)

    return {
        "status": "PASS" if not errors else "BLOCKED",
        "entry_gate": entry_gate,
        "intent": intent,
        "summary": {
            "contract_name": name,
            "direction": direction,
            "currency": currency,
            "contract_total": str(total),
            "service_total": str(service_total),
            "plan_total": str(plan_total),
            "paid_total": str(paid_total),
            "pending_total": str(plan_total - paid_total),
            "phase_count": len(plans),
            "overall_risk_level": overall_level,
            "risk_decision": decision,
            "risk_count": len(risks),
        },
        "errors": errors,
        "warnings": warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Analysis JSON path, or - for stdin")
    parser.add_argument("--output", help="Optional validation JSON output path")
    args = parser.parse_args()
    try:
        result = validate(load_payload(args.input))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        result = {"status": "BLOCKED", "errors": [{"code": "INPUT_ERROR", "path": "", "message": str(exc)}], "warnings": []}
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    else:
        sys.stdout.write(rendered)
    return 0 if result.get("status") == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
