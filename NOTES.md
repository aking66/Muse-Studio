# Project Notes

## 2026-03-26 Security hardening update

- Added `scripts/security_dependency_guard.py` to detect supply-chain IOC patterns and denylisted dependency versions.
- Added CI workflow `.github/workflows/security-dependency-guard.yml` to run guard checks on pull requests and pushes to `main`/`master`.
- Added and documented denylist entry for `litellm==1.82.8` based on active OSS incident response.
- Added root documentation in `SECURITY.md` and README security section for routine checks and remediation steps.

Incident reference:
- [LiteLLM security issue #24512](https://github.com/BerriAI/litellm/issues/24512)
