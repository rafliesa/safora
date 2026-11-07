import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Camera, ChevronDown, ClipboardCheck, Clock3, Filter, Layers3, Search, ShieldCheck, Sparkles, TrendingUp, Users, X } from 'lucide-react';
import { Badge, EmptyState, MetricCard, PageTitle, PeriodTabs, SectionTitle } from '../components/UI';
import ExposureChart from '../components/ExposureChart';
import { dateRange, risk } from '../lib/utils';
import { formatDate, inDateRange, observationMinutes, summarizeWorker, uniqueWindows } from '../lib/workforce';
import type { ObservationWindow, Recording, Worker, WorkerSummary } from '../lib/workforce';
import type { Period } from '../lib/types';
import type { EmployeeAssessmentSnapshot } from '../lib/assessment-model';
import type { LocalHseReview } from '../lib/local-reviews';
import { buildEmployeeSnapshot } from '../lib/assessment-model';
import { reviewForSnapshot, useLocalReviews } from '../lib/local-reviews';
import type { LocalReviewStore } from '../lib/local-reviews';
import type { NoiseReading } from '../lib/assessment-types';
export { default as EmployeeDetail } from './EmployeeExposure';

interface PeriodProps {
  period: Period;
  setPeriod: (value: Period) => void;
  date: string;
  setDate: (value: string) => void;
}

interface WorkforceProps extends PeriodProps {
  recordings?: Recording[];
  noiseReadings?: NoiseReading[];
  playback?: Record<string, string>;
  noiseUnavailableReason?: string;
  workers: Worker[];
  windows: ObservationWindow[];
  example: boolean;
  onExample: () => void;
}

export function PeriodControls({ period, setPeriod, date, setDate }: PeriodProps) {
  return <>
    <label className="date-filter"><CalendarDays size={15} /><input aria-label="Tanggal akhir rekap" type="date" value={date} onChange={event => { if (event.target.value) setDate(event.target.value); }} /></label>
    <PeriodTabs value={period} onChange={setPeriod} />
  </>;
}

function getSummaries(workers: Worker[], windows: ObservationWindow[], from: string, to: string, context: { recordings: Recording[]; noiseReadings: NoiseReading[]; period: Period; example: boolean; reviews: LocalReviewStore }) {
  const selected = windows.filter(window => inDateRange(window, from, to));
  return workers.map(worker => {
    const summary = summarizeWorker(worker, selected);
    const snapshot = buildEmployeeSnapshot({ worker, windows: selected, recordings: context.recordings, noiseReadings: context.noiseReadings, period: context.period, from, to, example: context.example });
    const review = reviewForSnapshot(context.reviews, snapshot);
    const needsReview = summary.needs_review || snapshot.noise.readings.some(reading => reading.status_priority >= 2);
    return { ...summary, assessment: snapshot, localReview: review, needs_review: review?.status === 'reviewed' ? false : review?.status === 'needs_evidence' ? true : needsReview };
  });
}

