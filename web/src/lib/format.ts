export const sourceLabel = (s: string) =>
  ({ simulator: 'Simulated', 'linux-pci': 'Linux PCI', 'nvidia-dpf': 'NVIDIA DPF' })[s] || s;

export const when = (seconds: number | null | undefined) =>
  seconds ? new Date(seconds * 1000).toLocaleString() : '—';

export function ago(seconds: number, now = Date.now() / 1000): string {
  const d = Math.max(0, Math.round(now - seconds));
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export function metric(value: number | undefined, unit = ''): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return 'Unknown';
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${unit ? ' ' + unit : ''}`;
}

export function detailText(detail: unknown): string {
  return typeof detail === 'string' ? detail : JSON.stringify(detail);
}

/** Parse "443, 8443" into ports; empty means all ports. Returns null on invalid input. */
export function parsePorts(text: string): number[] | null {
  if (!text.trim()) return [];
  const ports = text.split(',').map((x) => Number(x.trim()));
  return ports.every((p) => Number.isInteger(p) && p >= 1 && p <= 65535) ? ports : null;
}
