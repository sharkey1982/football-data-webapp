# ============================================================================
# scripts/db_direct.py
#
# Direct database connection (SUPABASE_DB_URL, the session pooler) with a
# client-side time limit on every query.
#
# Why (6 Oct 2026): the database restarted several times under load. A query
# in flight when that happens can leave the client waiting forever: the
# pooler is still up and answers on the socket, so neither the server's
# statement_timeout nor TCP keepalives ever fire. Two projection runs hung
# that way for 25+ minutes with nothing running in the database.
#
# Each query runs on a daemon thread; if it hasn't returned within the limit
# the connection is abandoned (never touched again, so nothing can block on
# it) and TimeoutError is raised for the caller's retry to reconnect.
# ============================================================================

from __future__ import annotations

import threading


class DirectDB:
    def __init__(self, url: str, statement_timeout_s: int = 120, client_timeout_s: int = 180):
        self.url = url
        self.statement_timeout_s = statement_timeout_s
        self.client_timeout_s = client_timeout_s
        self.conn = None

    def _connect(self):
        import psycopg
        conn = psycopg.connect(
            self.url, autocommit=True, connect_timeout=30,
            keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=3,
            tcp_user_timeout=60000,
        )
        conn.execute(f"set statement_timeout = '{int(self.statement_timeout_s)}s'")
        return conn

    def drop(self) -> None:
        """Forget the current connection, closing it only if it is idle-safe."""
        conn, self.conn = self.conn, None
        if conn is not None:
            threading.Thread(target=_quiet_close, args=(conn,), daemon=True).start()

    def query(self, sql: str, params=None, fetch: str = "one"):
        """Run one statement. fetch: 'one' -> first column of first row,
        'all' -> list of dicts."""
        box: dict = {}
        abandoned = threading.Event()

        def work():
            try:
                conn = self.conn
                if conn is None or conn.closed:
                    conn = self._connect()
                    if abandoned.is_set():  # connected too late: not ours any more
                        _quiet_close(conn)
                        return
                    self.conn = conn
                cur = conn.execute(sql, params)
                if fetch == "all":
                    names = [c.name for c in cur.description]
                    box["value"] = [dict(zip(names, r)) for r in cur.fetchall()]
                else:
                    box["value"] = cur.fetchone()[0]
            except BaseException as e:  # noqa: BLE001 -- handed to the caller
                box["error"] = e

        t = threading.Thread(target=work, daemon=True)
        t.start()
        t.join(self.client_timeout_s)
        if t.is_alive():
            # Abandon the stuck connection without touching it.
            abandoned.set()
            self.conn = None
            raise TimeoutError(f"no answer from the database within {self.client_timeout_s}s")
        if "error" in box:
            self.drop()
            raise box["error"]
        return box.get("value")


def _quiet_close(conn) -> None:
    try:
        conn.close()
    except Exception:
        pass
