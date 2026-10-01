import { download, saveJSON } from '../api';
import { Badge, Empty, Metrics, Section, severityTone } from '../components/kit';
import { when } from '../lib/format';
import { useFleet, useResource } from '../store';
import type { Briefing } from '../types';
import { Ring } from './Scorecard';

export default function Report() {
  const { toast } = useFleet();
  const { data, reload } = useResource<Briefing>('report');
  if (!data) return null;
  const actions = (
    <>
      <button type="button" className="btn-secondary" onClick={() => void reload()}>
        Refresh
      </button>
      <button type="button" className="btn-secondary" onClick={() => window.print()}>
        Print
      </button>
      <button type="button" className="btn-secondary" onClick={() => download('report.md', 'duvora-briefing.md').catch((e) => toast(e.message))}>
        Markdown
      </button>
      <button type="button" className="primary" onClick={() => saveJSON(data, 'duvora-briefing.json')}>
        Export JSON
      </button>
    </>
  );
  return (
    <div className="grid dv-report">
      <Section eyebrow={`GENERATED ${when(data.generated).toUpperCase()}`} title="Shift briefing" actions={actions}>
        <div className="dv-score">
          <Ring score={data.scorecard.score} />
          <div>
            <h3>{data.scorecard.grade}</h3>
            <Metrics
              items={[
                { label: 'devices', value: data.fleet.total },
                { label: 'active incidents', value: data.incidents.length },
                { label: 'operations in 24 h', value: data.jobs.length },
                ...Object.entries(data.fleet.by_health).map(([k, v]) => ({ label: k, value: v })),
              ]}
            />
          </div>
        </div>
      </Section>
      <Section span={2} eyebrow="INCIDENTS" title="Active incidents">
        {data.incidents.length ? (
          <div className="list">
            {data.incidents.map((i) => (
              <div className="agent wide" key={i.id}>
                <b>
                  <Badge tone={severityTone(i.severity)}>{i.severity}</Badge> {i.title}
                </b>
                <small>
                  {i.detail} · {i.state}
                </small>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="None." />
        )}
      </Section>
      <Section span={1} eyebrow="PLAYBOOK" title="Suggested next steps" lede="Review only. Nothing on this page applies a change.">
        <ol className="dv-steps">
          {data.playbook.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </Section>
      <Section eyebrow="OPERATIONS" title="Last 24 hours">
        {data.jobs.length ? (
          <div className="list">
            {data.jobs.map((j) => (
              <div className="agent wide" key={j.id}>
                <b>
                  {j.action} · {j.state}
                </b>
                <small>
                  {j.spec.devices.join(', ')} · {when(j.created)} · {j.actor}
                </small>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No operations in the last 24 hours." />
        )}
      </Section>
    </div>
  );
}
