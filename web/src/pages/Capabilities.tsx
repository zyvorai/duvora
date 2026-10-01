import { Badge, Section } from '../components/kit';
import { useFleet } from '../store';

const COPY: Record<string, string> = {
  simulator: 'Durable plans, jobs, policies, service records, upgrades, and rollback in the local model.',
  linux_discovery: 'Reads Linux sysfs PCI identity. No device writes or automatic readiness claims.',
  dpf_import: 'Imports Kubernetes DPF DPU objects using a read-only kubectl bridge.',
  hardware_enforcement: 'Requires a real policy backend, isolation validation, and hardware acceptance testing.',
  firmware_flash: 'Requires vendor compatibility checks, signed artifacts, recovery validation, and a hardware adapter.',
  storage_offload: 'Requires a validated DOCA storage integration and supported hardware.',
};

export default function Capabilities() {
  const { snapshot } = useFleet();
  if (!snapshot) return null;
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
    </div>
  );
}
