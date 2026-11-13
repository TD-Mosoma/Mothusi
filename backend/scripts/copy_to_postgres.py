"""Copy everything from the local SQLite database into PostgreSQL (for example Supabase).

    uv run python -m scripts.copy_to_postgres                       # uses MOTHUSI_DATABASE_URL from backend/.env
    uv run python -m scripts.copy_to_postgres --from data/mothusi.db --to postgresql://...

Safe to run more than once: rows that are already there are left alone. The SQLite file keeps all its data;
it is only upgraded to the current table layout first.
"""

import argparse
import sqlite3
import sys
from pathlib import Path

from config import BACKEND_DIR, load_settings
from storage.activity import ActivityStore
from storage.auth import AuthStore
from storage.database import Store
from storage.db import connect, is_postgres_url
from storage.resources import ResourceStore
from storage.workspace import WorkspaceStore

# Parents before children, so foreign keys are satisfied.
TABLES = ["accounts", "auth_sessions", "join_codes", "learner_links", "picture_logins", "password_resets",
          "runs", "events", "feedback", "workspace_docs", "learner_activity", "resources"]
IDENTITY = ["feedback", "learner_activity"]  # auto-numbered ids that must carry on after the copied rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--from", dest="source", default=str(BACKEND_DIR / "data" / "mothusi.db"))
    parser.add_argument("--to", dest="target", default=None)
    args = parser.parse_args()
    target = args.target or load_settings().database_url
    if not target or not is_postgres_url(target):
        print("Set MOTHUSI_DATABASE_URL in backend/.env (or pass --to postgresql://...).")
        return 1
    if not Path(args.source).exists():
        print(f"No SQLite database at {args.source}; nothing to copy.")
        return 1

    # Opening the stores creates the tables in PostgreSQL (and upgrades the SQLite file the same way).
    for path in (args.source, target):
        for store in (Store, AuthStore, WorkspaceStore, ActivityStore, ResourceStore):
            store(path)

    src = sqlite3.connect(args.source)
    src.row_factory = sqlite3.Row
    dst = connect(target)
    with dst.tx() as t:
        for table in TABLES:
            rows = src.execute(f"SELECT * FROM {table}").fetchall()
            if not rows:
                print(f"  {table}: empty")
                continue
            cols = rows[0].keys()
            t.executemany(
                f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)}) ON CONFLICT DO NOTHING",
                [tuple(r[c] for c in cols) for r in rows],
            )
            print(f"  {table}: {len(rows)} row(s)")
        for table in IDENTITY:
            t.execute(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE((SELECT MAX(id) FROM {table}), 0) + 1, false)")
    print("Done. Your local data is now in PostgreSQL.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
