#!/usr/bin/env python3
"""Build dist/mydublist-chrome-<version>.zip and dist/mydublist-firefox-<version>.zip from this folder.
Usage: python build_zips.py [--lint]   (--lint also runs Mozilla's web-ext lint on the Firefox zip)"""
import copy
import fnmatch
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")

# Everything the extension loads; README, the build script and git files stay out.
FILES = ["content.js", "browser-polyfill.min.js", "style.css", "popup.html", "popup.css", "popup.js", "LICENSE"]
DIRS = ["fonts", "icons"]

# Fixed timestamp so rebuilding the same sources gives byte-identical zips.
ZIP_DATE = (2020, 1, 1, 0, 0, 0)


def drop_redundant_optional_hosts(m):
    # Chrome warns about every optional host that is already required, and Firefox
    # already lets permissions.request() ask for any host in host_permissions.
    optional = [o for o in m.get("optional_host_permissions", []) if o not in m.get("host_permissions", [])]
    if optional:
        m["optional_host_permissions"] = optional
    else:
        m.pop("optional_host_permissions", None)


def chrome_manifest(m):
    m = copy.deepcopy(m)
    m.pop("browser_specific_settings", None)  # Firefox-only (add-on id, minimum version)
    drop_redundant_optional_hosts(m)
    return m


def firefox_manifest(m):
    m = copy.deepcopy(m)
    drop_redundant_optional_hosts(m)
    return m


def collect_files():
    paths = []
    for f in FILES:
        if not os.path.isfile(os.path.join(ROOT, f)):
            sys.exit(f"missing file: {f}")
        paths.append(f)
    for d in DIRS:
        for base, _dirs, names in os.walk(os.path.join(ROOT, d)):
            for name in names:
                rel = os.path.relpath(os.path.join(base, name), ROOT)
                paths.append(rel.replace(os.sep, "/"))
    return sorted(set(paths))


def check_references(manifest, paths):
    """Fail if the manifest points at a file the zip would not contain."""
    wanted = []
    for size_map in (manifest.get("icons", {}), manifest.get("action", {}).get("default_icon", {})):
        wanted += list(size_map.values())
    if manifest.get("action", {}).get("default_popup"):
        wanted.append(manifest["action"]["default_popup"])
    for cs in manifest.get("content_scripts", []):
        wanted += cs.get("js", []) + cs.get("css", [])
    missing = [w for w in wanted if w not in paths]
    for war in manifest.get("web_accessible_resources", []):
        for pattern in war.get("resources", []):
            if not fnmatch.filter(paths, pattern):
                missing.append(pattern)
    if missing:
        sys.exit(f"manifest references files that are not packaged: {missing}")


def check_popup_origins(manifest):
    """The popup can only request hosts the manifest declares; both browsers reject the rest."""
    with open(os.path.join(ROOT, "popup.js"), encoding="utf-8") as fh:
        block = re.search(r"REQUIRED_ORIGINS\s*=\s*\[(.*?)\]", fh.read(), re.S)
    if not block:
        sys.exit("popup.js: REQUIRED_ORIGINS not found")
    declared = set(manifest.get("host_permissions", [])) | set(manifest.get("optional_host_permissions", []))
    for cs in manifest.get("content_scripts", []):
        declared |= set(cs.get("matches", []))
    undeclared = [o for o in re.findall(r'"([^"]+)"', block.group(1)) if o not in declared]
    if undeclared:
        sys.exit(f"popup.js asks for hosts the manifest does not declare: {undeclared}")


def write_zip(target, manifest, paths):
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        info = zipfile.ZipInfo("manifest.json", ZIP_DATE)
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
        for rel in paths:
            info = zipfile.ZipInfo(rel, ZIP_DATE)  # forward slashes; AMO rejects backslash paths
            info.compress_type = zipfile.ZIP_DEFLATED
            with open(os.path.join(ROOT, rel), "rb") as fh:
                z.writestr(info, fh.read())


def lint_firefox(zip_path):
    npx = shutil.which("npx")
    if not npx:
        sys.exit("--lint needs Node.js (npx) on PATH")
    with tempfile.TemporaryDirectory() as tmp:
        zipfile.ZipFile(zip_path).extractall(tmp)
        return subprocess.call([npx, "--yes", "web-ext@latest", "lint", "--source-dir", tmp])


def main():
    with open(os.path.join(ROOT, "manifest.json"), encoding="utf-8") as fh:
        source = json.load(fh)
    version = source["version"]
    paths = collect_files()
    os.makedirs(DIST, exist_ok=True)
    built = {}
    for store, build in (("chrome", chrome_manifest), ("firefox", firefox_manifest)):
        manifest = build(source)
        check_references(manifest, paths)
        check_popup_origins(manifest)
        target = os.path.join(DIST, f"mydublist-{store}-{version}.zip")
        write_zip(target, manifest, paths)
        built[store] = target
        print(f"{os.path.relpath(target, ROOT)}  ({len(paths) + 1} files, {os.path.getsize(target)} bytes)")
    if "--lint" in sys.argv[1:]:
        sys.exit(lint_firefox(built["firefox"]))


if __name__ == "__main__":
    main()
