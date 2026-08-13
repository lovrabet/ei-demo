#!/usr/bin/env python3
"""Read-only analyzer for salary-payment XLSX workbooks.

Uses only Python's standard library and reads the OOXML package directly.
The JSON output contains aggregate application plans and checks only;
employee-level rows and names are never emitted. Applications are split by
business purpose into separate QZYT, MYLM, and QZYT_SH drafts by default.
"""

from __future__ import annotations

import argparse
import calendar
import json
import math
import re
import sys
import zipfile
from collections import Counter
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
OFFICE_REL_NS = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
)
NS = {"x": MAIN_NS, "r": OFFICE_REL_NS}

ENTITY_ALIASES = {
    "杭州启智云图科技有限公司": {
        "entity_code": "QZYT",
        "entity_id": 1,
        "short_name": "启智云图",
        "approval_subject_code": "QZYT",
    },
    "杭州梅柚流码科技有限公司": {
        "entity_code": "MYLM",
        "entity_id": 2,
        "short_name": "梅柚流码",
        "approval_subject_code": "MYLM",
    },
    "杭州启智云图科技有限公司上海分公司": {
        "entity_code": "QZYT_SH",
        "entity_id": 3,
        "short_name": "启智云图上海分公司",
        "approval_subject_code": "QZYT",
    },
}

APPROVAL_SUBJECTS = {
    "QZYT": {
        "name": "启智云图",
        "entity_codes": ("QZYT", "QZYT_SH"),
    },
    "MYLM": {
        "name": "梅柚流码",
        "entity_codes": ("MYLM",),
    },
}

DEFAULT_APPLICATION_ORDER = ("QZYT", "MYLM", "QZYT_SH")

SALARY_HEADER_ALIASES = {
    "name": {"姓名"},
    "entity": {"发薪单位", "公司"},
    "gross": {"应付工资", "应发工资"},
    "net": {"实发工资", "实发金额"},
    "tax": {"个税", "个人所得税"},
}


@dataclass
class Cell:
    ref: str
    value: Any
    formula: str | None


@dataclass
class Sheet:
    name: str
    rows: list[dict[int, Cell]]


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def col_index(ref: str) -> int:
    letters = re.match(r"[A-Z]+", ref)
    if not letters:
        raise ValueError(f"Invalid cell reference: {ref}")
    value = 0
    for char in letters.group(0):
        value = value * 26 + ord(char) - 64
    return value - 1


def normalize_number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def money(value: Any) -> float:
    number = normalize_number(value)
    return round(number or 0.0, 2)


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or "")).strip()


def load_shared_strings(book: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(book.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    strings: list[str] = []
    for item in root.findall("x:si", NS):
        strings.append("".join(node.text or "" for node in item.iter() if local_name(node.tag) == "t"))
    return strings


def workbook_sheet_paths(book: zipfile.ZipFile) -> list[tuple[str, str]]:
    root = ET.fromstring(book.read("xl/workbook.xml"))
    rel_root = ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))
    rels = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rel_root.findall(f"{{{REL_NS}}}Relationship")
    }
    result: list[tuple[str, str]] = []
    for sheet in root.findall("x:sheets/x:sheet", NS):
        rel_id = sheet.attrib[f"{{{OFFICE_REL_NS}}}id"]
        result.append((sheet.attrib["name"], f"xl/{rels[rel_id]}"))
    return result


def parse_cell(cell: ET.Element, shared_strings: list[str]) -> Cell:
    ref = cell.attrib["r"]
    cell_type = cell.attrib.get("t")
    formula_node = cell.find("x:f", NS)
    value_node = cell.find("x:v", NS)
    formula = formula_node.text if formula_node is not None else None
    raw = value_node.text if value_node is not None else None

    if cell_type == "s" and raw is not None:
        value: Any = shared_strings[int(raw)]
    elif cell_type == "inlineStr":
        value = "".join(
            node.text or "" for node in cell.iter() if local_name(node.tag) == "t"
        )
    elif cell_type == "b":
        value = raw == "1"
    elif cell_type in {"str", "e"}:
        value = raw
    else:
        number = normalize_number(raw)
        value = number if number is not None else raw
    return Cell(ref=ref, value=value, formula=formula)


