export const PAGES = [
  'overview',
  'devices',
  'topology',
  'telemetry',
  'services',
  'isolation',
  'operations',
  'incidents',
  'alert-rules',
  'scorecard',
  'report',
  'audit',
  'users',
  'capabilities',
] as const;

export type Page = (typeof PAGES)[number];

export type NavLink = { page: Page; label: string; blurb: string };
export type NavGroup = { label: string; page?: Page; children?: NavLink[] };

// Menu blurbs are shorter than each page's own hero lede in App.tsx; the
// navGroups test guards that every routable page is reachable from the menu.
export const navGroups: NavGroup[] = [
  { label: 'Overview', page: 'overview' },
  {
    label: 'Fleet',
    children: [
      { page: 'devices', label: 'Devices', blurb: 'Search, filter, select, and inspect every DPU and its observation source.' },
      { page: 'topology', label: 'Topology', blurb: 'Sites, hosts, DPUs, and isolation policies as one graph.' },
      { page: 'telemetry', label: 'Telemetry', blurb: 'Reported and kernel-measured counters, drop reasons, TCP health, and talkers.' },
    ],
  },
  {
    label: 'Operate',
    children: [
      { page: 'services', label: 'Services', blurb: 'Digest-pinned service images and simulated reconciliation.' },
      { page: 'isolation', label: 'Isolation', blurb: 'Allow-list plans, Netra shadow and enforce, kill switch, and release.' },
      { page: 'operations', label: 'Operations', blurb: 'Durable jobs, workflow steps, and eligible rollback.' },
    ],
  },
  {
    label: 'Monitor',
    children: [
      { page: 'incidents', label: 'Incidents', blurb: 'Alert rules that fired, acknowledged, and resolved.' },
      { page: 'alert-rules', label: 'Alert rules', blurb: 'Thresholds and severities for temperature, drops, health, and staleness.' },
      { page: 'scorecard', label: 'Scorecard', blurb: 'Health, freshness, incidents, and operations folded into 0–100.' },
      { page: 'report', label: 'Report', blurb: 'A point-in-time shift briefing with review-only next steps.' },
    ],
  },
  {
    label: 'Govern',
    children: [
      { page: 'audit', label: 'Audit trail', blurb: 'Principal, timestamp, action, and details for every change.' },
      { page: 'users', label: 'Users & access', blurb: 'Named users, roles, passwords, and personal API tokens.' },
      { page: 'capabilities', label: 'Capabilities', blurb: 'Adapters plus the per-node eBPF capability probe.' },
    ],
  },
];
