import { APP_NAME } from './lib/brand';
import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, ArrowRight, ArrowUpRight, Bell, Camera, Check, ChevronDown, CircleHelp, Cpu, FolderArchive, HeartPulse, LayoutDashboard, Menu, RefreshCw, ShieldCheck, Sparkles, Stethoscope, Users, X } from 'lucide-react';
import { Badge, Dialog, IconButton } from './components/UI';
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
  { path: '/overview', icon: LayoutDashboard, label: 'Dashboard Perusahaan' },
  { path: '/employees', icon: Users, label: 'Dashboard Pegawai' },
  { path: '/cameras', icon: Camera, label: 'Camera Hub' },
  { path: '/cameras/archive', icon: FolderArchive, label: 'Arsip Rekaman' },
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
      for (const label of recording.labels) if (!people.has(label.worker_id)) people.set(label.worker_id, { id: label.worker_id, name: label.worker_name, department: 'Label manual', initials: label.worker_name.split(' ').map(word => word[0]).slice(0, 2).join('').toUpperCase() });
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
  function refresh() { workspace.refresh(); setToast('Sinkronisasi diminta. Rekap memakai hasil interval yang sama tanpa dihitung ulang.'); }
  const subtitles: Record<string, string> = { overview: 'Company Health Overview', employees: 'Employee Analysis Dashboard', cameras: resourceId === 'archive' ? 'Recording Library' : 'Multi-Camera Hub', recordings: 'Recording & Manual Labels', report: 'Evidence & HSE Review' };
  useEffect(() => { document.title = APP_NAME + ' · ' + (subtitles[section] || 'HSE Workspace'); }, [section]);
  const dateLabel = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' }).format(new Date());

  return <>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); const main = document.getElementById('main-content'); main?.focus(); main?.scrollIntoView({ block: 'start' }); }}>Lewati ke konten</a>
    <div className="app-shell workforce-shell">
      <header className="app-header">
        <div className="header-left"><button className="brand" onClick={() => setMenu(!menu)} aria-label={`${APP_NAME}, buka menu workspace`} aria-expanded={menu}><span className="brand-symbol"><HeartPulse size={25} strokeWidth={1.65} /></span><span className="brand-copy"><strong>{APP_NAME}<i /></strong><small>{subtitles[section] || 'HSE Workspace'}</small></span><ChevronDown size={14} /></button><div className="header-tools"><IconButton icon={Stethoscope} label="Panduan workspace HSE" onClick={() => setModal('guide')} /><IconButton icon={RefreshCw} label="Sinkronisasi data dashboard" onClick={refresh} className={workspace.loading ? 'refreshing' : ''} /><IconButton icon={ShieldCheck} label="Privasi dan penyimpanan rekaman" onClick={() => setModal('privacy')} /></div></div>
        <div className="header-motto"><span />Healthy people. Better work.</div>
        <div className="header-right"><div className="header-tools"><IconButton icon={Sparkles} label="Metode asesmen RAISE" onClick={() => setModal('methods')} /><IconButton icon={Bell} label="Notifikasi workspace" onClick={() => setModal('notifications')} /></div><div className="header-date"><span />{dateLabel}</div><IconButton icon={Menu} label="Buka navigasi workspace" onClick={() => setMenu(!menu)} className={`menu-button ${menu ? 'is-open' : ''}`} aria-expanded={menu} /></div>
        {menu && <><button className="menu-dismiss" aria-label="Tutup menu navigasi" onClick={() => setMenu(false)} /><nav className="workspace-menu" aria-label="Menu workspace"><span className="eyebrow">YOUR HSE WORKSPACE</span>{navigation.map(({ path: navPath, icon: Icon, label }) => <a key={navPath} href={`#${navPath}`} aria-current={isActive(navPath) ? 'page' : undefined} onClick={() => setMenu(false)}><Icon size={17} /><span>{label}</span>{isActive(navPath) ? <Check size={14} /> : <ArrowUpRight size={13} />}</a>)}<button onClick={() => { setMenu(false); setModal('guide'); }}><CircleHelp size={17} />Panduan alur<ArrowUpRight size={13} /></button></nav></>}
      </header>
      <div className="app-body">
        <aside className="sidebar"><nav aria-label="Navigasi utama"><a className="sidebar-monogram" href="#/overview" title="RAISE overview" aria-label="RAISE overview"><HeartPulse size={21} strokeWidth={1.6} /></a><span className="sidebar-separator" />{navigation.map(({ path: navPath, icon: Icon, label }) => <a className={`nav-item ${isActive(navPath) ? 'active' : ''}`} key={navPath} href={`#${navPath}`} aria-label={label} aria-current={isActive(navPath) ? 'page' : undefined} title={label}><Icon size={21} strokeWidth={1.7} /><span className="nav-tooltip">{label}</span></a>)}<span className="sidebar-separator" /><button className="nav-item" aria-label="Panduan penggunaan" title="Panduan penggunaan" onClick={() => setModal('guide')}><CircleHelp size={21} strokeWidth={1.7} /></button></nav><button className="sidebar-bottom" aria-label="Status layanan" onClick={() => setModal('service')} title="Status layanan"><Activity size={17} /><span /></button></aside>
        <main id="main-content" tabIndex={-1} aria-busy={workspace.loading}>
          <div className="workspace-topline"><nav className="dashboard-links" aria-label="Dashboard"><a href="#/overview" className={section === 'overview' ? 'active' : ''}><LayoutDashboard size={14} />Perusahaan</a><a href="#/employees" className={section === 'employees' ? 'active' : ''}><Users size={14} />Pegawai</a><a href="#/cameras" className={section === 'cameras' || section === 'recordings' ? 'active' : ''}><Camera size={14} />Kamera & Arsip</a></nav><span><ClockDot />Update otomatis · 1 menit</span></div>
          <div className={`workspace-mode ${example ? 'workspace-mode-example' : ''}`}><div>{example ? <Sparkles size={16} /> : <Activity size={16} />}<p>{example ? <><strong>Pratinjau data contoh.</strong> Angka dan tren untuk demonstrasi tampilan, bukan hasil inferensi.</> : <><strong>Data layanan.</strong> Hasil AI akan terakumulasi otomatis sejak sumber kamera menyala.</>}</p></div><button onClick={() => setExample(!example)}>{example ? 'Gunakan data layanan' : 'Lihat contoh hasil'}<ArrowRight size={13} /></button></div>
          {workspace.error && <div className="error-message service-error" role="alert"><AlertCircle size={18} /><p>{workspace.error}</p><button onClick={workspace.refresh}>Coba sinkronkan<RefreshCw size={13} /></button></div>}
          {library.storageError && <div className="error-message service-error" role="alert"><AlertCircle size={18} /><p>{library.storageError}</p></div>}
          {section === 'overview' ? <CompanyDashboard {...shared} />
            : section === 'employees' ? resourceId ? <EmployeeDetail {...shared} workerId={resourceId} onRefresh={workspace.refresh} /> : <EmployeeDirectory {...shared} reviewOnly={queryParams.get('review') === 'needed'} />
            : section === 'cameras' ? resourceId && resourceId !== 'archive' ? <SourceDetail key={resourceId} cameraId={resourceId} sources={workspace.sources} recordings={library.recordings} playback={library.playback} /> : <CameraHub {...libraryProps} sources={workspace.sources} archive={resourceId === 'archive'} cameraFilter={queryParams.get('camera') || undefined} />
            : section === 'recordings' ? <RecordingDetail key={resourceId} {...libraryProps} recordingId={resourceId} workers={workers} onSaveLabels={library.saveLabels} />
            : section === 'report' ? <Report sessionId={resourceId || undefined} localVideo={null} videos={videos} onMethods={() => setModal('methods')} />
            : <div className="not-found"><span>404</span><h1>Halaman tidak ditemukan</h1><p>Kembali ke dashboard untuk melanjutkan peninjauan.</p><a href="#/overview" className="button button-dark">Dashboard perusahaan<ArrowRight size={16} /></a></div>}
        </main>
      </div>
      <footer className="app-footer"><span><strong>{APP_NAME} WORKSPACE</strong><span className="footer-slash">/</span>BUILT FOR BETTER WORK</span><button onClick={() => setModal('service')}><span className={`small-dot ${isConnectedMode && !workspace.error ? 'dot-success' : ''}`} />{example ? 'Pratinjau data contoh' : isConnectedMode ? 'Data layanan' : 'Frontend preview'}<span className="footer-slash">·</span>{workspace.lastSynced ? `Sinkronisasi ${workspace.lastSynced.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} WIB` : 'Mengambil data'}<ArrowUpRight size={12} /></button></footer>
    </div>
    {toast && <div className="toast" role="status"><span><Check size={16} /></span><p>{toast}</p><button aria-label="Tutup notifikasi" onClick={() => setToast('')}><X size={15} /></button></div>}
    {modal && <WorkspaceDialog modal={modal} onClose={() => setModal(null)} onMethods={() => setModal('methods')} sourcesOnline={workspace.sources.filter(source => source.status === 'online').length} />}
  </>;
}

