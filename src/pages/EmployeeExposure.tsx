import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertCircle, ArrowLeft, ArrowUpRight, CalendarDays, Camera, Check, ChevronRight, ClipboardCheck, Clock3, FileSearch, FileText, FileVideo, Info, Layers3, MapPin, MessageSquareText, Search, ShieldCheck, Timer, TrendingUp, Users, Volume2 } from 'lucide-react';
import { Badge, Dialog, EmptyState, PageTitle } from '../components/UI';
import ExposureChart from '../components/ExposureChart';
import NoiseHistoryChart from '../components/NoiseHistoryChart';
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

const number = (value: number, digits = 1) => value.toLocaleString('id-ID', { maximumFractionDigits: digits });
const min = (seconds: number) => `${number(seconds / 60)} menit`;
const clock = (timestamp: string) => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
const bandTone = (band: string | null) => band === 'High' ? 'danger' : band === 'Medium' ? 'warning' : band === 'Low' ? 'success' : 'neutral';
const reviewLabel = (review: LocalHseReview | null) => review?.status === 'reviewed' ? 'Sudah direview HSE' : review?.status === 'needs_evidence' ? 'Perlu bukti' : 'Belum direview';

export default function EmployeeExposure(props: EmployeeExposureProps) {
  const { workerId, workers, windows, recordings, date, setDate, example, setPeriod, noiseReadings = [], playback = {} } = props;
  const worker = workers.find(item => item.id === workerId);
  const period = props.period === 'day' ? 'day' : 'week';
  const range = dateRange(date, period);
  const reviews = useLocalReviews();
  const snapshot = useMemo(() => worker ? buildEmployeeSnapshot({ worker, windows, recordings, noiseReadings, period, ...range, example }) : null, [worker, windows, recordings, noiseReadings, period, range.from, range.to, example]);
  const review = snapshot ? reviewForSnapshot(reviews, snapshot) : null;
  const hasEarlierReview = snapshot ? Object.values(reviews).some(item => item.snapshotId === snapshot.scope.snapshotId && item.source === snapshot.scope.source && item.revision !== snapshot.scope.revision) : false;
  const [detail, setDetail] = useState<'msd' | 'noise' | null>(null);
  const [evidence, setEvidence] = useState<'msd' | 'noise' | null>(null);
  const [reviewing, setReviewing] = useState<EmployeeAssessmentSnapshot | null>(null);
  useEffect(() => { if (props.period === 'month') setPeriod('week'); }, [props.period, setPeriod]);
  useEffect(() => { setDetail(null); setEvidence(null); setReviewing(null); }, [workerId, period, date]);
  if (!worker || !snapshot) return <><PageTitle eyebrow="DETAIL PEGAWAI" title="Pegawai Belum Tersedia" description="Pilih pegawai dari daftar untuk membuka rekap paparan dan riwayatnya." /><a href="#/employees" className="button button-dark"><ArrowLeft size={15} />Dashboard pegawai</a></>;
  const hasData = snapshot.windows.length > 0 || snapshot.noise.readings.length > 0;
  const reviewTone = review?.status === 'reviewed' ? 'success' : review?.status === 'needs_evidence' ? 'warning' : 'neutral';
  return <>
    <a href="#/employees" className="back-link"><ArrowLeft size={14} />Dashboard pegawai</a>
    <PageTitle eyebrow={`PEGAWAI / ${worker.id}`} title={worker.name} description={`${worker.department} · Paparan kerja, bukti, dan kebutuhan intervensi`} actions={<><label className="date-filter"><CalendarDays size={15} /><input aria-label="Tanggal akhir rekap" type="date" value={date} onChange={event => { if (event.target.value) setDate(event.target.value); }} /></label><div className="period-tabs employee-period-tabs" aria-label="Periode pegawai">{([['day', 'Harian'], ['week', 'Mingguan']] as const).map(([value, label]) => <button key={value} aria-pressed={period === value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>{label}</button>)}</div></>} />
    <section className="employee-context-card" aria-label="Ringkasan pegawai dan periode"><div className="employee-context-identity"><span className="context-avatar">{worker.initials}</span><div><strong>{worker.name}</strong><span>{worker.id} · {worker.department}</span></div><Badge tone={reviewTone} dot>{reviewLabel(review)}</Badge></div><div className="employee-context-fields"><ContextField icon={CalendarDays} label="Periode terpilih" value={`${formatDate(range.from)}–${formatDate(range.to, { year: 'numeric' })}`} /><ContextField icon={Clock3} label="Shift terjadwal" value="08.00–17.00 WIB" note="Jadwal, bukan waktu paparan" /><ContextField icon={MapPin} label="Lokasi teramati" value={snapshot.locations.length ? snapshot.locations.join(' · ') : 'Lokasi belum tersedia'} /><ContextField icon={Activity} label="Pembaruan hasil terakhir" value={snapshot.updated_at ? formatDate(snapshot.updated_at, { hour: '2-digit', minute: '2-digit' }) + ' WIB' : 'Belum ada pembaruan hasil'} /></div><div className="context-snapshot-id"><Badge tone={example ? 'demo' : 'neutral'}>{example ? 'Data demo' : 'Data layanan'}</Badge><span>{snapshot.scope.snapshotId}</span><span>Revisi {snapshot.scope.revision}</span>{hasEarlierReview && !review && <Badge tone="info">Revisi baru · belum direview</Badge>}</div></section>
    <Coverage snapshot={snapshot} />
    <div className="exposure-assessment-grid">
      <MsdCard snapshot={snapshot} review={review} onDetails={() => setDetail('msd')} onEvidence={() => setEvidence('msd')} />
      <NoiseCard snapshot={snapshot} unavailableReason={props.noiseUnavailableReason} onDetails={() => setDetail('noise')} onEvidence={() => setEvidence('noise')} />
    </div>
    <section className="secondary-measurement-context" aria-label="Konteks instrumen tambahan"><div><h2>Konteks Instrumen Tambahan</h2><Badge>Belum tersedia</Badge></div><section><DataField label="Suhu tubuh" value="Data belum tersedia" note="Metode pengukuran dan timestamp diperlukan" /><DataField label="Suhu ruangan" value="Data belum tersedia" note="Pembacaan instrumen yang sesuai lokasi diperlukan" /><DataField label="Kelembapan ruangan" value="Data belum tersedia" note="Nilai RH dan interval pengukuran diperlukan" /></section></section>
    <section className="employee-hse-section" aria-labelledby="hse-review-title"><div className="employee-hse-heading"><span><ClipboardCheck size={25} strokeWidth={1.5} /></span><div><span className="eyebrow">HUMAN IN THE LOOP</span><h2 id="hse-review-title">Tinjauan HSE</h2><p>Catatan dan keputusan terikat pada pegawai, periode, serta snapshot yang sedang ditampilkan.</p></div><Badge tone={reviewTone} dot>{reviewLabel(review)}</Badge></div><div className="employee-hse-body"><div><h3>Catatan HSE</h3><p className={review ? 'saved-hse-notes' : ''}>{review?.notes || 'Belum ada catatan HSE untuk snapshot ini.'}</p>{review && <small>{review.reviewer} · {formatDate(review.savedAt, { hour: '2-digit', minute: '2-digit' })} WIB · tersimpan lokal</small>}<div className="snapshot-scope"><span>{snapshot.scope.snapshotId}</span><span>Revisi {snapshot.scope.revision}</span></div></div><button className="button button-dark" disabled={!hasData} onClick={() => setReviewing(snapshot)}><MessageSquareText size={16} />Tinjau hasil periode ini<ArrowUpRight size={15} /></button></div><div className="hse-local-note"><Info size={13} />Review disimpan pada browser ini. Hasil asesmen tetap terlihat sebelum review.</div></section>
    <section className="employee-evidence-history"><div className="exposure-subsection-title"><h2><FileVideo size={18} />Riwayat Hasil Analisis</h2><span>{snapshot.spans.length} rekaman pada periode terpilih</span></div>{snapshot.spans.length ? <div className="evidence-history-list">{snapshot.spans.map(span => {
      const recording = recordings.find(item => item.id === span.recordingId);
      return <div key={span.recordingId}><span className="history-record-icon"><Camera size={19} /></span><div><strong>{recording ? `Kamera ${recording.camera_id} · ${recording.station_id}` : 'Metadata sumber belum tersedia'}</strong><p>{recording?.filename || span.recordingId}</p><small>{formatDate(span.start_at, { hour: '2-digit', minute: '2-digit' })}–{clock(span.end_at)} WIB · {min(span.usable_s)} valid</small></div><Badge>{recording?.playback_url || playback[span.recordingId] ? 'Video tersedia' : 'Rekaman belum tersedia'}</Badge><button className="text-link" onClick={() => setEvidence('msd')}>Lihat bukti<ArrowUpRight size={14} /></button></div>;
    })}</div> : <EmptyState compact icon={FileSearch} title="Belum ada bukti rekaman pada periode ini" description="Sumber kamera, label manual, rekaman, dan timestamp akan ditampilkan saat tersedia." />}</section>
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
  return <section className="assessment-coverage" aria-label="Coverage pengamatan"><div><span className="coverage-icon"><Search size={20} /></span><div><h2>Cakupan pengamatan</h2><p><strong>{min(snapshot.valid_s)} valid</strong> dari {min(snapshot.recorded_s)} rekaman<span>·</span>{snapshot.recorded_s ? `${number(pct)}% valid` : 'Cakupan belum tersedia'}</p></div></div><div className="coverage-progress-area"><div className="coverage-progress" role="progressbar" aria-label="Persentase pengamatan valid" aria-valuenow={Number(pct.toFixed(1))} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div><p>{min(snapshot.unknown_s)} belum valid / Unknown<span>·</span>{snapshot.observed_days} dari {snapshot.period_days} hari memiliki observasi valid</p></div><div className="coverage-period-windows">{snapshot.spans.slice(0, 3).map(span => <span key={span.recordingId}><Clock3 size={11} />{formatDate(span.start_at)} · {clock(span.start_at)}–{clock(span.end_at)} WIB</span>)}{snapshot.spans.length > 3 && <span>+{snapshot.spans.length - 3} cuplikan lainnya</span>}{!snapshot.spans.length && <span>Bagian periode yang memiliki data belum tersedia.</span>}</div></section>;
}

function MsdCard({ snapshot, review, onDetails, onEvidence }: { snapshot: EmployeeAssessmentSnapshot; review: LocalHseReview | null; onDetails: () => void; onEvidence: () => void }) {
  const msd = snapshot.msd;
  const main = msd.findings[0];
  const evidence = snapshot.evidence.filter(item => item.kind === 'msd');
  return <article className="exposure-card msd-exposure-card" aria-labelledby="msd-card-title"><header className="exposure-card-header"><div><span className="exposure-card-icon"><Activity size={23} strokeWidth={1.6} /></span><div><span className="eyebrow">MUSCULOSKELETAL EXPOSURE</span><h2 id="msd-card-title">Paparan MSD</h2></div></div><Badge tone={bandTone(msd.band)}>{msd.band || 'Risiko belum dinilai'}</Badge></header>
    <div className={`msd-score-summary msd-summary-${bandTone(msd.band)}`}><div><span>SKOR REBA</span><strong>{msd.score ?? '—'}<small>/ 15</small></strong></div><div><Badge tone={review?.status === 'reviewed' ? 'success' : 'neutral'}>{review?.status === 'reviewed' ? 'Sudah direview HSE · lokal' : 'Hasil AI'}</Badge><p>{msd.score === null ? 'Skor REBA belum tersedia.' : review?.status === 'reviewed' ? 'Review berlaku untuk snapshot dan revisi ini.' : reviewLabel(review)}{snapshot.scope.period !== 'day' && msd.score !== null && <span>Skor tertinggi pada periode, bukan penjumlahan.</span>}</p>{msd.immediate_action && <Badge tone="danger">Tindakan segera · konfirmasi HSE</Badge>}</div></div>
    <div className="exposure-primary-finding"><span>Temuan utama</span><h3>{main?.region ? `Paparan ${main.region.toLowerCase()}` : 'Bagian tubuh belum tersedia'}</h3><strong>{main?.activity || 'Aktivitas / postur terkait belum tersedia'}</strong><p>{main?.rationale || 'Temuan, konteks aktivitas, dan alasan penilaian belum tersedia pada periode ini.'}</p></div>
    <div className="msd-duration-block"><div><span>Durasi paparan</span><strong>{min(msd.exposure_s)}<small> dari {min(snapshot.valid_s)} valid</small></strong></div><span>{msd.exposure_pct === null ? '—' : `${number(msd.exposure_pct)}%`}</span><div className="exposure-duration-track"><span style={{ width: `${Math.min(100, msd.exposure_pct || 0)}%` }} /></div></div>
    <div className="exposure-metric-grid"><ExposureMetric icon={Timer} label="Holding time terlama" value={msd.longest_hold_s === null ? '—' : `${number(msd.longest_hold_s)} detik`} note={msd.longest_hold_s === null ? 'Data holding time belum tersedia' : `${msd.static_holds} static hold teramati`} /><ExposureMetric icon={Layers3} label="Jumlah kejadian" value={msd.event_count === null ? '—' : String(msd.event_count)} note={msd.event_count === null ? 'Segmentasi kejadian belum tersedia' : 'Episode unik pada periode'} /><ExposureMetric icon={TrendingUp} label="Poin paparan kumulatif" value={msd.points === null ? '—' : `${number(msd.points)} poin`} note="Metrik prototipe RAISE" accent /><ExposureMetric icon={Clock3} label="Poin per jam pengamatan" value={msd.points_per_hour === null ? '—' : `${number(msd.points_per_hour)} poin/jam`} note={msd.points_per_hour === null ? 'Poin dan waktu valid diperlukan' : `Berdasarkan ${min(snapshot.valid_s)} valid`} /></div>
    {!msd.points_complete && <div className="exposure-missing-note"><Info size={14} />Sebagian interval valid belum memiliki perhitungan poin. Total yang tersedia bersifat parsial.</div>}
    <div className="exposure-trend-heading"><h3>Tren Paparan {snapshot.scope.period === 'day' ? 'Harian' : 'Mingguan'}</h3><Badge>Metrik prototipe</Badge></div><ExposureChart windows={snapshot.windows} from={snapshot.scope.from} to={snapshot.scope.to} compact />
    <Interventions items={msd.interventions} missing="Rekomendasi belum tersedia. Temuan dan konteks tugas diperlukan." />
    <EvidenceSummary evidence={evidence} onOpen={onEvidence} />
    <div className="exposure-card-actions"><button className="button button-outline" onClick={onDetails}><FileText size={15} />Rincian penilaian<ArrowUpRight size={14} /></button><button className="button button-dark" onClick={onEvidence}><FileVideo size={15} />Buka bukti<ArrowUpRight size={14} /></button></div>
  </article>;
}

function NoiseCard({ snapshot, unavailableReason, onDetails, onEvidence }: { snapshot: EmployeeAssessmentSnapshot; unavailableReason?: string; onDetails: () => void; onEvidence: () => void }) {
  const noise = snapshot.noise;
  const levels = noise.levels;
  const level = levels.length ? levels.length === 1 ? number(levels[0]) : `${number(levels[0])}–${number(levels.at(-1)!)}` : '—';
  const doses = noise.daily_doses.filter(day => day.pct !== null);
  const doseRange = doses.length ? [Math.min(...doses.map(day => day.pct!)), Math.max(...doses.map(day => day.pct!))] : null;
  const dose = doseRange ? doseRange[0] === doseRange[1] ? `${number(doseRange[0])}%` : `${number(doseRange[0])}–${number(doseRange[1])}%` : '—';
  const profiles = [...new Map(noise.readings.flatMap(reading => reading.profile ? [[reading.profile.id, reading.profile] as const] : [])).values()];
  const first = noise.readings[0], last = noise.readings.at(-1);
  const profileLabel = profiles.length === 1 ? `${profiles[0].name} · ${profiles[0].reference_hours} jam acuan` : profiles.length ? `${profiles.length} profil pengukuran · lihat rincian` : 'Profil perhitungan belum tersedia';
  return <article className="exposure-card noise-exposure-card" aria-labelledby="noise-card-title"><header className="exposure-card-header"><div><span className="exposure-card-icon"><Volume2 size={23} strokeWidth={1.6} /></span><div><span className="eyebrow">NIHL · KONTEKS PAPARAN KERJA</span><h2 id="noise-card-title">Paparan Kebisingan</h2></div></div><Badge tone="demo">Simulasi</Badge></header>
    <div className="noise-assessment-banner"><span><ClipboardCheck size={18} /></span><div><span>Status asesmen</span><strong>{noise.status}</strong><p>Status mengikuti data pengukuran pada fixture.</p></div></div>
    <div className="exposure-primary-finding"><span>Temuan utama</span><h3>{noise.finding}</h3><p>{unavailableReason && !noise.readings.length ? unavailableReason : noise.rationale}</p></div>
    <div className="noise-reading-summary"><div><span>Nilai kebisingan</span><strong>{level}<small>dBA</small></strong></div><div><span>Periode pengukuran</span><strong>{first && last ? snapshot.scope.period === 'day' ? `${clock(first.start_at)}–${clock(last.end_at)} WIB` : `${formatDate(first.start_at)}–${formatDate(last.end_at)}` : 'Interval belum tersedia'}</strong><p>{noise.readings.length ? `${noise.readings.length} interval · ${min(noise.covered_s)} tercakup` : 'Durasi pengukuran belum tersedia'}</p></div></div>
    <div className="noise-measurement-fields"><DataField label="Cakupan pengukuran" value={noise.scopes.length ? noise.scopes.map(scope => scope === 'personal' ? 'Personal' : 'Area').join(' + ') : 'Personal / area belum diketahui'} note={noise.scopes.length ? `Personal ${min(noise.personal_s)} · Area ${min(noise.area_s)}` : 'Jenis dan subjek instrumen belum tersedia'} /><DataField label="Durasi paparan tercakup" value={noise.readings.length ? min(noise.covered_s) : '—'} note="Hanya interval pengukuran, bukan seluruh shift" /><DataField label="Kontribusi dosis" value={dose} note={doses.length ? snapshot.scope.period === 'day' ? `Untuk ${min(doses[0].covered_s)} pengukuran personal pada hari ini` : 'Rentang kontribusi per hari terukur; tidak dijumlahkan antarshift' : noise.scopes.includes('area') && !noise.scopes.includes('personal') ? 'Pembacaan area tidak menetapkan dosis personal' : noise.daily_doses[0]?.reason || 'Nilai personal dan profil lengkap diperlukan'} /><DataField label="Profil perhitungan" value={profileLabel} note={profiles.length === 1 ? `${profiles[0].criterion_dba} dBA / exchange ${profiles[0].exchange_rate_db} dB · v${profiles[0].version}` : 'Profil contoh tidak menyatakan cakupan satu shift penuh'} /></div>
    <div className="exposure-trend-heading"><h3>Riwayat Kebisingan {snapshot.scope.period === 'day' ? 'Harian' : 'Mingguan'}</h3><Badge tone="demo">Simulasi</Badge></div><NoiseHistoryChart readings={noise.readings} from={snapshot.scope.from} to={snapshot.scope.to} />
    <Interventions items={noise.interventions} missing="Rekomendasi menunggu nilai pengukuran, scope, dan status asesmen." />
    <div className="noise-source-note"><Volume2 size={15} /><p><strong>Sumber pembacaan · Simulasi</strong>{noise.readings.length ? [...new Set(noise.readings.map(reading => reading.instrument_id))].join(' · ') : 'Identitas instrumen dan interval pembacaan belum tersedia.'}</p></div>
    <EvidenceSummary evidence={snapshot.evidence.filter(item => item.kind === 'noise')} onOpen={onEvidence} />
    <div className="exposure-card-actions"><button className="button button-outline" onClick={onDetails}><FileText size={15} />Rincian pengukuran<ArrowUpRight size={14} /></button><button className="button button-dark" onClick={onEvidence}><FileVideo size={15} />Buka bukti<ArrowUpRight size={14} /></button></div>
  </article>;
}

function ExposureMetric({ icon: Icon, label, value, note, accent = false }: { icon: typeof Timer; label: string; value: string; note: string; accent?: boolean }) {
  const parts = value.match(/^([\d.,]+)\s+(.+)$/);
  return <div className={`exposure-mini-metric ${accent ? 'exposure-mini-accent' : ''}`}><span><Icon size={14} />{label}</span><strong>{parts ? <>{parts[1]}<small> {parts[2]}</small></> : value}</strong><small>{note}</small></div>;
}

function DataField({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="assessment-data-field"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

function Interventions({ items, missing }: { items: ExposureIntervention[]; missing: string }) {
  return <section className="exposure-interventions"><h3><ShieldCheck size={16} />Rekomendasi intervensi</h3>{items.length ? items.slice(0, 2).map(item => <div key={item.id}><Badge tone={item.priority === 'P1' ? 'danger' : item.priority === 'P2' ? 'warning' : 'neutral'}>Prioritas {item.priority}</Badge><strong>{item.action}</strong><p>{item.reason}</p></div>) : <p className="exposure-missing-note">{missing}</p>}</section>;
}

function EvidenceSummary({ evidence, onOpen }: { evidence: ExposureEvidence[]; onOpen: () => void }) {
  return <div className="exposure-evidence-summary"><span><Camera size={15} />Bukti & sumber</span>{evidence.length ? <><p>{[...new Set(evidence.map(item => item.cameraId ? `Kamera ${item.cameraId}` : 'Kamera belum diketahui'))].join(' · ')}<span>·</span>{new Set(evidence.map(item => item.recordingId)).size} rekaman</p><button onClick={onOpen}>{time(evidence[0].start_s)}–{time(evidence[0].end_s)}<span>Timestamp relevan</span><ChevronRight size={14} /></button></> : <p>Kamera, rekaman, dan timestamp belum tersedia.</p>}</div>;
}

function AssessmentDetail({ kind, snapshot, review, onClose }: { kind: 'msd' | 'noise'; snapshot: EmployeeAssessmentSnapshot; review: LocalHseReview | null; onClose: () => void }) {
  return <Dialog title={kind === 'msd' ? 'Rincian Penilaian MSD' : 'Rincian Pengukuran Kebisingan'} onClose={onClose} wide><div className="assessment-detail-context"><Badge tone={snapshot.scope.source === 'example' ? 'demo' : 'neutral'}>{snapshot.scope.source === 'example' ? 'Fixture tampilan' : 'Hasil layanan'}</Badge><strong>{snapshot.worker.name} · {formatDate(snapshot.scope.from)}–{formatDate(snapshot.scope.to)}</strong><span>{reviewLabel(review)}</span></div>{kind === 'msd' ? <>
    <div className="assessment-detail-grid"><DataField label="REBA" value={snapshot.msd.score === null ? 'Skor belum tersedia' : `${snapshot.msd.score} / 15 · ${snapshot.msd.band}`} note={review?.status === 'reviewed' ? 'Sudah direview HSE pada snapshot ini (lokal)' : 'Hasil AI · belum direview HSE'} /><DataField label="Bagian tubuh" value={snapshot.msd.findings.map(finding => finding.region || 'Belum tersedia').join(' · ') || 'Belum tersedia'} /><DataField label="Holding time terlama" value={snapshot.msd.longest_hold_s === null ? 'Data belum tersedia' : `${snapshot.msd.longest_hold_s} detik`} /><DataField label="Jumlah episode" value={snapshot.msd.event_count === null ? 'Segmentasi belum tersedia' : `${snapshot.msd.event_count} kejadian · ${snapshot.msd.static_holds} static hold`} /><DataField label="Subtotal Table C" value={snapshot.msd.table_c_values.length ? snapshot.msd.table_c_values.join(' · ') : 'Input Table C belum tersedia'} /><DataField label="Tambahan holding time" value={snapshot.msd.extra_hold_s === null ? 'Konteks holding belum lengkap' : min(snapshot.msd.extra_hold_s)} note="Trigger 30 detik pada fixture; hanya hold dengan konteks lengkap" /></div>
    <div className="prototype-breakdown"><Badge tone="info">Metrik prototipe</Badge><h3>Perhitungan paparan kumulatif</h3><p>Poin = Σ w × (durasi paparan + tambahan hold).</p><strong>{snapshot.msd.points === null ? 'Perhitungan poin belum tersedia' : `${number(snapshot.msd.points)} poin · ${snapshot.msd.points_per_hour === null ? 'Rate belum tersedia' : number(snapshot.msd.points_per_hour) + ' poin/jam valid'}`}</strong><p>Bobot Table C: 1 untuk 1–3, 2 untuk 4–7, 3 untuk 8–12. Activity adjustment REBA tidak ditambahkan kembali ke poin.</p></div>
    <h3 className="modal-section-title">Konteks input penilaian</h3><div className="assessment-input-context">{snapshot.msd.input_context.length ? snapshot.msd.input_context.map((field, index) => <DataField key={`${field.field}-${index}`} label={field.field} value={field.value ?? 'Data belum tersedia'} />) : <p>Load/force, coupling, support, sisi tubuh, dan rincian worksheet belum tersedia.</p>}</div>
  </> : <>
    <div className="measurement-status-detail"><Volume2 size={20} /><div><strong>{snapshot.noise.status}</strong><p>{snapshot.noise.rationale}</p></div><Badge tone="demo">Simulasi</Badge></div>
    {snapshot.noise.readings.length ? <div className="noise-reading-details">{snapshot.noise.readings.map(reading => <section key={reading.id}><div><h3>{reading.scope === 'personal' ? 'Personal' : 'Area'} · {reading.level_dba === null ? 'Nilai dBA belum tersedia' : `${number(reading.level_dba)} dBA`}</h3><Badge tone="demo">Simulasi</Badge></div><p>{formatDate(reading.start_at, { year: 'numeric', hour: '2-digit', minute: '2-digit' })}–{clock(reading.end_at)} WIB · {min(reading.covered_s)}</p><div className="assessment-detail-grid"><DataField label="Sumber instrumen" value={reading.instrument_id} /><DataField label="Profil" value={reading.profile ? `${reading.profile.name} · v${reading.profile.version}` : 'Profil belum tersedia'} note={reading.profile ? `Criterion ${reading.profile.criterion_dba} dBA · exchange ${reading.profile.exchange_rate_db} dB · ${reading.profile.reference_hours} jam · threshold ${reading.profile.integration_threshold_dba ?? 'belum tersedia'} dBA` : undefined} /><DataField label="Kontribusi interval" value={reading.scope === 'area' ? 'Dosis personal tidak ditetapkan' : reading.dose_contribution_pct === null ? 'Kontribusi dosis belum tersedia' : `${number(reading.dose_contribution_pct)}%`} note={`Untuk ${min(reading.covered_s)} interval ini; bukan dosis shift lengkap`} /><DataField label="Identitas & scope" value={reading.scope === 'personal' ? reading.worker_id || 'Identitas belum tersedia' : `Area ${reading.station_id}`} /></div><p>{reading.finding} — {reading.rationale}</p></section>)}</div> : <EmptyState icon={Volume2} compact title="Pembacaan belum tersedia" description="Nilai dBA, instrumen, interval, scope personal/area, dan profil belum disediakan." />}
    {snapshot.noise.daily_doses.length > 0 && <div className="dose-day-summary"><h3>Kontribusi personal per hari</h3>{snapshot.noise.daily_doses.map(day => <div key={day.date}><span>{formatDate(day.date)}</span><strong>{day.pct === null ? 'Belum tersedia' : number(day.pct) + '%'}</strong><span>{min(day.covered_s)} tercakup</span>{day.reason && <small>{day.reason}</small>}</div>)}<p>Kontribusi dosis tidak dijumlahkan antarhari menjadi dosis mingguan.</p></div>}
  </>}<div className="snapshot-scope detail-snapshot"><span>{snapshot.scope.snapshotId}</span><span>Revisi {snapshot.scope.revision}</span></div><div className="dialog-actions"><button className="button button-dark" onClick={onClose}>Tutup rincian</button></div></Dialog>;
}

function EvidenceDialog({ kind, snapshot, recordings, playback, onClose }: { kind: 'msd' | 'noise'; snapshot: EmployeeAssessmentSnapshot; recordings: Recording[]; playback: Record<string, string>; onClose: () => void }) {
  const entries = snapshot.evidence.filter(item => item.kind === kind);
  const [selected, setSelected] = useState(entries[0] || null);
  const player = useRef<HTMLVideoElement>(null);
  const [mediaError, setMediaError] = useState('');
  const recording = selected ? recordings.find(item => item.id === selected.recordingId) : undefined;
  const url = recording?.playback_url || (selected ? playback[selected.recordingId] : undefined);
  function select(entry: ExposureEvidence) { setSelected(entry); setMediaError(''); if (player.current && entry.recordingId === selected?.recordingId) player.current.currentTime = entry.start_s; }
  return <Dialog title={`Bukti Rekaman · ${kind === 'msd' ? 'MSD' : 'Kebisingan'}`} onClose={onClose} wide><div className="evidence-dialog-summary"><Users size={18} /><p>{snapshot.worker.name} · {snapshot.worker.id}<span>Asosiasi melalui label manual pada rekaman.</span></p>{kind === 'noise' && <Badge tone="demo">Simulasi</Badge>}</div>{selected ? <><div className="exposure-evidence-player">{url && !mediaError ? <video key={selected.recordingId + url} ref={player} controls playsInline preload="metadata" src={url} aria-label="Pemutar bukti paparan pegawai" onLoadedMetadata={() => { if (player.current) player.current.currentTime = selected.start_s; }} onError={() => setMediaError('File rekaman belum dapat diputar.')} /> : <div><FileVideo size={33} strokeWidth={1.3} /><h3>Rekaman belum tersedia</h3><p>{mediaError || 'Metadata bukti tersedia; file video aktual belum ditautkan.'}</p><strong>{selected.filename || 'Nama file rekaman belum tersedia'}</strong><span>{selected.cameraId ? `Kamera ${selected.cameraId}` : 'Kamera belum tersedia'} · {time(selected.start_s)}–{time(selected.end_s)}</span></div>}</div><div className="selected-evidence-meta"><span><Camera size={14} />{selected.cameraId ? `Kamera ${selected.cameraId}` : 'Kamera belum tersedia'} · {selected.stationId || 'Lokasi belum tersedia'}</span><span><Clock3 size={14} />{time(selected.start_s)}–{time(selected.end_s)}</span><p><TagIcon />{selected.subjectLabel || 'Penanda subjek pada label manual belum tersedia'}</p></div><div className="exposure-evidence-list">{entries.map(entry => <button key={entry.id} className={selected.id === entry.id ? 'active' : ''} onClick={() => select(entry)}><span><Camera size={15} />{entry.cameraId ? `Kamera ${entry.cameraId}` : 'Sumber belum diketahui'}</span><div><strong>{entry.title}</strong><small>{entry.filename || 'Metadata rekaman belum lengkap'}</small></div><span>{time(entry.start_s)}–{time(entry.end_s)}</span></button>)}</div></> : <EmptyState icon={FileSearch} title="Bukti belum tersedia" description="Sumber kamera, rekaman, label subjek, dan timestamp diperlukan untuk menampilkan bukti." compact />}<div className="dialog-actions">{selected && <a href={`#/recordings/${selected.recordingId}`} className="button button-outline" onClick={onClose}>Detail rekaman<ArrowUpRight size={14} /></a>}<button className="button button-dark" onClick={onClose}>Tutup bukti</button></div></Dialog>;
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
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Review belum tersimpan.'); }
  }
  return <Dialog title={`Review · ${snapshot.worker.name}`} onClose={onClose} wide><div className="review-scope-note"><ClipboardCheck size={20} /><div><strong>Snapshot yang sedang ditinjau</strong><p>{snapshot.worker.id} · {snapshot.scope.period === 'day' ? 'Harian' : 'Mingguan'} · {formatDate(snapshot.scope.from)}–{formatDate(snapshot.scope.to)}<span>{snapshot.scope.snapshotId} · revisi {snapshot.scope.revision}</span></p></div></div><div className="review-snapshot-summary"><DataField label="MSD" value={snapshot.msd.score === null ? 'REBA belum tersedia' : `REBA ${snapshot.msd.score} · ${snapshot.msd.band}`} /><DataField label="Kebisingan · Simulasi" value={snapshot.noise.status} /><DataField label="Pengamatan valid" value={min(snapshot.valid_s)} /></div>{stale && <div className="error-message" role="alert"><AlertCircle size={17} /><p>Snapshot berubah saat ditinjau. Tutup dan buka ulang tinjauan untuk menggunakan revisi terbaru.</p></div>}<form onSubmit={submit}><label className="field">Nama / identitas petugas HSE<input required value={reviewer} onChange={event => setReviewer(event.target.value)} placeholder="Nama atau ID reviewer" autoComplete="name" /></label><label className="field">Catatan HSE<textarea required minLength={5} rows={4} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Catat bukti yang ditinjau, konteks yang belum lengkap, tindakan, pemilik, dan rencana tindak lanjut…" /></label><div className="local-review-explanation"><Info size={15} /><p>Review ini disimpan sebagai state frontend lokal pada pegawai, periode, snapshotId, dan revision di atas.{snapshot.scope.source === 'example' && ' Hasil yang ditinjau adalah fixture tampilan.'}</p></div>{error && <div className="error-message" role="alert"><AlertCircle size={17} /><p>{error}</p></div>}<div className="dialog-actions local-review-actions"><button type="button" className="button button-outline" onClick={onClose}>Batal</button><button type="submit" value="needs_evidence" className="button button-outline" disabled={stale}><FileSearch size={15} />Tandai perlu bukti</button><button type="submit" value="reviewed" className="button button-dark" disabled={stale}><Check size={15} />Simpan review</button></div></form></Dialog>;
}
