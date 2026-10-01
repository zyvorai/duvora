"""Read-only scorecard, shift briefing, and fleet topology derived from current state."""
import time

from . import __version__

PENALTY = {"critical": 10, "warning": 4, "info": 1}


def grade(score):
    if score is None:
        return "No devices"
    return "Excellent" if score >= 90 else "Good" if score >= 75 else "Needs attention" if score >= 50 else "At risk"


class ReportsMixin:
    def scorecard(self):
        snap = self.snapshot()
        devices, jobs = snap["devices"], snap["jobs"]
        incidents = self.incidents("active")
        n = len(devices)
        healthy = sum(d["health"] == "healthy" for d in devices)
        stale = sum(d["health"] == "stale" for d in devices)
        day = time.time() - 86400
        recent = [j for j in jobs if j["created"] >= day]
        failed = sum(j["state"] == "failed" for j in recent)
        penalty = min(20, sum(PENALTY.get(i["severity"], 1) for i in incidents))
        parts = [
            {"name": "Device health", "weight": 50, "score": round(50 * healthy / n, 1) if n else 0, "detail": f"{healthy} of {n} healthy"},
            {"name": "Observation freshness", "weight": 20, "score": round(20 * (1 - stale / n), 1) if n else 0, "detail": f"{stale} stale"},
            {"name": "Open incidents", "weight": 20, "score": 20 - penalty, "detail": f"{len(incidents)} active"},
            {"name": "Operations", "weight": 10, "score": round(10 * (1 - failed / len(recent)), 1) if recent else 10, "detail": f"{failed} of {len(recent)} failed in 24 h"},
        ]
        score = round(sum(p["score"] for p in parts)) if n else None
        return {"score": score, "grade": grade(score), "parts": parts, "devices": n, "generated": time.time()}

    def topology(self):
        snap = self.snapshot()
        nodes, edges, seen = [], [], set()

        def add(node):
            if node["id"] not in seen:
                seen.add(node["id"])
                nodes.append(node)

        for d in snap["devices"]:
            site, host = f"site:{d['site']}", f"host:{d['site']}/{d['host']}"
            add({"id": site, "kind": "site", "label": d["site"]})
            add({"id": host, "kind": "host", "label": d["host"], "site": d["site"]})
            add({"id": f"dpu:{d['id']}", "kind": "dpu", "label": d["id"], "health": d["health"], "mode": d["mode"], "source": d["source"]})
            edges.append({"from": site, "to": host, "kind": "contains"})
            edges.append({"from": host, "to": f"dpu:{d['id']}", "kind": "hosts"})
        for p in snap["policies"]:
            add({"id": f"policy:{p['id']}", "kind": "policy", "label": p["name"], "tenant": p["tenant"]})
            for dev in p["devices"]:
                edges.append({"from": f"policy:{p['id']}", "to": f"dpu:{dev}", "kind": "isolates"})
        return {"nodes": nodes, "edges": edges}

    def briefing(self):
        snap = self.snapshot()
        card = self.scorecard()
        incidents = self.incidents("active")
        day = time.time() - 86400
        jobs = sorted((j for j in snap["jobs"] if j["created"] >= day), key=lambda j: -j["created"])
        by = lambda key: {v: sum(d[key] == v for d in snap["devices"]) for v in sorted({d[key] for d in snap["devices"]})}
        steps = []
        for inc in incidents:
            if inc["rule"] == "temperature-high":
                steps.append(f"Check airflow and load on {inc['target']} before scheduling changes.")
            elif inc["rule"] == "device-stale":
                steps.append(f"Confirm the agent for {inc['target']} is running and can reach the control plane.")
            elif inc["rule"] == "health-degraded":
                steps.append(f"Inspect {inc['target']} in DPU fleet and review its source readiness.")
            elif inc["rule"] == "packet-drops":
                steps.append(f"Review drop counters on {inc['target']} in Telemetry.")
            elif inc["rule"] in ("tcp-retransmits", "tcp-resets"):
                steps.append(f"Check path loss and peer health for {inc['target']} (Netra TCP events).")
            elif inc["rule"] == "ebpf-detached":
                steps.append(f"Check the Netra agent and program attachment on {inc['target']}.")
            elif inc["rule"] == "isolation-would-block":
                steps.append(f"Review would-block destinations on {inc['target']} before enforcing isolation.")
            elif inc["rule"] == "isolation-blocked":
                steps.append(f"Check the destinations enforced isolation drops on {inc['target']}; engage the kill switch if they are needed.")
            else:
                steps.append(f"Review incident {inc['id']}: {inc['title']}.")
        if not steps:
            steps.append("No active incidents. Continue routine review.")
        body = {"generated": time.time(), "version": __version__, "demo": snap["demo"], "scorecard": card,
                "fleet": {"total": len(snap["devices"]), "by_health": by("health"), "by_source": by("source"), "by_site": by("site")},
                "incidents": incidents, "jobs": jobs[:50], "playbook": list(dict.fromkeys(steps)),
                "ebpf": [{"device": d["id"], "node": d["ebpf"].get("node"),
                          "drop_reasons": (d["ebpf"].get("drop_reasons") or [])[:3],
                          "talkers": (d["ebpf"].get("talkers") or [])[:3]}
                         for d in snap["devices"] if d.get("ebpf")]}
        body["markdown"] = markdown(body)
        return body


def markdown(r):
    when = time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime(r["generated"]))
    score = "n/a" if r["scorecard"]["score"] is None else r["scorecard"]["score"]
    lines = [f"# Duvora shift briefing — {when}", "",
             f"Score: **{score}** ({r['scorecard']['grade']}) · {r['fleet']['total']} devices" + (" · simulation enabled" if r["demo"] else ""), "",
             "## Fleet", ""]
    lines += [f"- {k}: {v}" for k, v in r["fleet"]["by_health"].items()] or ["- No devices"]
    lines += ["", "## Active incidents", ""]
    lines += [f"- [{i['severity']}] {i['title']} — {i['detail']} ({i['state']})" for i in r["incidents"]] or ["- None"]
    lines += ["", "## Operations in the last 24 hours", ""]
    lines += [f"- {j['action']} on {', '.join(j['spec']['devices'])}: {j['state']}" for j in r["jobs"]] or ["- None"]
    if r.get("ebpf"):
        lines += ["", "## Kernel observations (Netra eBPF)", ""]
        for e in r["ebpf"]:
            reasons = ", ".join(f"{x['reason']} ({x['count']})" for x in e["drop_reasons"]) or "none"
            talkers = ", ".join(f"{t['peer']}:{t['port']}/{t['protocol']}" for t in e["talkers"]) or "none"
            lines.append(f"- {e['device']}: drop reasons {reasons}; top talkers {talkers}")
    lines += ["", "## Suggested next steps (review only)", ""]
    lines += [f"- {s}" for s in r["playbook"]]
    return "\n".join(lines) + "\n"