export function CompanyDashboard(props: WorkforceProps) {
  const { workers, windows, date, period, example, onExample } = props;
  const reviews = useLocalReviews();
  const range = dateRange(date, period);
  const summaries = getSummaries(workers, windows, range.from, range.to, { recordings: props.recordings || [], noiseReadings: props.noiseReadings || [], period, example: props.example, reviews });
  const selected = uniqueWindows(windows.filter(window => inDateRange(window, range.from, range.to)));
  const observed = summaries.filter(worker => worker.windows.length > 0);
  const pending = summaries.filter(worker => worker.needs_review);
  const high = observed.filter(worker => (worker.peak_reba || 0) >= 8);
  const usable = selected.reduce((sum, window) => sum + window.usable_s, 0);
  return <>
    <PageTitle eyebrow="DASHBOARD PERUSAHAAN" title="Gambaran Kesehatan Kerja" description="Hasil analisis berkala seluruh pegawai, dalam satu pandangan." actions={<PeriodControls {...props} />} />
    <div className="metrics-grid">
      <MetricCard label="Pegawai teramati" value={observed.length} unit="Pegawai" detail={`${workers.length} identitas tersedia`} icon={Users} />
      <MetricCard label="Pegawai perlu review" value={pending.length} unit="Pegawai" detail="Temuan AI yang perlu ditinjau HSE" icon={ClipboardCheck} danger />
      <MetricCard label="Risiko tinggi pada periode" value={high.length} unit="Pegawai" detail="REBA tertinggi ≥ 8 · termasuk belum direview" icon={ShieldCheck} />
      <MetricCard label="Observasi usable pegawai" value={observationMinutes(usable)} unit="Menit" detail="Waktu teramati, bukan durasi shift" icon={Clock3} accent />
    </div>
    <div className="workforce-overview-grid">
      <section className="panel workforce-trend-panel">
        <SectionTitle aside={<Badge tone={example ? 'demo' : 'neutral'}>{example ? 'Data contoh' : 'Hasil AI · kumulatif'}</Badge>}>Tren Paparan Perusahaan</SectionTitle>
        <div className="workforce-chart-heading"><div><strong>{selected.length ? selected.reduce((sum, window) => sum + (window.exposure_points || 0), 0).toFixed(1) : '—'}<span>poin RAISE</span></strong><p>{formatDate(range.from)}–{formatDate(range.to, { year: 'numeric' })} · {selected.length} interval observasi</p></div><TrendingUp size={22} /></div>
        <ExposureChart windows={selected} {...range} />
      </section>
      <section className="panel review-queue-panel">
        <SectionTitle aside={<span className="count-pill">{pending.length}</span>}>Prioritas Review HSE</SectionTitle>
        <p className="workforce-helper">Hasil AI langsung masuk ke dashboard. Pegawai dengan temuan ditandai untuk peninjauan.</p>
        {pending.length ? <div className="review-queue">{pending.slice(0, 4).map(summary => <a key={summary.worker.id} href={`#/employees/${summary.worker.id}`}><WorkerAvatar worker={summary.worker} /><div><strong>{summary.worker.name}</strong><span>{summary.worker.department} · REBA tertinggi {summary.peak_reba}</span></div><ArrowUpRight size={16} /></a>)}</div> : <EmptyState icon={ClipboardCheck} title="Belum ada antrean review" description={selected.length ? 'Belum ada flag review pada periode ini.' : 'Antrean muncul setelah hasil observasi tersedia.'} compact />}
        <a className="button button-dark full-width" href="#/employees?review=needed">Buka dashboard pegawai<ArrowRight size={15} /></a>
      </section>
    </div>
    <section className="panel automatic-flow-panel"><SectionTitle aside={<Badge tone="lime">Tiap 1 menit</Badge>}>Analisis Berjalan Otomatis</SectionTitle><div className="automatic-flow">{[{ icon: Camera, title: 'Kamera menyala', text: 'Sumber terhubung ke layanan' }, { icon: Users, title: 'Label per rekaman', text: 'Pegawai ditentukan manual' }, { icon: Layers3, title: 'Hasil terakumulasi', text: 'Interval baru menambah rekap' }, { icon: ClipboardCheck, title: 'Review saat diperlukan', text: 'HSE meninjau temuan pegawai' }].map(({ icon: Icon, title, text }, index) => <div key={title}><span><Icon size={21} strokeWidth={1.5} /></span><div><strong>{title}</strong><p>{text}</p></div>{index < 3 && <ArrowRight size={14} />}</div>)}</div></section>
    <section className="panel workforce-recent"><SectionTitle aside={<a href="#/employees" className="text-link">Semua pegawai<ArrowRight size={14} /></a>}>Ringkasan Pegawai</SectionTitle>{summaries.length ? <WorkerTable summaries={summaries.slice(0, 5)} /> : <EmptyState icon={Users} title="Menunggu observasi pertama" description="Identitas dihubungkan ke rekaman secara manual. Rekap pegawai akan terisi otomatis saat hasil AI tersedia." action={<button className="button button-lime" onClick={onExample}><Sparkles size={16} />Jelajahi contoh dashboard</button>} />}</section>
  </>;
}

