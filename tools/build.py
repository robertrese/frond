"""Assemble Frond.

Usage: python -I build.py <frond dir>

Writes two outputs from src/:
- dist/frond.html  the Claude artifact page (Google Fonts, no service worker)
  and dist/index.html, the same page inside the publish skeleton for preview.
- site/            the installable web app for GitHub Pages: index.html with
  local fonts, manifest.webmanifest, icons, and sw.js for offline play.
Every URL in site/ is relative, so it works from any subfolder
(for example https://<user>.github.io/frond/).
"""
import hashlib
import json
import pathlib
import shutil
import sys

root = pathlib.Path(sys.argv[1]).resolve()
src, dist, site = root / "src", root / "dist", root / "site"
assets = root / "assets"
NAME = "Frond"
DESCRIPTION = "A calm botanical word search: a new puzzle every day, 13 themes at three difficulties, streaks and stats."
PAPER, PAPER_DARK = "#F2EBDD", "#191714"

page = (src / "page.html").read_text(encoding="utf-8")
parts = {
    "/*@@STYLE@@*/": (src / "style.css").read_text(encoding="utf-8"),
    "/*@@DATA@@*/": (src / "words.js").read_text(encoding="utf-8"),
    "/*@@APP@@*/": (src / "app.js").read_text(encoding="utf-8"),
}
for marker, body in parts.items():
    if marker not in page:
        raise SystemExit("missing marker " + marker)
    page = page.replace(marker, body)
for marker in ("<!--@@HEAD@@-->", "<!--@@BOOT@@-->"):
    if marker not in page:
        raise SystemExit("missing marker " + marker)

# ---------- Claude artifact ----------
dist.mkdir(exist_ok=True)
artifact_head = (
    f"<title>{NAME}</title>\n"
    '<meta name="claude:viewport-fit-sides" content="cover">\n'
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=DM+Mono:wght@400;500&display=swap">'
)
artifact = page.replace("<!--@@HEAD@@-->", artifact_head).replace("<!--@@BOOT@@-->", "")
(dist / "frond.html").write_text(artifact, encoding="utf-8")
reset = (
    ":root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);"
    "padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}"
    "img{max-width:100%}[hidden]{display:none!important}"
)
(dist / "index.html").write_text(
    '<!doctype html><html><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    f"<style>{reset}</style></head><body>{artifact}</body></html>",
    encoding="utf-8",
)

# ---------- GitHub Pages site ----------
if site.exists():
    shutil.rmtree(site)
(site / "fonts").mkdir(parents=True)
(site / "icons").mkdir()
for f in sorted((assets / "fonts").iterdir()):
    shutil.copy2(f, site / "fonts" / f.name)
for f in sorted((assets / "icons").glob("*.png")):
    shutil.copy2(f, site / "icons" / f.name)

fonts_css = """
@font-face { font-family: 'Bricolage Grotesque'; font-style: normal; font-weight: 500 800; font-display: swap; src: url("fonts/bricolage-grotesque-latin.woff2") format("woff2"); }
@font-face { font-family: 'DM Mono'; font-style: normal; font-weight: 400; font-display: swap; src: url("fonts/dm-mono-400-latin.woff2") format("woff2"); }
@font-face { font-family: 'DM Mono'; font-style: normal; font-weight: 500; font-display: swap; src: url("fonts/dm-mono-500-latin.woff2") format("woff2"); }
""".strip()
site_head = (
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    f"<title>{NAME}</title>\n"
    f'<meta name="description" content="{DESCRIPTION}">\n'
    f'<meta name="theme-color" content="{PAPER}" media="(prefers-color-scheme: light)">\n'
    f'<meta name="theme-color" content="{PAPER_DARK}" media="(prefers-color-scheme: dark)">\n'
    '<link rel="manifest" href="manifest.webmanifest">\n'
    '<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">\n'
    '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n'
    f'<meta name="apple-mobile-web-app-title" content="{NAME}">\n'
    '<meta name="apple-mobile-web-app-capable" content="yes">\n'
    '<meta name="mobile-web-app-capable" content="yes">\n'
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">\n'
    '<link rel="preload" href="fonts/bricolage-grotesque-latin.woff2" as="font" type="font/woff2" crossorigin>\n'
    f"<style>{reset}\n{fonts_css}</style>\n"
    "</head>\n<body>\n"
)
boot = (
    "<script>\n"
    "if ('serviceWorker' in navigator) {\n"
    "  addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });\n"
    "}\n"
    "</script>"
)
html = site_head + page.replace("<!--@@HEAD@@-->", "").replace("<!--@@BOOT@@-->", boot) + "\n</body>\n</html>\n"
(site / "index.html").write_text(html, encoding="utf-8")

manifest = {
    "id": "./",
    "name": NAME,
    "short_name": NAME,
    "description": DESCRIPTION,
    "lang": "en",
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "orientation": "any",
    "background_color": PAPER,
    "theme_color": PAPER,
    "categories": ["games", "entertainment"],
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}
(site / "manifest.webmanifest").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

# service worker: precache every file; the cache name changes whenever any file does
files = sorted(p.relative_to(site).as_posix() for p in site.rglob("*") if p.is_file())
sw = (src / "sw.js").read_text(encoding="utf-8")
digest = hashlib.sha256(sw.encode())
for name in files:
    digest.update(name.encode())
    digest.update((site / name).read_bytes())
version = digest.hexdigest()[:12]
precache = ["./"] + [f for f in files if f != "index.html"]
sw = sw.replace("'@@VERSION@@'", json.dumps(version)).replace("['@@PRECACHE@@']", json.dumps(precache))
if "@@" in sw:
    raise SystemExit("sw.js template marker not replaced")
(site / "sw.js").write_text(sw, encoding="utf-8")
(site / ".nojekyll").write_text("", encoding="utf-8")

print(f"artifact {len(artifact.encode()) // 1024} KB; site {len(files) + 2} files, cache {version}")
