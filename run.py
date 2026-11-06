#!/usr/bin/env python3
"""Local IOS -> NX-OS converter: one-command launcher.

Starts a tiny HTTP server bound to 127.0.0.1 (loopback only, never
exposed on the network) that serves a focused web UI and a small JSON
API.  The API imports the converter module from ``vendor/`` and calls
it in-process -- no shell, no subprocess, no disk writes.

Usage
-----
  python3 run.py                 # pick a free port, open the browser
  python3 run.py --port 8765     # pin a specific port
  python3 run.py --no-browser    # don't open the browser automatically
  python3 run.py --host 127.0.0.1  # loopback only (default and recommended)

Dependencies: Python 3.9+ standard library only.  No pip install needed.
"""
from __future__ import annotations

import argparse
import json
import logging
import mimetypes
import os
import re
import sys
import threading
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(HERE, "static")
SAMPLES_DIR = os.path.join(HERE, "samples")

# Make the vendored converter importable.
if HERE not in sys.path:
    sys.path.insert(0, HERE)
from vendor import nxos_catalyst_converter as converter  # noqa: E402

LOG = logging.getLogger("ios2nxos")

# Request-body cap: converter runs in-process so we need a DoS guard.
MAX_BODY = 4 * 1024 * 1024  # 4 MiB
# Strict allow-list for the "media" option (used by nxos->ios only).
MEDIA_RE = re.compile(r"^[A-Za-z0-9]{1,40}$")
# Host-header allow-list -- defends against DNS-rebinding against a
# loopback server.  Browsers targeting localhost will always send one of
# these hosts.  We populate the port at startup.
_ALLOWED_HOST_NAMES = {"localhost", "127.0.0.1", "[::1]", "::1"}

VALID_DIRECTIONS = {"ios2nxos", "nxos2ios"}
VALID_FORMATS = {"deployable", "sidebyside"}


class BadRequest(ValueError):
    """Raised for client-side input problems -> HTTP 400."""


# ---------------------------------------------------------------------------
# Conversion API (wraps the vendored converter)
# ---------------------------------------------------------------------------

def _validate(payload):
    direction = payload.get("direction", "ios2nxos")
    content = payload.get("content", "")
    fmt = payload.get("format", "deployable")
    options = payload.get("options") or {}
    if direction not in VALID_DIRECTIONS:
        raise BadRequest("unknown direction")
    if fmt not in VALID_FORMATS:
        raise BadRequest("unknown output format")
    if not isinstance(content, str):
        raise BadRequest("content must be a string")
    if not isinstance(options, dict):
        raise BadRequest("options must be an object")
    media = str(options.get("media") or "GigabitEthernet")
    if not MEDIA_RE.match(media):
        media = "GigabitEthernet"
    return direction, content, fmt, media


def do_convert(payload):
    direction, content, fmt, media = _validate(payload)
    records = (converter.iosxe_to_nxos(content, media)
               if direction == "ios2nxos"
               else converter.nxos_to_iosxe(content, media))
    output = (converter.render_sidebyside(records, direction)
              if fmt == "sidebyside"
              else converter.render_deployable(records))
    ext = "md" if fmt == "sidebyside" else "cfg"
    return {"output": output, "filename": f"converted_{direction}.{ext}"}


def do_verify(payload):
    direction, content, _fmt, media = _validate(payload)
    ok, report = converter.verify_report(content, direction, media)
    return {"ok": bool(ok), "report": report}


# ---------------------------------------------------------------------------
# HTTP layer
# ---------------------------------------------------------------------------