export function EmployeeDirectory(props: WorkforceProps & { reviewOnly?: boolean }) {
  const { workers, windows, date, period, onExample, reviewOnly = false } = props;
  const reviews = useLocalReviews();
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [reviewFilter, setReviewFilter] = useState(reviewOnly ? 'needed' : 'all');
  useEffect(() => { setReviewFilter(reviewOnly ? 'needed' : 'all'); }, [reviewOnly]);
  const range = dateRange(date, period);
  const summaries = getSummaries(workers, windows, range.from, range.to, { recordings: props.recordings || [], noiseReadings: props.noiseReadings || [], period, example: props.example, reviews });
  const pending = summaries.filter(summary => summary.needs_review).length;
  const departments = [...new Set(workers.map(worker => worker.department))];
  const visible = summaries.filter(summary => `${summary.worker.id} ${summary.worker.name}`.toLowerCase().includes(search.toLowerCase()) && (department === 'all' || summary.worker.department === department) && (reviewFilter === 'all' || (reviewFilter === 'needed' ? summary.needs_review : !summary.needs_review))).sort((a, b) => Number(b.needs_review) - Number(a.needs_review) || a.worker.name.localeCompare(b.worker.name));
  return <>
    <PageTitle eyebrow="DASHBOARD PEGAWAI" title="Setiap Pegawai, Lebih Dipahami" description="Rekap per orang dari berbagai kamera dan rekaman. Telusuri hasil dan riwayatnya." actions={<PeriodControls {...props} />} />
    <div className="employee-directory-summary"><span><Users size={17} /><strong>{workers.length}</strong> pegawai</span><span><ClipboardCheck size={16} /><strong>{pending}</strong> perlu review HSE</span><span><Clock3 size={16} />Pembaruan hasil tiap 1 menit</span></div>
    <div className="employee-filters"><div className="search-field"><Search size={17} /><input aria-label="Cari pegawai" placeholder="Cari nama atau ID pegawai…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="Hapus pencarian pegawai" onClick={() => setSearch('')}><X size={15} /></button>}</div><label className="filter-select"><Users size={14} /><select aria-label="Filter departemen" value={department} onChange={event => setDepartment(event.target.value)}><option value="all">Semua departemen</option>{departments.map(value => <option key={value}>{value}</option>)}</select><ChevronDown size={13} /></label><label className="filter-select"><Filter size={14} /><select aria-label="Filter review pegawai" value={reviewFilter} onChange={event => setReviewFilter(event.target.value)}><option value="all">Semua pegawai</option><option value="needed">Perlu review</option><option value="other">Tanpa flag review</option></select><ChevronDown size={13} /></label></div>
    {visible.length ? <div className="employee-grid">{visible.map(summary => <EmployeeCard key={summary.worker.id} summary={summary} />)}</div> : <section className="panel"><EmptyState icon={search || department !== 'all' || reviewFilter !== 'all' ? Search : Users} title={workers.length ? 'Tidak ada pegawai yang cocok' : 'Belum ada data pegawai'} description={workers.length ? 'Ubah kata kunci atau filter untuk melihat pegawai lainnya.' : 'Label manual pada rekaman menentukan pegawai yang dinilai. Hasil berkala akan muncul di halaman ini.'} action={!workers.length && <button className="button button-lime" onClick={onExample}><Sparkles size={16} />Lihat contoh daftar pegawai</button>} /></section>}
    <div className="hub-bottom"><p><ShieldCheck size={15} />Identitas mengikuti label rekaman, bukan kepemilikan kamera.</p><a href="#/cameras/archive" className="text-link">Buka arsip rekaman<ArrowRight size={14} /></a></div>
  </>;
}

