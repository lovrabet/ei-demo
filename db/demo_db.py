#!/usr/bin/env python3
"""Shared database connections for the oa-demo bootstrap scripts.

No production credentials live in this repository. Every connection is
resolved in this order:

1. Environment variables
     demo database:  OA_DEMO_MYSQL_HOST / OA_DEMO_MYSQL_PORT /
                     OA_DEMO_MYSQL_USER / OA_DEMO_MYSQL_PASSWORD /
                     OA_DEMO_MYSQL_DATABASE
     source database (structure export only): YUNTOO_CPO_MYSQL_URL
                     (a mysql://user:pass@host:port/db DSN)
2. Gitignored local JSON files beside this module (see .gitignore):
     db/.demo-db.json  -> oa-demo demo database
     db/.src-db.json   -> yuntoo-cpo source database
3. Localhost placeholders that never reach a real server.

To point the scripts at a real server without touching git, create
db/.demo-db.json (and db/.src-db.json for the source database):

    {"host": "your-db-host", "port": 7707, "user": "your-user",
     "password": "your-password", "database": "oa-demo"}
"""
import json
import os
import re
import urllib.parse

import pymysql

_HERE = os.path.dirname(os.path.abspath(__file__))


def _local(name):
    path = os.path.join(_HERE, name)
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def demo_dsn():
    """Connection kwargs for the oa-demo demo database."""
    local = _local(".demo-db.json")
    return {
        "host": os.environ.get("OA_DEMO_MYSQL_HOST")
        or local.get("host")
        or "127.0.0.1",
        "port": int(os.environ.get("OA_DEMO_MYSQL_PORT") or local.get("port") or 3306),
        "user": os.environ.get("OA_DEMO_MYSQL_USER") or local.get("user") or "root",
        "password": os.environ.get("OA_DEMO_MYSQL_PASSWORD")
        or local.get("password")
        or "",
        "database": os.environ.get("OA_DEMO_MYSQL_DATABASE")
        or local.get("database")
        or "oa-demo",
    }


def demo_connect(**overrides):
    """Open a pymysql connection to the oa-demo demo database."""
    return pymysql.connect(**{**demo_dsn(), **overrides}, charset="utf8mb4")


def src_dsn():
    """Connection kwargs for the yuntoo-cpo source database.

    Used only by export_and_apply_ddl.py to read table structure; row data
    is never copied. Prefers the YUNTOO_CPO_MYSQL_URL DSN over a local file.
    """
    url = os.environ.get("YUNTOO_CPO_MYSQL_URL")
    if url:
        m = re.match(r"mysql://([^:]+):([^@]*)@([^:/]+):?(\d*)/([^?/]+)", url)
        if m:
            user, password, host, port, database = m.groups()
            return {
                "host": host,
                "port": int(port) if port else 3306,
                "user": urllib.parse.unquote(user),
                "password": urllib.parse.unquote(password),
                "database": database,
            }
    local = _local(".src-db.json")
    return {
        "host": local.get("host") or "127.0.0.1",
        "port": int(local.get("port") or 3306),
        "user": local.get("user") or "root",
        "password": local.get("password") or "",
        "database": local.get("database") or "yuntoo-cpo",
    }


def src_connect(**overrides):
    """Open a pymysql connection to the yuntoo-cpo source database."""
    return pymysql.connect(**{**src_dsn(), **overrides}, charset="utf8mb4")
