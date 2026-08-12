#!/usr/bin/env python3
"""Demand Planning demo server.

Serves the static app AND persists the application state server-side:
  GET  /api/state  -> data/state.json (204 if none yet)
  POST /api/state  -> saves the state atomically + keeps rolling backups
                      in data/backups/ (last 30)

All data — items, requests, uploaded images — therefore lives on disk in
the project folder and survives browser cache/localStorage wipes.

Avoids os.getcwd() (blocked in sandbox) by serving an explicit absolute directory.
Optional argv[1] overrides the port (default 8123).
"""
import os
import sys
import json
import time
import threading
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
DATA_DIR = os.path.join(ROOT, "data")
STATE_FILE = os.path.join(DATA_DIR, "state.json")
BACKUP_DIR = os.path.join(DATA_DIR, "backups")
KEEP_BACKUPS = 30

_LOCK = threading.Lock()


def _stored_saved_at():
    try:
        with open(STATE_FILE, "rb") as f:
            return json.load(f).get("__savedAt") or 0
    except Exception:
        return 0


LAST_SAVED_AT = _stored_saved_at()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _api(self):
        return self.path.split("?")[0] == "/api/state"

    def end_headers(self):
        # local dev server: always revalidate, so a refresh never runs stale app code
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        if self._api():
            if os.path.exists(STATE_FILE):
                with open(STATE_FILE, "rb") as f:
                    body = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_response(204)
                self.end_headers()
            return
        super().do_GET()

    def do_POST(self):
        if not self._api():
            self.send_response(404)
            self.end_headers()
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length)
            incoming = json.loads(body)  # must be valid JSON — never overwrite good data with garbage
        except Exception:
            self.send_response(400)
            self.end_headers()
            return
        # stale-write guard: a tab holding an older copy (e.g. its unload beacon
        # during a refresh) must never overwrite newer data already on disk
        global LAST_SAVED_AT
        with _LOCK:
            ts = (incoming.get("__savedAt") or 0) if isinstance(incoming, dict) else 0
            if ts < LAST_SAVED_AT:
                resp = b'{"ok":false,"reason":"stale"}'
                self.send_response(409)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(resp)))
                self.end_headers()
                self.wfile.write(resp)
                return
            LAST_SAVED_AT = ts
        os.makedirs(DATA_DIR, exist_ok=True)
        os.makedirs(BACKUP_DIR, exist_ok=True)
        # rolling backup of the previous good state (at most one per minute)
        try:
            if os.path.exists(STATE_FILE):
                stamp = time.strftime("%Y%m%d-%H%M")
                bak = os.path.join(BACKUP_DIR, "state-%s.json" % stamp)
                if not os.path.exists(bak):
                    with open(STATE_FILE, "rb") as src, open(bak, "wb") as dst:
                        dst.write(src.read())
                    backups = sorted(os.listdir(BACKUP_DIR))
                    for old in backups[:-KEEP_BACKUPS]:
                        os.remove(os.path.join(BACKUP_DIR, old))
        except Exception:
            pass
        # atomic write: tmp file + rename, so a crash can never truncate the state
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "wb") as f:
            f.write(body)
        os.replace(tmp, STATE_FILE)
        # keep the bundled snapshot (js/state-snapshot.js) in sync, so the repo
        # always ships the same data the local app shows — even opened statically
        try:
            snap = os.path.join(ROOT, "js", "state-snapshot.js")
            with open(snap + ".tmp", "wb") as f:
                f.write(b"window.STATE_SNAPSHOT = ")
                f.write(body)
                f.write(b";")
            os.replace(snap + ".tmp", snap)
        except Exception:
            pass
        resp = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(resp)))
        self.end_headers()
        self.wfile.write(resp)

    def log_message(self, *args):
        pass


httpd = ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Handler))
print("Demand Planning demo on http://127.0.0.1:%d (root=%s, state=%s)" % (PORT, ROOT, STATE_FILE))
httpd.serve_forever()
