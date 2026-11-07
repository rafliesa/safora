import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, ChevronDown, ClipboardCheck, Clock3, Filter, Search, ShieldCheck, Sparkles, TrendingUp, Users, X } from 'lucide-react';
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
    <label className="date-filter"><CalendarDays size={15} /><input aria-label="Summary end date" type="date" value={date} onChange={event => { if (event.target.value) setDate(event.target.value); }} /></label>
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
    <PageTitle title="Workplace Health Overview" actions={<PeriodControls {...props} />} />
    <div className="metrics-grid">
      <MetricCard label="Employees observed" value={observed.length} unit="Employees" detail={`${workers.length} identities available`} icon={Users} />
      <MetricCard label="Employees needing review" value={pending.length} unit="Employees" detail="AI findings requiring HSE review" icon={ClipboardCheck} danger />
      <MetricCard label="High risk this period" value={high.length} unit="Employees" detail="Peak REBA ≥ 8 · includes unreviewed results" icon={ShieldCheck} />
      <MetricCard label="Valid employee observation" value={observationMinutes(usable)} unit="Min" detail="Observed time, not scheduled shift duration" icon={Clock3} accent />
    </div>
    <div className="workforce-overview-grid">
      <section className="panel workforce-trend-panel">
        <SectionTitle aside={<Badge tone={example ? 'demo' : 'neutral'}>{example ? 'Demo data' : 'Cumulative AI results'}</Badge>}>Company Exposure Trend</SectionTitle>
        <div className="workforce-chart-heading"><div><strong>{selected.length ? selected.reduce((sum, window) => sum + (window.exposure_points || 0), 0).toFixed(1) : '—'}<span>RAISE points</span></strong><p>{formatDate(range.from)}–{formatDate(range.to, { year: 'numeric' })} · {selected.length} observation intervals</p></div><TrendingUp size={22} /></div>
        <ExposureChart windows={selected} {...range} />
      </section>
      <section className="panel review-queue-panel">
        <SectionTitle aside={<span className="count-pill">{pending.length}</span>}>HSE Review Priorities</SectionTitle>
        {pending.length ? <div className="review-queue">{pending.slice(0, 4).map(summary => <a key={summary.worker.id} href={`#/employees/${summary.worker.id}`}><WorkerAvatar worker={summary.worker} /><div><strong>{summary.worker.name}</strong><span>{summary.worker.department} · Peak REBA {summary.peak_reba}</span></div><ArrowUpRight size={16} /></a>)}</div> : <EmptyState icon={ClipboardCheck} title="No reviews in the queue" description={selected.length ? 'No review flags for this period.' : 'The queue appears when observation results are available.'} compact />}
        <a className="button button-dark full-width" href="#/employees?review=needed">Open employee dashboard<ArrowRight size={15} /></a>
      </section>
    </div>
    <section className="panel workforce-recent"><SectionTitle aside={<a href="#/employees" className="text-link">All employees<ArrowRight size={14} /></a>}>Employee Summaries</SectionTitle>{summaries.length ? <WorkerTable summaries={summaries.slice(0, 5)} /> : <EmptyState icon={Users} title="Waiting for the first observation" description="Label employees in a recording to see their results." action={<button className="button button-lime" onClick={onExample}><Sparkles size={16} />Explore the demo dashboard</button>} />}</section>
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
    <PageTitle title="Employees" actions={<PeriodControls {...props} />} />
    <div className="employee-directory-summary"><span><Users size={17} /><strong>{workers.length}</strong> employees</span><span><ClipboardCheck size={16} /><strong>{pending}</strong> need HSE review</span></div>
    <div className="employee-filters"><div className="search-field"><Search size={17} /><input aria-label="Search employees" placeholder="Search by employee name or ID…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="Clear employee search" onClick={() => setSearch('')}><X size={15} /></button>}</div><label className="filter-select"><Users size={14} /><select aria-label="Filter by department" value={department} onChange={event => setDepartment(event.target.value)}><option value="all">All departments</option>{departments.map(value => <option key={value}>{value}</option>)}</select><ChevronDown size={13} /></label><label className="filter-select"><Filter size={14} /><select aria-label="Filter by employee review" value={reviewFilter} onChange={event => setReviewFilter(event.target.value)}><option value="all">All employees</option><option value="needed">Needs review</option><option value="other">No review flag</option></select><ChevronDown size={13} /></label></div>
    {visible.length ? <div className="employee-grid">{visible.map(summary => <EmployeeCard key={summary.worker.id} summary={summary} />)}</div> : <section className="panel"><EmptyState icon={search || department !== 'all' || reviewFilter !== 'all' ? Search : Users} title={workers.length ? 'No matching employees' : 'No employee data yet'} description={workers.length ? 'Change your search or filters to see other employees.' : 'Add employee labels to a recording.'} action={!workers.length && <button className="button button-lime" onClick={onExample}><Sparkles size={16} />View the demo employee directory</button>} /></section>}
  </>;
}

