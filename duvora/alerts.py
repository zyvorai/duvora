"""Alert rules evaluated against the fleet; one incident per rule and target."""
import json
import secrets
import time

from .common import Problem, canonical, finite

SCHEMA = """
CREATE TABLE IF NOT EXISTS alert_rules(id TEXT PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS incidents(id TEXT PRIMARY KEY, key TEXT NOT NULL, state TEXT NOT NULL, opened REAL NOT NULL, body TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS incidents_state ON incidents(state, key);
"""
SEVERITIES = ("info", "warning", "critical")
DEFAULT_RULES = [
    {"id": "temperature-high", "name": "Temperature above threshold", "kind": "metric", "metric": "temperature_c", "threshold": 80, "severity": "warning", "enabled": True},
    {"id": "packet-drops", "name": "Packet drops reported", "kind": "metric", "metric": "drops", "threshold": 0, "severity": "info", "enabled": True},
    {"id": "health-degraded", "name": "Device health degraded", "kind": "health", "severity": "warning", "enabled": True},
    {"id": "device-stale", "name": "Observation is stale", "kind": "stale", "threshold": 120, "severity": "critical", "enabled": True},
    {"id": "job-failed", "name": "Operation failed", "kind": "job", "severity": "critical", "enabled": True},
]
ALERT_INTERVAL = 5
RESOLVED_RETENTION = 30 * 86400


class AlertsMixin:
    def init_alerts(self):
        self.db.executescript(SCHEMA)
        self.last_alert = 0.0
        with self.transaction():
            for rule in DEFAULT_RULES:
                self.db.execute("INSERT OR IGNORE INTO alert_rules VALUES(?,?)", (rule["id"], canonical(rule)))

    def alert_rules(self):
        with self.lock:
            return [json.loads(r[0]) for r in self.db.execute("SELECT body FROM alert_rules ORDER BY id")]

    def update_rule(self, actor, ident, body):
        if not isinstance(body, dict) or not body or set(body) - {"enabled", "threshold", "severity"}:
            raise Problem("Rule updates may change enabled, threshold or severity")
        with self.transaction():
            row = self.db.execute("SELECT body FROM alert_rules WHERE id=?", (ident,)).fetchone()
            if not row:
                raise Problem("Alert rule not found", 404)
            rule = json.loads(row[0])
            if "enabled" in body:
                if not isinstance(body["enabled"], bool):
                    raise Problem("enabled must be true or false")
                rule["enabled"] = body["enabled"]
            if "severity" in body:
                if body["severity"] not in SEVERITIES:
                    raise Problem("Severity must be info, warning or critical")
                rule["severity"] = body["severity"]
            if "threshold" in body:
                if "threshold" not in rule:
                    raise Problem("This rule has no threshold")
                rule["threshold"] = finite(body["threshold"], "threshold", 0, 1e9)
            self.db.execute("UPDATE alert_rules SET body=? WHERE id=?", (canonical(rule), ident))
            self.event(actor, "alert-rule.updated", {"id": ident, "fields": sorted(body)})
            return rule

    def conditions(self, now):
        """Return {key: (rule, target, title, detail)} for every currently firing rule."""
        firing = {}
        devices = self.rows("devices")
        for rule in self.alert_rules():
            if not rule["enabled"]:
                continue
            if rule["kind"] == "job":
                for job in self.rows("jobs"):
                    if job["state"] == "failed":
                        firing[f"{rule['id']}:{job['id']}"] = (rule, job["id"], f"{job['action']} job failed", f"Job {job['id']}")
                continue
            for d in devices:
                hit = None
                if rule["kind"] == "metric":
                    value = d["metrics"].get(rule["metric"])
                    if value is not None and value > rule["threshold"]:
                        hit = f"{rule['metric']} = {value} (threshold {rule['threshold']})"
                elif rule["kind"] == "health" and d["health"] == "degraded":
                    hit = "Source reports degraded health"
                elif rule["kind"] == "stale" and d["source"] != "simulator" and now - d["last_seen"] > rule["threshold"]:
                    hit = f"No report for {int(now - d['last_seen'])} s"
                if hit:
                    firing[f"{rule['id']}:{d['id']}"] = (rule, d["id"], f"{rule['name']} on {d['id']}", hit)
        return firing

    def evaluate_alerts(self, now=None, force=False):
        now = now or time.time()
        if not force and now - self.last_alert < ALERT_INTERVAL:
            return
        self.last_alert = now
        with self.transaction():
            firing = self.conditions(now)
            active = {r["key"]: json.loads(r["body"]) for r in self.db.execute("SELECT key, body FROM incidents WHERE state!='resolved'")}
            for key, (rule, target, title, detail) in firing.items():
                if key in active:
                    inc = active[key]
                    if inc["detail"] != detail:
                        inc.update(detail=detail, updated=now)
                        self.db.execute("UPDATE incidents SET body=? WHERE id=?", (canonical(inc), inc["id"]))
                    continue
                inc = {"id": secrets.token_hex(8), "key": key, "rule": rule["id"], "target": target, "severity": rule["severity"],
                       "title": title, "detail": detail, "state": "open", "opened": now, "updated": now,
                       "acknowledged_by": None, "resolved_at": None, "resolved_by": None}
                self.db.execute("INSERT INTO incidents VALUES(?,?,?,?,?)", (inc["id"], key, "open", now, canonical(inc)))
                self.event("alerts", "incident.opened", {"id": inc["id"], "rule": rule["id"], "target": target, "severity": rule["severity"]})
            for key, inc in active.items():
                if key not in firing:
                    self._resolve(inc, "alerts", now)

    def _resolve(self, inc, actor, now):
        inc.update(state="resolved", resolved_at=now, resolved_by=actor, updated=now)
        self.db.execute("UPDATE incidents SET state='resolved', body=? WHERE id=?", (canonical(inc), inc["id"]))
        self.event(actor, "incident.resolved", {"id": inc["id"], "rule": inc["rule"], "target": inc["target"]})

    def incidents(self, state=None):
        if state not in (None, "open", "acknowledged", "resolved", "active"):
            raise Problem("State must be open, acknowledged, resolved or active")
        with self.lock:
            if state == "active":
                rows = self.db.execute("SELECT body FROM incidents WHERE state!='resolved' ORDER BY opened DESC")
            elif state:
                rows = self.db.execute("SELECT body FROM incidents WHERE state=? ORDER BY opened DESC LIMIT 500", (state,))
            else:
                rows = self.db.execute("SELECT body FROM incidents ORDER BY opened DESC LIMIT 500")
            return [json.loads(r[0]) for r in rows]

    def incident_action(self, actor, ident, action):
        with self.transaction():
            row = self.db.execute("SELECT body FROM incidents WHERE id=?", (ident,)).fetchone()
            if not row:
                raise Problem("Incident not found", 404)
            inc = json.loads(row[0])
            if inc["state"] == "resolved":
                return inc
            now = time.time()
            if action == "ack":
                if inc["state"] != "acknowledged":
                    inc.update(state="acknowledged", acknowledged_by=actor, updated=now)
                    self.db.execute("UPDATE incidents SET state='acknowledged', body=? WHERE id=?", (canonical(inc), ident))
                    self.event(actor, "incident.acknowledged", {"id": ident})
            elif action == "resolve":
                self._resolve(inc, actor, now)
            else:
                raise Problem("Endpoint not found", 404)
            return inc
