import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { bytes, metric, parsePorts, providerLabel, sourceLabel, when } from '../lib/format';
import { useFleet, useResource, type DialogState, type PlanAction, type PlanPreset } from '../store';
import type { Device, History, Job, Plan } from '../types';
import { Badge, Sparkline, Table } from './kit';

const TITLES: Record<PlanAction, string> = {
  isolate: 'Preview isolation.',
  release: 'Preview release.',
  deploy: 'Preview service deployment.',
  upgrade: 'Preview firmware upgrade.',
};

export default function PlanDialog({
  state,
  onClose,
  onApplied,
}: {
  state: DialogState;
  onClose: () => void;
  onApplied: (job: Job) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (state && !d.open) d.showModal();
    if (!state && d.open) d.close();
  }, [state]);

  return (
    <dialog ref={ref} className="dv-dialog card" onClose={onClose} aria-labelledby="dialog-title">
      {state?.kind === 'plan' && (
        <PlanForm key={state.action + state.devices.join() + (state.preset?.stage || '')} action={state.action} devices={state.devices} preset={state.preset} onClose={onClose} onApplied={onApplied} />
      )}
      {state?.kind === 'inspect' && <Inspect device={state.device} onClose={onClose} />}
    </dialog>
  );
}

function Head({ eyebrow, title, note, onClose }: { eyebrow: string; title: string; note: string; onClose: () => void }) {
  return (
    <>
      <div className="dv-dialog-head">
        <p className="eyebrow">{eyebrow}</p>
        <button type="button" className="theme-toggle" onClick={onClose} aria-label="Close dialog">
          ✕
        </button>
      </div>
      <h2 id="dialog-title">{title}</h2>
      <p className="dv-muted">{note}</p>
    </>
  );
}