def load_sheets(path: Path) -> list[Sheet]:
    with zipfile.ZipFile(path) as book:
        shared_strings = load_shared_strings(book)
        sheets: list[Sheet] = []
        for name, sheet_path in workbook_sheet_paths(book):
            root = ET.fromstring(book.read(sheet_path))
            rows: list[dict[int, Cell]] = []
            for row_node in root.findall("x:sheetData/x:row", NS):
                cells = {
                    col_index(cell.attrib["r"]): parse_cell(cell, shared_strings)
                    for cell in row_node.findall("x:c", NS)
                }
                rows.append(cells)
            sheets.append(Sheet(name=name, rows=rows))
        return sheets


def row_text(row: dict[int, Cell]) -> str:
    return " | ".join(
        str(cell.value).strip()
        for _, cell in sorted(row.items())
        if cell.value not in (None, "")
    )


def find_header(sheet: Sheet) -> tuple[int, dict[str, int]] | None:
    for row_index, _row in enumerate(sheet.rows[:12]):
        # Salary workbooks use vertically merged two-level headers. The anchor
        # row contains 姓名/发薪单位/实发工资, while 个税 and other deductions
        # commonly appear two rows below.
        header_values_by_col: dict[int, set[str]] = {}
        for candidate in sheet.rows[row_index : row_index + 4]:
            for col, cell in candidate.items():
                text = normalize_text(cell.value)
                if text:
                    header_values_by_col.setdefault(col, set()).add(text)
        mapping: dict[str, int] = {}
        for field, aliases in SALARY_HEADER_ALIASES.items():
            for col, header_values in header_values_by_col.items():
                if aliases.intersection(header_values):
                    mapping[field] = col
                    break
        for col, header_values in header_values_by_col.items():
            if any("申请" in value and "金额" in value for value in header_values):
                mapping["request_amount"] = col
                break
        if {"name", "entity", "net"}.issubset(mapping):
            return row_index, mapping
    return None


def infer_month(file_name: str, sheets: list[Sheet]) -> tuple[str | None, list[str]]:
    candidates = [file_name, *(sheet.name for sheet in sheets)]
    found: set[tuple[int, int]] = set()
    for text in candidates:
        match = re.search(r"(20\d{2})年\s*(1[0-2]|0?[1-9])月", text)
        if match:
            found.add((int(match.group(1)), int(match.group(2))))
    if len(found) == 1:
        year, month = found.pop()
        return f"{year:04d}-{month:02d}-01", []
    if not found:
        return None, ["未能从文件名或工作表名识别工资月份"]
    return None, [f"检测到多个工资月份：{sorted(found)}"]


def select_entity_name(
    entity_values: list[str], total_labels: list[str]
) -> tuple[str | None, list[str]]:
    warnings: list[str] = []
    known = [name for name in entity_values if name in ENTITY_ALIASES]
    if known:
        entity_name, count = Counter(known).most_common(1)[0]
        if len(set(known)) > 1:
            warnings.append(f"同一工资表出现多个发薪单位：{sorted(set(known))}")
        return entity_name, warnings
    for label in total_labels:
        cleaned = re.sub(r"[-－—]?合计.*$", "", label).strip()
        if cleaned in ENTITY_ALIASES:
            return cleaned, warnings
    return None, ["未识别到主体全称"]


