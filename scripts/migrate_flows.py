#!/usr/bin/env python3
"""把 cpo_workflow_step_config 的 7 条已发布流程迁移为 Lovrabet 平台 Flow 定义并发布。

线性简化：approval/action 步骤 -> APPROVAL 链；cc 抄送丢弃；审批人 FIXED=配置表 assignee_user_id。
平台 createFlow 硬编码 FORM_FLOW，因此绑定主数据集 + 标准 CREATE 页（如有）。
"""
import json
import os
import sys

import pymysql

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from flow_client import flow_create, flow_publish, flow_page
from db.demo_db import demo_connect

# workflowKey -> (flowName, datasetCode, pageId)
BINDINGS = {
    "expense_reimbursement": ("报销审批", "7851365c96244a1896e834daec447ddb", 1031511),
    "vendor_payment": ("付款审批", "7da208a5059b4b13896d7c7ae29c8492", 1031499),
    "external_service_contract": ("采购合同审批", "53869993f80f45ae8ef6cdf051d8e355", 1031479),
    "travel_request": ("差旅审批", "28494f18f334400c893576b6e168d3f6", 1031503),
    "salary_payment": ("工资发放审批", "235e11a9cb7945c8926b4d31fe64843f", None),
    "outgoing_invoice_application": ("开票申请审批", "ae51202c44e140828ba87e4571094d1a", None),
    "receivable_sales_contract": ("销售合同审批", "804e3a5ed3224074be329b9ed4799cc3", None),
}


def load_steps(cur, workflow_key):
    cur.execute(
        """SELECT step_no, step_name, node_type, assignee_user_id, version_no
           FROM cpo_workflow_step_config
           WHERE workflow_key=%s AND definition_status='published' AND enabled=1 AND is_deleted=0
           ORDER BY version_no DESC, step_no ASC""",
        (workflow_key,),
    )
    rows = cur.fetchall()
    if not rows:
        return []
    max_v = max(r["version_no"] for r in rows)
    return [r for r in rows if r["version_no"] == max_v]


def build_flow_json(workflow_key, flow_name, steps, dataset_code):
    chain = [s for s in steps if (s["node_type"] or "") != "cc"]
    chain.sort(key=lambda s: s["step_no"])

    nodes = [{"id": "start", "type": "START", "name": "开始"}]
    edges = []
    for idx, step in enumerate(chain):
        node_id = f"step_{step['step_no']}"
        nodes.append({
            "id": node_id,
            "type": "APPROVAL",
            "name": step["step_name"] or f"步骤 {step['step_no']}",
            "approvalMode": "SINGLE",
            "assignee": {"strategy": "FIXED", "userIds": [str(step["assignee_user_id"] or "81")]},
        })
        prev_id = "start" if idx == 0 else f"step_{chain[idx-1]['step_no']}"
        edges.append({
            "id": f"e_{prev_id}_{node_id}",
            "source": prev_id,
            "target": node_id,
            "conditionType": "ALWAYS" if idx == 0 else "APPROVED",
        })
        edges.append({
            "id": f"e_{node_id}_rejected",
            "source": node_id,
            "target": "end_rejected",
            "conditionType": "REJECTED",
            "name": "驳回",
        })

    nodes.append({"id": "end_approved", "type": "END", "name": "审批通过", "result": "APPROVED"})
    nodes.append({"id": "end_rejected", "type": "END", "name": "审批驳回", "result": "REJECTED"})
    if chain:
        last_id = f"step_{chain[-1]['step_no']}"
        edges.append({
            "id": f"e_{last_id}_approved",
            "source": last_id,
            "target": "end_approved",
            "conditionType": "APPROVED",
            "name": "通过",
        })
    else:
        edges.append({"id": "e_start_approved", "source": "start",
                      "target": "end_approved", "conditionType": "ALWAYS"})

    return {
        "schemaVersion": "approval.simple-flow.v1",
        "flowKey": workflow_key,
        "flowName": flow_name,
        "bindDatasetCode": dataset_code,
        "nodes": nodes,
        "edges": edges,
        "metadata": {"migratedFrom": "cpo_workflow_step_config", "ccStepsDropped": len(steps) - len(chain)},
    }


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    conn = demo_connect()
    cur = conn.cursor(pymysql.cursors.DictCursor)

    for workflow_key, (flow_name, dataset_code, page_id) in BINDINGS.items():
        if only and workflow_key != only:
            continue
        steps = load_steps(cur, workflow_key)
        if not steps:
            print(f"[{workflow_key}] SKIP: no legacy steps")
            continue
        flow_json = build_flow_json(workflow_key, flow_name, steps, dataset_code)

        create = flow_create(workflow_key, flow_name, flow_json, dataset_code, page_id,
                             desc=f"由 cpo_workflow_step_config 迁移（{workflow_key}）")
        flow_id = (create.get("data") or {}).get("id")
        if not flow_id:
            print(f"[{workflow_key}] CREATE FAILED: {json.dumps(create, ensure_ascii=False)[:400]}")
            continue
        pub = flow_publish(flow_id)
        pdata = pub.get("data") or {}
        print(f"[{workflow_key}] id={flow_id} publish success={pub.get('success')} "
              f"status={pdata.get('flowStatus')} procDefId={pdata.get('procDefId')}"
              + ("" if pub.get("success") else f" RAW={json.dumps(pub, ensure_ascii=False)[:300]}"))

    conn.close()


if __name__ == "__main__":
    main()