function ClockDot() { return <span className="automatic-update-dot" />; }

function WorkspaceDialog({ modal, onClose, onMethods, sourcesOnline }: { modal: Exclude<Modal, null>; onClose: () => void; onMethods: () => void; sourcesOnline: number }) {
  const titles = { guide: 'Alur Observasi RAISE', privacy: 'Privasi & Arsip Rekaman', methods: 'Metode di Balik Asesmen', notifications: 'Notifikasi Workspace', service: 'Status Layanan Kamera' };
  return <Dialog title={titles[modal]} onClose={onClose} wide={modal === 'methods'}>
    {modal === 'guide' && <><div className="guide-intro"><span><HeartPulse size={32} strokeWidth={1.5} /></span><p>Analisis berkala, rekap per pegawai, dan peninjauan HSE dalam satu alur.</p></div><div className="guide-steps">{[['Kamera menjadi sumber bersama', 'Analisis berjalan otomatis sejak sumber menyala. Tidak ada pegawai tetap untuk sebuah kamera.'], ['Konfirmasi label pada rekaman', 'Untuk hackathon, pegawai dilabel manual pada video. Beberapa subjek bisa dilabel di satu rekaman.'], ['Rekap terakumulasi tiap menit', 'Hasil langsung masuk dashboard perusahaan dan detail pegawai. Rekap tersedia per hari dan minggu, tanpa panel kondisi live pegawai.'], ['Tinjau temuan dan riwayat', 'Dashboard menandai pegawai yang perlu direview. Arsip menyimpan rekaman dan label untuk penelusuran kembali.']].map(([title, detail], index) => <div key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{detail}</p></div></div>)}</div><div className="dialog-actions"><button className="button button-outline" onClick={onMethods}>Tentang metode<Sparkles size={15} /></button><a className="button button-dark" href="#/employees" onClick={onClose}>Dashboard pegawai<ArrowRight size={15} /></a></div></>}
    {modal === 'privacy' && <><div className="dialog-feature-icon"><ShieldCheck size={29} /></div><p className="dialog-lead">Rekaman dan identitas dapat ditelusuri kembali sesuai sumbernya.</p><ul className="privacy-list"><li><Check size={16} /><div><strong>Label manual per rekaman</strong><p>Label memuat identitas, penanda subjek, dan interval. Memakai satu kamera tidak menetapkan kepemilikan pegawai.</p></div></li><li><Check size={16} /><div><strong>Arsip lokal untuk prototype</strong><p>File yang Anda tambahkan disimpan di IndexedDB browser. File tetap tersedia setelah refresh, tetapi tidak dibagikan ke perangkat lain. Menghapus data situs akan menghapus arsip lokal.</p></div></li><li><Check size={16} /><div><strong>Layanan mengelola rekaman live</strong><p>Perekaman kamera terus menerus dan penyimpanan terpusat memerlukan layanan kamera. Frontend tidak mengklaim merekam ketika sumber belum terhubung.</p></div></li></ul></>}
    {modal === 'methods' && <><p className="dialog-lead">Analisis berkala menambah interval teramati ke rekap pegawai.</p><div className="method-cards"><article><span className="method-number">01</span><Badge tone="lime">SEVERITY</Badge><h3>REBA per fase</h3><p>A = Table A + load/force<br />B = Table B + coupling<br />C = Table C(A, B)<br />R = C + activity adjustments</p><small>Skor REBA tidak dijumlahkan antar menit. Ringkasan menampilkan skor tertinggi pada periode dan status review terpisah.</small></article><article><span className="method-number">02</span><Badge tone="lime">DURATION</Badge><h3>ISO 11226-inspired</h3><p>Durasi mengikuti interval observable. Unknown memutus holding time kontinu dan mengurangi cakupan usable.</p><small>Jadwal shift 08:00–17:00 Asia/Jakarta tidak dianggap sebagai sembilan jam observasi.</small></article><article><span className="method-number">03</span><Badge tone="warning">EKSPERIMENTAL</Badge><h3>Poin paparan RAISE</h3><p>Poin = Σ wᵢ × (dᵢ + eᵢ)<br />w = 1 untuk C 1–3<br />w = 2 untuk C 4–7<br />w = 3 untuk C 8–12</p><small>Interval baru menambah poin kumulatif. Refresh yang membaca interval yang sama tidak menambahkannya lagi.</small></article></div><div className="risk-reference"><strong>Band dashboard REBA</strong><Badge tone="success">1–3 · Rendah</Badge><Badge tone="warning">4–7 · Sedang</Badge><Badge tone="danger">8–10 · Tinggi</Badge><Badge tone="danger">11–15 · Tindakan segera</Badge></div><p className="helper">Poin RAISE adalah metrik prototipe, bukan diagnosis. Hasil AI tampil sebelum validasi HSE; status peninjauan tetap terlihat.</p></>}
    {modal === 'notifications' && <div className="notification-empty"><div className="dialog-feature-icon"><Bell size={28} /></div><h3>Review ada di dashboard pegawai.</h3><p>Pegawai dengan temuan ditandai Perlu review. Buka daftar tersebut untuk meninjau hasil per periode.</p><a className="button button-dark" href="#/employees?review=needed" onClick={onClose}>Lihat antrean review<ArrowRight size={15} /></a></div>}
    {modal === 'service' && <><div className="service-status"><span className="dialog-feature-icon"><Cpu size={28} /></span><div><Badge tone={sourcesOnline ? 'success' : 'warning'} dot>{sourcesOnline} sumber terhubung</Badge><h3>{sourcesOnline ? 'Sumber kamera tersedia' : 'Menunggu layanan kamera'}</h3></div></div><p className="dialog-lead">Analisis otomatis dan perekaman berjalan di layanan sumber kamera. Dashboard mengambil hasil setiap 60 detik; menutup dashboard tidak seharusnya menghentikan pipeline.</p><div className="service-detail"><span>Timezone situs<strong>Asia/Jakarta</strong></span><span>Interval pembaruan UI<strong>60 detik</strong></span><span>Asosiasi pegawai<strong>Label manual per rekaman</strong></span><span>Rekap yang tersedia<strong>Harian · mingguan · riwayat</strong></span></div></>}
  </Dialog>;
}
