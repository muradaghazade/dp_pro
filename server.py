#!/usr/bin/env python3
"""Static file server for the Demand Planning demo.
Avoids os.getcwd() (blocked in sandbox) by serving an explicit absolute directory.
"""
import os
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 8123

Handler = functools.partial(SimpleHTTPRequestHandler, directory=ROOT)
httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
print("Demand Planning demo on http://127.0.0.1:%d (root=%s)" % (PORT, ROOT))
httpd.serve_forever()
