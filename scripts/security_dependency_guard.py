#!/usr/bin/env python3
"""
Lightweight supply-chain guard for known malicious dependency indicators.

Usage:
  python scripts/security_dependency_guard.py

Exit codes:
  0 - no findings
  1 - findings detected
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

# Denylist packages can be added over time.
DENYLIST_PYTHON = {
    # Compromised wheel reported on 2026-03-24.
    "litellm": {"1.82.8"},
}

DENYLIST_NODE = {
    # Keep here for future JS package incidents.
}

IOC_PATTERNS = [
    re.compile(r"litellm_init\.pth", re.IGNORECASE),
    re.compile(r"models\.litellm\.cloud", re.IGNORECASE),
    # Python startup abuse pattern commonly used in malicious .pth payloads.
    re.compile(r"subprocess\.Popen\(\[sys\.executable,\s*[\"']-c[\"']", re.IGNORECASE),
]

TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".py",
    ".toml",
    ".json",
    ".yaml",
    ".yml",
    ".ini",
    ".cfg",
    ".env",
    ".ps1",
    ".sh",
    ".bat",
}

SKIP_DIRS = {
    ".git",
    ".next",
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
    ".cursor",
}


def iter_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        if p.suffix.lower() in TEXT_EXTENSIONS or p.name in {
            "requirements.txt",
            "package.json",
            "package-lock.json",
            "pyproject.toml",
        }:
            files.append(p)
    return files


def parse_requirements(requirements_path: Path) -> list[tuple[str, str]]:
    hits: list[tuple[str, str]] = []
    for raw in requirements_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"([A-Za-z0-9_.-]+)\s*==\s*([A-Za-z0-9_.+-]+)", line)
        if not m:
            continue
        name = m.group(1).lower()
        version = m.group(2)
        if name in DENYLIST_PYTHON and version in DENYLIST_PYTHON[name]:
            hits.append((name, version))
    return hits


def parse_package_lock(lock_path: Path) -> list[tuple[str, str]]:
    hits: list[tuple[str, str]] = []
    try:
        data = json.loads(lock_path.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return hits

    # npm v7+ lockfile
    packages = data.get("packages", {})
    if isinstance(packages, dict):
        for _, meta in packages.items():
            if not isinstance(meta, dict):
                continue
            name = meta.get("name")
            version = meta.get("version")
            if not (isinstance(name, str) and isinstance(version, str)):
                continue
            bad_versions = DENYLIST_NODE.get(name)
            if bad_versions and version in bad_versions:
                hits.append((name, version))
    return hits


def scan_iocs(files: list[Path]) -> list[tuple[Path, str]]:
    findings: list[tuple[Path, str]] = []
    for file_path in files:
        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for patt in IOC_PATTERNS:
            if patt.search(content):
                findings.append((file_path, patt.pattern))
    return findings


def main() -> int:
    files = iter_files(REPO_ROOT)
    ioc_findings = scan_iocs(files)

    req_findings: list[tuple[Path, str, str]] = []
    lock_findings: list[tuple[Path, str, str]] = []

    for req_path in REPO_ROOT.rglob("requirements*.txt"):
        if any(part in SKIP_DIRS for part in req_path.parts):
            continue
        for name, version in parse_requirements(req_path):
            req_findings.append((req_path, name, version))

    for lock_path in REPO_ROOT.rglob("package-lock.json"):
        if any(part in SKIP_DIRS for part in lock_path.parts):
            continue
        for name, version in parse_package_lock(lock_path):
            lock_findings.append((lock_path, name, version))

    has_findings = bool(ioc_findings or req_findings or lock_findings)
    if not has_findings:
        print("OK: No supply-chain IOC or denylisted dependency found.")
        return 0

    print("ALERT: Potential supply-chain security findings detected:\n")

    for path, pattern in ioc_findings:
        print(f"- IOC match: {path.relative_to(REPO_ROOT)} (pattern: {pattern})")
    for path, name, version in req_findings:
        print(
            f"- Denylisted Python dependency: {name}=={version} in {path.relative_to(REPO_ROOT)}"
        )
    for path, name, version in lock_findings:
        print(
            f"- Denylisted Node dependency: {name}@{version} in {path.relative_to(REPO_ROOT)}"
        )

    print("\nAction: remove compromised versions and rotate exposed credentials.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
