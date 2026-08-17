#!/usr/bin/env python3
"""Seed fictional demo data into ei-demo.

All business data is fabricated. Platform user 81 (the demo tenant admin)
is used for every workflow assignee / actor so the demo account can see
todos, approvals and CC items end to end.
"""
import json
import random
from datetime import date, datetime, timedelta

import pymysql

import demo_db

ADMIN_ID = "81"
ADMIN_NAME = "梓骞"

random.seed(20260811)

# ---------------------------------------------------------------- employees
EMPLOYEES = [
    # (work_no, full_name, username, title, user_type)
    ("D001", "林晓岚", "linxiaolan", "总经理", "internal"),
    ("D002", "沈亦舟", "shenyizhou", "财务总监", "internal"),
    ("D003", "顾清让", "guqingrang", "会计", "internal"),
    ("D004", "苏蔓菁", "sumanjing", "出纳", "internal"),
    ("D005", "陆则铭", "luzeming", "销售总监", "internal"),
    ("D006", "祁雨桐", "qiyutong", "客户经理", "internal"),
    ("D007", "宋以安", "songyian", "项目经理", "internal"),
    ("D008", "岑蔚然", "cenweiran", "研发工程师", "internal"),
    ("D009", "穆云旗", "muyunqi", "实施顾问", "internal"),
    ("D010", "白叙白", "baixubai", "行政专员", "internal"),
    ("D011", "梅映雪", "meiyingxue", "法务专员", "internal"),
    ("D012", "霍星辰", "huoxingchen", "市场专员", "internal"),
]

# ------------------------------------------------------- internal entities
ENTITIES = [
    dict(
        entity_code="HQ",
        entity_name="星澜云图科技（杭州）有限公司",
        short_name="星澜云图",
        unified_credit_code="91330100MA27XDEM0A",
        legal_representative="林晓岚",
        registered_address="浙江省杭州市西湖区云栖小镇科海路 66 号",
        business_address="浙江省杭州市西湖区云栖小镇科海路 66 号 3 幢 5 楼",
        contact_name="白叙白",
        contact_phone="0571-88012345",
        contact_email="office@xinglan-demo.example.com",
        bank_name="招商银行杭州分行营业部",
        bank_account_name="星澜云图科技（杭州）有限公司",
        bank_account_no="571908888810801",
        invoice_title="星澜云图科技（杭州）有限公司",
        invoice_tax_no="91330100MA27XDEM0A",
        seal_name="星澜云图科技（杭州）有限公司合同专用章",
        is_default=1,
        sort_no=1,
    ),
    dict(
        entity_code="SH",
        entity_name="星澜云图信息科技（上海）有限公司",
        short_name="星澜上海",
        unified_credit_code="91310115MA1K4DEM2B",
        legal_representative="沈亦舟",
        registered_address="上海市浦东新区张江高科技园区博云路 2 号",
        business_address="上海市浦东新区张江高科技园区博云路 2 号 402 室",
        contact_name="梅映雪",
        contact_phone="021-58012345",
        contact_email="sh@xinglan-demo.example.com",
        bank_name="上海浦东发展银行张江支行",
        bank_account_name="星澜云图信息科技（上海）有限公司",
        bank_account_no="98070154770001234",
        invoice_title="星澜云图信息科技（上海）有限公司",
        invoice_tax_no="91310115MA1K4DEM2B",
        seal_name="星澜云图信息科技（上海）有限公司合同专用章",
        is_default=0,
        sort_no=2,
    ),
]

# ------------------------------------------------------------- partners
PARTNERS = [
    # name, partner_type, contact, phone, category, payment_purpose
    ("阿里云计算有限公司", "supplier", "王客户经理", "0571-85022088", "云服务", "云资源与短信服务采购"),
    ("杭州西子办公用品有限公司", "supplier", "李娟", "0571-88223344", "办公用品", "办公物资采购"),
    ("北京云启人力资源服务有限公司", "service_provider", "赵楠", "010-62998877", "人力资源", "招聘与猎头服务费"),
    ("上海泛微软件科技有限公司", "supplier", "钱峰", "021-50942288", "软件", "协同办公软件许可"),
    ("深圳市赛格物业管理有限公司", "service_provider", "孙丽", "0755-83355666", "物业", "办公室物业管理费"),
    ("杭州铭泰广告有限公司", "service_provider", "周正", "0571-87766554", "市场服务", "品牌投放与物料制作"),
    ("广州蓝鸽翻译服务有限公司", "service_provider", "吴敏", "020-38844556", "翻译", "技术文档翻译服务"),
    ("成都锦江会展服务有限公司", "service_provider", "郑爽", "028-86677889", "会展", "行业展会参展服务费"),
]

# ------------------------------------------------------------ customers
CUSTOMERS = [
    # name, industry, legal_rep
    ("杭州星辰电子商务有限公司", "电子商务", "郑有为"),
    ("宁波海川智能制造股份有限公司", "智能制造", "何建国"),
    ("苏州绿茵生物科技有限公司", "生物医药", "许文静"),
    ("南京紫金山软件研究院有限公司", "软件研发", "范志毅"),
    ("上海澄光广告传媒有限公司", "广告传媒", "崔丽丽"),
    ("北京字节方舟教育科技有限公司", "在线教育", "袁浩然"),
]

CONN = demo_db.demo_connect(autocommit=False)
CUR = CONN.cursor(pymysql.cursors.DictCursor)


