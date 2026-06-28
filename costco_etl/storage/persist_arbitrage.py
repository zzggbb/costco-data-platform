import sqlite3
import json
from datetime import datetime, timezone

def persist_arbitrage(db_path: str, delta: dict) -> None:
    """
    Serialize the delta and save it to the arbitrage table in the database.

    The database is recreated on each pipeline run, so arbitrage table will
    always only have a single row.
    """
    payload_str = json.dumps(delta)
    updated_at = datetime.now(timezone.utc).isoformat()

    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO arbitrage (payload, updated_at)
            VALUES (?, ?)
            """,
            (payload_str, updated_at)
        )
        conn.commit()
    finally:
        conn.close()
