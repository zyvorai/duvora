import { useState } from 'react';
import { api } from '../api';
import { Badge, Empty, Notice, Section, Table } from '../components/kit';
import { useFleet } from '../store';

interface Verdict {
  verdict: 'allow' | 'deny';
  matched: string[];
}

export default function Isolation() {
  const { snapshot, openPlan, isAdmin, toast } = useFleet();
  const [device, setDevice] = useState('');
  const [address, setAddress] = useState('10.42.0.20');
  const [port, setPort] = useState('443');
  const [result, setResult] = useState<Verdict | null>(null);
  if (!snapshot) return null;
  const simulated = snapshot.devices.filter((d) => d.source === 'simulator');
  const target = device || simulated[0]?.id || '';

  async function evaluate(e: React.FormEvent) {
    e.preventDefault();
    try {
      setResult(await api<Verdict>('evaluate', 'POST', { device: target, address, port: Number(port) }));
    } catch (err) {
      toast((err as Error).message);
    }
  }

  return (
    <div className="grid">
      <div className="span3">
        <Notice>
          These policies are model-only. They do not enforce a firewall, VLAN, VRF, or tenant boundary on real hardware. Multiple allow-lists combine as a union.
        </Notice>
      </div>
      <Section
        eyebrow="POLICIES"
        title="Isolation policies"
        lede="Scoped by device and labeled with tenant ownership."
        actions={
          <button type="button" className="primary" disabled={!isAdmin} onClick={() => openPlan('isolate')}>
            Create policy
          </button>
        }
      >
        {snapshot.policies.length ? (
          <Table heads={['Policy / tenant', 'Allowed CIDR', 'TCP/UDP ports', 'Devices', 'Mode']}>
            {snapshot.policies.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  <small className="dv-sub">Tenant {p.tenant}</small>
                </td>
                <td className="dv-mono">{p.cidr}</td>
                <td>{p.ports.length ? p.ports.join(', ') : 'All ports'}</td>
                <td>{p.devices.join(', ')}</td>
                <td>
                  <Badge tone="info">Simulated allow-list</Badge>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty title="No isolation policies yet.">Select fleet devices and create a reviewed allow-list.</Empty>
        )}
      </Section>
      <Section eyebrow="MODEL" title="Test a destination" lede="Evaluate the model without sending a packet.">
        <form className="toolbar" onSubmit={evaluate}>
          <label>
            Simulated device
            <select id="eval-device" value={target} onChange={(e) => setDevice(e.target.value)}>
              {simulated.map((d) => (
                <option key={d.id}>{d.id}</option>
              ))}
            </select>
          </label>
          <label className="tokenbox">
            Destination IP
            <input id="eval-ip" required value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <label className="tokenbox">
            Port
            <input id="eval-port" type="number" min={1} max={65535} required value={port} onChange={(e) => setPort(e.target.value)} />
          </label>
          <button className="primary" type="submit" disabled={!simulated.length || !isAdmin}>
            Evaluate
          </button>
        </form>
        {result && (
          <p className={`dv-verdict ${result.verdict}`} role="status">
            {result.verdict.toUpperCase()} · simulation only · {result.matched.join(', ') || 'No matching allow-list'}
          </p>
        )}
      </Section>
    </div>
  );
}