function Inspect({ device: d, onClose }: { device: Device; onClose: () => void }) {
  const { data } = useResource<History>(`devices/${d.id}/history?window=1h`);
  const tp = (data?.points || []).map((p) => p.throughput_gbps).filter((v): v is number => v !== undefined);
  const temp = (data?.points || []).map((p) => p.temperature_c).filter((v): v is number => v !== undefined);
  const rows: [string, string][] = [
    ['Host', d.host],
    ['Site', d.site],
    ['Firmware', d.firmware],
    ['Health', d.health],
    ['Mode', d.mode],
    ['Revision', String(d.version)],
    ['Interfaces', d.interfaces.join(', ') || 'Unknown'],
    ['Services', String(d.services.length)],
    ['Capabilities', d.capabilities.join(', ')],
    ['Last report', when(d.last_seen)],
  ];
  if (d.ebpf) {
    const e = d.ebpf;
    rows.push(
      [`${providerLabel(e.provider)} node`, `${e.node}${e.stale ? ' (agent stale)' : ''}`],
      ['Kernel', `${e.kernel || 'Unknown'} · BTF ${e.btf === null ? 'unknown' : e.btf ? 'yes' : 'no'}`],
      ['eBPF programs', `${e.attached} attached · ${e.programs.join(', ') || 'none reported'}`],
      ['Packets / s', metric(d.metrics.pps)],
      ['TCP retransmits / min', metric(d.metrics.tcp_retransmits_pm)],
      ['TCP resets / min', metric(d.metrics.tcp_resets_pm)],
      ['Top drop reasons', e.drop_reasons.map((r) => `${r.reason} ${r.count}`).join(', ') || e.drop_info_unavailable || 'None'],
      ['Top talkers', e.talkers.slice(0, 3).map((t) => `${t.peer}:${t.port} ${bytes(t.bytes)}`).join(', ') || 'None in window'],
      ['Node isolation', e.isolation ? `${e.isolation.mode} · would block ${e.isolation.would_block_packets} · blocked ${e.isolation.blocked_packets}` : e.nodeiso_available ? 'Available, none set' : 'Not attached'],
    );
  }
  return (
    <div>
      <Head eyebrow="DEVICE" title={d.id} note={`${d.model} · ${sourceLabel(d.source)}`} onClose={onClose} />
      <div className="dv-trends">
        <div>
          <span>Throughput · last hour</span>
          <Sparkline values={tp} width={220} height={40} fill />
          <b>{metric(d.metrics.throughput_gbps, 'Gb/s')}</b>
        </div>
        <div>
          <span>Temperature · last hour</span>
          <Sparkline values={temp} width={220} height={40} />
          <b>{metric(d.metrics.temperature_c, '°C')}</b>
        </div>
      </div>
      <Table heads={['Property', 'Value']}>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td>{k}</td>
            <td>{v}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function PlanForm({
  action,
  devices,
  preset,
  onClose,
  onApplied,
}: {
  action: PlanAction;
  devices: string[];
  preset?: PlanPreset;
  onClose: () => void;
  onApplied: (job: Job) => void;
}) {
  const { snapshot } = useFleet();
  const netra = devices.some((id) => {
    const d = snapshot?.devices.find((x) => x.id === id);
    return Boolean(d?.ebpf) && d?.source !== 'simulator';
  });
  const [stage, setStage] = useState<'shadow' | 'enforce'>(preset?.stage || 'shadow');
  const [typed, setTyped] = useState('');
  const [fields, setFields] = useState({
    name: preset?.policy?.name || 'tenant-private',
    tenant: preset?.policy?.tenant || 'tenant-a',
    cidr: preset?.policy?.cidr || '10.42.0.0/16',
    ports: preset?.policy ? preset.policy.ports.join(',') : '443,8443',
    service: 'network-observer',
    image: '',
    firmware: 'demo-2.0',
  });
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFields({ ...fields, [key]: e.target.value });
    setPlan(null);
  };

  async function preview(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const spec: Record<string, unknown> = { action, devices };
    if (action === 'isolate') {
      const ports = parsePorts(fields.ports);
      if (!ports) {
        setError('Ports must be comma-separated integers from 1 to 65535.');
        return;
      }
      spec.policy = { name: fields.name, tenant: fields.tenant, cidr: fields.cidr, ports };
      if (netra) spec.stage = stage;
    }
    if (action === 'deploy') Object.assign(spec, { service: fields.service, image: fields.image });
    if (action === 'upgrade') spec.firmware = fields.firmware;
    setBusy(true);
    try {
      setPlan(await api<Plan>('plans', 'POST', spec));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!plan) return;
    setBusy(true);
    setError('');
    try {
      onApplied(await api<Job>(`plans/${plan.id}/apply`, 'POST', { confirmation: plan.confirmation }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = (id: keyof typeof fields, label: string, placeholder?: string) => (
    <label className="tokenbox" htmlFor={`f-${id}`}>
      {label}
      <input id={`f-${id}`} value={fields[id]} onChange={set(id)} placeholder={placeholder} required={id !== 'ports'} />
    </label>
  );

  return (
    <form onSubmit={preview}>
      <Head eyebrow="CHANGE WORKFLOW" title={TITLES[action]} note={`${devices.join(', ')} · all changes require a reviewed plan`} onClose={onClose} />
      <div className="dv-fields">
        {action === 'isolate' && (
          <>
            {input('name', 'Policy name')}
            {input('tenant', 'Tenant')}
            {input('cidr', 'Allowed destination CIDR')}
            {input('ports', 'Allowed ports (comma separated; empty = all)')}
            {netra && (
              <label className="tokenbox" htmlFor="f-stage">
                Stage
                <select
                  id="f-stage"
                  value={stage}
                  onChange={(e) => {
                    setStage(e.target.value as 'shadow' | 'enforce');
                    setPlan(null);
                  }}
                >
                  <option value="shadow">Shadow: count what would be blocked</option>
                  <option value="enforce">Enforce: drop new flows outside the allow-list</option>
                </select>
              </label>
            )}
            {netra && (
              <p className="dv-fine">
                The node&apos;s eBPF provider (native agent or Netra) applies this as node isolation in the kernel. Shadow never drops. Enforce needs a shadow run of the same allow-list, holds a
                renewable lease, and falls back to shadow if Duvora or the controller goes away. SSH (22), ICMP, DHCP, established connections and the control plane stay reachable.
              </p>
            )}
          </>
        )}
        {action === 'deploy' && (
          <>
            {input('service', 'Service name')}
            {input('image', 'Container image pinned to SHA-256', 'registry.example/service@sha256:…')}
            <p className="dv-fine">Simulation records desired state. No image is pulled or container launched.</p>
          </>
        )}
        {action === 'upgrade' && (
          <>
            {input('firmware', 'Target firmware label')}
            <p className="dv-fine">Simulates drain, update, and verify. No firmware artifact is downloaded or flashed.</p>
          </>
        )}
        {action === 'release' && (
          <p className="dv-fine">{netra ? 'Removes node isolation from the selected devices.' : 'Removes every simulated isolation policy from the selected devices.'}</p>
        )}
      </div>
      {plan && (
        <div className="dv-plan" role="status">
          <Badge tone={plan.blockers.length ? 'bad' : 'info'}>{plan.mode}</Badge>
          <p>{plan.effects}</p>
          <ul>
            {plan.targets.map((t) => (
              <li key={t.id}>
                {t.id} · {t.host} · revision {t.version}
              </li>
            ))}
          </ul>
          {plan.shadow && (
            <Table heads={['Device', 'Flows checked', 'Would block', 'Top would-block destinations']} label="Shadow replay">
              {Object.entries(plan.shadow).map(([id, r]) => (
                <tr key={id}>
                  <td>{id}</td>
                  <td>{r.flows}</td>
                  <td>
                    {r.would_block_flows} flows · {bytes(r.would_block_bytes)}
                  </td>
                  <td className="dv-mono">{r.top.map((t) => `${t.peer}:${t.port}`).join(', ') || 'None'}</td>
                </tr>
              ))}
            </Table>
          )}
          {plan.shadow && <p className="dv-fine">Replayed from the last {Math.round(Object.values(plan.shadow)[0].window / 60)} minutes of observed flow records.</p>}
          <p className="dv-fine">Expires {when(plan.expires)}</p>
          {plan.blockers.length ? (
            <p className="login-error">{plan.blockers.join(' · ')}</p>
          ) : plan.netra ? (
            <p className="dv-fine">The kernel isolation on the node will change. Confirm with: {plan.confirmation}</p>
          ) : (
            <p className="dv-fine">Only the local simulation model will change.</p>
          )}
          {!plan.blockers.length && plan.confirmation.startsWith('ENFORCE') && (
            <label className="tokenbox" htmlFor="f-confirm">
              Type {plan.confirmation} to confirm
              <input id="f-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </label>
          )}
        </div>
      )}
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      <div className="dv-dialog-actions">
        {plan && !plan.blockers.length ? (
          <button type="button" className="primary" onClick={apply} disabled={busy || (plan.confirmation.startsWith('ENFORCE') && typed !== plan.confirmation)}>
            {plan.netra ? (plan.mode.endsWith('-enforce') ? 'Enforce in kernel' : plan.mode.endsWith('-release') ? 'Release isolation' : 'Apply shadow') : 'Apply simulation'}
          </button>
        ) : (
          <button type="submit" className="primary" disabled={busy}>
            Preview change
          </button>
        )}
      </div>
    </form>
  );
}
