#!/usr/bin/env python3
"""Export DDL (structure only) from yuntoo-cpo and apply to ei-demo.

Reads all tables from yuntoo-cpo, writes a combined DDL file, then applies
it to the empty ei-demo database. Never copies row data.
"""
import demo_db

# Connections resolve via env vars / gitignored local files — see demo_db.py.

# Tables to skip (none expected in yuntoo-cpo, guard only)
SKIP_PREFIXES = ("quote_",)

def main():
    src = demo_db.src_connect()
    with src.cursor() as cur:
        cur.execute("SHOW TABLES")
        tables = [r[0] for r in cur.fetchall()]
    tables = [t for t in tables if not t.startswith(SKIP_PREFIXES)]
    print(f"source tables: {len(tables)}")

    ddls = []
    with src.cursor() as cur:
        for t in tables:
            cur.execute(f"SHOW CREATE TABLE `{t}`")
            ddl = cur.fetchone()[1]
            ddls.append((t, ddl))
    src.close()

    out = "/Users/tangshuang/data/gitlab/yuntoo/oa-combo/oa-demo/db/yuntoo-cpo-ddl.sql"
    with open(out, "w") as f:
        f.write("-- DDL exported from yuntoo-cpo (structure only, no data)\n")
        f.write("-- Target: ei-demo\n\nSET FOREIGN_KEY_CHECKS=0;\n\n")
        for t, ddl in ddls:
            f.write(f"-- --------------------------------------------------------\n")
            f.write(f"-- Table: {t}\n")
            f.write(f"-- --------------------------------------------------------\n")
            f.write(f"DROP TABLE IF EXISTS `{t}`;\n{ddl};\n\n")
        f.write("SET FOREIGN_KEY_CHECKS=1;\n")
    print(f"wrote {out}")

    dst = demo_db.demo_connect(autocommit=True)
    with dst.cursor() as cur:
        cur.execute("SET FOREIGN_KEY_CHECKS=0")
        for t, ddl in ddls:
            cur.execute(f"DROP TABLE IF EXISTS `{t}`")
            cur.execute(ddl)
            print(f"  created {t}")
        cur.execute("SHOW TABLES")
        created = [r[0] for r in cur.fetchall()]
    dst.close()
    print(f"ei-demo now has {len(created)} tables")

if __name__ == "__main__":
    main()