def analyze_salary_sheet(sheet: Sheet, payroll_month: str | None) -> dict[str, Any]:
    header = find_header(sheet)
    if not header:
        return {
            "sheet": sheet.name,
            "recognized": False,
            "warnings": ["未找到工资表标准表头（姓名、发薪单位、实发工资）"],
        }
    header_index, columns = header
    data_rows = sheet.rows[header_index + 1 :]
    total_rows: list[dict[int, Cell]] = []
    employee_rows: list[dict[int, Cell]] = []
    entity_values: list[str] = []
    missing_cached_formula_count = 0

    for row in data_rows:
        text = row_text(row)
        if "合计" in text or "总计" in text:
            total_rows.append(row)
            continue
        name = normalize_text(row.get(columns["name"], Cell("", None, None)).value)
        entity = str(row.get(columns["entity"], Cell("", "", None)).value or "").strip()
        net_cell = row.get(columns["net"], Cell("", None, None))
        net = normalize_number(net_cell.value)
        if name and entity and net is None and net_cell.formula:
            missing_cached_formula_count += 1
        if name and entity and net is not None:
            employee_rows.append(row)
            entity_values.append(entity)

    total_labels = [row_text(row) for row in total_rows]
    entity_name, warnings = select_entity_name(entity_values, total_labels)
    if missing_cached_formula_count:
        warnings.append(
            f"{missing_cached_formula_count} 行实发工资公式没有缓存结果，"
            "请先用 Excel/WPS 重新计算并保存"
        )

    def sum_employee_column(field: str) -> float:
        col = columns.get(field)
        if col is None:
            return 0.0
        return round(
            sum(
                normalize_number(row.get(col, Cell("", None, None)).value) or 0.0
                for row in employee_rows
            ),
            2,
        )

    net_amount = sum_employee_column("net")
    gross_amount = sum_employee_column("gross")
    tax_amount = sum_employee_column("tax")
    request_amount = sum_employee_column("request_amount")
    if net_amount <= 0:
        warnings.append("实发工资汇总不大于 0")
    if request_amount > 0 and request_amount < net_amount:
        warnings.append("Excel 明确申请金额小于实发工资，请财务复核")
    if request_amount > 0 and abs(request_amount - net_amount - tax_amount) > 0.01:
        warnings.append("申请金额与“实发工资+个税”不一致，请财务复核")

    reconciliations: list[dict[str, Any]] = []
    if total_rows:
        total_row = total_rows[0]
        for field, calculated in (
            ("gross", gross_amount),
            ("net", net_amount),
            ("tax", tax_amount),
            ("request_amount", request_amount),
        ):
            col = columns.get(field)
            if col is None:
                continue
            stated = normalize_number(
                total_row.get(col, Cell("", None, None)).value
            )
            if stated is None:
                continue
            delta = round(calculated - stated, 2)
            reconciliations.append(
                {
                    "field": field,
                    "calculated": calculated,
                    "stated_total": round(stated, 2),
                    "delta": delta,
                    "status": "PASS" if abs(delta) <= 0.01 else "FAIL",
                }
            )
            if abs(delta) > 0.01:
                warnings.append(f"{field}逐人汇总与合计行相差 {delta:.2f}")

    alias = ENTITY_ALIASES.get(entity_name or "", {})
    month_label = ""
    if payroll_month:
        year, month, _ = payroll_month.split("-")
        month_label = f"{int(year)}年{int(month)}月"
    return {
        "sheet": sheet.name,
        "recognized": True,
        "entity_name": entity_name,
        "entity_code": alias.get("entity_code"),
        "internal_legal_entity_id": alias.get("entity_id"),
        "employee_count": len(employee_rows),
        "net_salary_amount": net_amount,
        "gross_salary_amount": gross_amount,
        "individual_income_tax": tax_amount,
        "explicit_request_amount": request_amount or None,
        "payment_project": (
            f"{alias.get('short_name')}{month_label}工资"
            if alias.get("short_name") and month_label
            else f"{entity_name or sheet.name}工资"
        ),
        "payment_amount_candidate": request_amount if request_amount > 0 else net_amount,
        "payment_amount_basis": (
            "Excel 明确标注的申请金额逐人汇总"
            if request_amount > 0
            else "实发工资逐人汇总"
        ),
        "reconciliations": reconciliations,
        "warnings": warnings,
    }


