# Security Policy

This project includes a lightweight supply-chain guard to catch known malicious dependency indicators before they spread.

## Quick check

From repo root:

```bash
python scripts/security_dependency_guard.py
```

Expected safe output:

```text
OK: No supply-chain IOC or denylisted dependency found.
```

If the script exits with an alert:

1. Remove the compromised dependency/version immediately.
2. Assume exposed secrets are compromised and rotate credentials.
3. Rebuild local virtual environments and reinstall from trusted indexes.
4. Open a security incident ticket with findings and remediation steps.

## Current denylist

- Python: `litellm==1.82.8` (known compromised release)

Reference:
- [LiteLLM security issue #24512](https://github.com/BerriAI/litellm/issues/24512)

## Recommended install hygiene

- Use isolated Python virtual environments (`.venv`) per project.
- Prefer pinned versions and review lockfile diffs in PRs.
- Avoid running `pip` as root.
- Run the guard script in CI and before release tags.
