# HTTP API

Base path: `/api/v1`. API version is `v1`; payload version is `0.3.0`. Except `/healthz`, `POST /api/v1/session` and the console's static files, every request must authenticate with one of:

- the `duvora_session` cookie set by signing in (HttpOnly, `SameSite=Strict`, `Secure` over HTTPS, 12-hour lifetime, revocable server-side);
- `Authorization: Bearer dvr_…` — a personal API token created by a named user (`duvoractl login` creates one);
- `Authorization: Bearer KEY` — a static access or agent key from `DUVORA_KEYS`.

Request bodies (POST, PUT, PATCH) must be a JSON object with `Content-Type: application/json`, at most 64 KiB. No CORS is enabled. An unknown path returns 404; a known path with another method returns 405.

## Session

| Method | Endpoint | Access | Result |
|---|---|---|---|
| POST | `/api/v1/session` | Public | `{"username","password"}` → user; sets the cookie. 401 on bad credentials, 429 after 10 failures in 5 minutes from one client |
| DELETE | `/api/v1/session` | Any | Revokes the session and clears the cookie |
| GET | `/api/v1/session` | Any credential | Principal, role, demo flag |
| GET | `/api/v1/whoami` | Any credential | Principal, role, `via` (`session`, `token`, `key`), `default_password` flag |

## Fleet and changes

| Method | Endpoint | Role | Result |
|---|---|---|---|
| GET | `/healthz` | Public | Process health |
| GET | `/api/v1/snapshot` | Viewer | Fleet, jobs, policies, last 200 audit events, version, open incident count |
| GET | `/api/v1/export` | Viewer | Same evidence snapshot as JSON |
| GET | `/api/v1/metrics` | Viewer | Prometheus text: device/source counts, jobs, `duvora_open_incidents` |
| GET | `/api/v1/devices/{id}/history?window=1h\|24h\|7d` | Viewer | Telemetry points (raw for 1h, 5-minute buckets for 24h, hourly for 7d) |
| GET | `/api/v1/topology` | Viewer | Nodes (site, host, dpu, policy) and edges (contains, hosts, isolates) |
| POST | `/api/v1/reports` | Host-bound agent key | Accepted observed inventory |
| POST | `/api/v1/plans` | Admin | Preview with mode, blockers, expiry, target revisions, the `confirmation` phrase, and (for isolate) a `shadow` replay of Netra flow records |
| POST | `/api/v1/plans/{id}/apply` | Plan's admin principal | Idempotent queued job (`mode` `simulation` or `netra`) |
| POST | `/api/v1/jobs/{id}/rollback` | Admin | Eligible rollback; a Netra rollback restores the previous allow-list in shadow and never re-enforces |
| POST | `/api/v1/evaluate` | Admin | Model-only allow/deny verdict |

## eBPF (Netra)

| Method | Endpoint | Role | Result |
|---|---|---|---|
| GET | `/api/v1/ebpf` | Viewer | Netra connection (`connected`, `isolation_supported`, `enforce_allowed`, `kill_switch`, `unmatched` nodes) and per-device probe: kernel, BTF, attached programs, node isolation status, Duvora's requested isolation |
| GET | `/api/v1/devices/{id}/ebpf` | Viewer | One device: measured metrics, drop reasons, TCP availability, top talkers, node isolation counters |
| POST | `/api/v1/ebpf/kill-switch` | Admin | `{"engaged":true\|false}`. Engaging demotes every enforced node to shadow now and refuses enforce plans until released; returns `demoted` and `errors` |

See [EBPF.md](EBPF.md) for the stages, gates and failure behavior.

## Monitoring and reports

