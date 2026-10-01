# Changelog

## 0.3.0

- Netra bridge (`DUVORA_NETRA_URL`, `DUVORA_NETRA_API_KEY`): kernel-measured throughput, packets per second, drops with kernel drop reasons, TCP retransmits and resets, and top talkers, merged into devices and telemetry history. Devices map to Netra nodes by `DUVORA_NETRA_NODE_MAP`, host name, or discovery (`DUVORA_NETRA_DISCOVER=1`).
- eBPF capability probe per node: kernel, BTF, attached programs, drop-reason and TCP event availability, node isolation.
- Isolation stages on Netra nodes. Previews replay recent flow records against the allow-list; shadow counts what the kernel would block; enforce drops new egress flows outside the allow-list. Enforce requires a shadow run of the same allow-list, one device, `DUVORA_NETRA_ENFORCE=1`, and a typed `ENFORCE ON <device>` confirmation. Enforce leases (`DUVORA_NETRA_LEASE`, default 900 s) are renewed while Duvora runs; Netra falls back to shadow without them.
- Kill switch (`POST /api/v1/ebpf/kill-switch`, console, `duvoractl kill-switch`) demotes every enforced node to shadow and blocks enforcement until released. Rollback of a Netra job never re-enforces. Changes made on Netra (lease lapse, deletion, another policy) are detected and recorded.
- New alert rules: `tcp-retransmits`, `tcp-resets`, `ebpf-detached`, `isolation-would-block`, `isolation-blocked`. The shift briefing gains kernel observations.
- Console: kernel observations on Telemetry, node isolation with promote / back to shadow / release and the kill switch on Isolation, eBPF probe on Capabilities, eBPF details in device inspect, shadow replay and stage in the plan dialog.
- `duvoractl ebpf`, `shadow`, `enforce`, `kill-switch`.
- Helm `netra.*` values; `deploy-remote.sh` connects to a Netra running in the same cluster (`DUVORA_NETRA=off` to skip).
- Requires Netra with node isolation (`/api/v1/ebpf/node-isolation`, `netra_nodeiso`) for shadow and enforce; older Netra builds give telemetry only.

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
