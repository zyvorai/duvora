import { Badge, Empty, Notice, Section, Table } from '../components/kit';
import { useFleet } from '../store';

export default function Services() {
  const { snapshot, openPlan, isAdmin } = useFleet();
  if (!snapshot) return null;
  const rows = snapshot.devices.flatMap((d) => d.services.map((x) => ({ device: d.id, ...x })));
  return (
    <div className="grid">
      <div className="span3">
        <Notice>Service deployment is simulated in this release. No containers are launched on physical DPUs.</Notice>
      </div>
      <Section
        eyebrow="SERVICES"
        title="Deployed services"
        lede="Image digests, placement, and reported state."
        actions={
          <button type="button" className="primary" disabled={!isAdmin} onClick={() => openPlan('deploy')}>
            Deploy service
          </button>
        }
      >
        {rows.length ? (
          <Table heads={['Service / image', 'Device', 'State']}>
            {rows.map((x) => (
              <tr key={x.device + x.name}>
                <td>
                  <strong>{x.name}</strong>
                  <small className="dv-sub dv-mono">{x.image}</small>
                </td>
                <td>{x.device}</td>
                <td>
                  <Badge tone="info">{x.state}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty title="Ready for your first service.">Select devices in Fleet → Devices, then deploy an image pinned to its SHA-256 digest.</Empty>
        )}
      </Section>
      <Section span={1} eyebrow="CATEGORY" title="Networking">
        <p>Plan the lifecycle of switching and traffic-processing services. Hardware acceleration requires a validated backend.</p>
      </Section>
      <Section span={1} eyebrow="CATEGORY" title="Security">
        <p>Bring tenant isolation and policy workflows into the same operating model.</p>
      </Section>
      <Section span={1} eyebrow="FUTURE" title="Storage">
        <p>NVMe-oF and storage acceleration are planned, with separate compatibility and hardware acceptance tests.</p>
      </Section>
    </div>
  );
}