def extract_control_rows(sheets: list[Sheet]) -> list[dict[str, Any]]:
    controls: list[dict[str, Any]] = []
    keywords = ("申请", "合计", "总计", "总发工资")
    for sheet in sheets:
        for row in sheet.rows:
            text_cells = [
                str(cell.value).strip()
                for _, cell in sorted(row.items())
                if isinstance(cell.value, str) and cell.value.strip()
            ]
            label = " | ".join(text_cells)
            if not label or not any(keyword in label for keyword in keywords):
                continue
            numbers = [
                {
                    "cell": cell.ref,
                    "value": (
                        money(cell.value)
                        if normalize_number(cell.value) is not None
                        else None
                    ),
                    **({"formula": cell.formula} if cell.formula else {}),
                }
                for _, cell in sorted(row.items())
                if normalize_number(cell.value) is not None or cell.formula
            ]
            controls.append(
                {
                    "sheet": sheet.name,
                    "label": label,
                    "numbers": numbers,
                }
            )
    return controls


def scan_cell_errors(sheets: list[Sheet]) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    for sheet in sheets:
        for row in sheet.rows:
            for cell in row.values():
                if isinstance(cell.value, str) and cell.value.startswith("#"):
                    errors.append(
                        {
                            "sheet": sheet.name,
                            "cell": cell.ref,
                            "error": cell.value,
                        }
                    )
    return errors


def parse_application_groups(value: str | None) -> list[list[str]] | None:
    if value is None:
        return None
    groups = [
        [code.strip().upper() for code in group.split(",") if code.strip()]
        for group in value.split(";")
        if group.strip()
    ]
    if not groups or any(not group for group in groups):
        raise ValueError("application groups must not be empty")
    return groups


def plan_application_groups(
    items: list[dict[str, Any]],
    requested_groups: list[list[str]] | None,
) -> list[list[str]]:
    alias_by_id = {
        int(alias["entity_id"]): alias for alias in ENTITY_ALIASES.values()
    }
    detected_codes = [
        alias_by_id[int(item["internal_legal_entity_id"])]["entity_code"]
        for item in items
    ]
    detected_set = set(detected_codes)

    if requested_groups is None:
        return [[code] for code in DEFAULT_APPLICATION_ORDER if code in detected_set]

    flattened = [code for group in requested_groups for code in group]
    if len(flattened) != len(set(flattened)):
        raise ValueError("an entity code may appear in only one application group")
    unknown = sorted(set(flattened) - detected_set)
    missing = sorted(detected_set - set(flattened))
    if unknown:
        raise ValueError(
            "application groups contain entities not found in the workbooks: "
            + "、".join(unknown)
        )
    if missing:
        raise ValueError(
            "application groups omit detected entities: " + "、".join(missing)
        )

    alias_by_code = {
        alias["entity_code"]: alias for alias in ENTITY_ALIASES.values()
    }
    for group in requested_groups:
        if "QZYT_SH" in group and len(group) > 1:
            raise ValueError(
                "QZYT_SH salary and tax intercompany payment must remain "
                "a separate application"
            )
        approval_subject_codes = {
            alias_by_code[code]["approval_subject_code"] for code in group
        }
        if len(approval_subject_codes) != 1:
            raise ValueError(
                "different approval subjects cannot be merged into one application: "
                + "、".join(group)
            )
    return requested_groups