def insert(table, rows):
    # Per-row columns: skip None values so NOT NULL columns with DB defaults
    # (bank_status, lifecycle_status, ...) fall through to their defaults and
    # nullable columns simply stay NULL.
    ids = []
    for r in rows:
        cols = [c for c, v in r.items() if v is not None]
        sql = (
            f"INSERT INTO `{table}` ({', '.join('`'+c+'`' for c in cols)})"
            f" VALUES ({', '.join(['%s'] * len(cols))})"
        )
        CUR.execute(sql, [r[c] for c in cols])
        ids.append(CUR.lastrowid)
    return ids


def ts(days_ago=0, hour=10):
    d = datetime.now() - timedelta(days=days_ago)
    return d.replace(hour=hour, minute=random.randint(0, 59), second=0, microsecond=0)


def main():
    # ---------------------------------------------------- CRM dictionaries (FK targets)
    status_rows = [
        ("LEAD", "线索", 1, 10, "初步线索"),
        ("VALIDATING", "正在验证", 1, 15, "正在进行需求验证和评估"),
        ("QUALIFIED", "已确定意向", 1, 20, "资格评估通过"),
        ("CONTRACT_PENDING", "待签署合同", 1, 30, "合同待签或审批中"),
        ("CONTRACT_IN_PROGRESS", "合同进行中", 1, 40, "合同已签署并在履约"),
        ("ON_HOLD", "暂缓", 1, 50, "暂缓推进"),
        ("LOST", "丢单", 1, 90, "机会失败"),
        ("CUSTOMER", "已成交客户", 1, 100, "已形成付费客户"),
    ]
    for code, name, active, sort, desc in status_rows:
        CUR.execute(
            "INSERT INTO crm_customer_status (code, name, is_active, sort_order, description) VALUES (%s,%s,%s,%s,%s)",
            (code, name, active, sort, desc),
        )
    stage_rows = [
        ("DISCOVERY", "需求挖掘", 10), ("QUALIFICATION", "资格评估", 20),
        ("PROPOSAL", "方案与报价", 30), ("NEGOTIATION", "商务谈判", 40),
        ("CONTRACT", "合同签署", 50), ("DELIVERY", "交付实施", 60),
        ("WON", "赢单", 90), ("LOST", "丢单", 95),
    ]
    for code, name, order_no in stage_rows:
        CUR.execute(
            "INSERT INTO crm_opportunity_stage (code, name, order_no, is_active) VALUES (%s,%s,%s,1)",
            (code, name, order_no),
        )
    print("crm dictionaries seeded")

    # ---------------------------------------------------- employees
    emp_rows = []
    for work_no, full_name, username, title, user_type in EMPLOYEES:
        emp_rows.append(
            dict(
                yuntoo_email=f"{username}@xinglan-demo.example.com",
                lovrabet_member_id=None,
                username=username,
                work_no=work_no,
                full_name=full_name,
                title=title,
                nickname=full_name,
                mobile=f"139{random.randint(10000000, 99999999)}",
                email=f"{username}@xinglan-demo.example.com",
                user_type=user_type,
                avatar=None,
                on_job=1,
                deleted=0,
            )
        )
    emp_ids = insert("employee", emp_rows)
    print("employee:", len(emp_ids))

    # ---------------------------------------------------- internal legal entities
    ent_rows = []
    for e in ENTITIES:
        row = dict(e)
        row.update(status="active", remark=None, created_by=ADMIN_NAME, updated_by=ADMIN_NAME)
        ent_rows.append(row)
    ent_ids = insert("internal_legal_entity", ent_rows)
    print("internal_legal_entity:", ent_ids)

    # ---------------------------------------------------- business partners
    partner_rows = []
    for name, ptype, contact, phone, category, purpose in PARTNERS:
        partner_rows.append(
            dict(
                name=name,
                partner_type=ptype,
                unified_credit_code=f"91{random.randint(10**16, 10**17 - 1)}X",
                contact_name=contact,
                contact_phone=phone,
                contact_email=None,
                address=None,
                bank_name=None,
                bank_account=None,
                status="active",
                external_source=None,
                external_record_id=None,
                supplier_category=category,
                payment_purpose=purpose,
                remark=None,
            )
        )
    partner_ids = insert("business_partner", partner_rows)
    print("business_partner:", partner_ids)

    # ---------------------------------------------------- crm companies / contacts
    comp_rows = []
    for name, industry, legal in CUSTOMERS:
        comp_rows.append(
            dict(
                name=name,
                uscc=f"91{random.randint(10**16, 10**17 - 1)}K",
                legal_rep=legal,
                reg_capital=random.choice([500, 1000, 2000, 5000]),
                reg_capital_unit="万元",
                founded_date=date(2015, random.randint(1, 12), random.randint(1, 28)),
                industry=industry,
                business_scope=None,
                reg_address=None,
                status_code="CUSTOMER",
            )
        )
    comp_ids = insert("crm_company", comp_rows)
    contact_rows = []
    for cid, (name, _, _) in zip(comp_ids, CUSTOMERS):
        contact_rows.append(
            dict(
                company_id=cid,
                name=f"{name[0]}经理",
                title="采购经理",
                phone=f"138{random.randint(10000000, 99999999)}",
                email=None,
                wechat=None,
                dept="采购部",
                is_primary=1,
                remarks=None,
            )
        )
    contact_ids = insert("crm_contact", contact_rows)
    print("crm_company:", comp_ids, "crm_contact:", contact_ids)

    # ---------------------------------------------------- opportunities / contracts / plans
    owner = 81
    opp_rows, contract_rows, plan_rows = [], [], []
    contract_specs = [
        # (customer_idx, title, amount, sign_status, signed_days_ago, periods)
        (0, "星辰电商数据中台建设项目", 1200000, "signed", 200, 3),
        (1, "海川智能制造 MES 系统集成", 860000, "signed", 150, 3),
        (2, "绿茵生物实验室信息系统", 450000, "signed", 90, 2),
        (3, "紫金山软件定制开发服务", 680000, "signed", 60, 2),
        (4, "澄光广告投放管理系统", 320000, "draft", None, 2),
    ]
    for idx, (ci, title, amount, sign_status, signed_ago, periods) in enumerate(contract_specs):
        cid = comp_ids[ci]
        opp_rows.append(
            dict(
                company_id=cid,
                name=title,
                description=None,
                stage="WON" if sign_status == "signed" else "NEGOTIATION",
                amount=amount,
                currency="CNY",
                probability=100 if sign_status == "signed" else 60,
                expected_close=date.today() - timedelta(days=signed_ago or -30),
                owner_user_id=owner,
                status_code="CUSTOMER" if sign_status == "signed" else "QUALIFIED",
            )
        )
    opp_ids = insert("crm_opportunity", opp_rows)
    for idx, (ci, title, amount, sign_status, signed_ago, periods) in enumerate(contract_specs):
        signed_date = date.today() - timedelta(days=signed_ago) if signed_ago else None
        contract_rows.append(
            dict(
                company_id=comp_ids[ci],
                opportunity_id=opp_ids[idx],
                contract_no=f"HT-2026-{idx + 1:03d}",
                title=title,
                amount=amount,
                currency="CNY",
                sign_status=sign_status,
                signed_date=signed_date,
                start_date=signed_date,
                end_date=(signed_date + timedelta(days=365)) if signed_date else None,
                owner_user_id=owner,
                applicant_user_id=ADMIN_ID,
                applicant_name_snapshot=ADMIN_NAME,
                submitted_at=ts(signed_ago + 5) if signed_ago else None,
                workflow_managed=1 if sign_status == "signed" else 0,
                remark=None,
                payment_periods=periods,
                cashflow_direction="inflow",
            )
        )
    contract_ids = insert("crm_contract", contract_rows)
    for idx, (ci, title, amount, sign_status, signed_ago, periods) in enumerate(contract_specs):
        if sign_status != "signed":
            continue
        per = amount // periods
        for p in range(periods):
            planned = date.today() - timedelta(days=signed_ago) + timedelta(days=30 * (p + 1))
            status = "received" if p == 0 else ("partially_received" if p == 1 and periods > 2 else "pending")
            plan_rows.append(
                dict(
                    contract_id=contract_ids[idx],
                    phase_no=p + 1,
                    phase_name=f"第{p + 1}期收款",
                    planned_amount=per,
                    currency="CNY",
                    planned_receipt_date=planned,
                    trigger_condition="按合同约定账期",
                    status=status,
                    invoiced_amount=per if status == "received" else 0,
                    received_amount=per if status == "received" else 0,
                    actual_received_date=planned if status == "received" else None,
                    data_quality_status="complete",
                    remark=None,
                    created_by_user_id=owner,
                    created_by_name_snapshot=ADMIN_NAME,
                    updated_by_user_id=owner,
                    updated_by_name_snapshot=ADMIN_NAME,
                )
            )
    plan_ids = insert("crm_contract_receivable_plan", plan_rows)
    print("crm_opportunity:", len(opp_ids), "crm_contract:", contract_ids, "receivable_plan:", len(plan_ids))

    # ---------------------------------------------------- customer receipts
    receipt_rows = [
        dict(
            receipt_no="SK-2026-001",
            receipt_title="星辰电商数据中台项目首期款",
            crm_company_id=comp_ids[0],
            customer_name_snapshot=CUSTOMERS[0][0],
            amount=400000,
            currency="CNY",
            received_date=date.today() - timedelta(days=170),
            date_precision="exact",
            status="confirmed",
            receipt_method="bank_transfer",
            bank_reference=f"2026{random.randint(10**9, 10**10 - 1)}",
            source_type="manual",
            source_record_key=None,
            data_quality_status="complete",
            remark=None,
            created_by_user_id=ADMIN_ID,
            created_by_name_snapshot=ADMIN_NAME,
            updated_by_user_id=ADMIN_ID,
            updated_by_name_snapshot=ADMIN_NAME,
        ),
        dict(
            receipt_no="SK-2026-002",
            receipt_title="海川 MES 项目首期款",
            crm_company_id=comp_ids[1],
            customer_name_snapshot=CUSTOMERS[1][0],
            amount=280000,
            currency="CNY",
            received_date=date.today() - timedelta(days=120),
            date_precision="exact",
            status="confirmed",
            receipt_method="bank_transfer",
            bank_reference=f"2026{random.randint(10**9, 10**10 - 1)}",
            source_type="manual",
            source_record_key=None,
            data_quality_status="complete",
            remark=None,
            created_by_user_id=ADMIN_ID,
            created_by_name_snapshot=ADMIN_NAME,
            updated_by_user_id=ADMIN_ID,
            updated_by_name_snapshot=ADMIN_NAME,
        ),
    ]
    receipt_ids = insert("customer_receipt", receipt_rows)
    print("customer_receipt:", receipt_ids)

    # ---------------------------------------------------- contract applications (payable)
    ca_specs = [
        # title, partner_idx, amount, status, days_ago, direction
        ("阿里云年度资源采购合同", 0, 360000, "archived", 210),
        ("泛微协同办公平台采购合同", 3, 150000, "signed", 100),
        ("铭泰广告年度投放框架合同", 5, 240000, "signed", 80),
        ("蓝鸽翻译服务年度框架合同", 6, 60000, "draft", 3),
    ]
    ca_rows = []
    for i, (title, pi, amount, status, days_ago) in enumerate(ca_specs):
        submitted = None if status == "draft" else ts(days_ago)
        ca_rows.append(
            dict(
                contract_no=f"CG-2026-{i + 1:03d}" if status != "draft" else None,
                applicant_user_id=ADMIN_ID,
                applicant_name_snapshot=ADMIN_NAME,
                contract_name=title,
                contract_type="purchase",
                our_role="buyer",
                direction="outflow",
                partner_id=partner_ids[pi],
                amount=amount,
                currency="CNY",
                start_date=date.today() - timedelta(days=days_ago),
                end_date=date.today() - timedelta(days=days_ago) + timedelta(days=365),
                liaison_user_id=None,
                liaison_name_snapshot=None,
                signed_at=ts(days_ago - 2) if status in ("signed", "archived") else None,
                current_version_id=None,
                archive_location="档案柜 A-3" if status == "archived" else None,
                remark=None,
                contract_assessment=None,
                status=status,
                submitted_at=submitted,
                lifecycle_status="in_progress" if status in ("signed", "archived") else "pending_signature",
                lifecycle_updated_at=ts(days_ago - 2) if status in ("signed", "archived") else None,
                payment_requirement="required",
            )
        )
    ca_ids = insert("contract_application", ca_rows)
    print("contract_application:", ca_ids)

    # ---------------------------------------------------- contract payment plans
    cpp_rows = [
        dict(contract_id=ca_ids[0], phase_no=1, phase_name="首付款", planned_amount=180000,
             currency="CNY", planned_pay_date=date.today() - timedelta(days=200),
             trigger_condition="合同签署后 15 日内", status="paid",
             linked_payment_application_id=None, actual_paid_amount=180000, invoiced_amount=180000,
             actual_paid_at=ts(198), remark=None),
        dict(contract_id=ca_ids[0], phase_no=2, phase_name="尾款", planned_amount=180000,
             currency="CNY", planned_pay_date=date.today() - timedelta(days=30),
             trigger_condition="服务满 6 个月", status="paid",
             linked_payment_application_id=None, actual_paid_amount=180000, invoiced_amount=180000,
             actual_paid_at=ts(28), remark=None),
        dict(contract_id=ca_ids[1], phase_no=1, phase_name="首付款", planned_amount=75000,
             currency="CNY", planned_pay_date=date.today() - timedelta(days=90),
             trigger_condition="合同签署后 10 日内", status="paid",
             linked_payment_application_id=None, actual_paid_amount=75000, invoiced_amount=75000,
             actual_paid_at=ts(88), remark=None),
        dict(contract_id=ca_ids[1], phase_no=2, phase_name="尾款", planned_amount=75000,
             currency="CNY", planned_pay_date=date.today() + timedelta(days=30),
             trigger_condition="系统上线验收后", status="pending",
             linked_payment_application_id=None, actual_paid_amount=None, invoiced_amount=0,
             actual_paid_at=None, remark=None),
        dict(contract_id=ca_ids[2], phase_no=1, phase_name="季度投放费 Q3", planned_amount=60000,
             currency="CNY", planned_pay_date=date.today() + timedelta(days=15),
             trigger_condition="季度投放完成后结算", status="pending",
             linked_payment_application_id=None, actual_paid_amount=None, invoiced_amount=0,
             actual_paid_at=None, remark=None),
    ]
    for r in cpp_rows:
        r.update(is_deleted=0)
    cpp_ids = insert("contract_payment_plan", cpp_rows)
    print("contract_payment_plan:", cpp_ids)

    # ---------------------------------------------------- payment applications
    pa_specs = [
        # title, partner_idx, contract_idx(ca), plan_idx(cpp), amount, status, days_ago
        ("阿里云资源首付款", 0, 0, 0, 180000, "paid_confirmed", 199),
        ("阿里云资源尾款", 0, 0, 1, 180000, "paid_confirmed", 29),
        ("泛微平台首付款", 3, 1, 2, 75000, "paid_confirmed", 89),
        ("办公用品季度采购付款", 1, None, None, 12800, "paid_confirmed", 45),
        ("赛格物业 Q3 物业费", 4, None, None, 36000, "reviewed", 6),
        ("云启人力猎头服务费", 2, None, None, 45000, "draft", 1),
    ]
    pa_rows = []
    for title, pi, cai, cppi, amount, status, days_ago in pa_specs:
        paid = status == "paid_confirmed"
        pa_rows.append(
            dict(
                applicant_user_id=ADMIN_ID,
                applicant_name_snapshot=ADMIN_NAME,
                partner_id=partner_ids[pi],
                contract_id=ca_ids[cai] if cai is not None else None,
                payment_plan_id=cpp_ids[cppi] if cppi is not None else None,
                payment_type="vendor_payment",
                title=title,
                amount=amount,
                planned_amount_snapshot=amount,
                currency="CNY",
                payment_phase_no=1,
                payment_phase_name=None,
                total_phase_count=None,
                phase_trigger_condition=None,
                liaison_user_id=None,
                liaison_name_snapshot=None,
                expected_pay_date=date.today() - timedelta(days=days_ago),
                planned_pay_date_snapshot=None,
                plan_variance_reason=None,
                bank_account_snapshot=None,
                bank_status="confirmed" if paid else None,
                bank_submitted_at=ts(days_ago - 1) if paid else None,
                bank_confirmed_at=ts(days_ago) if paid else None,
                bank_confirmed_by_user_id=ADMIN_ID if paid else None,
                bank_confirmed_by_name_snapshot=ADMIN_NAME if paid else None,
                bank_receipt_attachment_id=None,
                current_owner_user_id=None,
                current_owner_role=None,
                current_owner_name_snapshot=None,
                last_action_at=ts(days_ago),
                remark=None,
                status=status,
                submitted_at=ts(days_ago + 2) if status != "draft" else None,
            )
        )
    pa_ids = insert("payment_application", pa_rows)
    print("payment_application:", pa_ids)

    # ---------------------------------------------------- travel applications
    ta_specs = [
        ("北京客户拜访出差", "domestic", "杭州", "北京", 5, "reviewed", 20, 4500),
        ("成都展会参展出差", "domestic", "杭州", "成都", 3, "reviewed", 35, 6800),
        ("上海分公司支持出差", "domestic", "杭州", "上海", 2, "draft", 0, 1500),
    ]
    ta_rows = []
    for title, ttype, origin, dest, days, status, days_ago, amount in ta_specs:
        ta_rows.append(
            dict(
                applicant_user_id=ADMIN_ID,
                applicant_name_snapshot=ADMIN_NAME,
                title=title,
                travel_type=ttype,
                trip_region="mainland",
                origin_city=origin,
                destination_city=dest,
                start_date=date.today() - timedelta(days=days_ago + 10),
                end_date=date.today() - timedelta(days=days_ago + 10 - days),
                travel_reason="客户现场沟通与项目交付支持",
                estimated_amount=amount,
                currency="CNY",
                transport_type="high_speed_train",
                hotel_needed=1,
                partner_id=None,
                project_name=None,
                companions_json=None,
                remark=None,
                status=status,
                submitted_at=ts(days_ago + 12) if status != "draft" else None,
            )
        )
    ta_ids = insert("travel_application", ta_rows)
    print("travel_application:", ta_ids)

    # ---------------------------------------------------- expense applications + items
    ea_specs = [
        # title, type, total, status, days_ago
        ("北京出差差旅费报销", "travel", 4280.50, "paid_confirmed", 15),
        ("7 月团队建设费用报销", "team_building", 3600, "paid_confirmed", 25),
        ("办公用品采购报销", "office", 899.90, "reviewed", 4),
        ("云服务月度费用报销", "cloud", 12500, "submitted", 1),
        ("8 月通讯费报销", "telecom", 300, "draft", 0),
        ("客户商务宴请报销", "business_relation", 2680, "rejected", 10),
    ]
    ea_rows, ei_rows = [], []
    for title, etype, total, status, days_ago in ea_specs:
        paid = status == "paid_confirmed"
        submitted = status not in ("draft",)
        ea_rows.append(
            dict(
                applicant_user_id=ADMIN_ID,
                applicant_name_snapshot=ADMIN_NAME,
                expense_type=etype,
                travel_type=None,
                title=title,
                total_original_amount=total,
                total_cny_amount=total,
                reimbursable_cny_amount=total,
                payout_currency="CNY",
                status=status,
                bank_status="confirmed" if paid else None,
                bank_submitted_at=ts(days_ago - 1) if paid else None,
                bank_confirmed_at=ts(days_ago) if paid else None,
                bank_confirmed_by_user_id=ADMIN_ID if paid else None,
                bank_confirmed_by_name_snapshot=ADMIN_NAME if paid else None,
                bank_receipt_attachment_id=None,
                last_action_at=ts(days_ago),
                submitted_at=ts(days_ago + 1) if submitted else None,
                remark=None,
            )
        )
    ea_ids = insert("expense_application", ea_rows)
    for eid, (title, etype, total, status, days_ago) in zip(ea_ids, ea_specs):
        parts = 2 if total > 2000 else 1
        per = round(float(total) / parts, 2)
        for i in range(parts):
            ei_rows.append(
                dict(
                    expense_id=eid,
                    occurred_date=date.today() - timedelta(days=days_ago + 3),
                    category={"travel": "transport", "team_building": "activity", "office": "supplies",
                              "cloud": "service", "telecom": "service", "business_relation": "entertainment"}[etype],
                    description=f"{title} - 明细{i + 1}",
                    original_currency="CNY",
                    original_amount=per,
                    exchange_rate_to_cny=1,
                    cny_amount=per,
                    cabin_class=None,
                    reimburse_ratio=1,
                    reimbursable_cny_amount=per,
                    invoice_id=None,
                    offset_invoice_id=None,
                    compliance_status="compliant",
                    remark=None,
                )
            )
    ei_ids = insert("expense_item", ei_rows)
    print("expense_application:", ea_ids, "expense_item:", len(ei_ids))

    # ---------------------------------------------------- salary payments
    spa_rows = []
    for month_offset, status, days_ago in [(2, "paid_confirmed", 40), (1, "paid_confirmed", 10), (0, "draft", 0)]:
        month = (date.today().replace(day=1) - timedelta(days=30 * month_offset)).replace(day=1)
        paid = status == "paid_confirmed"
        spa_rows.append(
            dict(
                applicant_user_id=ADMIN_ID,
                applicant_name_snapshot=ADMIN_NAME,
                title=f"{month.strftime('%Y 年 %m 月')}工资发放",
                payroll_month=month,
                internal_legal_entity_id=ent_ids[0],
                internal_legal_entity_name_snapshot=ENTITIES[0]["entity_name"],
                employee_count=len(EMPLOYEES),
                amount=386000,
                currency="CNY",
                payment_method="bank_transfer",
                expected_pay_date=month + timedelta(days=9),
                bank_status="confirmed" if paid else None,
                bank_submitted_at=ts(days_ago + 1) if paid else None,
                bank_confirmed_at=ts(days_ago) if paid else None,
                bank_confirmed_by_user_id=ADMIN_ID if paid else None,
                bank_confirmed_by_name_snapshot=ADMIN_NAME if paid else None,
                bank_receipt_attachment_id=None,
                current_owner_user_id=None,
                current_owner_role=None,
                current_owner_name_snapshot=None,
                last_action_at=ts(days_ago),
                remark=None,
                status=status,
                submitted_at=ts(days_ago + 3) if status != "draft" else None,
            )
        )
    spa_ids = insert("salary_payment_application", spa_rows)
    spi_rows = []
    for sid in spa_ids:
        for sort_no, (project, count, amount) in enumerate(
            [("星澜云图工资", 10, 320000), ("星澜上海工资", 2, 52000), ("个税代扣往来款", 12, 14000)], start=1
        ):
            spi_rows.append(
                dict(
                    salary_payment_id=sid,
                    internal_legal_entity_id=ent_ids[0] if sort_no != 2 else ent_ids[1],
                    internal_legal_entity_name_snapshot=ENTITIES[0]["entity_name"] if sort_no != 2 else ENTITIES[1]["entity_name"],
                    payment_project=project,
                    employee_count=count,
                    amount=amount,
                    currency="CNY",
                    payment_method="bank_transfer",
                    sort_no=sort_no,
                    remark=None,
                )
            )
    spi_ids = insert("salary_payment_item", spi_rows)
    print("salary_payment_application:", spa_ids, "items:", len(spi_ids))

    # ---------------------------------------------------- invoice records (incoming)
    ir_rows = []
    for i, (title, pi, amount, tax, days_ago) in enumerate([
        ("阿里云资源服务费发票", 0, 169811.32, 10188.68, 197),
        ("办公用品采购发票", 1, 12056.60, 743.40, 46),
        ("物业费发票 Q3", 4, 33962.26, 2037.74, 7),
    ]):
        ir_rows.append(
            dict(
                applicant_user_id=ADMIN_ID,
                applicant_name_snapshot=ADMIN_NAME,
                invoice_title=title,
                request_type="reimburse",
                invoice_direction="incoming",
                invoice_purpose="deduction",
                partner_id=partner_ids[pi],
                partner_source="local",
                partner_name_snapshot=PARTNERS[pi][0],
                contract_id=None,
                invoice_no=f"24{random.randint(10**9, 10**10 - 1)}",
                invoice_date=date.today() - timedelta(days=days_ago),
                seller_name=PARTNERS[pi][0],
                buyer_name=ENTITIES[0]["entity_name"],
                buyer_tax_no=ENTITIES[0]["unified_credit_code"],
                buyer_address_phone=None,
                buyer_bank_account=None,
                amount=amount,
                tax_amount=tax,
                total_amount=round(amount + tax, 2),
                currency="CNY",
                tax_rate=0.06,
                invoice_region="mainland",
                invoice_type="special",
                invoice_content="*信息技术服务*服务费",
                invoice_medium="electronic",
                is_mainland_compliant=1,
                category=None,
                file_path=None,
                receiver_name=ADMIN_NAME,
                receiver_phone=None,
                receiver_email=None,
                status="archived",
                remark=None,
                submitted_at=ts(days_ago),
            )
        )
    ir_ids = insert("invoice_record", ir_rows)
    print("invoice_record:", ir_ids)

    # ---------------------------------------------------- outgoing invoice applications
    ia_rows = [
        dict(
            application_no="INV-2026-001",
            application_title="星辰电商数据中台项目首期开票",
            applicant_user_id=ADMIN_ID,
            applicant_name_snapshot=ADMIN_NAME,
            request_type="new",
            crm_company_id=comp_ids[0],
            customer_name_snapshot=CUSTOMERS[0][0],
            crm_contract_id=contract_ids[0],
            contract_title_snapshot=contract_specs[0][1],
            seller_name=ENTITIES[0]["entity_name"],
            buyer_name=CUSTOMERS[0][0],
            buyer_tax_no=f"91{random.randint(10**16, 10**17 - 1)}K",
            buyer_address_phone=None,
            buyer_bank_account=None,
            requested_amount=377358.49,
            requested_tax_amount=22641.51,
            requested_total_amount=400000,
            currency="CNY",
            tax_rate=0.06,
            invoice_type="special",
            invoice_content="*信息技术服务*软件开发服务",
            invoice_medium="electronic",
            receiver_name="郑有为",
            receiver_phone=None,
            receiver_email=None,
            payment_condition_snapshot="首期款到账后 10 个工作日内开票",
            status="completed",
            submitted_at=ts(175),
            completed_at=ts(172),
            remark=None,
        ),
        dict(
            application_no="INV-2026-002",
            application_title="海川 MES 项目首期开票申请",
            applicant_user_id=ADMIN_ID,
            applicant_name_snapshot=ADMIN_NAME,
            request_type="new",
            crm_company_id=comp_ids[1],
            customer_name_snapshot=CUSTOMERS[1][0],
            crm_contract_id=contract_ids[1],
            contract_title_snapshot=contract_specs[1][1],
            seller_name=ENTITIES[0]["entity_name"],
            buyer_name=CUSTOMERS[1][0],
            buyer_tax_no=f"91{random.randint(10**16, 10**17 - 1)}K",
            buyer_address_phone=None,
            buyer_bank_account=None,
            requested_amount=264150.94,
            requested_tax_amount=15849.06,
            requested_total_amount=280000,
            currency="CNY",
            tax_rate=0.06,
            invoice_type="special",
            invoice_content="*信息技术服务*系统集成服务",
            invoice_medium="electronic",
            receiver_name="何建国",
            receiver_phone=None,
            receiver_email=None,
            payment_condition_snapshot=None,
            status="submitted",
            submitted_at=ts(2),
            completed_at=None,
            remark=None,
        ),
    ]
    ia_ids = insert("invoice_application", ia_rows)
    print("invoice_application:", ia_ids)

    # ---------------------------------------------------- legal agreements
    la_rows = [
        dict(
            agreement_no="LA-2026-001", revision_no=1, parent_agreement_id=None,
            agreement_type="NDA", agreement_title="与星辰电商保密协议", status="EFFECTIVE",
            project_name="星辰电商数据中台建设项目", cooperation_matter="数据中台建设合作保密",
            primary_crm_company_id=comp_ids[0], primary_crm_contact_id=contact_ids[0],
            primary_party_name_snapshot=CUSTOMERS[0][0], related_quote_id=None,
            template_id=None, current_document_id=None,
            agreement_date=date.today() - timedelta(days=205),
            signed_date=date.today() - timedelta(days=203),
            effective_date=date.today() - timedelta(days=203),
            confidentiality_period_type="FIXED_YEARS", confidentiality_years=3,
            return_destroy_days=15, breach_penalty_type="ACTUAL_LOSS",
            breach_penalty_amount=None, breach_penalty_percent=None,
            dispute_resolution_type="ARBITRATION", dispute_resolution_org="杭州仲裁委员会",
            dispute_resolution_place="杭州", governing_law="中华人民共和国法律",
            signing_place="杭州", external_note=None, internal_note=None,
            owner_user_id=ADMIN_ID, created_by=ADMIN_NAME, updated_by=ADMIN_NAME,
        ),
        dict(
            agreement_no="LA-2026-002", revision_no=1, parent_agreement_id=None,
            agreement_type="NDA", agreement_title="与绿茵生物保密协议", status="DRAFT",
            project_name="绿茵生物实验室信息系统", cooperation_matter="项目洽谈保密",
            primary_crm_company_id=comp_ids[2], primary_crm_contact_id=contact_ids[2],
            primary_party_name_snapshot=CUSTOMERS[2][0], related_quote_id=None,
            template_id=None, current_document_id=None,
            agreement_date=None, signed_date=None, effective_date=None,
            confidentiality_period_type="FIXED_YEARS", confidentiality_years=2,
            return_destroy_days=15, breach_penalty_type="NONE",
            breach_penalty_amount=None, breach_penalty_percent=None,
            dispute_resolution_type="LITIGATION", dispute_resolution_org="甲方所在地人民法院",
            dispute_resolution_place="杭州", governing_law="中华人民共和国法律",
            signing_place=None, external_note=None, internal_note=None,
            owner_user_id=ADMIN_ID, created_by=ADMIN_NAME, updated_by=ADMIN_NAME,
        ),
    ]
    la_ids = insert("legal_agreement", la_rows)
    print("legal_agreement:", la_ids)

    # ---------------------------------------------------- company credentials
    cred_rows = [
        dict(credential_name="营业执照（星澜云图）", credential_type="business_license",
             holder_entity_name=ENTITIES[0]["entity_name"], issuer="杭州市市场监督管理局",
             credential_no=ENTITIES[0]["unified_credit_code"], issued_at=date(2019, 3, 15),
             expires_at=None, status="active", remark=None),
        dict(credential_name="营业执照（星澜上海）", credential_type="business_license",
             holder_entity_name=ENTITIES[1]["entity_name"], issuer="上海市市场监督管理局",
             credential_no=ENTITIES[1]["unified_credit_code"], issued_at=date(2021, 6, 20),
             expires_at=None, status="active", remark=None),
        dict(credential_name="高新技术企业证书", credential_type="qualification",
             holder_entity_name=ENTITIES[0]["entity_name"], issuer="浙江省科学技术厅",
             credential_no=f"GR20263300{random.randint(1000, 9999)}", issued_at=date(2023, 11, 8),
             expires_at=date(2026, 11, 7), status="active", remark="三年有效期"),
        dict(credential_name="ISO9001 质量管理体系认证", credential_type="qualification",
             holder_entity_name=ENTITIES[0]["entity_name"], issuer="中国质量认证中心",
             credential_no=f"00124Q{random.randint(10000, 99999)}R0M", issued_at=date(2024, 5, 12),
             expires_at=date(2027, 5, 11), status="active", remark=None),
    ]
    cred_ids = insert("company_credential", cred_rows)
    print("company_credential:", cred_ids)

    # ---------------------------------------------------- biz tasks (pending todos for admin)
    task_rows = []
    # expense submitted -> pending review task
    task_rows.append(dict(
        biz_type="expense", biz_id=ea_ids[3], workflow_key="expense_reimbursement", workflow_version=3,
        task_type="review", workflow_step_no=1, workflow_step_name="报销审核",
        title=f"报销审核：{ea_specs[3][0]}", assignee_user_id=ADMIN_ID, assignee_name_snapshot=ADMIN_NAME,
        assignee_role="reviewer", status="pending", due_at=None, completed_at=None,
        completed_by_user_id=None, completed_by_name_snapshot=None, comment=None,
    ))
    # payment reviewed -> voucher creation task
    task_rows.append(dict(
        biz_type="payment", biz_id=pa_ids[4], workflow_key="vendor_payment", workflow_version=2,
        task_type="create_voucher", workflow_step_no=2, workflow_step_name="财务制单",
        title=f"财务制单：{pa_specs[4][0]}", assignee_user_id=ADMIN_ID, assignee_name_snapshot=ADMIN_NAME,
        assignee_role="voucher_creator", status="pending", due_at=None, completed_at=None,
        completed_by_user_id=None, completed_by_name_snapshot=None, comment=None,
    ))
    # invoice application submitted -> review task
    task_rows.append(dict(
        biz_type="invoice_application", biz_id=ia_ids[1], workflow_key="outgoing_invoice_application", workflow_version=3,
        task_type="review", workflow_step_no=1, workflow_step_name="发票审核",
        title=f"发票审核：{ia_rows[1]['application_title']}", assignee_user_id=ADMIN_ID, assignee_name_snapshot=ADMIN_NAME,
        assignee_role="reviewer", status="pending", due_at=None, completed_at=None,
        completed_by_user_id=None, completed_by_name_snapshot=None, comment=None,
    ))
    # completed tasks for history
    task_rows.append(dict(
        biz_type="expense", biz_id=ea_ids[0], workflow_key="expense_reimbursement", workflow_version=3,
        task_type="review", workflow_step_no=1, workflow_step_name="报销审核",
        title=f"报销审核：{ea_specs[0][0]}", assignee_user_id=ADMIN_ID, assignee_name_snapshot=ADMIN_NAME,
        assignee_role="reviewer", status="done", due_at=None, completed_at=ts(16),
        completed_by_user_id=ADMIN_ID, completed_by_name_snapshot=ADMIN_NAME, comment="同意",
    ))
    task_rows.append(dict(
        biz_type="travel", biz_id=ta_ids[0], workflow_key="travel_request", workflow_version=2,
        task_type="review", workflow_step_no=1, workflow_step_name="差旅出行审核",
        title=f"差旅出行审核：{ta_specs[0][0]}", assignee_user_id=ADMIN_ID, assignee_name_snapshot=ADMIN_NAME,
        assignee_role="reviewer", status="done", due_at=None, completed_at=ts(19),
        completed_by_user_id=ADMIN_ID, completed_by_name_snapshot=ADMIN_NAME, comment="同意出行",
    ))
    for r in task_rows:
        r["created_at"] = ts(2)
        r["updated_at"] = ts(2)
    task_ids = insert("biz_task", task_rows)
    print("biz_task:", task_ids)

    # ---------------------------------------------------- action records (audit trail)
    ar_rows = []
    def audit(biz_type, biz_id, action, from_s, to_s, days_ago, comment=None, wf=None, wv=1):
        ar_rows.append(dict(
            biz_type=biz_type, biz_id=biz_id, workflow_key=wf, workflow_version=wv,
            actor_user_id=ADMIN_ID, actor_name_snapshot=ADMIN_NAME, actor_role_snapshot="applicant",
            action=action, from_status=from_s, to_status=to_s, comment=comment,
            created_at=ts(days_ago),
        ))
    audit("expense", ea_ids[0], "submit", "draft", "submitted", 16, wf="expense_reimbursement", wv=3)
    audit("expense", ea_ids[0], "review_pass", "submitted", "reviewed", 16, "同意", wf="expense_reimbursement", wv=3)
    audit("expense", ea_ids[3], "submit", "draft", "submitted", 2, wf="expense_reimbursement", wv=3)
    audit("payment", pa_ids[4], "submit", "draft", "submitted", 8, wf="vendor_payment", wv=2)
    audit("payment", pa_ids[4], "review_pass", "submitted", "reviewed", 6, "同意", wf="vendor_payment", wv=2)
    audit("travel", ta_ids[0], "submit", "draft", "submitted", 22, wf="travel_request", wv=2)
    audit("travel", ta_ids[0], "review_pass", "submitted", "reviewed", 19, "同意出行", wf="travel_request", wv=2)
    audit("invoice_application", ia_ids[1], "submit", "draft", "submitted", 2, wf="outgoing_invoice_application", wv=3)
    audit("contract", ca_ids[1], "submit", "draft", "submitted", 105, wf="external_service_contract", wv=5)
    audit("contract", ca_ids[1], "review_pass", "submitted", "reviewed", 103, "同意", wf="external_service_contract", wv=5)
    audit("contract", ca_ids[1], "sign", "reviewed", "signed", 100, "已签署", wf="external_service_contract", wv=5)
    ar_ids = insert("biz_action_record", ar_rows)
    print("biz_action_record:", len(ar_ids))

    # ---------------------------------------------------- biz relations
    rel_rows = [
        dict(source_biz_type="payment", source_biz_id=pa_ids[0], target_biz_type="contract",
             target_biz_id=ca_ids[0], relation_type="payment_for_contract", relation_status="active",
             remark=None, created_by_user_id=ADMIN_ID, created_by_name_snapshot=ADMIN_NAME),
        dict(source_biz_type="payment", source_biz_id=pa_ids[1], target_biz_type="contract",
             target_biz_id=ca_ids[0], relation_type="payment_for_contract", relation_status="active",
             remark=None, created_by_user_id=ADMIN_ID, created_by_name_snapshot=ADMIN_NAME),
        dict(source_biz_type="invoice_application", source_biz_id=ia_ids[0], target_biz_type="crm_contract",
             target_biz_id=contract_ids[0], relation_type="invoice_for_contract", relation_status="active",
             remark=None, created_by_user_id=ADMIN_ID, created_by_name_snapshot=ADMIN_NAME),
    ]
    rel_ids = insert("biz_relation", rel_rows)
    print("biz_relation:", rel_ids)

    CONN.commit()
    print("ALL SEEDED OK")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        CONN.rollback()
        raise
    finally:
        CONN.close()
