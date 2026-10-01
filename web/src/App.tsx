import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { AUTH_EXPIRED, api, signOut } from './api';
import Login from './components/Login';
import Nav from './components/Nav';
import PageHero, { type HeroTint } from './components/PageHero';
import PlanDialog from './components/PlanDialog';
import { Notice } from './components/kit';
import type { Page } from './lib/navGroups';
import { readRoute, routeHash } from './lib/route';
import AlertRules from './pages/AlertRules';
import Audit from './pages/Audit';
import Capabilities from './pages/Capabilities';
import Devices from './pages/Devices';
import Incidents from './pages/Incidents';
import Isolation from './pages/Isolation';
import Operations from './pages/Operations';
import Overview from './pages/Overview';
import Report from './pages/Report';
import Scorecard from './pages/Scorecard';
import Services from './pages/Services';
import Telemetry from './pages/Telemetry';
import Topology from './pages/Topology';
import Users from './pages/Users';
import { FleetProvider, useFleet } from './store';
import { applyTheme, readStoredTheme, toggleTheme, type Theme } from './theme';
import type { Session } from './types';

export const pageHero: Record<Page, { eyebrow: string; title: string; lede: string; tint?: HeroTint }> = {
  overview: {
    eyebrow: 'Fleet intelligence',
    title: 'Infrastructure, in control.',
    lede: 'A clear view of every DPU. Preview each change, follow its progress, and keep the evidence.',
  },
  devices: {
    eyebrow: 'DPU fleet',
    title: 'Know every device.',
    lede: 'Discover the hardware, understand its source, and manage selected devices through a reviewed plan.',
  },
  topology: {
    eyebrow: 'Fleet',
    title: 'See how it fits together.',
    lede: 'Sites contain hosts, hosts carry DPUs, and isolation policies bind to DPUs — one graph, derived from current state.',
    tint: 'purple',
  },
  telemetry: {
    eyebrow: 'Observability',
    title: 'Signals with a source.',
    lede: 'Inspect reported counters and their history. Missing measurements stay unknown; simulated samples remain labeled.',
    tint: 'green',
  },
  services: {
    eyebrow: 'Service orchestration',
    title: 'A home for DPU services.',
    lede: 'Stage an immutable service image, preview its targets, and track the deployment workflow.',
  },
  isolation: {
    eyebrow: 'Tenant isolation',
    title: 'Make the boundary clear.',
    lede: 'Preview an allow-list and test its modeled verdict before applying a simulated isolation change.',
    tint: 'red',
  },
  operations: {
    eyebrow: 'Operations',
    title: 'Every change, accounted for.',
    lede: 'Durable simulation jobs move through preflight, reconciliation, and verification. Inspect results and roll back eligible changes.',
  },
  incidents: {
    eyebrow: 'Incidents',
    title: 'When a rule fires.',
    lede: 'Temperature, drops, degraded health, stale observations, and failed jobs — one incident per rule and device, resolved automatically when the condition clears.',
    tint: 'red',
  },
  'alert-rules': {
    eyebrow: 'Alert rules',
    title: 'Decide what deserves attention.',
    lede: 'Tune thresholds and severities, or switch a rule off. Every change is recorded in the audit trail.',
    tint: 'amber',
  },
  scorecard: {
    eyebrow: 'Scorecard',
    title: 'One number for the shift.',
    lede: 'Device health, observation freshness, open incidents, and operations folded into a 0–100 board. Observe-only.',
    tint: 'green',
  },
  report: {
    eyebrow: 'Report',
    title: 'Brief the next operator.',
    lede: 'A point-in-time health, incident, and operations briefing plus review-only next steps. Nothing on this page applies a change.',
    tint: 'amber',
  },
  audit: {
    eyebrow: 'Audit trail',
    title: 'Keep the evidence.',
    lede: 'Principal, action, timestamp, and result — recorded alongside every reviewed workflow.',
    tint: 'red',
  },
  users: {
    eyebrow: 'Users & access',
    title: 'Who can do what.',
    lede: 'Named users with admin or viewer roles, password changes, and personal API tokens for automation.',
    tint: 'purple',
  },
  capabilities: {
    eyebrow: 'Platform capabilities',
    title: 'Clear about what ships.',
    lede: 'A runnable control plane and explicit hardware boundaries. No hidden claims of offload or production enforcement.',
  },
};

