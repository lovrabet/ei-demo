#!/usr/bin/env python3
"""Generate DDL for the 6 legal/entity tables from dataset metadata JSON,
then apply to oa-demo. Metadata was pulled via `rabetbase dataset detail`
(no direct yuntoo-pricing DB access)."""
import glob
import json

import demo_db

META_DIR = "/tmp/pricing-meta"


def column_ddl(f):
    name = f["name"]
    dbtype = (f.get("dbType") or "VARCHAR").upper()
    required = bool(f.get("required"))
    comment = (f.get("displayName") or "").replace("'", "''")

    if f.get("pk"):
        col = f"`{name}` bigint unsigned NOT NULL AUTO_INCREMENT"
    elif dbtype == "BIGINT UNSIGNED":
        col = f"`{name}` bigint unsigned"
    elif dbtype == "INT UNSIGNED":
        col = f"`{name}` int unsigned"
    elif dbtype == "INT":
        col = f"`{name}` int"
    elif dbtype == "DECIMAL":
        col = f"`{name}` decimal(15,2)"
    elif dbtype == "ENUM":
        vals = [o["value"] for o in (f.get("options") or [])]
        if not vals:
            vals = ["UNKNOWN"]
        col = f"`{name}` varchar(50)"  # store enum as varchar for resilience
        # keep enum values in comment for reference
        comment = f"{comment} ({'|'.join(vals)})"
    elif dbtype == "BIT":
        col = f"`{name}` tinyint(1)"
    elif dbtype == "TEXT":
        col = f"`{name}` text"
    elif dbtype == "MEDIUMTEXT":
        col = f"`{name}` mediumtext"
    elif dbtype == "JSON":
        col = f"`{name}` json"
    elif dbtype == "DATE":
        col = f"`{name}` date"
    elif dbtype == "DATETIME":
        col = f"`{name}` datetime"
    elif dbtype == "TIMESTAMP":
        if name == "created_at":
            col = f"`{name}` timestamp NULL DEFAULT CURRENT_TIMESTAMP"
            return f"{col} COMMENT '{comment}'"
        if name == "updated_at":
            col = f"`{name}` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
            return f"{col} COMMENT '{comment}'"
        col = f"`{name}` timestamp NULL"
    else:  # VARCHAR and fallback
        col = f"`{name}` varchar(255)"

    # text/blob/json columns cannot have NOT NULL default issues; allow NULL unless required
    if required and dbtype not in ("TEXT", "MEDIUMTEXT", "JSON", "TIMESTAMP"):
        col += " NOT NULL"
    else:
        col += " NULL"
    return f"{col} COMMENT '{comment}'"


def main():
    statements = []
    for path in sorted(glob.glob(f"{META_DIR}/*.json")):
        d = json.load(open(path))
        table = d["table"]
        fields = d["fields"]
        cols = [column_ddl(f) for f in fields]
        pk = next((f["name"] for f in fields if f.get("pk")), "id")
        ddl = (
            f"CREATE TABLE `{table}` (\n  "
            + ",\n  ".join(cols)
            + f",\n  PRIMARY KEY (`{pk}`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='{d.get('name','')}'"
        )
        statements.append((table, ddl))

    out = "/Users/tangshuang/data/gitlab/yuntoo/oa-combo/oa-demo/db/legal-entity-ddl.sql"
    with open(out, "w") as fp:
        fp.write("-- Legal/internal-entity tables rebuilt from dataset metadata\n\n")
        for t, ddl in statements:
            fp.write(f"DROP TABLE IF EXISTS `{t}`;\n{ddl};\n\n")
    print(f"wrote {out}")

    dst = demo_db.demo_connect(autocommit=True)
    with dst.cursor() as cur:
        for t, ddl in statements:
            cur.execute(f"DROP TABLE IF EXISTS `{t}`")
            cur.execute(ddl)
            print(f"  created {t}")
    dst.close()


if __name__ == "__main__":
    main()
