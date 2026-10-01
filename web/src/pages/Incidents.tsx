import { useState } from 'react';
import { api } from '../api';
import { Badge, Empty, Metrics, Section, Table, severityTone } from '../components/kit';
import { ago, when } from '../lib/format';
import { useFleet, useResource } from '../store';
import type { Incident } from '../types';

const FILTERS = ['active', 'open', 'acknowledged', 'resolved'] as const;

export default function Incidents() {
  const { isAdmin, toast, refresh } = useFleet();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('active');
  const { data, reload } = useResource<Incident[]>(`incidents?state=${filter}`, 5000, [filter]);
  const { data: all } = useResource<Incident[]>('incidents?state=active', 5000);
  const active = all || [];

  async function act(id: string, action: 'ack' | 'resolve') {
    try {
      await api(`incidents/${id}/${action}`, 'POST', {});
      toast(action === 'ack' ? 'Incident acknowledged.' : 'Incident resolved. It reopens if the rule still fires.');
      await Promise.all([reload(), refresh()]);
    } catch (e) {
      toast((e as Error).message);
    }
  }

  return (
    <div className="grid">
      <section className="card span3">
        <p className="eyebrow">MONITOR</p>
        <h2 className="card-title">{active.length ? `${active.length} incident${active.length === 1 ? '' : 's'} need attention.` : 'No alert rule is firing.'}</h2>
        <Metrics
          items={[
            { label: 'critical', value: active.filter((i) => i.severity === 'critical').length },
            { label: 'warning', value: active.filter((i) => i.severity === 'warning').length },
            { label: 'info', value: active.filter((i) => i.severity === 'info').length },
            { label: 'acknowledged', value: active.filter((i) => i.state === 'acknowledged').length },
          ]}
        />
      </section>
      <Section
        eyebrow="INCIDENTS"
        title="Incident list"
        lede="Rules are evaluated every 5 seconds. An incident resolves automatically once its condition clears."
        actions={
          <div className="chips" role="group" aria-label="Incident filter">
            {FILTERS.map((f) => (
              <button key={f} type="button" className={f === filter ? 'primary' : ''} aria-pressed={f === filter} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </div>
        }
      >
        {data?.length ? (
          <Table heads={['Severity', 'Incident', 'State', 'Opened', '']} label="Incidents">
            {data.map((i) => (
              <tr key={i.id}>
                <td>
                  <Badge tone={severityTone(i.severity)}>{i.severity}</Badge>
                </td>
                <td>
                  <strong>{i.title}</strong>
                  <small className="dv-sub">{i.detail}</small>
                </td>
                <td>
                  {i.state}
                  <small className="dv-sub">
                    {i.state === 'acknowledged' && `by ${i.acknowledged_by}`}
                    {i.state === 'resolved' && `by ${i.resolved_by} · ${when(i.resolved_at)}`}
                  </small>
                </td>
                <td>
                  {ago(i.opened)}
                  <small className="dv-sub">{when(i.opened)}</small>
                </td>
                <td>
                  <div className="dv-actions">
                  {isAdmin && i.state === 'open' && (
                    <button type="button" className="btn-secondary" onClick={() => act(i.id, 'ack')}>
                      Acknowledge
                    </button>
                  )}
                  {isAdmin && i.state !== 'resolved' && (
                    <button type="button" className="btn-success" onClick={() => act(i.id, 'resolve')}>
                      Resolve
                    </button>
                  )}
                </div>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty title={filter === 'active' ? 'All clear.' : `No ${filter} incidents.`}>Incidents appear when an alert rule fires.</Empty>
        )}
      </Section>
    </div>
  );
}
