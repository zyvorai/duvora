import { useState } from 'react';
import { Empty, Section, Sparkline, Table } from '../components/kit';
import { metric, sourceLabel, when } from '../lib/format';
import { useFleet, useResource } from '../store';
import type { History, HistoryPoint } from '../types';

const WINDOWS = ['1h', '24h', '7d'] as const;
type MetricKey = 'throughput_gbps' | 'temperature_c' | 'drops';
const SERIES: { key: MetricKey; label: string; unit: string }[] = [
  { key: 'throughput_gbps', label: 'Throughput', unit: 'Gb/s' },
  { key: 'temperature_c', label: 'Temperature', unit: '°C' },
  { key: 'drops', label: 'Drops', unit: '' },
];

const values = (points: HistoryPoint[], key: MetricKey) => points.map((p) => p[key]).filter((v): v is number => v !== undefined);

export default function Telemetry() {
  const { snapshot } = useFleet();
  const [device, setDevice] = useState('');
  const [win, setWin] = useState<(typeof WINDOWS)[number]>('1h');
  const devices = snapshot?.devices || [];
  const current = device || devices[0]?.id || '';
  const { data } = useResource<History>(current ? `devices/${current}/history?window=${win}` : null, 10000, [current, win]);
  if (!snapshot) return null;
  const points = data?.points || [];
  return (
    <div className="grid">
      <Section
        eyebrow="HISTORY"
        title="Device trends"
        lede="Samples recorded from agent reports (and every 10 s for simulated devices). Longer windows are averaged per bucket; drops show the bucket maximum."
      >
        <div className="toolbar">
          <label>
            Device
            <select aria-label="History device" value={current} onChange={(e) => setDevice(e.target.value)}>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id}
                </option>
              ))}
            </select>
          </label>
          <div className="chips" role="group" aria-label="Window">
            {WINDOWS.map((w) => (
              <button key={w} type="button" className={w === win ? 'primary' : ''} aria-pressed={w === win} onClick={() => setWin(w)}>
                {w}
              </button>
            ))}
          </div>
        </div>
        {points.length ? (
          <div className="dv-trends wide">
            {SERIES.map((s) => {
              const v = values(points, s.key);
              return (
                <div key={s.key}>
                  <span>{s.label}</span>
                  <Sparkline values={v} width={320} height={64} fill={s.key === 'throughput_gbps'} />
                  <b>
                    {v.length ? metric(v[v.length - 1], s.unit) : 'Unknown'}
                    {v.length > 1 && (
                      <small className="dv-sub">
                        min {metric(Math.min(...v), s.unit)} · max {metric(Math.max(...v), s.unit)}
                      </small>
                    )}
                  </b>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty title="No samples in this window.">Linux PCI discovery reports identity only; counters appear once a source reports them.</Empty>
        )}
      </Section>
      <Section span={3} eyebrow="LATEST" title="Device measurements" lede="Unknown values require a telemetry adapter.">
        {devices.length ? (
          <Table heads={['Device / source', 'Throughput', 'Link capacity', 'Temperature', 'Drops', 'Last report']}>
            {devices.map((x) => (
              <tr key={x.id}>
                <td>
                  <strong>{x.id}</strong>
                  <small className="dv-sub">{sourceLabel(x.source)}</small>
                </td>
                <td>
                  <meter min={0} max={x.metrics.link_gbps || Math.max(x.metrics.throughput_gbps || 0, 1)} value={x.metrics.throughput_gbps || 0} aria-label={`${x.id} throughput`} />{' '}
                  {metric(x.metrics.throughput_gbps, 'Gb/s')}
                </td>
                <td>{metric(x.metrics.link_gbps, 'Gb/s')}</td>
                <td>{metric(x.metrics.temperature_c, '°C')}</td>
                <td>{metric(x.metrics.drops)}</td>
                <td>{when(x.last_seen)}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty title="No telemetry yet.">Connect a device source.</Empty>
        )}
      </Section>
    </div>
  );
}
