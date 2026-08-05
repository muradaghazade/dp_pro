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
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
DATA_DIR = os.path.join(ROOT, "data")
STATE_FILE = os.path.join(DATA_DIR, "state.json")
BACKUP_DIR = os.path.join(DATA_DIR, "backups")
KEEP_BACKUPS = 30


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _api(self):
        return self.path.split("?")[0] == "/api/state"

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
            json.loads(body)  # must be valid JSON — never overwrite good data with garbage
        except Exception:
            self.send_response(400)
            self.end_headers()
            return
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
