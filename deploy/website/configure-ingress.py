"""Run on the authorized server after the website's TLS upstream is healthy.

Extends the existing shared Nginx ingress in place (its configs are bind-mounted).
Preserves the current default routes. Saves private backups, tests both configs,
and rolls both files back if validation or reload fails.
"""
from pathlib import Path
from datetime import datetime, timezone
import os
import subprocess

sni_path = Path('/opt/clashx-proxy/sni-nginx.conf')
http_path = Path('/opt/clashx-proxy/nginx.conf')
originals = {sni_path: sni_path.read_text(), http_path: http_path.read_text()}
sni, http = originals[sni_path], originals[http_path]

sni_line = '    gp.uasier.com 127.0.0.1:40501;'
if 'gp.uasier.com' not in sni:
    anchor = '  map $ssl_preread_server_name $sni_upstream {\n'
    if sni.count(anchor) != 1:
        raise RuntimeError('Unexpected SNI map; no files changed')
    sni = sni.replace(anchor, anchor + sni_line + '\n', 1)
elif sni_line not in sni:
    raise RuntimeError('A different gp.uasier.com SNI route already exists; no files changed')

marker = '  # BEGIN gp-website\n'
http_block = '''  # BEGIN gp-website
  server {
    listen 80;
    server_name gp.uasier.com;
    return 308 https://gp.uasier.com$request_uri;
  }
  # END gp-website
'''
if marker not in http:
    if 'gp.uasier.com' in http or not http.endswith('\n}\n'):
        raise RuntimeError('Unexpected HTTP config or existing domain; no files changed')
    # Append after existing virtual hosts so the original default server stays first.
    http = http[:-2] + '\n' + http_block + '}\n'
elif http_block not in http:
    raise RuntimeError('A different website HTTP route exists; no files changed')

if sni == originals[sni_path] and http == originals[http_path]:
    print('Website ingress already configured')
    raise SystemExit(0)

backup = Path('/opt/gp-website/backups') / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
backup.mkdir(parents=True, mode=0o700)
for path, content in originals.items():
    saved = backup / path.name
    saved.write_text(content)
    os.chmod(saved, 0o600)

containers = ['shiban-sni', 'clashx-subscription-nginx']
def nginx(args):
    for container in containers:
        subprocess.run(['docker', 'exec', container, 'nginx', *args], check=True)

try:
    sni_path.write_text(sni)
    http_path.write_text(http)
    nginx(['-t'])
    nginx(['-s', 'reload'])
except Exception:
    for path, content in originals.items():
        path.write_text(content)
    nginx(['-t'])
    nginx(['-s', 'reload'])
    raise
print(f'Website ingress active; original configs saved privately in {backup}')