function WorkerAvatar({ worker, large = false }: { worker: Worker; large?: boolean }) {
  const tone = [...worker.id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 4;
  return <span className={`worker-avatar worker-avatar-${tone} ${large ? 'worker-avatar-large' : ''}`}>{worker.initials}</span>;
}

function EmployeeCard({ summary }: { summary: WorkerSummary & { assessment?: EmployeeAssessmentSnapshot; localReview?: LocalHseReview | null } }) {
  const { worker, assessment, localReview } = summary;
  const band = risk(summary.peak_reba);
  const reviewText = localReview?.status === 'reviewed' ? 'Reviewed' : localReview?.status === 'needs_evidence' ? 'Evidence needed' : summary.needs_review ? 'Needs review' : 'Not reviewed';
  const reviewTone = localReview?.status === 'reviewed' ? 'success' : summary.needs_review ? 'warning' : 'neutral';
  const noiseStatus = assessment?.noise.status || 'Measurement data unavailable';
  const shortNoiseStatus: Record<string, string> = {
    'Partial coverage, HSE review needed': 'Partial coverage',
    'Area coverage · personal assessment needed': 'Area reading',
    'Measurement data unavailable': 'No measurement',
    'Measurement value unavailable': 'Value unavailable',
    'Exposure criterion reached': 'Criterion reached',
  };
  return <article className={'employee-card employee-card-compact' + (summary.needs_review ? ' employee-card-review' : '')}>
    <div className="employee-card-identity">
      <WorkerAvatar worker={worker} />
      <div><h2>{worker.name}</h2><p>{worker.id} · {worker.department}</p></div>
    </div>
    <div className="employee-card-signals">
      <div><span>MSD · REBA</span><div><strong>{summary.peak_reba ?? '—'}<small>/15</small></strong><Badge tone={band.tone}>{assessment?.msd.band || 'Not assessed'}</Badge></div></div>
      <div><span>Noise <small>Simulated</small></span><strong title={noiseStatus}>{shortNoiseStatus[noiseStatus] || noiseStatus}</strong></div>
    </div>
    <div className="employee-card-footer">
      <Badge tone={reviewTone} dot>{reviewText}</Badge>
      <a href={'#/employees/' + worker.id} className="text-link" aria-label="View employee details">View details<ArrowUpRight size={15} /></a>
    </div>
  </article>;
}

function WorkerTable({ summaries }: { summaries: WorkerSummary[] }) {
  return <div className="table-scroll"><table className="session-table"><thead><tr><th>Employees</th><th>Department</th><th>Valid observation</th><th>Peak REBA</th><th>HSE review</th><th>Detail</th></tr></thead><tbody>{summaries.map(summary => <tr key={summary.worker.id}><td><div className="table-worker"><WorkerAvatar worker={summary.worker} /><div><strong>{summary.worker.name}</strong><small>{summary.worker.id}</small></div></div></td><td>{summary.worker.department}</td><td>{observationMinutes(summary.usable_s)} min</td><td><Badge tone={risk(summary.peak_reba).tone}>{summary.peak_reba ?? '—'} · {risk(summary.peak_reba).label}</Badge></td><td><Badge tone={summary.needs_review ? 'warning' : 'neutral'}>{summary.needs_review ? 'Needs review' : 'No flags'}</Badge></td><td><a className="text-link" href={`#/employees/${summary.worker.id}`}>View details<ArrowUpRight size={14} /></a></td></tr>)}</tbody></table></div>;
}
