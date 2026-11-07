import { APP_NAME } from './lib/brand';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, ArrowUpRight, Bell, Camera, Check, ChevronDown, CircleHelp, Cpu, FolderArchive, HeartPulse, LayoutDashboard, RefreshCw, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { Badge, Dialog } from './components/UI';
import { CameraHub, RecordingDetail, SourceDetail } from './pages/CameraWorkspace';
import { CompanyDashboard, EmployeeDetail, EmployeeDirectory } from './pages/Workforce';
import Report from './pages/Report';
import { exampleNoiseReadings, exampleWindows, exampleWorkers } from './lib/demo';
import { useWorkspace } from './lib/useWorkspace';
import { useRecordingLibrary } from './lib/useRecordingLibrary';
import { isConnectedMode } from './lib/api';
import { localDate } from './lib/utils';
import type { Worker } from './lib/workforce';
import type { Period, VideoAsset } from './lib/types';

type Modal = 'guide' | 'privacy' | 'methods' | 'notifications' | 'service' | null;
const navigation = [
  { path: '/overview', icon: LayoutDashboard, label: 'Company Dashboard', shortLabel: 'Overview' },
  { path: '/employees', icon: Users, label: 'Employee Dashboard', shortLabel: 'Employees' },
  { path: '/cameras', icon: Camera, label: 'Camera Hub', shortLabel: 'Cameras' },
  { path: '/cameras/archive', icon: FolderArchive, label: 'Recording Archive', shortLabel: 'Recordings' },
];

function readRoute() {
  const route = window.location.hash.slice(1).replace(/\/$/, '') || '/overview';
  if (route.startsWith('/analyze/')) return route.replace('/analyze/', '/cameras/');
  if (route.startsWith('/processing')) return '/overview';
  if (route.startsWith('/history')) return '/cameras/archive';
  return route;
}

function initialExample() {
  try {
    if (new URLSearchParams(window.location.hash.split('?')[1] || '').get('demo') === '1') return true;
    const selected = window.sessionStorage.getItem('raise-data-mode-v1');
    if (selected) return selected === 'example';
    return !isConnectedMode;
  } catch { return !isConnectedMode; }
}

function initialPeriod(): Period {
  return new URLSearchParams(window.location.hash.split('?')[1] || '').get('period') === 'day' ? 'day' : 'week';
}

