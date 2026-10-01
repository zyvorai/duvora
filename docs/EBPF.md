# eBPF through Netra

Duvora does not load eBPF programs itself. It talks to a [Netra](https://github.com/zyvorai/netra) controller over Netra's HTTP API, and Netra's per-node agent does the kernel work. Everything here needs `DUVORA_NETRA_URL` and `DUVORA_NETRA_API_KEY`; without them the features are absent and the rest of Duvora is unchanged.

## What you get

| Feature | Netra source | Where in Duvora |
|---|---|---|
| Kernel-measured throughput, packets/s, blocked packets/s, drops | `/ebpf/interfaces`, `/ebpf/drops` | Device metrics (`metrics_source: netra-ebpf`), Telemetry history |
| Drop reasons (`NO_SOCKET`, `NETFILTER_DROP`, ...) | `/ebpf/drop-info` | Telemetry → Kernel observations, the `packet-drops` incident detail |
| TCP retransmits and resets per minute | `/ebpf/tcp-events` | Metrics, `tcp-retransmits` / `tcp-resets` rules |
| Top talkers (last 15 minutes) | `/flows/history` | Telemetry, device inspect, shift briefing |
| Capability probe (kernel, BTF, attached programs) | `/fleet`, `/node-resources`, `/ebpf/coverage` | Govern → Capabilities |
| Shadow isolation | `/ebpf/node-isolation` (mode `shadow`) | Operate → Isolation, `isolation-would-block` rule |
| Enforced isolation | `/ebpf/node-isolation` (mode `enforce`, `?lease=`) | Operate → Isolation, `isolation-blocked` rule |

Rates are computed from counter deltas between two polls. A counter that goes backwards (agent restart) skips that interval rather than reporting a bogus spike.

## Mapping devices to nodes

A device is matched to a Netra node, in order, by:

1. `DUVORA_NETRA_NODE_MAP`, a JSON object of device id or host to node name;
2. the node the device was matched to before;
3. the device host equal to the node name, its slug, or the node's host name.

With `DUVORA_NETRA_DISCOVER=1`, every node that matches nothing becomes a `netra-<node>` device (source `netra-ebpf`). Simulated devices are never matched. Unmatched nodes are listed in `GET /api/v1/ebpf`.

## Isolation stages

Node isolation is an allow-only egress filter that Netra attaches at TCX egress on the node's uplinks (`netra_nodeiso`). It is node-scoped: it filters the whole host, not one tenant.

1. **Preview.** An isolate plan replays the last 15 minutes of Netra flow records for each device against the allow-list and shows how many flows, and which destinations, would be blocked. Nothing changes.
2. **Shadow.** Applying the plan (confirmation `APPLY SHADOW`) sets the allow-list on the node in shadow mode. The kernel counts would-block packets and their top destinations; nothing is dropped. New would-block packets open an `isolation-would-block` incident.
3. **Enforce.** Promote one device whose same allow-list is already in shadow. The plan needs `DUVORA_NETRA_ENFORCE=1`, the kill switch released, and the typed confirmation `ENFORCE ON <device>`. The kernel then drops new outbound flows outside the allow-list; drops open an `isolation-blocked` incident.
4. **Release.** A release plan (`APPLY RELEASE`) deletes the node isolation.

What is always allowed, in every mode: established TCP (only SYNs are judged), ICMP and ICMPv6, DHCP and DHCPv6, non-first fragments, traffic from local port 22, and TCP to the Netra controller's own addresses. SSH and the control path stay reachable.

## Failing safe

- **Lease.** Enforce is set with a lease (`DUVORA_NETRA_LEASE`, default 900 s, 60–3600). Duvora renews it when less than a third (at most 5 minutes) remains. If Duvora stops, Netra's controller demotes the node to shadow when the lease ends.
- **Agent fail-safe.** If the Netra agent loses its controller, or applying the policy fails, the agent falls back to shadow by itself. A restarted Netra controller never resumes enforcement.
- **Kill switch.** `POST /api/v1/ebpf/kill-switch {"engaged":true}`, the Kill switch button, or `duvoractl kill-switch on` demotes every enforced node to shadow immediately and refuses enforce plans until released. Its state survives restarts.
- **Rollback.** Rolling back a Netra job restores the previous allow-list in shadow, or deletes the isolation if there was none. It never re-enforces.
- **Drift.** If Netra demotes a node, deletes its isolation, or another client replaces it, Duvora updates the device and records an `isolation.demoted` or `isolation.drift` audit event.

## Requirements

- Netra with node isolation: `/api/v1/ebpf/node-isolation` and the `netra_nodeiso` program attached on the node (Linux with TCX, 6.6 or later). Older Netra builds give telemetry only; isolation plans are blocked with a reason.
- A Netra **admin** API key for shadow and enforce. A viewer key gives telemetry only.
- HTTPS to Netra unless it is on loopback. Pin a self-signed certificate with `DUVORA_NETRA_CA_FILE`.

## CLI

```bash
duvoractl ebpf                       # connection, kill switch, per-device probe
duvoractl ebpf netra-node-1          # one device's kernel observations
duvoractl shadow netra-node-1 --cidr 10.0.0.0/8 --ports 443 --yes
duvoractl enforce netra-node-1                                  # prints the plan
duvoractl enforce netra-node-1 --confirm "ENFORCE ON netra-node-1"
duvoractl kill-switch on
```
