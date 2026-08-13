#!/usr/bin/env python3
"""废弃 legacy 自建状态机数据，用平台原生 Flow 重新 mock 审批演示数据。

步骤：
1. 清空 legacy 流程运行时数据（biz_task / biz_action_record）。
2. 修正已有平台验证记录（93/94/96）的标题与业务状态。
3. 对 7 条平台流程各发起若干实例，推进到不同状态（审批中/已通过/已驳回）。
4. 业务 status 列按终态手动同步（平台只回写 flow_status，不回写业务 status）。
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from flow_client import flow_start, todo, approve, timeline
from db.demo_db import demo_connect

APPLICANT = {"applicant_user_id": "81", "applicant_name_snapshot": "梓骞"}

# 业务终态（与 legacy 状态词表对齐，保证列表页/详情页标签正常）
TERMINAL = {
    "expense_application": {"done": "paid_confirmed", "reject": "rejected"},
    "payment_application": {"done": "paid_confirmed", "reject": "rejected"},
    "contract_application": {"done": "signed", "reject": "rejected"},
    "travel_application": {"done": "reviewed", "reject": "rejected"},
    "salary_payment_application": {"done": "paid_confirmed", "reject": "rejected"},
    "invoice_application": {"done": "completed", "reject": "rejected"},
}

# ---------------------------------------------------------------- mock 计划
# (flowCode, datasetCode, table, formData, plan)
# plan: ("run", n) 通过 n 级后停在审批中；("done",) 全部通过；("reject", n) 通过 n 级后驳回
PLAN = [
    # 报销（4 级链）
    ("flow_4d050189_81_c4672e76", "7851365c96244a1896e834daec447ddb", "expense_application",
     {"title": "办公用品集中采购报销", "expense_type": "office",
      "total_original_amount": 1280.5, "total_cny_amount": 1280.5,
      "reimbursable_cny_amount": 1280.5, "payout_currency": "CNY",
      "bank_status": "not_submitted", "status": "submitted", **APPLICANT},
     ("run", 1)),
    ("flow_4d050189_81_c4672e76", "7851365c96244a1896e834daec447ddb", "expense_application",
     {"title": "Q3 线上广告投放费报销", "expense_type": "marketing",
      "total_original_amount": 45000, "total_cny_amount": 45000,
      "reimbursable_cny_amount": 45000, "payout_currency": "CNY",
      "bank_status": "not_submitted", "status": "submitted", **APPLICANT},
     ("done",)),
    # 付款
    ("flow_4d050189_81_d646ef5b", "7da208a5059b4b13896d7c7ae29c8492", "payment_application",
     {"title": "云服务器年度续费付款", "amount": 86000, "currency": "CNY",
      "bank_status": "not_submitted", "status": "submitted", **APPLICANT},
     ("run", 0)),
    ("flow_4d050189_81_d646ef5b", "7da208a5059b4b13896d7c7ae29c8492", "payment_application",
     {"title": "办公家具采购尾款支付", "amount": 32800, "currency": "CNY",
      "bank_status": "not_submitted", "status": "submitted", **APPLICANT},
     ("done",)),
    ("flow_4d050189_81_d646ef5b", "7da208a5059b4b13896d7c7ae29c8492", "payment_application",
     {"title": "市场推广服务费预付款", "amount": 50000, "currency": "CNY",
      "bank_status": "not_submitted", "status": "submitted", **APPLICANT},
     ("reject", 0)),
    # 采购合同
    ("flow_4d050189_81_91089c0e", "53869993f80f45ae8ef6cdf051d8e355", "contract_application",
     {"contract_name": "数据中心机柜租赁服务合同", "amount": 156000, "currency": "CNY",
      "lifecycle_status": "in_progress", "payment_requirement": "required",
      "is_deleted": 0, "status": "submitted", **APPLICANT},
     ("run", 0)),
    ("flow_4d050189_81_91089c0e", "53869993f80f45ae8ef6cdf051d8e355", "contract_application",
     {"contract_name": "办公区保洁服务年度合同", "amount": 48000, "currency": "CNY",
      "lifecycle_status": "in_progress", "payment_requirement": "required",
      "is_deleted": 0, "status": "submitted", **APPLICANT},
     ("done",)),
    # 差旅
    ("flow_4d050189_81_3a471a4d", "28494f18f334400c893576b6e168d3f6", "travel_application",
     {"title": "北京行业峰会出差申请", "destination": "北京", "travel_type": "domestic", "trip_region": "mainland", "currency": "CNY",
      "hotel_needed": 1, "is_deleted": 0,
      "estimated_amount": 6800, "status": "submitted", **APPLICANT},
     ("run", 0)),
    ("flow_4d050189_81_3a471a4d", "28494f18f334400c893576b6e168d3f6", "travel_application",
     {"title": "深圳客户项目验收差旅", "destination": "深圳", "travel_type": "domestic", "trip_region": "mainland", "currency": "CNY",
      "hotel_needed": 0, "is_deleted": 0,
      "estimated_amount": 5200, "status": "submitted", **APPLICANT},
     ("done",)),
    # 工资发放
    ("flow_4d050189_81_ab422b6b", "235e11a9cb7945c8926b4d31fe64843f", "salary_payment_application",
     {"title": "2026年7月工资发放", "payroll_month": "2026-07-01",
      "expected_pay_date": "2026-08-10", "amount": 386500, "currency": "CNY",
      "bank_status": "not_submitted", "is_deleted": 0, "status": "submitted", **APPLICANT},
     ("run", 1)),
    # 开票申请
    ("flow_4d050189_81_1120bd28", "ae51202c44e140828ba87e4571094d1a", "invoice_application",
     {"application_title": "智慧园区项目二期工程款开票",
      "request_type": "new", "requested_amount": 252830.19, "requested_tax_amount": 15169.81,
      "requested_total_amount": 268000, "currency": "CNY", "tax_rate": 0.06,
      "invoice_type": "special", "invoice_medium": "electronic",
      "is_deleted": 0, "status": "submitted", **APPLICANT},
     ("run", 0)),
    ("flow_4d050189_81_1120bd28", "ae51202c44e140828ba87e4571094d1a", "invoice_application",
     {"application_title": "SaaS 订阅服务费开票（7月）",
      "request_type": "new", "requested_amount": 34716.98, "requested_tax_amount": 2083.02,
      "requested_total_amount": 36800, "currency": "CNY", "tax_rate": 0.06,
      "invoice_type": "special", "invoice_medium": "electronic",
      "is_deleted": 0, "status": "submitted", **APPLICANT},
     ("done",)),
    # 销售合同
    ("flow_4d050189_81_67b98a05", "804e3a5ed3224074be329b9ed4799cc3", "crm_contract",
     {"title": "智慧园区 SaaS 平台年度订阅合同", "contract_no": "XS-2026-0811-001",
      "company_id": 61, "amount": 428000, "currency": "CNY",
      "workflow_managed": 1, "cashflow_direction": "inflow", "is_deleted": 0,
      "sign_status": "PENDING", **APPLICANT},
     ("run", 0)),
]

# 已有验证记录的修正：(id, 新标题, 新业务状态)
FIX_EXISTING = [
    (93, "杭州出差打车费报销", "paid_confirmed"),
    (94, "部门团建聚餐费报销", "rejected"),
    (96, "上海客户拜访交通费报销", "submitted"),
]

APPROVE_COMMENTS = ["同意", "已核对，通过", "信息无误，通过", "复核完成"]


def find_task(piid):
    """在平台待办里找指定流程实例的当前任务。"""
    records = (todo(1, 100).get("data") or {}).get("records") or []
    for r in records:
        if r.get("processInstanceId") == piid:
            return r
    return None


def advance(piid, levels, reject_last=False):
    """推进 levels 级；reject_last=True 时在下一级驳回。返回最终实例状态。"""
    done_levels = 0
    for i in range(levels + (1 if reject_last else 0)):
        task = find_task(piid)
        if not task:
            break
        is_reject = reject_last and i == levels
        res = approve(
            task["id"],
            approved=not is_reject,
            comment=("材料不完整，驳回" if is_reject
                     else APPROVE_COMMENTS[i % len(APPROVE_COMMENTS)]),
        )
        if not res.get("success"):
            print(f"  approve failed: {res.get('errorMsg')}")
            break
        done_levels += 1
        time.sleep(0.5)
    tl = timeline(piid).get("data") or {}
    return tl.get("status"), done_levels


def main():
    only = set(sys.argv[1:])
    conn = demo_connect()
    cur = conn.cursor()

    if only:
        run_plan(cur, conn, only)
        conn.close()
        print("MOCK DONE")
        return

    # 1. 废弃 legacy 流程运行时数据
    cur.execute("DELETE FROM biz_task")
    t1 = cur.rowcount
    cur.execute("DELETE FROM biz_action_record")
    t2 = cur.rowcount
    conn.commit()
    print(f"legacy cleaned: biz_task -{t1}, biz_action_record -{t2}")

    # 2. 修正已有平台验证记录
    for rid, title, status in FIX_EXISTING:
        cur.execute("UPDATE expense_application SET title=%s, status=%s WHERE id=%s",
                    (title, status, rid))
    conn.commit()
    print("existing platform records renamed/status-synced: 93/94/96")

    run_plan(cur, conn, set())
    conn.close()
    print("MOCK DONE")


def run_plan(cur, conn, only):
    # 3. 逐条发起平台流程并推进
    for flow_code, dataset_code, table, form, plan in PLAN:
        if only and table not in only:
            continue
        start = flow_start(dataset_code=dataset_code, form_data=form)
        data_id = start.get("data")
        if not start.get("success") or data_id is None:
            print(f"[{table}] START FAILED: {str(start)[:300]}")
            continue
        # 找 piid（该记录最新实例）
        cur.execute(f"SELECT process_instance_id FROM {table} WHERE id=%s", (data_id,))
        row = cur.fetchone()
        piid = row[0] if row else None
        if not piid:
            print(f"[{table}] id={data_id} no process_instance_id!")
            continue

        kind = plan[0]
        if kind == "run":
            final, lv = advance(piid, plan[1])
        elif kind == "done":
            final, lv = advance(piid, 10)  # 多级循环直到待办消失
        else:  # reject
            final, lv = advance(piid, plan[1], reject_last=True)

        # 4. 业务状态同步（终态手动对齐）
        term = TERMINAL.get(table, {})
        if kind == "done":
            cur.execute(f"UPDATE {table} SET status=%s WHERE id=%s",
                        (term.get("done", "approved"), data_id))
        elif kind == "reject":
            cur.execute(f"UPDATE {table} SET status=%s WHERE id=%s",
                        (term.get("reject", "rejected"), data_id))
        conn.commit()
        print(f"[{table}] id={data_id} plan={kind} levels={lv} final={final}")


if __name__ == "__main__":
    main()
