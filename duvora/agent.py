"""Read-only Linux PCI discovery; no privileged subprocesses or hardware writes."""
import argparse
import hashlib
import json
import os
import re
import socket
import time
from pathlib import Path

from .cli import request

# NVIDIA/Mellanox BlueField PCI IDs. An ID match proves PCI identity, not DPU mode.
BLUEFIELD = {"0xa2d2": "BlueField-2", "0xa2d3": "BlueField-3", "0xa2d6": "BlueField integrated controller"}


def read(path, default="unknown"):
    try:
        return path.read_text().strip()
    except OSError:
        return default


def discover(root=Path("/sys/bus/pci/devices"), host=None, site="unassigned"):
    host = host or re.sub(r"[^a-z0-9._-]", "-", socket.gethostname().lower())[:63]
    reports = []
    if not root.exists():
        return reports
    for pci in sorted(root.iterdir()):
        vendor, ident = read(pci / "vendor"), read(pci / "device")
        if vendor != "0x15b3" or ident not in BLUEFIELD:
            continue
        uid = hashlib.sha256(f"{host}:{pci.name}".encode()).hexdigest()[:16]
        interfaces = sorted(x.name for x in (pci / "net").iterdir()) if (pci / "net").exists() else []
        reports.append({"id": "pci-" + uid, "host": host, "site": site, "model": BLUEFIELD[ident],
            "source": "linux-pci", "firmware": "unknown", "health": "unknown", "metrics": {}, "interfaces": interfaces})
    return reports


def main():
    p = argparse.ArgumentParser(description="Read-only BlueField PCI inventory agent")
    p.add_argument("--host", default=re.sub(r"[^a-z0-9._-]", "-", socket.gethostname().lower())[:63])
    p.add_argument("--site", default="unassigned")
    p.add_argument("--url", default=os.environ.get("DUVORA_URL", "http://127.0.0.1:8787"))
    p.add_argument("--submit", action="store_true")
    p.add_argument("--interval", type=int, default=0, help="0 = once; otherwise repeat every N seconds")
    args = p.parse_args()
    if args.interval < 0 or (args.interval and args.interval < 10):
        p.error("Interval must be zero or at least 10 seconds")
    token = os.environ.get("DUVORA_TOKEN", "")
    if args.submit and not token:
        p.error("Set DUVORA_TOKEN to a host-bound agent key")
    while True:
        reports = discover(host=args.host, site=args.site)
        if args.submit:
            for report in reports:
                request(args.url, token, "/api/v1/reports", report)
            print(json.dumps({"submitted": len(reports), "host": args.host}), flush=True)
        else:
            print(json.dumps(reports, indent=2), flush=True)
        if not args.interval:
            break
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
