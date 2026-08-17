#!/usr/bin/env python3
"""Seed configuration data (dictionary, expense rules, workflow configs)
into ei-demo. Source values come from the published config export, but ALL
real user references are remapped to the demo tenant admin (81 梓骞)."""
import json

import pymysql

import demo_db

ADMIN_ID = "81"
ADMIN_NAME = "梓骞"

cfg = json.load(open("/tmp/config-seed.json"))

conn = demo_db.demo_connect(autocommit=False)
cur = conn.cursor(pymysql.cursors.DictCursor)


def insert(table, rows, drop_cols=("id", "created_at", "updated_at")):
    if not rows:
        return
    cols = [c for c in rows[0].keys() if c not in drop_cols]
    sql = f"INSERT INTO `{table}` ({', '.join('`'+c+'`' for c in cols)}) VALUES ({', '.join(['%s']*len(cols))})"
    for r in rows:
        cur.execute(sql, [r.get(c) for c in cols])
    print(f"{table}: {len(rows)}")


def remap_user(value):
    """Any real platform user id becomes the demo admin."""
    if value is None or value == "":
        return value
    return ADMIN_ID


def remap_name(value):
    if value is None or value == "":
        return value
    return ADMIN_NAME


# ---------------------------------------------------------- dictionary
# application_read_all_user / workflow_admin_user reference real users -> remap to admin;
# everything else is pure enum config copied as-is.
dict_rows = []
for r in cfg["cpo_dictionary"]:
    row = {k: r[k] for k in ("category", "code", "label", "sort_order", "is_active", "is_deleted")}
    if r["category"] in ("application_read_all_user", "workflow_admin_user"):
        row["code"] = ADMIN_ID
        row["label"] = ADMIN_NAME
    dict_rows.append(row)
# dedupe after remap (multiple read-all users collapse to one admin row)
seen = set()
deduped = []
for row in dict_rows:
    key = (row["category"], row["code"])
    if key in seen:
        continue
    seen.add(key)
    deduped.append(row)
insert("cpo_dictionary", deduped)

# ---------------------------------------------------------- expense rules
rule_rows = [
    {k: r[k] for k in (
        "rule_code", "rule_name", "expense_type", "category", "condition_text",
        "calculation_type", "reimburse_ratio", "limit_amount", "requirement_text",
        "priority", "status", "effective_from", "effective_to", "remark", "is_deleted",
    )}
    for r in cfg["expense_rule"]
]
insert("expense_rule", rule_rows)

# ---------------------------------------------------------- workflow step config
step_rows = []
for r in cfg["cpo_workflow_step_config"]:
    row = {k: r[k] for k in (
        "biz_type", "workflow_key", "version_no", "definition_status", "step_no",
        "task_type", "node_type", "step_name", "from_status", "pass_action",
        "pass_to_status", "reject_action", "reject_to_status", "assignee_user_id",
        "assignee_name_snapshot", "assignee_role", "enabled", "is_deleted",
    )}
    row["assignee_user_id"] = remap_user(row["assignee_user_id"])
    row["assignee_name_snapshot"] = ADMIN_NAME
    step_rows.append(row)
insert("cpo_workflow_step_config", step_rows)

# ---------------------------------------------------------- workflow action config
action_rows = []
for r in cfg["cpo_workflow_action_config"]:
    row = {k: r[k] for k in (
        "biz_type", "workflow_key", "version_no", "definition_status", "action_code",
        "action_label", "from_status", "to_status", "current_step_no", "current_task_type",
        "next_step_no", "actor_scope", "actor_role", "danger", "comment_required",
        "manual_allowed", "visible_condition", "handler_codes_json", "field_updates_json",
        "display_order", "enabled", "is_deleted",
    )}
    action_rows.append(row)
insert("cpo_workflow_action_config", action_rows)

conn.commit()
conn.close()
print("CONFIG SEEDED OK")
