#!/usr/bin/env python3
"""Validate a cpo-batch-workflow-approval execution plan.

The validator is intentionally conservative. It validates structure and safety
invariants; it does not replace live BFF authorization or stale-state checks.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


ALLOWED_MODES = {"dry_run", "confirmed"}
ALLOWED_RECOMMENDATIONS = {
    "approve_recommended",
    "ask_first",
    "reject_recommended",
    "not_eligible",
}
ALLOWED_RISKS = {"none", "low", "medium", "high", "critical", "unknown"}
ALLOWED_ACTIONS = {"review_pass", "review_reject", "none"}
CONTRACT_TYPES = {"contract", "crm_contract"}
MAX_BATCH_SIZE = 20


def read_json(path: str) -> Any:
    if path == "-":
        return json.load(sys.stdin)
    with Path(path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: str, value: Any) -> None:
    rendered = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if path == "-":
        sys.stdout.write(rendered)
        return
    Path(path).write_text(rendered, encoding="utf-8")


def nonempty_text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate(plan: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(plan, dict):
        return ["The plan must be a JSON object"]

    mode = plan.get("mode")
    if mode not in ALLOWED_MODES:
        errors.append(f"mode must be one of {sorted(ALLOWED_MODES)}")

    if mode == "confirmed" and plan.get("userConfirmed") is not True:
        errors.append("confirmed mode requires userConfirmed=true")

    items = plan.get("items")
    if not isinstance(items, list):
        return errors + ["items must be an array"]
    if len(items) > MAX_BATCH_SIZE:
        errors.append(f"A batch may contain at most {MAX_BATCH_SIZE} items; received {len(items)}")

    seen_task_ids: set[str] = set()
    seen_business_keys: set[str] = set()

    for index, item in enumerate(items):
        prefix = f"items[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{prefix} must be an object")
            continue

        task_id = item.get("taskId")
        if task_id is None or str(task_id).strip() == "":
            errors.append(f"{prefix}.taskId is missing")
        else:
            task_key = str(task_id)
            if task_key in seen_task_ids:
                errors.append(f"{prefix}.taskId duplicates another task in this batch")
            seen_task_ids.add(task_key)

        biz_type = item.get("bizType")
        biz_id = item.get("bizId")
        if not nonempty_text(biz_type):
            errors.append(f"{prefix}.bizType is missing")
        if biz_id is None or str(biz_id).strip() == "":
            errors.append(f"{prefix}.bizId is missing")
        elif nonempty_text(biz_type):
            business_key = f"{biz_type}:{biz_id}"
            if business_key in seen_business_keys:
                errors.append(f"{prefix} refers to the same business record as another batch item")
            seen_business_keys.add(business_key)

        if item.get("taskType") != "review":
            errors.append(f"{prefix}.taskType must be review")

        eligible = item.get("eligible")
        if not isinstance(eligible, bool):
            errors.append(f"{prefix}.eligible must be a boolean")

        recommendation = item.get("recommendation")
        if recommendation not in ALLOWED_RECOMMENDATIONS:
            errors.append(
                f"{prefix}.recommendation must be one of {sorted(ALLOWED_RECOMMENDATIONS)}"
            )

        risk = item.get("riskLevel")
        if risk not in ALLOWED_RISKS:
            errors.append(f"{prefix}.riskLevel must be one of {sorted(ALLOWED_RISKS)}")

        action = item.get("proposedAction", "none")
        if action not in ALLOWED_ACTIONS:
            errors.append(f"{prefix}.proposedAction is not an allowed approval action")

        for field in ("findings", "questions"):
            value = item.get(field, [])
            if not isinstance(value, list) or not all(nonempty_text(v) for v in value):
                errors.append(f"{prefix}.{field} must be an array of non-empty strings or an empty array")

        if action == "review_pass":
            if eligible is not True:
                errors.append(f"{prefix} is ineligible and cannot use review_pass")
            if recommendation != "approve_recommended":
                errors.append(f"{prefix} may use review_pass only with approve_recommended")
            if risk in {"high", "critical", "unknown"}:
                errors.append(f"{prefix} has {risk} risk and cannot use review_pass")
            if biz_type in CONTRACT_TYPES and risk not in {"none", "low"}:
                errors.append(f"{prefix} is a contract with risk above low and cannot be approved directly")
            if not nonempty_text(item.get("comment")):
                errors.append(f"{prefix}.comment is required for review_pass")

        if action == "review_reject":
            if eligible is not True:
                errors.append(f"{prefix} is ineligible and cannot use review_reject")
            if mode != "confirmed" or item.get("rejectConfirmed") is not True:
                errors.append(
                    f"{prefix} rejection requires item-level rejectConfirmed=true in confirmed mode"
                )
            if not nonempty_text(item.get("comment")):
                errors.append(f"{prefix}.comment is required for review_reject")

        if recommendation in {"ask_first", "not_eligible"} and action != "none":
            errors.append(f"{prefix} has recommendation {recommendation}; proposedAction must be none")

        if recommendation == "reject_recommended" and action == "review_pass":
            errors.append(f"{prefix} is recommended for rejection and cannot use review_pass")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default="-", help="Input plan JSON; - means stdin")
    parser.add_argument("--output", default="-", help="Output validation JSON; - means stdout")
    args = parser.parse_args()

    try:
        plan = read_json(args.input)
        errors = validate(plan)
    except (OSError, json.JSONDecodeError) as exc:
        errors = [f"Unable to read plan JSON: {exc}"]

    result = {
        "valid": not errors,
        "errorCount": len(errors),
        "errors": errors,
        "maxBatchSize": MAX_BATCH_SIZE,
    }
    write_json(args.output, result)
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
