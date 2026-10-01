import { Badge, Empty, Section, Table } from '../components/kit';
import { ago } from '../lib/format';
import { useFleet, useResource } from '../store';
import type { EbpfOverview } from '../types';

const COPY: Record<string, string> = {
  simulator: 'Durable plans, jobs, policies, service records, upgrades, and rollback in the local model.',
  linux_discovery: 'Reads Linux sysfs PCI identity. No device writes or automatic readiness claims.',
  dpf_import: 'Imports Kubernetes DPF DPU objects using a read-only kubectl bridge.',
  ebpf_telemetry: 'Kernel-measured rates, drop reasons, TCP health, and talkers from Netra. Read-only.',
  hardware_enforcement:
    'DPU hardware enforcement is unavailable. With Netra, node isolation runs in the kernel: shadow first, then a leased enforce with a kill switch.',
  firmware_flash: 'Requires vendor compatibility checks, signed artifacts, recovery validation, and a hardware adapter.',
  storage_offload: 'Requires a validated DOCA storage integration and supported hardware.',
};

export default function Capabilities() {
  const { snapshot } = useFleet();
  const { data } = useResource<EbpfOverview>('ebpf', 10000);
  if (!snapshot) return null;
  const netra = data?.netra;
  return (
    <div className="grid">
      {Object.entries(snapshot.capabilities).map(([key, value]) => (
        <Section key={key} span={1} eyebrow="ADAPTER STATUS" title={key.replaceAll('_', ' ')}>
          <p>
            <Badge tone={value === 'available' ? 'ok' : value === 'unavailable' ? 'warn' : 'info'}>{value}</Badge>
          </p>
          <p>{COPY[key]}</p>
        </Section>
      ))}
      <Section
        eyebrow="eBPF PROBE"
        title="Netra kernel capabilities"
        lede={
          netra?.configured
            ? `${netra.connected ? 'Connected' : 'Not connected'} to ${netra.url || 'Netra'} · ${netra.nodes} node(s) · last sync ${netra.last_sync ? ago(netra.last_sync) : 'never'}${netra.error ? ` · ${netra.error}` : ''}`
            : 'Netra is not configured (set DUVORA_NETRA_URL and DUVORA_NETRA_API_KEY). Without it, eBPF telemetry and node isolation are unavailable.'
        }
      >
        {data?.devices.length ? (
          <Table heads={['Device / node', 'Kernel', 'BTF', 'Programs attached', 'Drop reasons', 'TCP events', 'Node isolation']} label="eBPF capability probe">
            {data.devices.map((d) => (
              <tr key={d.id}>
                <td>
                  <strong>{d.id}</strong>
                  <small className="dv-sub">{d.node}</small>
                </td>
                <td className="dv-mono">{d.kernel || 'Unknown'}</td>
                <td>
                  <Badge tone={d.btf ? 'ok' : d.btf === null ? 'idle' : 'warn'}>{d.btf === null ? 'unknown' : d.btf ? 'yes' : 'no'}</Badge>
                </td>
                <td>
                  {d.attached}
                  <small className="dv-sub dv-mono">{d.programs.join(', ')}</small>
                </td>
                <td>{d.drop_info_unavailable ? <small className="dv-sub">{d.drop_info_unavailable}</small> : <Badge tone="ok">reporting</Badge>}</td>
                <td>{d.tcp_unavailable ? <small className="dv-sub">{d.tcp_unavailable}</small> : <Badge tone="ok">reporting</Badge>}</td>
                <td>
                  <Badge tone={d.nodeiso_available ? 'ok' : 'idle'}>{d.nodeiso_available ? 'available' : 'not attached'}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          netra?.configured && <Empty title="No devices matched to Netra nodes.">Unmatched nodes: {netra.unmatched.join(', ') || 'none'}.</Empty>
        )}
      </Section>
    </div>
  );
}
