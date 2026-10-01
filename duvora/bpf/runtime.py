"""The agent's native eBPF loop: report counters, pull desired isolation, apply it with local safety.

Safety is local and does not depend on the control plane:
  - enforce falls back to shadow when the lease in the desired state has lapsed;
  - enforce falls back to shadow when the control plane has been unreachable for `failsafe` seconds;
  - an override file on the host (DUVORA_EBPF_OVERRIDE) turns isolation off entirely."""
import hashlib
import json
import os
import time
from urllib.parse import urlsplit

from .nodeiso import build_rules, resolve_controller

OVERRIDE = "/run/duvora/isolation-off"


def failsafe_seconds():
    try:
        return min(3600, max(15, int(os.environ.get("DUVORA_EBPF_FAILSAFE", "60"))))
    except ValueError:
        return 60


def decide(desired, now, last_contact, failsafe, override=False):
    """(effective mode, demoted reason) for a desired isolation (or None)."""
    if not desired or desired.get("mode") not in {"shadow", "enforce"}:
        return "off", ""
    if override:
        return "off", "local override"
    if desired["mode"] == "enforce":
        lease = desired.get("leaseUntil")
        if not isinstance(lease, (int, float)) or now >= lease:
            return "shadow", "lease expired"
        if last_contact is None or now - last_contact > failsafe:
            return "shadow", "control plane unreachable"
    return desired["mode"], ""


class EbpfAgent:
    def __init__(self, host, url, call, sensors, isolation=None, isolation_error="", failsafe=None, override_path=None):
        """`call(method, path, body)` talks to the control plane; `isolation` is a NodeIsolation or None."""
        self.host, self.url, self.call = host, url, call
        self.sensors, self.isolation, self.isolation_error = sensors, isolation, isolation_error
        self.failsafe = failsafe or failsafe_seconds()
        self.override_path = override_path or os.environ.get("DUVORA_EBPF_OVERRIDE") or OVERRIDE
        self.desired, self.last_contact, self.server_controller = None, None, []
        self.controller = resolve_controller(urlsplit(url).hostname or "")
        self.applied = {"key": None, "mode": "off", "revision": None, "demoted": ""}
        self.errors = []

    def status(self):
        """Isolation status in the shape of a Netra node-isolation item, or None if there is nothing to show."""
        d, a = self.desired or {}, self.applied
        if not d and a["mode"] == "off" and not self.isolation_error:
            return None
        item = {"policyId": d.get("policyId"), "mode": d.get("mode") or "off", "effectiveMode": a["mode"],
                "revision": d.get("revision"), "appliedRevision": a["revision"], "leaseUntil": d.get("leaseUntil"),
                "demoted": a["demoted"], "agentStale": False, "unavailable": self.isolation_error,
                "attached": self.isolation is not None}
        stats = self.isolation.stats() if self.isolation else {}
        for key, name in (("allowed", "allowedPackets"), ("exempt", "exemptPackets"), ("would_block", "wouldBlockPackets"),
                          ("would_block_bytes", "wouldBlockBytes"), ("blocked", "blockedPackets"), ("blocked_bytes", "blockedBytes")):
            item[name] = stats.get(key, 0)
        item["top"] = stats.get("top", [])
        return item

    def report(self, now):
        summary = self.sensors.snapshot(self.host, now)
        summary["nodeiso_available"] = self.isolation is not None
        summary["isolation"] = self.status()
        summary["errors"] = self.errors[-5:]
        self.call("POST", "/api/v1/agent/ebpf", {"host": self.host, "summary": summary})
        self.errors = []

    def pull(self, now):
        out = self.call("GET", "/api/v1/agent/isolation", None)
        self.desired = out.get("isolation") if isinstance(out, dict) else None
        self.server_controller = [a for a in (out.get("controller") or []) if isinstance(a, str)] if isinstance(out, dict) else []
        self.last_contact = now

    def apply(self, now):
        mode, why = decide(self.desired, now, self.last_contact, self.failsafe, os.path.exists(self.override_path))
        if self.isolation is None:
            return
        rules = (self.desired or {}).get("rules") or [] if mode != "off" else []
        controller = sorted(set(self.controller) | set(self.server_controller))
        key = hashlib.sha256(json.dumps([mode, rules, controller], sort_keys=True).encode()).hexdigest()
        if key != self.applied["key"]:
            self.isolation.apply(mode, build_rules(rules, controller) if mode != "off" else [])
        self.applied = {"key": key, "mode": mode, "demoted": why,
                        "revision": (self.desired or {}).get("revision") if mode != "off" else None}

    def step(self, now=None):
        """One interval. Each phase fails independently; apply always runs so local safety holds."""
        now = now or time.time()
        fresh = resolve_controller(urlsplit(self.url).hostname or "")
        if fresh:
            self.controller = fresh
        for phase in (self.report, self.pull):
            try:
                phase(now)
            except Exception as exc:  # network, HTTP or map errors; keep going
                self.errors.append(f"{phase.__name__}: {exc}"[:300])
        try:
            self.apply(now)
        except Exception as exc:
            self.errors.append(f"apply: {exc}"[:300])
        self.errors = self.errors[-20:]
        return self.applied