export default function WorkspaceApp() {
  const [route, setRoute] = useState(readRoute);
  const [modal, setModal] = useState<Modal>(null);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState('');
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [date, setDate] = useState(localDate());
  const [example, setExample] = useState(initialExample);
  const workspace = useWorkspace(date);
  const library = useRecordingLibrary(workspace.recordings);
  const [path, query = ''] = route.split('?');
  const section = path.split('/')[1];
  let resourceId = '';
  try { resourceId = decodeURIComponent(path.split('/')[2] || ''); } catch { resourceId = ''; }
  const queryParams = new URLSearchParams(query);

  const workers = useMemo(() => {
    if (example) return exampleWorkers;
    const people = new Map<string, Worker>(workspace.workers.map(worker => [worker.id, worker]));
    for (const recording of library.recordings.filter(item => item.source !== 'example' || item.labels_updated_at)) {
      for (const label of recording.labels) if (!people.has(label.worker_id)) people.set(label.worker_id, { id: label.worker_id, name: label.worker_name, department: 'Manual label', initials: label.worker_name.split(' ').map(word => word[0]).slice(0, 2).join('').toUpperCase() });
    }
    return [...people.values()];
  }, [example, workspace.workers, library.recordings]);

  const windows = useMemo(() => {
    if (!example) return workspace.windows;
    // Never associate sample findings with an actual replacement video or a
    // newly assigned person. Example results only refer to their sample labels.
    return exampleWindows.filter(window => {
      const recording = library.recordings.find(item => item.id === window.recording_id);
      return recording?.source === 'example' && recording.labels.some(label => label.worker_id === window.worker_id && label.start_s <= window.start_s && label.end_s >= window.end_s);
    });
  }, [example, workspace.windows, library.recordings]);

  const noiseReadings = useMemo(() => example ? exampleNoiseReadings.filter(reading => {
    const recording = library.recordings.find(item => item.id === reading.recording_id);
    return recording?.source === 'example' && recording.labels.some(label => reading.scope === 'area' || label.worker_id === reading.worker_id);
  }) : workspace.noiseReadings, [example, workspace.noiseReadings, library.recordings]);

  const videos: VideoAsset[] = library.recordings.map(recording => ({ id: recording.id, filename: recording.filename, duration_s: recording.duration_s, width: recording.width || 0, height: recording.height || 0, content_hash: recording.content_hash || '', url: recording.playback_url || library.playback[recording.id] }));
  const shared = { workers, windows, recordings: library.recordings, playback: library.playback, noiseReadings, noiseUnavailableReason: example ? '' : workspace.noiseUnavailableReason, period, setPeriod, date, setDate, example, onExample: () => setExample(true) };
  const libraryProps = { recordings: library.recordings, playback: library.playback, onAttach: library.attachVideo, notify: setToast };

  useEffect(() => {
    const change = () => { const nextRoute = readRoute(); setRoute(nextRoute); const params = new URLSearchParams(nextRoute.split('?')[1] || ''); if (params.get('demo') === '1') setExample(true); const requestedPeriod = params.get('period'); if (requestedPeriod === 'day' || requestedPeriod === 'week') setPeriod(requestedPeriod); setMenu(false); window.scrollTo({ top: 0, behavior: 'instant' }); document.getElementById('main-content')?.focus({ preventScroll: true }); };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => { try { window.sessionStorage.setItem('raise-data-mode-v1', example ? 'example' : 'service'); } catch { /* Preview still works when browser storage is restricted. */ } }, [example]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 5500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menu]);

  function isActive(navPath: string) {
    if (navPath === '/cameras/archive') return path === navPath || section === 'recordings';
    if (navPath === '/cameras') return section === 'cameras' && resourceId !== 'archive';
    return section === navPath.split('/')[1];
  }
  const subtitles: Record<string, string> = { overview: 'Company Health Overview', employees: 'Employee Analysis Dashboard', cameras: resourceId === 'archive' ? 'Recording Library' : 'Multi-Camera Hub', recordings: 'Recording & Manual Labels', report: 'Evidence & HSE Review' };
  useEffect(() => { document.title = APP_NAME + ' · ' + (subtitles[section] || 'HSE Workspace'); }, [section]);
  const dateLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' }).format(new Date());

  return <>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); const main = document.getElementById('main-content'); main?.focus(); main?.scrollIntoView({ block: 'start' }); }}>Skip to content</a>
    <div className="app-shell workforce-shell">
      <header className="app-header">
        <div className="header-left"><button className="brand" onClick={() => setMenu(!menu)} aria-label={`${APP_NAME}, open workspace menu`} aria-expanded={menu}><span className="brand-symbol"><HeartPulse size={25} strokeWidth={1.65} /></span><span className="brand-copy"><strong>{APP_NAME}<i /></strong></span><ChevronDown size={14} /></button></div>
        <div className="header-right"><div className="header-date"><span />{dateLabel}</div></div>
        {menu && <><button className="menu-dismiss" aria-label="Close navigation menu" onClick={() => setMenu(false)} /><nav className="workspace-menu" aria-label="Workspace menu"><span className="eyebrow">YOUR HSE WORKSPACE</span>{navigation.map(({ path: navPath, icon: Icon, label }) => <a key={navPath} href={`#${navPath}`} aria-current={isActive(navPath) ? 'page' : undefined} onClick={() => setMenu(false)}><Icon size={17} /><span>{label}</span>{isActive(navPath) ? <Check size={14} /> : <ArrowUpRight size={13} />}</a>)}<button onClick={() => { setMenu(false); setModal('guide'); }}><CircleHelp size={17} />Workflow guide<ArrowUpRight size={13} /></button></nav></>}
      </header>
      <div className="app-body">
        <aside className="workspace-sidebar"><nav className="primary-navigation" aria-label="Main navigation">{navigation.map(({ path: navPath, icon: Icon, label, shortLabel }) => <a key={navPath} href={`#${navPath}`} aria-label={label} aria-current={isActive(navPath) ? 'page' : undefined}><Icon size={17} strokeWidth={1.7} /><span>{shortLabel}</span></a>)}</nav></aside>
        <main id="main-content" className={section === 'overview' ? 'overview-page' : undefined} tabIndex={-1} aria-busy={workspace.loading}>
          {workspace.error && <div className="error-message service-error" role="alert"><AlertCircle size={18} /><p>{workspace.error}</p><button onClick={workspace.refresh}>Retry sync<RefreshCw size={13} /></button></div>}
          {library.storageError && <div className="error-message service-error" role="alert"><AlertCircle size={18} /><p>{library.storageError}</p></div>}
          {section === 'overview' ? <CompanyDashboard {...shared} />
            : section === 'employees' ? resourceId ? <EmployeeDetail {...shared} workerId={resourceId} onRefresh={workspace.refresh} /> : <EmployeeDirectory {...shared} reviewOnly={queryParams.get('review') === 'needed'} />
            : section === 'cameras' ? resourceId && resourceId !== 'archive' ? <SourceDetail key={resourceId} cameraId={resourceId} sources={workspace.sources} recordings={library.recordings} playback={library.playback} /> : <CameraHub {...libraryProps} sources={workspace.sources} archive={resourceId === 'archive'} cameraFilter={queryParams.get('camera') || undefined} />
            : section === 'recordings' ? <RecordingDetail key={resourceId} {...libraryProps} recordingId={resourceId} workers={workers} onSaveLabels={library.saveLabels} />
            : section === 'report' ? <Report sessionId={resourceId || undefined} localVideo={null} videos={videos} onMethods={() => setModal('methods')} />
            : <div className="not-found"><span>404</span><h1>Page not found</h1><p>Return to the dashboard to continue your review.</p><a href="#/overview" className="button button-dark">Company dashboard<ArrowRight size={16} /></a></div>}
        </main>
      </div>
    </div>
    {toast && <div className="toast" role="status"><span><Check size={16} /></span><p>{toast}</p><button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}
    {modal && <WorkspaceDialog modal={modal} onClose={() => setModal(null)} onMethods={() => setModal('methods')} sourcesOnline={workspace.sources.filter(source => source.status === 'online').length} />}
  </>;
}


