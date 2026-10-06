import time

import pytest

from db_direct import DirectDB


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows
        self.description = [type("C", (), {"name": "x"})()]

    def fetchone(self):
        return self.rows[0]

    def fetchall(self):
        return self.rows


class FakeConn:
    def __init__(self, delay=0.0, fail=False):
        self.delay, self.fail, self.closed = delay, fail, False

    def execute(self, sql, params=None):
        time.sleep(self.delay)
        if self.fail:
            raise RuntimeError("boom")
        return FakeCursor([(7,)])

    def close(self):
        self.closed = True


def make(conns, timeout=0.3):
    db = DirectDB("postgres://x", client_timeout_s=timeout)
    it = iter(conns)
    db._connect = lambda: next(it)
    return db


def test_returns_value():
    assert make([FakeConn()]).query("select 1") == 7


def test_fetch_all():
    assert make([FakeConn()]).query("select 1", fetch="all") == [{"x": 7}]


def test_hung_query_times_out_and_next_call_reconnects():
    db = make([FakeConn(delay=5), FakeConn()])
    t0 = time.time()
    with pytest.raises(TimeoutError):
        db.query("select 1")
    assert time.time() - t0 < 2
    assert db.query("select 1") == 7


def test_error_drops_connection():
    db = make([FakeConn(fail=True), FakeConn()])
    with pytest.raises(RuntimeError):
        db.query("select 1")
    assert db.query("select 1") == 7