# Served static files (relative path -> absolute path).  Explicit allow-list
# so a bug in path-joining cannot leak arbitrary files from the project.
_STATIC_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/style.css": "style.css",
    "/app.js": "app.js",
    "/samples/sample_ios.cfg": "sample_ios.cfg",
    "/samples/sample_nxos.cfg": "sample_nxos.cfg",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "ios2nxos-local/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        LOG.info("%s - %s", self.address_string(), fmt % args)

    # --- shared helpers ------------------------------------------------
    def _common_security_headers(self):
        # Local, same-origin app.  Lock it down so even if the browser is
        # tricked into loading our page in a weird context, it cannot
        # pull in remote scripts or be framed.
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; style-src 'self'; script-src 'self'; "
            "img-src 'self' data:; connect-src 'self'; "
            "frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        )
        self.send_header("Cache-Control", "no-store")

    def _send_json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._common_security_headers()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _send_bytes(self, code, body, content_type):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self._common_security_headers()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _host_allowed(self):
        # Defense in depth against DNS rebinding: refuse requests whose
        # Host header is not a known loopback name.
        host = (self.headers.get("Host") or "").strip()
        if not host:
            return False
        name = host.rsplit(":", 1)[0].strip().lower() if ":" in host else host.lower()
        if name.startswith("[") and "]" in name:
            name = name[: name.index("]") + 1]
        return name in _ALLOWED_HOST_NAMES

    def _read_json(self):
        if (self.headers.get("Content-Type") or "").split(";")[0].strip() \
                != "application/json":
            raise BadRequest("content-type must be application/json")
        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0:
            return {}
        if length > MAX_BODY:
            raise BadRequest("request body too large")
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except (ValueError, UnicodeDecodeError):
            raise BadRequest("body is not valid JSON")
        if not isinstance(data, dict):
            raise BadRequest("body must be a JSON object")
        return data

    def _serve_static(self, rel_path):
        name = _STATIC_FILES.get(rel_path)
        if name is None:
            return self._send_json(404, {"error": "not found"})
        base = SAMPLES_DIR if rel_path.startswith("/samples/") else STATIC_DIR
        path = os.path.join(base, name)
        try:
            with open(path, "rb") as fh:
                body = fh.read()
        except OSError:
            return self._send_json(404, {"error": "not found"})
        ctype, _ = mimetypes.guess_type(path)
        if ctype is None:
            ctype = "text/plain; charset=utf-8"
        elif ctype.startswith("text/"):
            ctype += "; charset=utf-8"
        return self._send_bytes(200, body, ctype)

    # --- routes --------------------------------------------------------
    def do_GET(self):
        if not self._host_allowed():
            return self._send_json(403, {"error": "forbidden host"})
        path = urlsplit(self.path).path
        if path == "/api/health":
            return self._send_json(200, {"status": "ok"})
        return self._serve_static(path)

    def do_HEAD(self):
        # Keep responses consistent with GET for cache/preflight clients.
        self.do_GET()

    def do_POST(self):
        if not self._host_allowed():
            return self._send_json(403, {"error": "forbidden host"})
        path = urlsplit(self.path).path
        try:
            payload = self._read_json()
            if path == "/api/convert":
                return self._send_json(200, do_convert(payload))
            if path == "/api/verify":
                return self._send_json(200, do_verify(payload))
            return self._send_json(404, {"error": "not found"})
        except BadRequest as exc:
            return self._send_json(400, {"error": str(exc)})
        except Exception as exc:  # defensive -- converter is fool-proof
            LOG.exception("conversion failed")
            return self._send_json(500, {"error": f"internal error: {exc}"})


# ---------------------------------------------------------------------------
# Launcher
# ---------------------------------------------------------------------------

def _parse_args(argv):
    p = argparse.ArgumentParser(
        description="Local IOS -> NX-OS converter (browser UI + CLI).",
    )
    p.add_argument("--host", default="127.0.0.1",
                   help="bind address (default: 127.0.0.1, loopback only)")
    p.add_argument("--port", type=int, default=0,
                   help="TCP port (default: pick a free one)")
    p.add_argument("--no-browser", action="store_true",
                   help="do not open the browser automatically")
    return p.parse_args(argv)


def main(argv=None):
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    args = _parse_args(argv or sys.argv[1:])
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    host, port = httpd.server_address[0], httpd.server_address[1]
    url = f"http://{'localhost' if host in ('127.0.0.1', '::1') else host}:{port}/"
    LOG.info("ios-to-nxos listening on %s", url)
    LOG.info("Press Ctrl-C to stop.")

    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open_new(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        LOG.info("shutting down")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
