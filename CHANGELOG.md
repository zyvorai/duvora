# Changelog

## 0.2.0

- Sign in with a username and password (default `admin` / `Admin@321`, or `DUVORA_ADMIN_PASSWORD`). Passwords are scrypt-hashed; sessions are server-side, revocable, and carried in an HttpOnly `SameSite=Strict` cookie. Failed sign-ins are rate-limited.
- Named users with admin/viewer roles, password changes, and personal `dvr_` API tokens. Static `DUVORA_KEYS` access and agent keys still work.
- New console in React + Vite + TypeScript, using the Netra design language: login screen, mega-menu navigation, page heroes, dark mode.
- New pages: Topology, Telemetry history, Incidents, Alert rules, Scorecard, Shift briefing, Users.
- Telemetry history (1h/24h/7d), alert rules with automatic incidents, fleet scorecard, Markdown shift briefing, topology graph.
- Housekeeping of expired plans, old audit events (`DUVORA_AUDIT_RETENTION_DAYS`), samples, resolved incidents and sessions; online SQLite backup endpoint.
- `duvoractl login/logout/whoami/incidents/ack/resolve/rules/scorecard/report/topology/history/users/passwd/backup`; settings saved in `~/.duvora/env`; `DUVORA_CA_FILE` pins a self-signed certificate.
- Optional native TLS (`--tls-cert/--tls-key`). Unknown API paths return 404 and wrong methods 405.
- Deploy: multi-stage `Dockerfile`, `Dockerfile.runtime`, `helm/duvora` chart (NodePort 30880), `scripts/deploy-remote.sh` (`--k3s`, `--k8s`, `--docker`, `--quick`, `--dry-run`, `--verify-only`) and `scripts/deploy-container.sh`.
- CI: web typecheck/tests/build, Helm lint, browser workflow with password sign-in, container smoke test.

## 0.1.0

- Renamed project, Python module, console, CLI, environment variables, deployment resources, and source archives to Duvora.

- Standalone DPU control plane, CLI, console, and read-only inventory agents.
- Persistent simulation workflows for services, isolation, release, firmware upgrade, and rollback.
- Actor-bound expiring previews, revision checks, idempotent apply, and device operation locking.
- Admin/viewer/host-bound agent access keys; Prometheus metrics and JSON evidence export.
- Container and single-replica Kubernetes deployment templates, CI, and acceptance roadmap.