function WorkspaceDialog({ modal, onClose, onMethods, sourcesOnline }: { modal: Exclude<Modal, null>; onClose: () => void; onMethods: () => void; sourcesOnline: number }) {
  const titles = { guide: 'RAISE Observation Workflow', privacy: 'Privacy & Recording Archive', methods: 'Assessment Methods', notifications: 'Workspace Notifications', service: 'Camera Service Status' };
  return <Dialog title={titles[modal]} onClose={onClose} wide={modal === 'methods'}>
    {modal === 'guide' && <><div className="guide-intro"><span><HeartPulse size={32} strokeWidth={1.5} /></span><p>Periodic analysis, employee summaries, and HSE review in one workflow.</p></div><div className="guide-steps">{[['Cameras are shared sources', 'Analysis starts automatically with the camera source. A camera is not permanently assigned to an employee.'], ['Confirm recording labels', 'For this prototype, employees are labeled manually in videos. A recording can include several labeled subjects.'], ['Summaries accumulate every minute', 'Results appear immediately in the company dashboard and employee details. Daily and weekly summaries are available.'], ['Review findings and history', 'The dashboard flags employees who need review. The archive keeps recordings and labels for traceability.']].map(([title, detail], index) => <div key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{detail}</p></div></div>)}</div><div className="dialog-actions"><button className="button button-outline" onClick={onMethods}>About the methods<Sparkles size={15} /></button><a className="button button-dark" href="#/employees" onClick={onClose}>Employee dashboard<ArrowRight size={15} /></a></div></>}
    {modal === 'privacy' && <><div className="dialog-feature-icon"><ShieldCheck size={29} /></div><p className="dialog-lead">Recordings and identities can be traced back to their sources.</p><ul className="privacy-list"><li><Check size={16} /><div><strong>Manual labels per recording</strong><p>Labels include employee identity, a subject identifier, and an interval. Camera use does not assign a camera to an employee.</p></div></li><li><Check size={16} /><div><strong>Local prototype archive</strong><p>Added files are stored locally in your browser and remain available after refresh. They are not shared across devices. Clearing site data deletes the local archive.</p></div></li><li><Check size={16} /><div><strong>The service manages live recordings</strong><p>Continuous recording and centralized storage require a camera service. Recording is unavailable until a source is connected.</p></div></li></ul></>}
    {modal === 'methods' && <><p className="dialog-lead">Periodic analysis adds observed intervals to employee summaries.</p><div className="method-cards"><article><span className="method-number">01</span><Badge tone="lime">SEVERITY</Badge><h3>REBA by phase</h3><p>A = Table A + load/force<br />B = Table B + coupling<br />C = Table C(A, B)<br />R = C + activity adjustments</p><small>REBA scores are not summed across minutes. Summaries show the highest score for the period and a separate review status.</small></article><article><span className="method-number">02</span><Badge tone="lime">DURATION</Badge><h3>ISO 11226-inspired</h3><p>Duration follows observable intervals. Unknown periods interrupt continuous holding time and reduce valid coverage.</p><small>The 08:00–17:00 Asia/Jakarta shift schedule does not imply nine hours of observation.</small></article><article><span className="method-number">03</span><Badge tone="warning">EXPERIMENTAL</Badge><h3>RAISE exposure points</h3><p>Points = Σ wᵢ × (dᵢ + eᵢ)<br />w = 1 for C 1–3<br />w = 2 for C 4–7<br />w = 3 for C 8–12</p><small>New intervals add to cumulative points. Refreshing existing intervals does not count them again.</small></article></div><div className="risk-reference"><strong>REBA dashboard bands</strong><Badge tone="success">1–3 · Low</Badge><Badge tone="warning">4–7 · Medium</Badge><Badge tone="danger">8–10 · High</Badge><Badge tone="danger">11–15 · Immediate action</Badge></div><p className="helper">RAISE points are a prototype metric, not a diagnosis. AI results appear before HSE validation, with the review status always visible.</p></>}
    {modal === 'notifications' && <div className="notification-empty"><div className="dialog-feature-icon"><Bell size={28} /></div><h3>Reviews are in the employee dashboard.</h3><p>Employees with findings are flagged for review. Open the list to review results by period.</p><a className="button button-dark" href="#/employees?review=needed" onClick={onClose}>View review queue<ArrowRight size={15} /></a></div>}
    {modal === 'service' && <><div className="service-status"><span className="dialog-feature-icon"><Cpu size={28} /></span><div><Badge tone={sourcesOnline ? 'success' : 'warning'} dot>{sourcesOnline} sources connected</Badge><h3>{sourcesOnline ? 'Camera sources available' : 'Waiting for camera service'}</h3></div></div><p className="dialog-lead">Automatic analysis and recording run through the camera service. The dashboard retrieves results every 60 seconds; closing it does not stop the service.</p><div className="service-detail"><span>Site time zone<strong>Asia/Jakarta</strong></span><span>Dashboard refresh interval<strong>60 seconds</strong></span><span>Employee association<strong>Manual labels per recording</strong></span><span>Available summaries<strong>Daily · weekly · history</strong></span></div></>}
  </Dialog>;
}