export default function App() {
  const [page, setPage] = useState<Page>(() => readRoute(window.location.hash));
  const [session, setSession] = useState<Session | null | false>(null);
  const [authError, setAuthError] = useState('');
  const [theme, setTheme] = useState<Theme>(() => {
    const t = readStoredTheme();
    applyTheme(t);
    return t;
  });
  const [toastText, setToastText] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const s = await api<Session>('whoami');
      if (s.role === 'agent') {
        setAuthError('Agent keys cannot open the console.');
        setSession(false);
        return;
      }
      setSession(s);
    } catch {
      setSession(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    const onExpired = () => {
      setAuthError('Your session ended. Sign in again.');
      setSession(false);
    };
    window.addEventListener(AUTH_EXPIRED, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED, onExpired);
  }, []);

  useEffect(() => {
    const onHashChange = () => setPage(readRoute(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const goPage = useCallback((next: Page) => {
    setPage(next);
    window.history.replaceState(null, '', routeHash(next));
    window.scrollTo({ top: 0 });
  }, []);

  const toast = useCallback((message: string) => {
    setToastText(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(''), 5000);
  }, []);

  if (session === null) return null;
  if (!session) {
    return (
      <Login
        initialError={authError}
        onLogin={() => {
          setAuthError('');
          void loadSession();
        }}
      />
    );
  }

  return (
    <FleetProvider session={session} navigate={goPage} toast={toast}>
      <Console
        page={page}
        goPage={goPage}
        theme={theme}
        onToggleTheme={() => setTheme((t) => toggleTheme(t))}
        onLogout={() => {
          void signOut();
          setSession(false);
        }}
        reloadSession={loadSession}
      />
      <div className="dv-toast" role="status" hidden={!toastText}>
        {toastText}
      </div>
    </FleetProvider>
  );
}

function Console({
  page,
  goPage,
  theme,
  onToggleTheme,
  onLogout,
  reloadSession,
}: {
  page: Page;
  goPage: (p: Page) => void;
  theme: Theme;
  onToggleTheme: () => void;
  onLogout: () => void;
  reloadSession: () => Promise<void>;
}) {
  const { session, snapshot, error, updated, dialog, closeDialog, toast, refresh } = useFleet();
  const body: Record<Page, ReactElement> = {
    overview: <Overview />,
    devices: <Devices />,
    topology: <Topology />,
    telemetry: <Telemetry />,
    services: <Services />,
    isolation: <Isolation />,
    operations: <Operations />,
    incidents: <Incidents />,
    'alert-rules': <AlertRules />,
    scorecard: <Scorecard />,
    report: <Report />,
    audit: <Audit />,
    users: <Users onPasswordChanged={() => void reloadSession()} />,
    capabilities: <Capabilities />,
  };
  const hero = pageHero[page];
  return (
    <>
      <Nav
        page={page}
        setPage={goPage}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onLogout={onLogout}
        demo={session.demo}
        openIncidents={snapshot?.open_incidents ?? 0}
        principal={`${session.actor} · ${session.role}`}
      />
      <main id="main">
        {session.default_password && page !== 'users' && (
          <Notice tone="warn">
            You are signed in with the default password.{' '}
            <button type="button" className="btn-diag" onClick={() => goPage('users')}>
              Change it now
            </button>
          </Notice>
        )}
        {error && <Notice tone="warn">{error}</Notice>}
        <div key={page}>
          <PageHero eyebrow={hero.eyebrow} title={hero.title} lede={hero.lede} tint={hero.tint} />
          {body[page]}
        </div>
      </main>
      <footer className="dv-footer">
        <span>
          Zyvor AI Labs · Duvora {session.version} · {session.actor} ({session.role})
        </span>
        <span>{updated ? `Updated ${new Date(updated).toLocaleTimeString()}` : 'Waiting for inventory'}</span>
      </footer>
      <PlanDialog
        state={dialog}
        onClose={closeDialog}
        onApplied={(job) => {
          closeDialog();
          if (job.mode === 'netra') {
            toast(`Kernel isolation job queued: ${job.action}${job.spec.stage ? ` (${String(job.spec.stage)})` : ''}`);
            goPage('isolation');
          } else {
            toast(`Simulation job queued: ${job.action}`);
            goPage('operations');
          }
          void refresh();
        }}
      />
    </>
  );
}
