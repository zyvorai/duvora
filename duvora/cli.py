"""duvoractl — operator CLI, using the same HTTP contract as the console."""
import argparse
import getpass
import json
import os
import socket
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote, urlsplit

ENV_FILE = Path(os.environ.get("DUVORA_ENV_FILE") or Path.home() / ".duvora" / "env")
LOOPBACK = {"localhost", "127.0.0.1", "::1"}


def read_env_file(path=None):
    """KEY=VALUE lines written by `duvoractl login` or deploy-remote.sh."""
    path = Path(path or ENV_FILE)
    values = {}
    try:
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip("'\"")
    except OSError:
        pass
    return values


def write_env_file(values, path=None):
    path = Path(path or ENV_FILE)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    body = "# Written by duvoractl — holds a personal API token; keep private.\n"
    body += "".join(f"{k}={v}\n" for k, v in values.items() if v)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(body)
    os.chmod(path, 0o600)


def setting(name, default=""):
    return os.environ.get(name) or read_env_file().get(name) or default


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def check_url(url):
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"} or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment or parts.path not in {"", "/"}:
        raise ValueError("URL must be an HTTP(S) origin without credentials, query, fragment or path")
    if parts.scheme != "https" and parts.hostname not in LOOPBACK:
        raise ValueError("Remote access requires HTTPS")
    return parts


def open_url(url, path, token="", body=None, method=None, cookie="", ca_file=None):
    parts = check_url(url)
    data = json.dumps(body, allow_nan=False).encode() if body is not None else None
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(url.rstrip("/") + path, data=data, headers=headers, method=method)
    handlers = [NoRedirect()]
    if parts.scheme == "https":
        # A self-signed deployment is trusted by pinning its certificate, never by disabling verification.
        ca = ca_file if ca_file is not None else setting("DUVORA_CA_FILE")
        handlers.append(urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=ca or None)))
    return urllib.request.build_opener(*handlers).open(req, timeout=15)


def decode(response, path):
    data = response.read(64 * 1024 * 1024)
    kind = response.headers.get("Content-Type", "")
    if "application/json" in kind:
        return json.loads(data)
    if kind.startswith("text/"):
        return data.decode()
    return data


def request(url, token, path, body=None, method=None, cookie="", ca_file=None):
    with open_url(url, path, token, body, method, cookie, ca_file) as response:
        return decode(response, path)


def prompt_password(label="Password"):
    if not sys.stdin.isatty():
        return sys.stdin.readline().rstrip("\n")
    return getpass.getpass(f"{label}: ")


def login(args):
    username = args.user or (input("Username [admin]: ").strip() if sys.stdin.isatty() else "") or "admin"
    password = prompt_password()
    with open_url(args.url, "/api/v1/session", body={"username": username, "password": password}) as response:
        cookie = (response.headers.get("Set-Cookie") or "").split(";", 1)[0]
        decode(response, "/api/v1/session")
    try:
        label = f"duvoractl@{socket.gethostname()}"[:64]
        token = request(args.url, "", "/api/v1/tokens", {"name": label}, cookie=cookie)
    finally:
        try:
            request(args.url, "", "/api/v1/session", method="DELETE", cookie=cookie)
        except (urllib.error.URLError, ValueError):
            pass
    values = read_env_file()
    values.update(DUVORA_URL=args.url.rstrip("/"), DUVORA_TOKEN=token["token"], DUVORA_TOKEN_ID=token["id"])
    if os.environ.get("DUVORA_CA_FILE"):
        values["DUVORA_CA_FILE"] = os.environ["DUVORA_CA_FILE"]
    write_env_file(values)
    return {"signed_in": username, "token": token["name"], "saved": str(ENV_FILE)}


def logout(args, token):
    values = read_env_file()
    if values.get("DUVORA_TOKEN_ID") and token:
        try:
            request(args.url, token, f"/api/v1/tokens/{quote(values['DUVORA_TOKEN_ID'])}", method="DELETE")
        except urllib.error.HTTPError as exc:
            if exc.code not in {401, 404}:
                raise
    values.pop("DUVORA_TOKEN", None)
    values.pop("DUVORA_TOKEN_ID", None)
    write_env_file(values)
    return {"signed_out": True, "saved": str(ENV_FILE)}


