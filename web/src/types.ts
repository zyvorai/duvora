export type Role = 'admin' | 'viewer' | 'agent';

export interface Session {
  actor: string;
  role: Role;
  via: 'session' | 'token' | 'key';
  demo: boolean;
  version: string;
  default_password: boolean;
}

export interface Metrics {
  throughput_gbps?: number;
  drops?: number;
  temperature_c?: number;
  link_gbps?: number;
  pps?: number;
  blocked_pps?: number;
  tcp_retransmits_pm?: number;
  tcp_resets_pm?: number;
}

export interface IsolationDest {
  address?: string;
  peer?: string;
  protocol?: string;
  port?: number;
  packets?: number;
  bytes?: number;
}

/** Where eBPF observations and node isolation come from: Duvora's own agent or a Netra controller. */
export type EbpfProvider = 'native' | 'netra';

/** The node's view of its isolation (kernel counters, effective mode), from the agent or Netra. */
export interface NetraIsolationStatus {
  policy_id: string;
  mode: 'shadow' | 'enforce' | 'off' | string;
  requested_mode?: string;
  revision?: number;
  applied_revision?: number;
  /** ISO time from Netra, epoch seconds from the native agent. */
  lease_until?: string | number | null;
  demoted?: string;
  agent_stale?: boolean;
  unavailable?: string;
  allowed_packets: number;
  exempt_packets?: number;
  would_block_packets: number;
  would_block_bytes: number;
  blocked_packets: number;
  blocked_bytes: number;
  would_block_delta?: number;
  blocked_delta?: number;
  top: IsolationDest[];
}

/** What Duvora asked the provider for. */
export interface DuvoraIsolation {
  node: string;
  provider?: EbpfProvider;
  policy_id: string;
  job: string;
  stage: 'shadow' | 'enforce';
  policy: { name: string; tenant: string; cidr: string; ports: number[] };
  lease_until: number | null;
  revision?: number;
  updated: number;
}

export interface Talker {
  peer: string;
  port: number;
  protocol: string;
  packets: number;
  bytes: number;
  blocked?: number;
}

export interface DeviceEbpf {
  provider?: EbpfProvider;
  errors?: string[];
  node: string;
  stale: boolean;
  age: number;
  kernel: string;
  btf: boolean | null;
  programs: string[];
  program_count: number;
  attached: number;
  mode: string;
  interfaces: string[];
  drop_reasons: { reason: string; count: number }[];
  drop_info_unavailable?: string | null;
  tcp_unavailable?: string | null;
  talkers: Talker[];
  nodeiso_available: boolean;
  isolation: NetraIsolationStatus | null;
  updated: number;
}

export interface Service {
  name: string;
  image: string;
  state: string;
}

export interface Device {
  id: string;
  model: string;
  host: string;
  site: string;
  source: 'simulator' | 'linux-pci' | 'nvidia-dpf' | 'netra-ebpf' | 'duvora-ebpf';
  health: string;
  last_seen: number;
  version: number;
  firmware: string;
  mode: string;
  services: Service[];
  policy_ids: string[];
  metrics: Metrics;
  capabilities: string[];
  interfaces: string[];
  metrics_source?: string;
  ebpf?: DeviceEbpf;
  netra_isolation?: DuvoraIsolation;
}

export interface KillSwitch {
  engaged: boolean;
  by?: string;
  at?: number;
}

export interface EbpfOverview {
  netra: {
    configured: boolean;
    connected: boolean;
    url?: string;
    last_sync: number | null;
    error: string | null;
    unmatched: string[];
    isolation_supported: boolean;
    enforce_allowed: boolean;
    nodes: number;
    kill_switch: KillSwitch;
  };
  /** DUVORA_EBPF_SOURCE: which provider the server accepts. */
  source?: 'native' | 'netra' | 'auto';
  native?: { agents: number };
  devices: (Pick<DeviceEbpf, 'node' | 'stale' | 'kernel' | 'btf' | 'programs' | 'attached' | 'mode' | 'nodeiso_available' | 'drop_info_unavailable' | 'tcp_unavailable' | 'isolation' | 'updated'> & {
    id: string;
    host: string;
    source: string;
    provider?: EbpfProvider;
    errors?: string[];
    metrics_source?: string;
    netra_isolation?: DuvoraIsolation | null;
  })[];
}

export interface ShadowReplay {
  flows: number;
  would_block_flows: number;
  would_block_packets: number;
  would_block_bytes: number;
  unresolved: number;
  top: { peer: string; port: number; packets: number; bytes: number }[];
  source: string;
  window: number;
}

export interface Policy {
  id: string;
  name: string;
  tenant: string;
  cidr: string;
  ports: number[];
  devices: string[];
  mode: string;
  created: number;
}

export interface JobEvent {
  time: number;
  step: string;
  message: string;
}

export interface Job {
  id: string;
  plan_id: string;
  mode?: 'simulation' | 'netra';
  state: string;
  step: number;
  action: string;
  spec: { action: string; devices: string[]; [key: string]: unknown };
  created: number;
  actor: string;
  events: JobEvent[];
}

export interface AuditEvent {
  seq: number;
  time: number;
  actor: string;
  action: string;
  detail: unknown;
}

export interface Snapshot {
  version: string;
  demo: boolean;
  devices: Device[];
  policies: Policy[];
  jobs: Job[];
  audit: AuditEvent[];
  open_incidents: number;
  capabilities: Record<string, string>;
}

export interface Plan {
  id: string;
  mode: string;
  confirmation: string;
  netra?: boolean;
  shadow?: Record<string, ShadowReplay>;
  effects: string;
  expires: number;
  blockers: string[];
  targets: { id: string; host: string; version: number }[];
}

export interface Incident {
  id: string;
  rule: string;
  target: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  state: 'open' | 'acknowledged' | 'resolved';
  opened: number;
  updated: number;
  acknowledged_by: string | null;
  resolved_at: number | null;
  resolved_by: string | null;
}

export interface AlertRule {
  id: string;
  name: string;
  kind: 'metric' | 'health' | 'stale' | 'job' | 'ebpf' | 'isolation' | 'isolation-enforce';
  metric?: string;
  threshold?: number;
  severity: 'info' | 'warning' | 'critical';
  enabled: boolean;
}

export interface ScorePart {
  name: string;
  weight: number;
  score: number;
  detail: string;
}

export interface Scorecard {
  score: number | null;
  grade: string;
  parts: ScorePart[];
  devices: number;
  generated: number;
}

export interface Briefing {
  generated: number;
  scorecard: Scorecard;
  fleet: { total: number; by_health: Record<string, number>; by_source: Record<string, number>; by_site: Record<string, number> };
  incidents: Incident[];
  jobs: Job[];
  playbook: string[];
  markdown: string;
}

export interface TopologyNode {
  id: string;
  kind: 'site' | 'host' | 'dpu' | 'policy';
  label: string;
  health?: string;
  mode?: string;
  source?: string;
  site?: string;
  tenant?: string;
}

export interface Topology {
  nodes: TopologyNode[];
  edges: { from: string; to: string; kind: string }[];
}

export interface HistoryPoint extends Metrics {
  ts: number;
}

export interface History {
  device: string;
  window: string;
  bucket_seconds: number;
  points: HistoryPoint[];
}

export interface User {
  username: string;
  role: 'admin' | 'viewer';
  created: number;
  disabled: boolean;
  default_password: boolean;
}

export interface ApiToken {
  id: string;
  name: string;
  created: number;
  last_used: number | null;
}