function WorkerAvatar({ worker, large = false }: { worker: Worker; large?: boolean }) {
  const tone = [...worker.id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 4;
  return <span className={`worker-avatar worker-avatar-${tone} ${large ? 'worker-avatar-large' : ''}`}>{worker.initials}</span>;
}

function EmployeeCard({ summary }: { summary: WorkerSummary & { assessment?: EmployeeAssessmentSnapshot; localReview?: LocalHseReview | null } }) {
  const { worker, assessment, localReview } = summary;
  const band = risk(summary.peak_reba);
  const recommendation = assessment ? [...assessment.msd.interventions, ...assessment.noise.interventions].sort((a, b) => a.priority.localeCompare(b.priority))[0] : null;
  const reviewText = localReview?.status === 'reviewed' ? 'Sudah direview HSE' : localReview?.status === 'needs_evidence' ? 'Perlu bukti' : 'Belum direview';
  return <article className={`employee-card ${summary.needs_review ? 'employee-card-review' : ''}`}>
    <div className="employee-card-top"><WorkerAvatar worker={worker} /><Badge tone={summary.needs_review ? 'warning' : 'neutral'} dot>{summary.needs_review ? 'Perlu review' : 'Tanpa flag'}</Badge></div>
    <h2>{worker.name}</h2><p className="employee-card-id">{worker.id}<span>·</span>{worker.department}</p>
    {assessment && <p className="employee-card-period"><CalendarDays size={13} />{formatDate(assessment.scope.from)}–{formatDate(assessment.scope.to)}</p>}
    <div className="employee-card-measures"><div><span>MSD · REBA tertinggi</span><strong className={`score-${band.tone}`}>{summary.peak_reba ?? '—'}<small>/15</small></strong><Badge tone={band.tone}>{assessment?.msd.band || 'Belum dinilai'}</Badge></div><div><span>Paparan RAISE</span><strong>{summary.has_points ? summary.exposure_points.toFixed(1) : '—'}<small>poin</small></strong><small>Metrik prototipe</small></div></div>
    {assessment && <div className="employee-card-module-status"><span>Kebisingan</span><strong>{assessment.noise.status}</strong><Badge tone="demo">Simulasi</Badge></div>}
    {recommendation && <div className="employee-card-recommendation"><Badge tone={recommendation.priority === 'P1' ? 'danger' : recommendation.priority === 'P2' ? 'warning' : 'neutral'}>Prioritas {recommendation.priority}</Badge><p>{recommendation.action}</p></div>}
    <div className="employee-card-coverage"><Clock3 size={13} /><span>{observationMinutes(summary.usable_s)} menit valid</span><span>{summary.recordings} rekaman</span></div>
    <div className="employee-card-review-meta"><Badge tone={localReview?.status === 'reviewed' ? 'success' : localReview?.status === 'needs_evidence' ? 'warning' : 'neutral'}>{reviewText}</Badge><small>{assessment?.updated_at ? formatDate(assessment.updated_at, { hour: '2-digit', minute: '2-digit' }) + ' WIB' : 'Pembaruan belum tersedia'}</small></div>
    <a href={`#/employees/${worker.id}`} className="button button-muted full-width">Lihat detail pegawai<ArrowUpRight size={15} /></a>
  </article>;
}

function WorkerTable({ summaries }: { summaries: WorkerSummary[] }) {
  return <div className="table-scroll"><table className="session-table"><thead><tr><th>Pegawai</th><th>Departemen</th><th>Observasi usable</th><th>REBA tertinggi</th><th>Review HSE</th><th>Detail</th></tr></thead><tbody>{summaries.map(summary => <tr key={summary.worker.id}><td><div className="table-worker"><WorkerAvatar worker={summary.worker} /><div><strong>{summary.worker.name}</strong><small>{summary.worker.id}</small></div></div></td><td>{summary.worker.department}</td><td>{observationMinutes(summary.usable_s)} menit</td><td><Badge tone={risk(summary.peak_reba).tone}>{summary.peak_reba ?? '—'} · {risk(summary.peak_reba).label}</Badge></td><td><Badge tone={summary.needs_review ? 'warning' : 'neutral'}>{summary.needs_review ? 'Perlu review' : 'Tanpa flag'}</Badge></td><td><a className="text-link" href={`#/employees/${summary.worker.id}`}>Lihat detail<ArrowUpRight size={14} /></a></td></tr>)}</tbody></table></div>;
}
