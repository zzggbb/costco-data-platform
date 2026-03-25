import sqlite3
import json
from datetime import datetime, timezone

def persist_arbitrage_daily(db_path: str, delta: dict) -> None:
    """
    Serializa el reporte de arbitraje (delta) y lo guarda en la base de datos.
    Como la DB se recrea en cada ejecución, esto inserta una única fila
    con la foto del día.
    """
    payload_str = json.dumps(delta)
    updated_at = datetime.now(timezone.utc).isoformat()

    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO arbitrage_daily (payload, updated_at)
            VALUES (?, ?)
            """,
            (payload_str, updated_at)
        )
        conn.commit()
    finally:
        conn.close()