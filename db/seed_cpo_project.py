#!/usr/bin/env python3
"""Seed the cpo_project 项目库 and backfill expense/payment project_name.

对应 yuntoo-ei 2026-08-20「项目名称必填归集」的 demo 版本：
- cpo_project 表造 8 个虚构项目（与 demo 虚构客户/合同的命名一致）；
- cpo_dictionary 补 expense_project 分类（平台数据集未建时前端回退用）
  和 project_type 分类（项目库维护页用）；
- 存量 expense_application / payment_application 回填 project_name。

幂等：cpo_dictionary 先删后插，cpo_project 按 code 幂等（存在即跳过）。
"""
import random

import pymysql

import demo_db

random.seed(20260901)

# (code, name, project_type, manager_name, start_date, end_date, sort_order)
# demo 场景 code 直接用项目名：业务单据 project_name 存 code，详情页无需再做映射。
PROJECTS = [
    ("星辰电商数据中台建设项目", "星辰电商数据中台建设项目", "研发项目", "沈知远", "2026-01-15", "2026-12-31", 10),
    ("绿茵生物实验室信息系统", "绿茵生物实验室信息系统", "研发项目", "陆嘉树", "2026-02-01", "2026-10-31", 20),
    ("紫金山研究院智能风控平台", "紫金山研究院智能风控平台", "研发项目", "沈知远", "2026-03-10", "2027-03-09", 30),
    ("澄光传媒投放效果分析系统", "澄光传媒投放效果分析系统", "研发项目", "温以宁", "2026-04-01", "2026-09-30", 40),
    ("字节方舟在线课程平台改造", "字节方舟在线课程平台改造", "研发项目", "陆嘉树", "2026-05-20", "2026-11-30", 50),
    ("星澜云图 ISO27001 认证", "星澜云图 ISO27001 认证", "认证资质", "温以宁", "2026-03-01", "2026-08-31", 60),
    ("星澜云图上海子公司设立", "星澜云图上海子公司设立", "投资设立", "沈知远", "2026-01-01", "2026-06-30", 70),
    ("星澜云图 A 轮融资", "星澜云图 A 轮融资", "融资", "陆嘉树", "2026-06-01", "2027-06-30", 80),
]

PROJECT_TYPES = [
    ("rd", "研发项目", 10),
    ("certification", "认证资质", 20),
    ("investment", "投资设立", 30),
    ("financing", "融资", 40),
]

conn = demo_db.demo_connect(autocommit=False)
cur = conn.cursor(pymysql.cursors.DictCursor)


def dict_rows(category, tuples):
    return [
        {
            "category": category,
            "code": code,
            "label": label,
            "sort_order": sort,
            "is_active": 1,
            "is_deleted": 0,
        }
        for code, label, sort in tuples
    ]


def main():
    # ---------------------------------------------------- cpo_dictionary
    for category in ("expense_project", "project_type"):
        cur.execute(
            "DELETE FROM cpo_dictionary WHERE category = %s", (category,)
        )
        rows = dict_rows(
            category,
            (
                [(code, name, sort) for code, name, _, _, _, _, sort in PROJECTS]
                if category == "expense_project"
                else PROJECT_TYPES
            ),
        )
        for r in rows:
            cur.execute(
                "INSERT INTO cpo_dictionary (category, code, label, sort_order, is_active, is_deleted)"
                " VALUES (%(category)s, %(code)s, %(label)s, %(sort_order)s, %(is_active)s, %(is_deleted)s)",
                r,
            )
        print(f"cpo_dictionary[{category}]: {len(rows)}")

    # ---------------------------------------------------- cpo_project（按 code 幂等）
    inserted = 0
    for code, name, ptype, manager, start, end, sort in PROJECTS:
        cur.execute("SELECT id FROM cpo_project WHERE code = %s", (code,))
        if cur.fetchone():
            continue
        cur.execute(
            "INSERT INTO cpo_project (code, name, project_type, manager_name, start_date, end_date, sort_order)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (code, name, ptype, manager, start, end, sort),
        )
        inserted += 1
    print(f"cpo_project: +{inserted} (existing skipped)")

    # ---------------------------------------------------- 存量回填
    for table in ("expense_application", "payment_application"):
        cur.execute(
            f"UPDATE `{table}` SET project_name = %s WHERE project_name IS NULL OR project_name = ''",
            (random.choice(PROJECTS)[0],),
        )
        print(f"{table}: backfilled {cur.rowcount}")

    conn.commit()
    conn.close()
    print("CPO PROJECT SEEDED OK")


if __name__ == "__main__":
    main()