def build_parser():
    p = argparse.ArgumentParser(description="duvoractl — Duvora operator CLI")
    p.add_argument("--url", default=None, help="Control-plane origin (default: DUVORA_URL or ~/.duvora/env)")
    sub = p.add_subparsers(dest="command", required=True)
    for cmd in ("status", "devices", "jobs", "policies", "audit", "export", "metrics", "whoami", "scorecard", "topology", "logout", "passwd"):
        sub.add_parser(cmd)
    lg = sub.add_parser("login", help="Sign in with a username and password and save a personal API token")
    lg.add_argument("--user", "-u")
    sub.add_parser("plan").add_argument("file", help="JSON plan spec")
    ap = sub.add_parser("apply"); ap.add_argument("plan_id"); ap.add_argument("--confirm", required=True)
    sub.add_parser("rollback").add_argument("job_id")
    ev = sub.add_parser("evaluate"); ev.add_argument("device"); ev.add_argument("address"); ev.add_argument("port", type=int)
    inc = sub.add_parser("incidents"); inc.add_argument("--state", default="active", choices=["active", "open", "acknowledged", "resolved", "all"])
    sub.add_parser("ack").add_argument("incident_id")
    sub.add_parser("resolve").add_argument("incident_id")
    rp = sub.add_parser("report"); rp.add_argument("--markdown", action="store_true")
    hs = sub.add_parser("history"); hs.add_argument("device"); hs.add_argument("--window", default="1h", choices=["1h", "24h", "7d"])
    rules = sub.add_parser("rules")
    rules.add_argument("rule_id", nargs="?")
    rules.add_argument("--threshold", type=float)
    rules.add_argument("--severity", choices=["info", "warning", "critical"])
    rules.add_argument("--enable", dest="enabled", action="store_const", const=True)
    rules.add_argument("--disable", dest="enabled", action="store_const", const=False)
    users = sub.add_parser("users")
    users.add_argument("action", nargs="?", default="list", choices=["list", "add", "role", "disable", "enable", "delete", "reset-password"])
    users.add_argument("username", nargs="?")
    users.add_argument("--role", choices=["admin", "viewer"])
    sub.add_parser("backup").add_argument("file")
    return p


def run(args, token):
    call = lambda path, body=None, method=None: request(args.url, token, path, body, method)
    c = args.command
    if c == "plan":
        with open(args.file) as f:
            return call("/api/v1/plans", json.load(f))
    if c == "apply":
        return call(f"/api/v1/plans/{quote(args.plan_id)}/apply", {"confirmation": args.confirm})
    if c == "rollback":
        return call(f"/api/v1/jobs/{quote(args.job_id)}/rollback", {})
    if c == "evaluate":
        return call("/api/v1/evaluate", {"device": args.device, "address": args.address, "port": args.port})
    if c in {"export", "metrics", "whoami", "scorecard", "topology"}:
        return call(f"/api/v1/{c}")
    if c == "incidents":
        return call("/api/v1/incidents" + ("" if args.state == "all" else f"?state={args.state}"))
    if c in {"ack", "resolve"}:
        return call(f"/api/v1/incidents/{quote(args.incident_id)}/{c}", {})
    if c == "report":
        return call("/api/v1/report.md") if args.markdown else call("/api/v1/report")
    if c == "history":
        return call(f"/api/v1/devices/{quote(args.device)}/history?window={args.window}")
    if c == "rules":
        changes = {k: v for k, v in {"threshold": args.threshold, "severity": args.severity, "enabled": args.enabled}.items() if v is not None}
        if not args.rule_id:
            return call("/api/v1/alert-rules")
        if not changes:
            raise ValueError("Give --threshold, --severity, --enable or --disable")
        return call(f"/api/v1/alert-rules/{quote(args.rule_id)}", changes, "PUT")
    if c == "users":
        if args.action == "list":
            return call("/api/v1/users")
        if not args.username:
            raise ValueError("A username is required")
        target = f"/api/v1/users/{quote(args.username)}"
        if args.action == "add":
            return call("/api/v1/users", {"username": args.username, "role": args.role or "viewer", "password": prompt_password(f"Password for {args.username}")})
        if args.action == "role":
            if not args.role:
                raise ValueError("Give --role admin or --role viewer")
            return call(target, {"role": args.role}, "PATCH")
        if args.action in {"disable", "enable"}:
            return call(target, {"disabled": args.action == "disable"}, "PATCH")
        if args.action == "reset-password":
            return call(target, {"password": prompt_password(f"New password for {args.username}")}, "PATCH")
        return call(target, method="DELETE")
    if c == "passwd":
        return call("/api/v1/me/password", {"current": prompt_password("Current password"), "new": prompt_password("New password")})
    if c == "backup":
        data = call("/api/v1/backup")
        fd = os.open(args.file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        return {"saved": args.file, "bytes": len(data)}
    result = call("/api/v1/snapshot")
    return result if c == "status" else result[c]


def main():
    p = build_parser()
    args = p.parse_args()
    args.url = args.url or setting("DUVORA_URL", "http://127.0.0.1:8787")
    try:
        if args.command == "login":
            result = login(args)
        else:
            token = setting("DUVORA_TOKEN")
            if not token:
                p.error("Run `duvoractl login`, or set DUVORA_TOKEN; secrets are deliberately not accepted as command-line arguments")
            result = logout(args, token) if args.command == "logout" else run(args, token)
        print(result if isinstance(result, str) else json.dumps(result, indent=2))
    except urllib.error.HTTPError as exc:
        print(exc.read().decode(errors="replace"), file=sys.stderr); sys.exit(1)
    except (ValueError, OSError) as exc:
        print(str(exc), file=sys.stderr); sys.exit(1)


if __name__ == "__main__":
    main()
