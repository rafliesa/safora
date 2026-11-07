import ModelResults from '../components/ModelResults';
import MsdReview from '../components/MsdReview';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertCircle, ArrowLeft, ArrowUpRight, CalendarDays, Camera, Check, ChevronRight, ClipboardCheck, Clock3, FileSearch, FileText, FileVideo, Info, Layers3, MapPin, MessageSquareText, Search, ShieldCheck, Timer, TrendingUp, Users, Volume2 } from 'lucide-react';
import { Badge, Dialog, EmptyState, PageTitle } from '../components/UI';
import ExposureChart from '../components/ExposureChart';
import { buildEmployeeSnapshot } from '../lib/assessment-model';
import type { EmployeeAssessmentSnapshot, ExposureEvidence } from '../lib/assessment-model';
import type { ExposureIntervention, NoiseReading } from '../lib/assessment-types';
import { reviewForSnapshot, saveLocalReview, useLocalReviews } from '../lib/local-reviews';
import type { LocalHseReview } from '../lib/local-reviews';
import { dateRange, time } from '../lib/utils';
import { formatDate } from '../lib/workforce';
import type { ObservationWindow, Recording, Worker } from '../lib/workforce';
import type { Period } from '../lib/types';

export interface EmployeeExposureProps {
  workerId: string;
  workers: Worker[];
  windows: ObservationWindow[];
  recordings: Recording[];
  noiseReadings?: NoiseReading[];
  noiseUnavailableReason?: string;
  playback?: Record<string, string>;
  period: Period;
  setPeriod: (value: Period) => void;
  date: string;
  setDate: (value: string) => void;
  example: boolean;
  onExample: () => void;
  onRefresh: () => void;
}

