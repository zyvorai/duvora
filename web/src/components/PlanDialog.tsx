import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { metric, parsePorts, sourceLabel, when } from '../lib/format';
import { useResource, type DialogState, type PlanAction } from '../store';
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
      {state?.kind === 'plan' && <PlanForm key={state.action + state.devices.join()} action={state.action} devices={state.devices} onClose={onClose} onApplied={onApplied} />}
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

function PlanForm({ action, devices, onClose, onApplied }: { action: PlanAction; devices: string[]; onClose: () => void; onApplied: (job: Job) => void }) {
  const [fields, setFields] = useState({
    name: 'tenant-private',
    tenant: 'tenant-a',
    cidr: '10.42.0.0/16',
    ports: '443,8443',
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
      onApplied(await api<Job>(`plans/${plan.id}/apply`, 'POST', { confirmation: 'APPLY SIMULATION' }));
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
        {action === 'release' && <p className="dv-fine">Removes every simulated isolation policy from the selected devices.</p>}
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
          <p className="dv-fine">Expires {when(plan.expires)}</p>
          {plan.blockers.length ? (
            <p className="login-error">{plan.blockers.join(' · ')}</p>
          ) : (
            <p className="dv-fine">Only the local simulation model will change.</p>
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
          <button type="button" className="primary" onClick={apply} disabled={busy}>
            Apply simulation
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
