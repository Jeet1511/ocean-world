#!/usr/bin/env python3
"""Local preview server with automatic full-page reload on runtime file changes.

Run from anywhere: python3 tools/dev_server.py [--port 8000] [--host 0.0.0.0]
No third-party packages. Development only; do not expose to an untrusted network.
"""
import argparse
import hashlib
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
WATCH_DIRS = ('src', 'vendor', 'assets')
WATCH_EXTENSIONS = {'.js', '.mjs', '.css', '.html', '.json', '.glb', '.gltf', '.bin',
                    '.png', '.jpg', '.jpeg', '.webp', '.svg', '.wasm'}

# Injected only into responses served by this development server; no production
# game files or gameplay code are modified. A reload resets current game state.
CLIENT = b'''\n<script>\n(() => {\n  let version = null, checking = false;\n  async function check() {\n    if (checking) return;\n    checking = true;\n    try {\n      const response = await fetch('/__dev_version', {cache: 'no-store'});\n      if (!response.ok) return;\n      const data = await response.json();\n      if (version !== null && data.version !== version) { window.location.reload(); return; }\n      version = data.version;\n    } catch (_) { /* Keep retrying if the server temporarily goes away. */ }\n    finally { checking = false; }\n  }\n  check(); setInterval(check, 1000);\n})();\n</script>\n'''

def version():
    """Fingerprint paths, nanosecond mtimes and sizes, including additions/deletions."""
    digest = hashlib.sha256()
    paths = [ROOT / 'index.html']
    for folder in WATCH_DIRS:
        paths.extend(p for p in (ROOT / folder).rglob('*') if p.is_file() and p.suffix.lower() in WATCH_EXTENSIONS)
    for path in sorted(paths):
        try:
            st = path.stat()
            digest.update(f'{path.relative_to(ROOT)}\0{st.st_mtime_ns}\0{st.st_size}\n'.encode())
        except FileNotFoundError:
            # Files may be replaced while scanning; the next poll picks them up.
            continue
    return digest.hexdigest()

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # ES modules, GLBs and textures must not be served stale after a reload.
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/__dev_version':
            body = json.dumps({'version': version()}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif path in ('/', '/index.html'):
            try:
                data = (ROOT / 'index.html').read_bytes()
            except OSError:
                self.send_error(404, 'index.html not found')
                return
            data = data.replace(b'</body>', CLIENT + b'</body>', 1) if b'</body>' in data else data + CLIENT
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            super().do_GET()

    def log_message(self, fmt, *args):
        # Suppress the once-per-second reload poll, but keep useful request logs.
        if not self.path.startswith('/__dev_version'):
            super().log_message(fmt, *args)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=int(os.environ.get('PORT', '8000')))
    options = parser.parse_args()
    server = ThreadingHTTPServer((options.host, options.port), partial(Handler, directory=str(ROOT)))
    print(f'Living Abyss development preview: http://{options.host}:{options.port}/ (automatic reload on)', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
