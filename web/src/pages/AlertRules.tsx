import { useState } from 'react';
import { api } from '../api';
import { Badge, Section, Table, severityTone } from '../components/kit';
import { useFleet, useResource } from '../store';
import type { AlertRule } from '../types';

const KIND = { metric: 'Metric threshold', health: 'Reported health', stale: 'Observation age (s)', job: 'Job outcome' };

export default function AlertRules() {
  const { isAdmin, toast } = useFleet();
  const { data, reload } = useResource<AlertRule[]>('alert-rules');
  const [draft, setDraft] = useState<Record<string, string>>({});

  async function update(rule: AlertRule, body: Partial<AlertRule>) {
    try {
      await api(`alert-rules/${rule.id}`, 'PUT', body);
      toast(`${rule.name} updated.`);
      await reload();
    } catch (e) {
      toast((e as Error).message);
    }
  }

  return (
    <div className="grid">
      <Section eyebrow="RULES" title="Alert rules" lede="Built-in rules evaluated against every device. Changes are audited; viewers can read them.">
        <Table heads={['Rule', 'Kind', 'Threshold', 'Severity', 'Enabled']} label="Alert rules">
          {(data || []).map((r) => (
            <tr key={r.id}>
              <td>
                <strong>{r.name}</strong>
                <small className="dv-sub dv-mono">{r.id}</small>
              </td>
              <td>
                {KIND[r.kind]}
                {r.metric && <small className="dv-sub dv-mono">{r.metric}</small>}
              </td>
              <td>
                {r.threshold === undefined ? (
                  '—'
                ) : (
                  <form
                    className="dv-inline"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const v = Number(draft[r.id]);
                      if (draft[r.id] !== undefined && Number.isFinite(v)) void update(r, { threshold: v });
                    }}
                  >
                    <input
                      type="number"
                      min={0}
                      step="any"
                      aria-label={`${r.name} threshold`}
                      value={draft[r.id] ?? String(r.threshold)}
                      disabled={!isAdmin}
                      onChange={(e) => setDraft({ ...draft, [r.id]: e.target.value })}
                    />
                    {isAdmin && draft[r.id] !== undefined && draft[r.id] !== String(r.threshold) && (
                      <button type="submit" className="btn-secondary">
                        Save
                      </button>
                    )}
                  </form>
                )}
              </td>
              <td>
                {isAdmin ? (
                  <select aria-label={`${r.name} severity`} value={r.severity} onChange={(e) => update(r, { severity: e.target.value as AlertRule['severity'] })}>
                    <option value="info">info</option>
                    <option value="warning">warning</option>
                    <option value="critical">critical</option>
                  </select>
                ) : (
                  <Badge tone={severityTone(r.severity)}>{r.severity}</Badge>
                )}
              </td>
              <td>
                <label>
                  <input type="checkbox" checked={r.enabled} disabled={!isAdmin} onChange={(e) => update(r, { enabled: e.target.checked })} />
                  {r.enabled ? 'On' : 'Off'}
                </label>
              </td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  );
}