| Method | Endpoint | Role | Result |
|---|---|---|---|
| GET | `/api/v1/incidents?state=open\|acknowledged\|resolved\|active` | Viewer | Incidents, newest first (`active` = open or acknowledged) |
| POST | `/api/v1/incidents/{id}/ack` | Admin | Acknowledge an open incident |
| POST | `/api/v1/incidents/{id}/resolve` | Admin | Resolve an incident |
| GET | `/api/v1/alert-rules` | Viewer | Rules: temperature-high, packet-drops, health-degraded, device-stale, job-failed, tcp-retransmits, tcp-resets, ebpf-detached, isolation-would-block, isolation-blocked |
| PUT | `/api/v1/alert-rules/{id}` | Admin | `{"enabled","threshold","severity"}` (any subset) |
| GET | `/api/v1/scorecard` | Viewer | Fleet score 0–100 (or null with no devices), grade, weighted parts |
| GET | `/api/v1/report` | Viewer | Shift briefing as JSON, including `markdown` |
| GET | `/api/v1/report.md` | Viewer | Shift briefing as a Markdown download |

## Users, tokens and backup

| Method | Endpoint | Role | Result |
|---|---|---|---|
| GET | `/api/v1/users` | Admin | Users (no password hashes) |
| POST | `/api/v1/users` | Admin | `{"username","role":"admin\|viewer","password"}` |
| PATCH | `/api/v1/users/{name}` | Admin | `{"role","password","disabled"}`; revokes the user's sessions; the last enabled admin is protected |
| DELETE | `/api/v1/users/{name}` | Admin | Deletes the user, their sessions and tokens |
| POST | `/api/v1/me/password` | Named user | `{"current","new"}`; passwords need at least 8 characters |
| GET | `/api/v1/tokens` | Named user | Your tokens (name, created, last used; never the secret) |
| POST | `/api/v1/tokens` | Named user | `{"name"}` → `{"id","name","token"}`; the secret is shown once |
| DELETE | `/api/v1/tokens/{id}` | Named user | Revokes one of your tokens |
| GET | `/api/v1/backup` | Admin | Consistent SQLite snapshot (`application/vnd.sqlite3`) |

"Named user" means a session or personal token, not a static `DUVORA_KEYS` key.

## Bodies

Plan examples are in `examples/`. Supported actions: `isolate`, `release`, `deploy`, `upgrade`. Unknown fields are rejected. Targets are explicit IDs; selectors cannot silently expand after preview.

Apply with the plan's `confirmation` phrase: `APPLY SIMULATION` for simulation plans, `APPLY SHADOW` or `APPLY RELEASE` for Netra plans, and `ENFORCE ON <device>` to enforce.

```json
{"confirmation":"APPLY SIMULATION"}
```

Netra isolation plan (`stage` is `shadow` by default; `enforce` needs the same allow-list already in shadow, one device, `DUVORA_NETRA_ENFORCE=1`, and the kill switch released):

```json
{"action":"isolate","devices":["netra-node-1"],"stage":"shadow","policy":{"name":"egress","tenant":"ops","cidr":"10.0.0.0/8","ports":[443]}}
```

```json
{"device":"bf3-01","address":"10.42.0.20","port":443}
```

Report shape:

```json
{"id":"pci-example","host":"gpu-01","site":"pune","source":"linux-pci","model":"BlueField-3","firmware":"unknown","health":"unknown","metrics":{},"interfaces":["p0"]}
```

Supported observed metric keys: `throughput_gbps`, `drops`, `temperature_c`, `link_gbps`; values must be nonnegative finite numbers. Agent values are trusted reports, not independent measurements verified by the controller. Source must be `linux-pci` or `nvidia-dpf`; agents cannot set simulator capabilities or desired enforcement state. Every accepted report is also recorded as a telemetry sample.

## Errors

Errors return `{"error":"message"}` with 400 (validation), 401 (authentication), 403 (role/identity), 404 (missing object or path), 405 (method), 409 (stale/expired/blocked/conflicting state), 413 (body size), 415 (content type), or 429 (sign-in rate limit).

Apply retries return the same job. Poll the snapshot for job progress. Plans expire after 300 seconds. Jobs serialize changes per selected device. A rollback is blocked after later revisions; rollback is not a general history stack or a physical recovery mechanism. Full audit history remains in SQLite (subject to retention); snapshot/export expose only the latest 200 events.