def build_result(
    paths: list[Path],
    requested_group_text: str | None = None,
) -> dict[str, Any]:
    sources: list[dict[str, Any]] = []
    analyses: list[dict[str, Any]] = []
    control_rows: list[dict[str, Any]] = []
    cell_errors: list[dict[str, str]] = []
    month_warnings: list[str] = []
    detected_months: set[str] = set()

    for path in paths:
        sheets = load_sheets(path)
        source_month, source_month_warnings = infer_month(path.name, sheets)
        if source_month:
            detected_months.add(source_month)
        month_warnings.extend(
            f"{path.name}：{warning}" for warning in source_month_warnings
        )
        sources.append(
            {
                "file_name": path.name,
                "absolute_path": str(path.resolve()),
                "sheet_names": [sheet.name for sheet in sheets],
            }
        )

        salary_sheets = [
            sheet
            for sheet in sheets
            if "工资表" in sheet.name and "人员成本" not in sheet.name
        ]
        for sheet in salary_sheets:
            analysis = analyze_salary_sheet(sheet, source_month)
            analysis["source_file"] = path.name
            analyses.append(analysis)
        for row in extract_control_rows(sheets):
            row["source_file"] = path.name
            control_rows.append(row)
        for error in scan_cell_errors(sheets):
            error["source_file"] = path.name
            cell_errors.append(error)

    payroll_month = next(iter(detected_months)) if len(detected_months) == 1 else None
    if len(detected_months) > 1:
        month_warnings.append(
            "多份附件工资月份不一致：" + "、".join(sorted(detected_months))
        )
    recognized = [item for item in analyses if item.get("recognized")]
    item_candidates = [
        {
            "internal_legal_entity_id": item["internal_legal_entity_id"],
            "internal_legal_entity_name": item["entity_name"],
            "payment_project": item["payment_project"],
            "employee_count": item["employee_count"],
            "amount": item["payment_amount_candidate"],
            "currency": "CNY",
            "payment_method": "bank_transfer",
            "_gross": item["gross_salary_amount"],
            "_net": item["net_salary_amount"],
            "_tax": item["individual_income_tax"],
            "_basis": item["payment_amount_basis"],
            "_sheet": item["sheet"],
            "_source_file": item["source_file"],
        }
        for item in recognized
        if item.get("internal_legal_entity_id") and item["payment_amount_candidate"] > 0
    ]
    grouped: dict[int, dict[str, Any]] = {}
    for candidate in item_candidates:
        entity_id = candidate["internal_legal_entity_id"]
        if entity_id not in grouped:
            grouped[entity_id] = dict(candidate)
            grouped[entity_id]["_sheets"] = [candidate["_sheet"]]
            grouped[entity_id]["_source_files"] = [candidate["_source_file"]]
            grouped[entity_id]["_bases"] = [candidate["_basis"]]
            continue
        current = grouped[entity_id]
        current["employee_count"] += candidate["employee_count"]
        current["amount"] = round(current["amount"] + candidate["amount"], 2)
        current["_gross"] = round(current["_gross"] + candidate["_gross"], 2)
        current["_net"] = round(current["_net"] + candidate["_net"], 2)
        current["_tax"] = round(current["_tax"] + candidate["_tax"], 2)
        current["_sheets"].append(candidate["_sheet"])
        current["_source_files"].append(candidate["_source_file"])
        current["_bases"].append(candidate["_basis"])

    items: list[dict[str, Any]] = []
    item_source_files_by_entity_id: dict[int, list[str]] = {}
    item_net_amount_by_entity_id: dict[int, float] = {}
    item_tax_amount_by_entity_id: dict[int, float] = {}
    for item in grouped.values():
        bases = list(dict.fromkeys(item.pop("_bases")))
        sheets_for_item = item.pop("_sheets")
        source_files_for_item = list(dict.fromkeys(item.pop("_source_files")))
        item.pop("_basis", None)
        item.pop("_sheet", None)
        item.pop("_source_file", None)
        gross = item.pop("_gross")
        net = item.pop("_net")
        tax = item.pop("_tax")
        item["remark"] = (
            f"金额依据：{'、'.join(bases)}；应付工资 {gross:.2f}；"
            f"个税 {tax:.2f}；来源附件：{'、'.join(source_files_for_item)}；"
            f"来源工作表：{'、'.join(sheets_for_item)}"
        )
        item_source_files_by_entity_id[
            int(item["internal_legal_entity_id"])
        ] = source_files_for_item
        item_net_amount_by_entity_id[int(item["internal_legal_entity_id"])] = net
        item_tax_amount_by_entity_id[int(item["internal_legal_entity_id"])] = tax
        items.append(item)
    items.sort(key=lambda item: int(item["internal_legal_entity_id"]))
    warnings = list(month_warnings)
    if cell_errors:
        warnings.append(f"检测到 {len(cell_errors)} 个单元格公式错误")
    for analysis in analyses:
        warnings.extend(
            f"{analysis['sheet']}：{warning}" for warning in analysis.get("warnings", [])
        )
    found_entity_ids = {
        item["internal_legal_entity_id"] for item in items if item["internal_legal_entity_id"]
    }
    missing_entity_names = [
        name
        for name, alias in ENTITY_ALIASES.items()
        if alias["entity_id"] not in found_entity_ids
    ]
    if missing_entity_names:
        warnings.append(
            "本批附件未生成付款明细的已知主体：" + "、".join(missing_entity_names)
        )

    total_amount = round(sum(item["amount"] for item in items), 2)
    total_employees = sum(item["employee_count"] for item in items)
    month_title = ""
    expected_pay_date = None
    if payroll_month:
        year, month, _ = payroll_month.split("-")
        month_title = f"{int(year)}年{int(month)}月"
        last_day = calendar.monthrange(int(year), int(month))[1]
        expected_pay_date = f"{int(year):04d}-{int(month):02d}-{last_day:02d}"

    requested_groups = parse_application_groups(requested_group_text)
    application_groups = plan_application_groups(items, requested_groups)
    alias_by_code = {
        alias["entity_code"]: alias for alias in ENTITY_ALIASES.values()
    }
    alias_by_id = {
        int(alias["entity_id"]): alias for alias in ENTITY_ALIASES.values()
    }
    item_by_code = {
        alias_by_id[int(item["internal_legal_entity_id"])]["entity_code"]: item
        for item in items
    }
    source_by_name = {source["file_name"]: source for source in sources}
    application_drafts: list[dict[str, Any]] = []
    application_plan_groups: list[dict[str, Any]] = []

    for index, group_codes in enumerate(application_groups, start=1):
        group_items = [dict(item_by_code[code]) for code in group_codes]
        approval_subject_code = alias_by_code[group_codes[0]][
            "approval_subject_code"
        ]
        approval_subject_name = APPROVAL_SUBJECTS[approval_subject_code]["name"]
        primary_code = group_codes[0]
        primary_entity_name = next(
            name
            for name, alias in ENTITY_ALIASES.items()
            if alias["entity_code"] == primary_code
        )
        if primary_code == "QZYT_SH":
            shanghai_item_id = int(group_items[0]["internal_legal_entity_id"])
            shanghai_net = item_net_amount_by_entity_id[shanghai_item_id]
            shanghai_tax = item_tax_amount_by_entity_id[shanghai_item_id]
            group_items[0]["payment_project"] = (
                f"{month_title}上海分公司工资及个税往来款"
                if month_title
                else "上海分公司工资及个税往来款"
            )
            application_title = (
                f"转启智云图科技上海分公司往来款，发放{month_title}员工工资"
                f"{shanghai_net:.2f}加上个税{shanghai_tax:.2f}"
                if month_title and shanghai_tax > 0
                else f"转启智云图科技上海分公司往来款，发放{month_title}员工工资"
                f"{shanghai_net:.2f}"
                if month_title
                else "启智云图向上海分公司支付工资及个税往来款"
            )
            application_remark = (
                "本单为启智云图向上海分公司支付往来款，用于发放上海分公司"
                f"员工工资及个税；实发工资 {shanghai_net:.2f} 元，"
                f"个税 {shanghai_tax:.2f} 元。提交前须由财务复核。"
            )
        else:
            application_title = (
                f"{primary_entity_name}发放{month_title}员工工资"
                if month_title
                else f"{primary_entity_name}工资付款申请"
            )
            application_remark = (
                "付款金额优先采用工资附件明确标注的申请金额，"
                "未标注时采用实发工资逐人汇总；提交前须由财务复核。"
            )
        related_file_names = list(
            dict.fromkeys(
                file_name
                for item in group_items
                for file_name in item_source_files_by_entity_id[
                    int(item["internal_legal_entity_id"])
                ]
            )
        )
        attachments = [
            {
                "required": True,
                "attachment_type": "payroll_sheet",
                "local_path": source_by_name[file_name]["absolute_path"],
                "file_name": file_name,
            }
            for file_name in related_file_names
        ]
        application_drafts.append(
            {
                "biz_type": "salary_payment",
                "approval_subject": {
                    "code": approval_subject_code,
                    "name": approval_subject_name,
                },
                "values": {
                    "title": application_title,
                    "payroll_month": payroll_month,
                    "expected_pay_date": expected_pay_date,
                    "remark": application_remark,
                },
                "items": group_items,
                "attachments": attachments,
            }
        )
        application_plan_groups.append(
            {
                "application_index": index,
                "approval_subject_code": approval_subject_code,
                "approval_subject_name": approval_subject_name,
                "entity_codes": group_codes,
                "entity_names": [
                    next(
                        name
                        for name, alias in ENTITY_ALIASES.items()
                        if alias["entity_code"] == code
                    )
                    for code in group_codes
                ],
                "attachment_files": related_file_names,
            }
        )

    return {
        "source": {
            "files": sources,
            "file_count": len(sources),
            "contains_employee_level_data": True,
            "employee_level_data_emitted": False,
        },
        "application_plan": {
            "strategy": (
                "user_requested"
                if requested_groups is not None
                else "business_default_three_way"
            ),
            "application_count": len(application_drafts),
            "groups": application_plan_groups,
        },
        "application_drafts": application_drafts,
        "analysis": {
            "salary_sheets": analyses,
            "control_rows": control_rows,
            "cell_errors": cell_errors,
            "totals": {
                "payment_amount": total_amount,
                "employee_count": total_employees,
                "entity_count": len(items),
            },
        },
        "checks": {
            "status": "PASS" if not warnings else "REVIEW",
            "warnings": warnings,
            "blocking": [
                "付款日期默认工资月份最后一天，创建草稿前必须由用户确认。",
                "不得自动提交审批；必须先展示汇总并取得用户确认。",
                "默认按启智云图、梅柚流码、上海分公司工资及个税往来款拆为三张申请。",
                "上海分公司工资及个税往来款不得并入启智云图本部工资申请。",
                "启智云图与梅柚流码不得合并为同一申请单。",
                "每张申请必须上传覆盖其付款项目的原始 Excel 并随申请留档。",
            ],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Analyze salary workbooks and plan compliant salary-payment applications "
            "without exposing employee details."
        )
    )
    parser.add_argument(
        "xlsx",
        type=Path,
        nargs="+",
        help="Paths to one or more source .xlsx files",
    )
    parser.add_argument("--output", type=Path, help="Write aggregate JSON to this file")
    parser.add_argument(
        "--application-groups",
        help=(
            "Optional user-requested split, for example "
            "'QZYT;MYLM;QZYT_SH'. Semicolons separate applications. QZYT_SH "
            "salary and tax intercompany payment must remain separate; different "
            "approval subjects cannot be merged."
        ),
    )
    args = parser.parse_args()

    resolved_paths = [path.resolve() for path in args.xlsx]
    if len(set(resolved_paths)) != len(resolved_paths):
        parser.error("duplicate input files are not allowed")
    for path in args.xlsx:
        if not path.is_file():
            parser.error(f"file not found: {path}")
        if path.suffix.lower() != ".xlsx":
            parser.error("only .xlsx files are supported")

    try:
        result = build_result(args.xlsx, args.application_groups)
    except (zipfile.BadZipFile, ET.ParseError, KeyError, ValueError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2

    payload = json.dumps(
        {"ok": True, **result}, ensure_ascii=False, indent=2, sort_keys=False
    )
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
        args.output.chmod(0o600)
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
