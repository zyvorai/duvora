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
  source: 'simulator' | 'linux-pci' | 'nvidia-dpf';
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
  kind: 'metric' | 'health' | 'stale' | 'job';
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
