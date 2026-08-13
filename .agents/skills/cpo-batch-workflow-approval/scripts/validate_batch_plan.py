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
        return ["计划必须是 JSON 对象"]

    mode = plan.get("mode")
    if mode not in ALLOWED_MODES:
        errors.append(f"mode 必须是 {sorted(ALLOWED_MODES)} 之一")

    if mode == "confirmed" and plan.get("userConfirmed") is not True:
        errors.append("confirmed 模式必须设置 userConfirmed=true")

    items = plan.get("items")
    if not isinstance(items, list):
        return errors + ["items 必须是数组"]
    if len(items) > MAX_BATCH_SIZE:
        errors.append(f"单批最多 {MAX_BATCH_SIZE} 条，当前为 {len(items)} 条")

    seen_task_ids: set[str] = set()
    seen_business_keys: set[str] = set()

    for index, item in enumerate(items):
        prefix = f"items[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{prefix} 必须是对象")
            continue

        task_id = item.get("taskId")
        if task_id is None or str(task_id).strip() == "":
            errors.append(f"{prefix}.taskId 缺失")
        else:
            task_key = str(task_id)
            if task_key in seen_task_ids:
                errors.append(f"{prefix}.taskId 与本批其他任务重复")
            seen_task_ids.add(task_key)

        biz_type = item.get("bizType")
        biz_id = item.get("bizId")
        if not nonempty_text(biz_type):
            errors.append(f"{prefix}.bizType 缺失")
        if biz_id is None or str(biz_id).strip() == "":
            errors.append(f"{prefix}.bizId 缺失")
        elif nonempty_text(biz_type):
            business_key = f"{biz_type}:{biz_id}"
            if business_key in seen_business_keys:
                errors.append(f"{prefix} 与本批其他条目指向同一业务记录")
            seen_business_keys.add(business_key)

        if item.get("taskType") != "review":
            errors.append(f"{prefix}.taskType 必须为 review")

        eligible = item.get("eligible")
        if not isinstance(eligible, bool):
            errors.append(f"{prefix}.eligible 必须是布尔值")

        recommendation = item.get("recommendation")
        if recommendation not in ALLOWED_RECOMMENDATIONS:
            errors.append(
                f"{prefix}.recommendation 必须是 {sorted(ALLOWED_RECOMMENDATIONS)} 之一"
            )

        risk = item.get("riskLevel")
        if risk not in ALLOWED_RISKS:
            errors.append(f"{prefix}.riskLevel 必须是 {sorted(ALLOWED_RISKS)} 之一")

        action = item.get("proposedAction", "none")
        if action not in ALLOWED_ACTIONS:
            errors.append(f"{prefix}.proposedAction 不是允许的审批动作")

        for field in ("findings", "questions"):
            value = item.get(field, [])
            if not isinstance(value, list) or not all(nonempty_text(v) for v in value):
                errors.append(f"{prefix}.{field} 必须是非空字符串数组或空数组")

        if action == "review_pass":
            if eligible is not True:
                errors.append(f"{prefix} 不具备办理资格，不能 review_pass")
            if recommendation != "approve_recommended":
                errors.append(f"{prefix} 只有 approve_recommended 才能 review_pass")
            if risk in {"high", "critical", "unknown"}:
                errors.append(f"{prefix} 风险为 {risk}，不能 review_pass")
            if biz_type in CONTRACT_TYPES and risk not in {"none", "low"}:
                errors.append(f"{prefix} 合同风险高于 low，不能直接 review_pass")
            if not nonempty_text(item.get("comment")):
                errors.append(f"{prefix}.comment 在 review_pass 时不能为空")

        if action == "review_reject":
            if eligible is not True:
                errors.append(f"{prefix} 不具备办理资格，不能 review_reject")
            if mode != "confirmed" or item.get("rejectConfirmed") is not True:
                errors.append(
                    f"{prefix} 拒绝必须在 confirmed 模式逐项设置 rejectConfirmed=true"
                )
            if not nonempty_text(item.get("comment")):
                errors.append(f"{prefix}.comment 在 review_reject 时不能为空")

        if recommendation in {"ask_first", "not_eligible"} and action != "none":
            errors.append(f"{prefix} 当前建议为 {recommendation}，proposedAction 必须为 none")

        if recommendation == "reject_recommended" and action == "review_pass":
            errors.append(f"{prefix} 建议拒绝的条目不能 review_pass")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default="-", help="输入计划 JSON；- 表示 stdin")
    parser.add_argument("--output", default="-", help="输出校验 JSON；- 表示 stdout")
    args = parser.parse_args()

    try:
        plan = read_json(args.input)
        errors = validate(plan)
    except (OSError, json.JSONDecodeError) as exc:
        errors = [f"无法读取计划 JSON：{exc}"]

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