const number = (value: number, digits = 1) => value.toLocaleString('en-GB', { maximumFractionDigits: digits });
const min = (seconds: number) => `${number(seconds / 60)} min`;
const clock = (timestamp: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
const bandTone = (band: string | null) => band === 'High' ? 'danger' : band === 'Medium' ? 'warning' : band === 'Low' ? 'success' : 'neutral';
const reviewLabel = (review: LocalHseReview | null) => review?.status === 'reviewed' ? 'Reviewed by HSE' : review?.status === 'needs_evidence' ? 'Evidence needed' : 'Not reviewed';

export default function EmployeeExposure(props: EmployeeExposureProps) {
  const { workerId, workers, windows, recordings, date, example, setPeriod, noiseReadings = [], playback = {} } = props;
  const worker = workers.find(item => item.id === workerId);
  const period = props.period;
  const range = dateRange(date, period);
  const reviews = useLocalReviews();
  const snapshot = useMemo(() => worker ? buildEmployeeSnapshot({ worker, windows, recordings, noiseReadings, period, ...range, example }) : null, [worker, windows, recordings, noiseReadings, period, range.from, range.to, example]);
  const review = snapshot ? reviewForSnapshot(reviews, snapshot) : null;
  const hasEarlierReview = snapshot ? Object.values(reviews).some(item => item.snapshotId === snapshot.scope.snapshotId && item.source === snapshot.scope.source && item.revision !== snapshot.scope.revision) : false;
  const [detail, setDetail] = useState<'msd' | 'noise' | null>(null);
  const [evidence, setEvidence] = useState<'msd' | 'noise' | null>(null);
  const [reviewing, setReviewing] = useState<EmployeeAssessmentSnapshot | null>(null);
  useEffect(() => { setDetail(null); setEvidence(null); setReviewing(null); }, [workerId, period, date]);
  if (workerId === 'demo-a') return <><a href="/employees" className="back-link"><ArrowLeft size={14} />Employee dashboard</a><PageTitle title="Employee A (Demo)" /><MsdReview /></>;
  if (!worker || !snapshot) return <><PageTitle title="Employee Unavailable" /><a href="/employees" className="button button-dark"><ArrowLeft size={15} />Employee dashboard</a></>;
  const hasData = snapshot.windows.length > 0 || snapshot.noise.readings.length > 0;
  const reviewTone = review?.status === 'reviewed' ? 'success' : review?.status === 'needs_evidence' ? 'warning' : 'neutral';
  return <>
    <a href="/employees" className="back-link"><ArrowLeft size={14} />Employee dashboard</a>
    <PageTitle title={worker.name} actions={<div className="period-tabs employee-period-tabs" data-period={period} aria-label="Employee period">{([['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']] as const).map(([value, label]) => <button key={value} aria-pressed={period === value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>{label}</button>)}</div>} />
    <section className="employee-context-card" aria-label="Employee and period summary">
      <div className="employee-context-identity"><span className="context-avatar">{worker.initials}</span><div><strong>{worker.id}</strong><span>{worker.department}</span></div><div className="employee-context-status"><Badge tone={reviewTone} dot>{reviewLabel(review)}</Badge>{hasEarlierReview && !review && <Badge tone="info">New revision · not reviewed</Badge>}</div></div>
      <details className="employee-context-details"><summary>Period & observation details</summary><div className="employee-context-fields"><ContextField icon={CalendarDays} label="Selected period" value={formatDate(range.from) + '–' + formatDate(range.to, { year: 'numeric' })} /><ContextField icon={Clock3} label="Scheduled shift" value="08:00–17:00 WIB" /><ContextField icon={MapPin} label="Observed locations" value={snapshot.locations.length ? snapshot.locations.join(' · ') : 'Location unavailable'} /><ContextField icon={Activity} label="Last results update" value={snapshot.updated_at ? formatDate(snapshot.updated_at, { hour: '2-digit', minute: '2-digit' }) + ' WIB' : 'No results update available'} /></div></details>
    </section>
    <div className="exposure-assessment-grid exposure-assessment-single">
      <MsdCard snapshot={snapshot} review={review} onDetails={() => setDetail('msd')} onEvidence={() => setEvidence('msd')} />
    </div>
    {recordings.filter(recording => recording.source === 'service' && recording.labels.some(label => label.worker_id === workerId)).map(recording => <section key={recording.id} aria-label="Employee model results">
      <p className="inline-note">{recording.labels.find(label => label.worker_id === workerId)?.subject_label}</p>
      <a className="text-link" href={`/recordings/${recording.id}`}>Open recording · {recording.filename}</a>
      <ModelResults recording={recording} currentTime={0} />
    </section>)}
    <Coverage snapshot={snapshot} />
    <section className="employee-hse-section" aria-labelledby="hse-review-title">
      <div className="employee-hse-heading"><span><ClipboardCheck size={25} strokeWidth={1.5} /></span><h2 id="hse-review-title">HSE Review</h2><Badge tone={reviewTone} dot>{reviewLabel(review)}</Badge></div>
      <div className="employee-hse-body"><div className="hse-notes-block"><h3>HSE notes</h3><p className={review ? 'saved-hse-notes' : ''}>{review?.notes || 'No HSE notes for this snapshot.'}</p>{review && <small>{review.reviewer} · {formatDate(review.savedAt, { hour: '2-digit', minute: '2-digit' })} WIB</small>}</div><button className="button button-dark" disabled={!hasData} onClick={() => setReviewing(snapshot)}><MessageSquareText size={16} />Review this period<ArrowUpRight size={15} /></button></div>
      <div className="hse-review-footer"><span><Info size={13} />Saved in this browser</span><details className="snapshot-audit"><summary>Snapshot details<ChevronRight size={14} /></summary><div className="snapshot-scope"><span>{snapshot.scope.snapshotId}</span><span>Revision {snapshot.scope.revision}</span></div></details></div>
    </section>
    <section className="employee-evidence-history"><div className="exposure-subsection-title"><h2><FileVideo size={18} />Analysis History</h2><span>{snapshot.spans.length} recordings in the selected period</span></div>{snapshot.spans.length ? <div className="evidence-history-list">{snapshot.spans.map(span => {
      const recording = recordings.find(item => item.id === span.recordingId);
      return <div key={span.recordingId}><span className="history-record-icon"><Camera size={19} /></span><div><strong>{recording ? `Camera ${recording.camera_id} · ${recording.station_id}` : 'Source metadata unavailable'}</strong><p>{recording?.filename || span.recordingId}</p><small>{formatDate(span.start_at, { hour: '2-digit', minute: '2-digit' })}–{clock(span.end_at)} WIB · {min(span.usable_s)} valid</small></div><Badge>{recording?.playback_url || playback[span.recordingId] ? 'Video available' : 'Recording unavailable'}</Badge><button className="text-link" onClick={() => setEvidence('msd')}>View evidence<ArrowUpRight size={14} /></button></div>;
    })}</div> : <EmptyState compact icon={FileSearch} title="No recording evidence for this period" description="Camera sources, manual labels, recordings, and timestamps will appear when available." />}</section>
    {detail && <AssessmentDetail kind={detail} snapshot={snapshot} review={review} onClose={() => setDetail(null)} />}
    {evidence && <EvidenceDialog kind={evidence} snapshot={snapshot} recordings={recordings} playback={playback} onClose={() => setEvidence(null)} />}
    {reviewing && <LocalReviewDialog snapshot={reviewing} current={snapshot} previous={reviewForSnapshot(reviews, reviewing)} onClose={() => setReviewing(null)} />}
  </>;
}

function ContextField({ icon: Icon, label, value, note }: { icon: typeof Clock3; label: string; value: string; note?: string }) {
  return <div className="employee-context-field"><span><Icon size={15} />{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

function Coverage({ snapshot }: { snapshot: EmployeeAssessmentSnapshot }) {
  const pct = snapshot.recorded_s > 0 ? snapshot.valid_s / snapshot.recorded_s * 100 : 0;
  return <section className="assessment-coverage coverage-overview" aria-label="Observation coverage">
    <div className="coverage-heading"><span className="coverage-icon"><Search size={20} /></span><h2>Observation coverage</h2><span>{snapshot.observed_days} / {snapshot.period_days} days observed</span></div>
    <div className="coverage-stat-row"><div><strong>{number(snapshot.valid_s / 60)}<small>min</small></strong><span>Valid observation</span></div><div><strong>{number(snapshot.recorded_s / 60)}<small>min</small></strong><span>Recorded</span></div><div><strong>{number(snapshot.unknown_s / 60)}<small>min</small></strong><span>Unknown / invalid</span></div><div className="coverage-progress-area"><strong>{snapshot.recorded_s ? number(pct) + '%' : '—'}<small> valid coverage</small></strong><div className="coverage-progress" role="progressbar" aria-label="Valid observation percentage" aria-valuenow={Number(pct.toFixed(1))} aria-valuemin={0} aria-valuemax={100}><span style={{ width: Math.max(0, Math.min(100, pct)) + '%' }} /></div></div></div>
    {snapshot.spans.length > 0 ? <details className="coverage-observed-intervals"><summary>Observed intervals<ChevronRight size={14} /></summary><div className="coverage-period-windows">{snapshot.spans.map(span => <span key={span.recordingId}><Clock3 size={12} />{formatDate(span.start_at)} · {clock(span.start_at)}–{clock(span.end_at)} WIB</span>)}</div></details> : <p className="coverage-empty">No observation intervals available.</p>}
  </section>;
}

function MsdCard({ snapshot, review, onDetails, onEvidence }: { snapshot: EmployeeAssessmentSnapshot; review: LocalHseReview | null; onDetails: () => void; onEvidence: () => void }) {
  const msd = snapshot.msd;
  const main = msd.findings[0];
  const evidence = snapshot.evidence.filter(item => item.kind === 'msd');
  const tone = bandTone(msd.band);
  return <article className={'exposure-card msd-exposure-card assessment-card-redesign assessment-tone-' + tone} aria-labelledby="msd-card-title">
    <header className="exposure-card-header"><div><span className="exposure-card-icon"><Activity size={23} strokeWidth={1.6} /></span><h2 id="msd-card-title">MSD Exposure</h2></div><Badge tone={tone}>{msd.band || 'Risk not assessed'}</Badge></header>
    <div className={'msd-score-summary msd-summary-' + tone}>
      <div><span>REBA SCORE</span><strong>{msd.score ?? '—'}<small>/ 15</small></strong></div>
      <div><Badge tone={review?.status === 'reviewed' ? 'success' : 'neutral'}>{review?.status === 'reviewed' ? 'Reviewed by HSE · local' : 'AI result'}</Badge><p>{msd.score === null ? 'REBA score unavailable.' : reviewLabel(review)}</p>{snapshot.scope.period !== 'day' && msd.score !== null && <small>Peak score this period</small>}{msd.immediate_action && <Badge tone="danger">Immediate action · HSE confirmation</Badge>}</div>
      <div className="reba-scale" aria-hidden="true">{Array.from({ length: 15 }, (_, index) => <span key={index} className={msd.score !== null && index < msd.score ? 'filled' : ''} />)}</div>
    </div>
    <div className="assessment-trend-panel"><div className="exposure-trend-heading"><h3>{snapshot.scope.period === 'day' ? 'Daily' : snapshot.scope.period === 'week' ? 'Weekly' : 'Monthly'} Exposure Trend</h3><Badge>Prototype metric</Badge></div><ExposureChart windows={snapshot.windows} from={snapshot.scope.from} to={snapshot.scope.to} /></div>
    <details className="assessment-extra" hidden><summary>Findings & measurements</summary>
    <KeyFinding title={main?.region ? main.region + ' exposure' : 'Body region unavailable'} activity={main?.activity || 'Activity or posture unavailable'} rationale={main?.rationale || 'Findings, activity context, and assessment rationale are unavailable for this period.'} />
    <div className="msd-duration-block"><div><span>Exposure duration</span><strong>{min(msd.exposure_s)}<small> of {min(snapshot.valid_s)} valid</small></strong></div><span>{msd.exposure_pct === null ? '—' : number(msd.exposure_pct) + '%'}</span><div className="exposure-duration-track"><span style={{ width: Math.min(100, msd.exposure_pct || 0) + '%' }} /></div></div>
    <div className="exposure-metric-grid">
      <ExposureMetric icon={Timer} label="Longest holding time" value={msd.longest_hold_s === null ? '—' : number(msd.longest_hold_s) + ' seconds'} note={msd.longest_hold_s === null ? 'Holding time data unavailable' : msd.static_holds + ' observed static holds'} />
      <ExposureMetric icon={Layers3} label="Event count" value={msd.event_count === null ? '—' : String(msd.event_count)} note={msd.event_count === null ? 'Event segmentation unavailable' : 'Unique episodes'} />
      <ExposureMetric icon={TrendingUp} label="Cumulative exposure points" value={msd.points === null ? '—' : number(msd.points) + ' points'} note="RAISE prototype metric" accent />
      <ExposureMetric icon={Clock3} label="Points per observation hour" value={msd.points_per_hour === null ? '—' : number(msd.points_per_hour) + ' points/hour'} note={msd.points_per_hour === null ? 'Points and valid observation time required' : 'Based on ' + min(snapshot.valid_s) + ' valid'} accent />
    </div>
    {!msd.points_complete && <div className="exposure-missing-note"><Info size={14} />Some valid intervals have no calculated points. The available total is partial.</div>}

    <Interventions items={msd.interventions} missing="Recommendations unavailable. Findings and task context are required." />
    <EvidenceSummary evidence={evidence} onOpen={onEvidence} />
    </details>
    <div className="exposure-card-actions"><button className="button button-outline" onClick={onDetails}><FileText size={15} />Assessment details<ArrowUpRight size={14} /></button><button className="button button-dark" onClick={onEvidence}><FileVideo size={15} />Open evidence<ArrowUpRight size={14} /></button></div>
  </article>;
}

function KeyFinding({ title, activity, rationale }: { title: string; activity?: string; rationale: string }) {
  return <div className="assessment-key-finding"><div className="key-finding-label"><FileSearch size={15} /><span>Key finding</span></div><h3>{title}</h3>{activity && <strong>{activity}</strong>}<div className="finding-rationale"><span>Why it matters</span><p>{rationale}</p></div></div>;
}

function ExposureMetric({ icon: Icon, label, value, note, accent = false }: { icon: typeof Timer; label: string; value: string; note: string; accent?: boolean }) {
  const parts = value.match(/^([\d.,]+)\s+(.+)$/);
  return <div className={`exposure-mini-metric ${accent ? 'exposure-mini-accent' : ''}`}><span><Icon size={14} />{label}</span><strong>{parts ? <>{parts[1]}<small> {parts[2]}</small></> : value}</strong><small>{note}</small></div>;
}

function DataField({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="assessment-data-field"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

function Interventions({ items, missing }: { items: ExposureIntervention[]; missing: string }) {
  return <section className="exposure-interventions intervention-list"><h3><ShieldCheck size={17} />Recommended interventions</h3>{items.length ? items.map(item => <div key={item.id} className={'intervention-action intervention-' + item.priority.toLowerCase()}><div className="intervention-action-header"><Badge tone={item.priority === 'P1' ? 'danger' : item.priority === 'P2' ? 'warning' : 'neutral'}>Priority {item.priority}</Badge><strong>{item.action}</strong></div><p><span>Why</span>{item.reason}</p></div>) : <p className="exposure-missing-note">{missing}</p>}</section>;
}

function EvidenceSummary({ evidence, onOpen }: { evidence: ExposureEvidence[]; onOpen: () => void }) {
  return <div className="exposure-evidence-summary"><span><Camera size={15} />Evidence & sources</span>{evidence.length ? <><p>{[...new Set(evidence.map(item => item.cameraId ? `Camera ${item.cameraId}` : 'Camera unknown'))].join(' · ')}<span>·</span>{new Set(evidence.map(item => item.recordingId)).size} recordings</p><button onClick={onOpen}>{time(evidence[0].start_s)}–{time(evidence[0].end_s)}<span>Relevant timestamp</span><ChevronRight size={14} /></button></> : <p>Camera, recording, and timestamp unavailable.</p>}</div>;
}

function AssessmentDetail({ kind, snapshot, review, onClose }: { kind: 'msd' | 'noise'; snapshot: EmployeeAssessmentSnapshot; review: LocalHseReview | null; onClose: () => void }) {
  return <Dialog title={kind === 'msd' ? 'MSD Assessment Details' : 'Noise Measurement Details'} onClose={onClose} wide><div className="assessment-detail-context"><strong>{snapshot.worker.name} · {formatDate(snapshot.scope.from)}–{formatDate(snapshot.scope.to)}</strong><span>{reviewLabel(review)}</span></div>{kind === 'msd' ? <>
    <div className="assessment-detail-grid"><DataField label="REBA" value={snapshot.msd.score === null ? 'Score unavailable' : `${snapshot.msd.score} / 15 · ${snapshot.msd.band}`} note={review?.status === 'reviewed' ? 'HSE reviewed this snapshot (local)' : 'AI result · not reviewed by HSE'} /><DataField label="Body region" value={snapshot.msd.findings.map(finding => finding.region || 'Unavailable').join(' · ') || 'Unavailable'} /><DataField label="Longest holding time" value={snapshot.msd.longest_hold_s === null ? 'Data unavailable' : `${snapshot.msd.longest_hold_s} seconds`} /><DataField label="Episode count" value={snapshot.msd.event_count === null ? 'Segmentation unavailable' : `${snapshot.msd.event_count} events · ${snapshot.msd.static_holds} static hold`} /><DataField label="Table C subtotal" value={snapshot.msd.table_c_values.length ? snapshot.msd.table_c_values.join(' · ') : 'Table C inputs unavailable'} /><DataField label="Additional holding time" value={snapshot.msd.extra_hold_s === null ? 'Incomplete holding context' : min(snapshot.msd.extra_hold_s)} note="30-second demo threshold; only holds with complete context" /></div>
    <div className="prototype-breakdown"><Badge tone="info">Prototype metric</Badge><h3>Cumulative exposure calculation</h3><p>Points = Σ w × (exposure duration + additional hold).</p><strong>{snapshot.msd.points === null ? 'Point calculation unavailable' : `${number(snapshot.msd.points)} points · ${snapshot.msd.points_per_hour === null ? 'Rate unavailable' : number(snapshot.msd.points_per_hour) + ' points per valid hour'}`}</strong><p>Table C weights: 1 for 1–3, 2 for 4–7, and 3 for 8–12. REBA activity adjustments are not added to the points again.</p></div>
    <h3 className="modal-section-title">Assessment input context</h3><div className="assessment-input-context">{snapshot.msd.input_context.length ? snapshot.msd.input_context.map((field, index) => <DataField key={`${field.field}-${index}`} label={field.field} value={field.value ?? 'Data unavailable'} />) : <p>Load/force, coupling, support, body side, and worksheet details are unavailable.</p>}</div>
  </> : <>
    <div className="measurement-status-detail"><Volume2 size={20} /><div><strong>{snapshot.noise.status}</strong><p>{snapshot.noise.rationale}</p></div><Badge tone="demo">Simulated</Badge></div>
    {snapshot.noise.readings.length ? <div className="noise-reading-details">{snapshot.noise.readings.map(reading => <section key={reading.id}><div><h3>{reading.scope === 'personal' ? 'Personal' : 'Area'} · {reading.level_dba === null ? 'Noise level unavailable' : `${number(reading.level_dba)} dBA`}</h3><Badge tone="demo">Simulated</Badge></div><p>{formatDate(reading.start_at, { year: 'numeric', hour: '2-digit', minute: '2-digit' })}–{clock(reading.end_at)} WIB · {min(reading.covered_s)}</p><div className="assessment-detail-grid"><DataField label="Instrument source" value={reading.instrument_id} /><DataField label="Profile" value={reading.profile ? `${reading.profile.name} · v${reading.profile.version}` : 'Profile unavailable'} note={reading.profile ? `Criterion ${reading.profile.criterion_dba} dBA · exchange ${reading.profile.exchange_rate_db} dB · ${reading.profile.reference_hours} hours · threshold ${reading.profile.integration_threshold_dba ?? 'unavailable'} dBA` : undefined} /><DataField label="Interval contribution" value={reading.scope === 'area' ? 'Personal dose not established' : reading.dose_contribution_pct === null ? 'Dose contribution unavailable' : `${number(reading.dose_contribution_pct)}%`} note={`For ${min(reading.covered_s)} in this interval; not a full-shift dose`} /><DataField label="Identity & scope" value={reading.scope === 'personal' ? reading.worker_id || 'Identity unavailable' : `Area ${reading.station_id}`} /></div><p>{reading.finding} — {reading.rationale}</p></section>)}</div> : <EmptyState icon={Volume2} compact title="Readings unavailable" description="Noise levels in dBA, instrument, intervals, personal or area scope, and profile have not been provided." />}
    {snapshot.noise.daily_doses.length > 0 && <div className="dose-day-summary"><h3>Personal contribution per day</h3>{snapshot.noise.daily_doses.map(day => <div key={day.date}><span>{formatDate(day.date)}</span><strong>{day.pct === null ? 'Unavailable' : number(day.pct) + '%'}</strong><span>{min(day.covered_s)} covered</span>{day.reason && <small>{day.reason}</small>}</div>)}<p>Daily dose contributions are not summed into a weekly dose.</p></div>}
  </>}<div className="snapshot-scope detail-snapshot"><span>{snapshot.scope.snapshotId}</span><span>Revision {snapshot.scope.revision}</span></div><div className="dialog-actions"><button className="button button-dark" onClick={onClose}>Close details</button></div></Dialog>;
}

function EvidenceDialog({ kind, snapshot, recordings, playback, onClose }: { kind: 'msd' | 'noise'; snapshot: EmployeeAssessmentSnapshot; recordings: Recording[]; playback: Record<string, string>; onClose: () => void }) {
  const entries = snapshot.evidence.filter(item => item.kind === kind);
  const [selected, setSelected] = useState(entries[0] || null);
  const player = useRef<HTMLVideoElement>(null);
  const [mediaError, setMediaError] = useState('');
  const recording = selected ? recordings.find(item => item.id === selected.recordingId) : undefined;
  const url = recording?.playback_url || (selected ? playback[selected.recordingId] : undefined);
  function select(entry: ExposureEvidence) { setSelected(entry); setMediaError(''); if (player.current && entry.recordingId === selected?.recordingId) player.current.currentTime = entry.start_s; }
  return <Dialog title={`Recording Evidence · ${kind === 'msd' ? 'MSD' : 'Noise'}`} onClose={onClose} wide><div className="evidence-dialog-summary"><Users size={18} /><p>{snapshot.worker.name} · {snapshot.worker.id}<span>Associated through manual recording labels.</span></p>{kind === 'noise' && <Badge tone="demo">Simulated</Badge>}</div>{selected ? <><div className="exposure-evidence-player">{url && !mediaError ? <video key={selected.recordingId + url} ref={player} controls playsInline preload="metadata" src={url} aria-label="Employee exposure evidence player" onLoadedMetadata={() => { if (player.current) player.current.currentTime = selected.start_s; }} onError={() => setMediaError('The recording could not be played.')} /> : <div><FileVideo size={33} strokeWidth={1.3} /><h3>Recording unavailable</h3><p>{mediaError || 'Evidence metadata is available; no actual video file is linked.'}</p><strong>{selected.filename || 'Recording filename unavailable'}</strong><span>{selected.cameraId ? `Camera ${selected.cameraId}` : 'Camera unavailable'} · {time(selected.start_s)}–{time(selected.end_s)}</span></div>}</div><div className="selected-evidence-meta"><span><Camera size={14} />{selected.cameraId ? `Camera ${selected.cameraId}` : 'Camera unavailable'} · {selected.stationId || 'Location unavailable'}</span><span><Clock3 size={14} />{time(selected.start_s)}–{time(selected.end_s)}</span><p><TagIcon />{selected.subjectLabel || 'Manual subject identifier unavailable'}</p></div><div className="exposure-evidence-list">{entries.map(entry => <button key={entry.id} className={selected.id === entry.id ? 'active' : ''} onClick={() => select(entry)}><span><Camera size={15} />{entry.cameraId ? `Camera ${entry.cameraId}` : 'Source unknown'}</span><div><strong>{entry.title}</strong><small>{entry.filename || 'Incomplete recording metadata'}</small></div><span>{time(entry.start_s)}–{time(entry.end_s)}</span></button>)}</div></> : <EmptyState icon={FileSearch} title="Evidence unavailable" description="A camera source, recording, subject label, and timestamp are required to display evidence." compact />}<div className="dialog-actions">{selected && <a href={`/recordings/${selected.recordingId}`} className="button button-outline" onClick={onClose}>Recording details<ArrowUpRight size={14} /></a>}<button className="button button-dark" onClick={onClose}>Close evidence</button></div></Dialog>;
}

function TagIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3H12L21 12L12 21L3 12V3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><circle cx="7.5" cy="7.5" r="1.4" fill="currentColor" /></svg>; }

function LocalReviewDialog({ snapshot, current, previous, onClose }: { snapshot: EmployeeAssessmentSnapshot; current: EmployeeAssessmentSnapshot; previous: LocalHseReview | null; onClose: () => void }) {
  const [reviewer, setReviewer] = useState(previous?.reviewer || '');
  const [notes, setNotes] = useState(previous?.notes || '');
  const [error, setError] = useState('');
  const stale = snapshot.scopeKey !== current.scopeKey;
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const decision = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'needs_evidence' ? 'needs_evidence' : 'reviewed';
    try { saveLocalReview(snapshot, current, { status: decision, reviewer, notes }); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The review could not be saved.'); }
  }
  return <Dialog title={`Review · ${snapshot.worker.name}`} onClose={onClose} wide><div className="review-scope-note"><ClipboardCheck size={20} /><div><strong>Snapshot under review</strong><p>{snapshot.worker.id} · {snapshot.scope.period === 'day' ? 'Daily' : snapshot.scope.period === 'week' ? 'Weekly' : 'Monthly'} · {formatDate(snapshot.scope.from)}–{formatDate(snapshot.scope.to)}<span>{snapshot.scope.snapshotId} · revision {snapshot.scope.revision}</span></p></div></div><div className="review-snapshot-summary"><DataField label="MSD" value={snapshot.msd.score === null ? 'REBA unavailable' : `REBA ${snapshot.msd.score} · ${snapshot.msd.band}`} /><DataField label="Noise · Simulated" value={snapshot.noise.status} /><DataField label="Valid observation" value={min(snapshot.valid_s)} /></div>{stale && <div className="error-message" role="alert"><AlertCircle size={17} /><p>The snapshot changed during review. Close and reopen the review to use the latest revision.</p></div>}<form onSubmit={submit}><label className="field">HSE reviewer name / ID<input required value={reviewer} onChange={event => setReviewer(event.target.value)} placeholder="Reviewer name or ID" autoComplete="name" /></label><label className="field">HSE notes<textarea required minLength={5} rows={4} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Record the evidence reviewed, missing context, actions, owners, and follow-up plans…" /></label><div className="local-review-explanation"><Info size={15} /><p>Saved only in this browser.{snapshot.scope.source === 'example' && ' Demo results.'}</p></div>{error && <div className="error-message" role="alert"><AlertCircle size={17} /><p>{error}</p></div>}<div className="dialog-actions local-review-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button type="submit" value="needs_evidence" className="button button-outline" disabled={stale}><FileSearch size={15} />Mark as needing evidence</button><button type="submit" value="reviewed" className="button button-dark" disabled={stale}><Check size={15} />Save review</button></div></form></Dialog>;
}
