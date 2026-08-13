#!/usr/bin/env python3
"""Lovrabet 平台原生审批流 HTTP 客户端（复用 CLI 登录态）。

管理端 api.lovrabet.com/smartapi/flow/* + 运行端 runtime.lovrabet.com/api/*。
BFF 运行时没有 http/fetch client，所以流程定义的创建/发布直接从这里调。
"""
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path

SMART_BASE = "https://api.lovrabet.com"
RUNTIME_BASE = "https://runtime.lovrabet.com"
APP_CODE = "app-4d050189"


def load_cookie() -> str:
    return Path.home().joinpath(".lovrabet/cookie").read_text().strip()


def call(base: str, method: str, path: str, body=None, query=None):
    url = base + path
    if query:
        from urllib.parse import urlencode
        url += "?" + urlencode({k: v for k, v in query.items() if v is not None})
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Cookie", load_cookie())
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"__http_error__": e.code, "body": e.read().decode()[:500]}


# ------------------------------------------------------------- 管理端
def flow_create(flow_code, flow_name, flow_json, dataset_code=None, page_id=None, desc=""):
    return call(SMART_BASE, "POST", "/smartapi/flow/create", {
        "appCode": APP_CODE,
        "flowCode": flow_code,
        "flowName": flow_name,
        "flowDesc": desc,
        "datasetCode": dataset_code,
        "pageId": page_id,
        "flowJson": flow_json,
    })


def flow_publish(flow_id):
    return call(SMART_BASE, "POST", "/smartapi/flow/publish", {"appCode": APP_CODE, "id": flow_id})


def flow_update(flow_id, **fields):
    """更新流程定义（pageId/datasetCode/flowName/flowDesc/flowJson 等）。"""
    return call(SMART_BASE, "POST", "/smartapi/flow/update",
                {"appCode": APP_CODE, "id": flow_id, **fields})


def flow_page(page_num=1, page_size=100, **filters):
    return call(SMART_BASE, "POST", "/smartapi/flow/page", {
        "appCode": APP_CODE, "pageNum": page_num, "pageSize": page_size,
        "flowCode": None, "flowName": None, "flowStatus": None, "flowType": None, **filters,
    })


def flow_detail(flow_id):
    return call(SMART_BASE, "POST", "/smartapi/flow/detail", {"appCode": APP_CODE, "id": flow_id})


def flow_delete(flow_id):
    return call(SMART_BASE, "POST", "/smartapi/flow/delete", {"appCode": APP_CODE, "id": flow_id})


# ------------------------------------------------------------- 运行端
def flow_start(dataset_code=None, flow_code=None, form_data=None, variables=None):
    return call(RUNTIME_BASE, "POST", "/api/flow/start", {
        "appCode": APP_CODE,
        "flowCode": flow_code,
        "datasetCode": dataset_code,
        "operationType": "CREATE" if dataset_code else None,
        "formData": form_data or {},
        "variables": variables or {},
    })


def approve(task_id, approved=True, comment=""):
    return call(RUNTIME_BASE, "POST", "/api/flow/approve", {
        "taskId": task_id, "approved": approved, "comment": comment, "variables": {},
    })


def todo(page=1, size=20):
    return call(RUNTIME_BASE, "GET", "/api/approve/todo",
                query={"appCode": APP_CODE, "currentPage": page, "pageSize": size})


def submitted(page=1, size=20):
    return call(RUNTIME_BASE, "GET", "/api/flow/process/submitted",
                query={"appCode": APP_CODE, "currentPage": page, "pageSize": size})


def timeline(piid):
    return call(RUNTIME_BASE, "GET", f"/api/flow/{piid}/timeline")


def task_detail(piid):
    return call(RUNTIME_BASE, "GET", f"/api/flow/process/{piid}/task-detail")


if __name__ == "__main__":
    cmd = sys.argv[1]
    args = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    fn = globals().get(cmd)
    if not callable(fn):
        sys.exit(f"unknown command: {cmd}")
    print(json.dumps(fn(**args), ensure_ascii=False, indent=1, default=str))
