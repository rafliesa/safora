import type { ExposureIntervention, MsdEpisode, NoiseReading } from './assessment-types';
import type { ObservationWindow, Recording, Worker } from './workforce';
import type { Period } from './types';
import { inDateRange, uniqueWindows } from './workforce';
import { localDate } from './utils';

export interface AssessmentScope {
  workerId: string;
  period: Period;
  from: string;
  to: string;
  snapshotId: string;
  revision: string;
  source: 'example' | 'service';
}

export interface ExposureEvidence {
  id: string;
  recordingId: string;
  cameraId: string | null;
  stationId: string | null;
  filename: string | null;
  recordedAt: string;
  start_s: number;
  end_s: number;
  subjectLabel: string | null;
  kind: 'msd' | 'noise';
  title: string;
}

export interface NoiseDailyDose {
  date: string;
  pct: number | null;
  covered_s: number;
  reason: string | null;
}

export interface EmployeeAssessmentSnapshot {
  scope: AssessmentScope;
  scopeKey: string;
  worker: Worker;
  windows: ObservationWindow[];
  recorded_s: number;
  valid_s: number;
  unknown_s: number;
  observed_days: number;
  period_days: number;
  updated_at: string | null;
  locations: string[];
  spans: { recordingId: string; start_at: string; end_at: string; usable_s: number }[];
  evidence: ExposureEvidence[];
  msd: {
    score: number | null;
    band: 'Low' | 'Medium' | 'High' | null;
    immediate_action: boolean;
    findings: { region: string | null; activity: string | null; rationale: string; duration_s: number }[];
    exposure_s: number;
    exposure_pct: number | null;
    longest_hold_s: number | null;
    event_count: number | null;
    static_holds: number | null;
    episodes: MsdEpisode[];
    points: number | null;
    points_per_hour: number | null;
    points_complete: boolean;
    extra_hold_s: number | null;
    table_c_values: number[];
    interventions: ExposureIntervention[];
    input_context: { field: string; value: string | null }[];
  };
  noise: {
    readings: NoiseReading[];
    status: string;
    finding: string;
    rationale: string;
    levels: number[];
    covered_s: number;
    personal_s: number;
    area_s: number;
    scopes: ('personal' | 'area')[];
    daily_doses: NoiseDailyDose[];
    interventions: ExposureIntervention[];
  };
}

export function msdBand(score: number | null): 'Low' | 'Medium' | 'High' | null {
  if (score === null || !Number.isInteger(score) || score < 1 || score > 15) return null;
  return score <= 3 ? 'Low' : score <= 7 ? 'Medium' : 'High';
}

function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function dedupeInterventions(items: ExposureIntervention[]): ExposureIntervention[] {
  return [...new Map(items.map(item => [item.id, item])).values()].sort((a, b) => a.priority.localeCompare(b.priority));
}

function unionSeconds(readings: NoiseReading[]): number {
  const intervals = readings.map(reading => [new Date(reading.start_at).getTime(), new Date(reading.end_at).getTime()]).sort((a, b) => a[0] - b[0]);
  let total = 0, start = 0, end = 0;
  for (const [left, right] of intervals) {
    if (right <= left) continue;
    if (left > end) { total += Math.max(0, end - start); start = left; end = right; }
    else end = Math.max(end, right);
  }
  return (total + Math.max(0, end - start)) / 1000;
}

function overlaps(readings: NoiseReading[]): boolean {
  const sorted = [...readings].sort((a, b) => a.start_at.localeCompare(b.start_at));
  let end = 0;
  for (const reading of sorted) {
    const start = new Date(reading.start_at).getTime();
    if (start < end) return true;
    end = Math.max(end, new Date(reading.end_at).getTime());
  }
  return false;
}

export function noiseDailyDoses(readings: NoiseReading[]): NoiseDailyDose[] {
  const personal = readings.filter(reading => reading.scope === 'personal');
  const days = [...new Set(personal.map(reading => localDate(new Date(reading.start_at))))].sort();
  return days.map(date => {
    const entries = personal.filter(reading => localDate(new Date(reading.start_at)) === date);
    const profiles = new Set(entries.map(reading => reading.profile ? `${reading.profile.id}:${reading.profile.version}` : 'missing'));
    const reason = overlaps(entries) ? 'Interval personal bertumpang tindih; dosis gabungan belum tersedia.'
      : profiles.size !== 1 || profiles.has('missing') ? 'Profil perhitungan personal belum lengkap atau berbeda.'
        : entries.some(reading => reading.level_dba === null || reading.dose_contribution_pct === null) ? 'Nilai pembacaan atau kontribusi dosis belum tersedia.' : null;
    return { date, pct: reason ? null : entries.reduce((sum, reading) => sum + reading.dose_contribution_pct!, 0), covered_s: unionSeconds(entries), reason };
  });
}

function selectNoise(readings: NoiseReading[], worker: Worker, windows: ObservationWindow[], recordings: Recording[], from: string, to: string): NoiseReading[] {
  const periodStart = new Date(`${from}T00:00:00+07:00`).getTime();
  const periodEnd = new Date(`${to}T00:00:00+07:00`).getTime() + 86_400_000;
  const latest = new Map<string, NoiseReading>();
  for (const reading of readings) {
    const old = latest.get(reading.id);
    if (!old || reading.revision > old.revision) latest.set(reading.id, reading);
  }
  return [...latest.values()].filter(reading => {
    const recording = recordings.find(item => item.id === reading.recording_id);
    const targetMatches = reading.scope === 'personal' ? reading.worker_id === worker.id
      : Boolean(recording?.labels.some(label => label.worker_id === worker.id) && windows.some(window => window.recording_id === reading.recording_id) && recording.station_id === reading.station_id);
    return targetMatches && new Date(reading.end_at).getTime() > periodStart && new Date(reading.start_at).getTime() < periodEnd;
  }).map(reading => {
    const start = new Date(reading.start_at).getTime(), end = new Date(reading.end_at).getTime();
    const clippedStart = Math.max(start, periodStart), clippedEnd = Math.min(end, periodEnd);
    if (start === clippedStart && end === clippedEnd) return reading;
    const fraction = (clippedEnd - clippedStart) / (end - start);
    return { ...reading, start_at: new Date(clippedStart).toISOString(), end_at: new Date(clippedEnd).toISOString(), covered_s: reading.covered_s * fraction,
      dose_contribution_pct: reading.interval_model === 'constant_simulated' && reading.dose_contribution_pct !== null ? reading.dose_contribution_pct * fraction : null };
  }).sort((a, b) => a.start_at.localeCompare(b.start_at) || a.id.localeCompare(b.id));
}

export function buildEmployeeSnapshot(input: { worker: Worker; windows: ObservationWindow[]; recordings: Recording[]; noiseReadings?: NoiseReading[]; period: Period; from: string; to: string; example: boolean }): EmployeeAssessmentSnapshot {
  const { worker, recordings, period, from, to, example } = input;
  const windows = uniqueWindows(input.windows.filter(window => window.worker_id === worker.id && inDateRange(window, from, to)));
  const noise = selectNoise(input.noiseReadings || [], worker, windows, recordings, from, to);
  const recordingIds = new Set([...windows.map(window => window.recording_id), ...noise.map(reading => reading.recording_id)]);
  const referenced = recordings.filter(recording => recordingIds.has(recording.id)).sort((a, b) => a.id.localeCompare(b.id));
  const revision = fingerprint({ worker: worker.id, windows, noise, recordings: referenced.map(recording => ({ id: recording.id, camera: recording.camera_id, station: recording.station_id, labels: recording.labels, content_hash: recording.content_hash })) });
  const scope: AssessmentScope = { workerId: worker.id, period, from, to, snapshotId: `RAISE-${worker.id}-${period}-${from}-${to}`, revision: `r${revision}`, source: example ? 'example' : 'service' };
  const scopeKey = JSON.stringify([scope.source, worker.id, period, from, to, scope.snapshotId, scope.revision]);
  const valid = windows.reduce((sum, window) => sum + window.usable_s, 0);
  const recorded = windows.reduce((sum, window) => sum + window.end_s - window.start_s, 0);
  const exposure = windows.reduce((sum, window) => sum + window.flagged_s, 0);
  const scores = windows.flatMap(window => window.reba_score === null ? [] : [window.reba_score]);
  const score = scores.length ? Math.max(...scores) : null;
  const pointsAvailable = windows.some(window => window.exposure_points !== null);
  const points = pointsAvailable ? windows.reduce((sum, window) => sum + (window.exposure_points || 0), 0) : null;
  const pointsComplete = windows.every(window => window.usable_s === 0 || window.exposure_points !== null);
  const episodes = [...new Map(windows.flatMap(window => window.msd?.episodes || []).map(episode => [episode.id, episode])).values()];
  const holdingAvailable = windows.length > 0 && windows.every(window => Boolean(window.msd?.holding_tracking_available));
  const holds = episodes.filter(episode => episode.kind === 'static_hold');
  const findings = new Map<string, { region: string | null; activity: string | null; rationale: string; duration_s: number }>();
  for (const window of windows.filter(item => item.usable_s > 0)) {
    const key = window.msd ? `${window.msd.body_region}:${window.msd.activity}` : 'missing-context';
    const previous = findings.get(key);
    if (previous) previous.duration_s += window.flagged_s;
    else findings.set(key, { region: window.msd?.body_region || null, activity: window.msd?.activity || null,
      rationale: window.msd?.rationale || window.finding || 'Bagian tubuh, aktivitas, dan alasan penilaian belum tersedia.', duration_s: window.flagged_s });
  }
  const spans = [...new Set(windows.map(window => window.recording_id))].map(recordingId => {
    const entries = windows.filter(window => window.recording_id === recordingId);
    return { recordingId, start_at: entries[0].observed_at,
      end_at: new Date(Math.max(...entries.map(window => new Date(window.observed_at).getTime() + (window.end_s - window.start_s) * 1000))).toISOString(),
      usable_s: entries.reduce((sum, window) => sum + window.usable_s, 0) };
  });
  const evidence: ExposureEvidence[] = [];
  function addEvidence(recordingId: string, id: string, start: number, end: number, kind: 'msd' | 'noise', title: string, timestamp: string) {
    const recording = recordings.find(item => item.id === recordingId);
    evidence.push({ id, recordingId, cameraId: recording?.camera_id || null, stationId: recording?.station_id || null,
      filename: recording?.filename || null, recordedAt: recording?.recorded_at || timestamp, start_s: start, end_s: end, kind, title,
      subjectLabel: recording?.labels.find(label => label.worker_id === worker.id)?.subject_label || null });
  }
  for (const recordingId of new Set(windows.map(window => window.recording_id))) {
    const entries = windows.filter(window => window.recording_id === recordingId);
    const events = [...new Map(entries.flatMap(window => window.msd?.episodes || []).map(episode => [episode.id, episode])).values()];
    if (events.length) for (const event of events.slice(0, 3)) addEvidence(recordingId, event.id, event.start_s, event.end_s, 'msd', event.kind === 'static_hold' ? 'Holding time yang teramati' : 'Episode aktivitas terflag', entries[0].observed_at);
    else { const first = entries.find(window => window.flagged_s > 0) || entries[0]; addEvidence(recordingId, `evidence-${first.id}`, first.start_s, first.end_s, 'msd', first.finding || 'Interval observasi postur', first.observed_at); }
  }
  for (const reading of noise) {
    const recording = recordings.find(item => item.id === reading.recording_id);
    const start = recording ? Math.max(0, (new Date(reading.start_at).getTime() - new Date(recording.recorded_at).getTime()) / 1000) : 0;
    addEvidence(reading.recording_id, reading.id, start, start + (new Date(reading.end_at).getTime() - new Date(reading.start_at).getTime()) / 1000, 'noise', `Pembacaan ${reading.scope === 'personal' ? 'personal' : 'area'} · Simulasi`, reading.start_at);
  }
  const primaryNoise = [...noise].sort((a, b) => b.status_priority - a.status_priority || b.start_at.localeCompare(a.start_at))[0];
  const updated = [...windows.map(window => window.updated_at || new Date(new Date(window.observed_at).getTime() + (window.end_s - window.start_s) * 1000).toISOString()), ...noise.map(reading => reading.updated_at)].sort();
  return {
    scope, scopeKey, worker, windows, recorded_s: recorded, valid_s: valid, unknown_s: Math.max(0, recorded - valid),
    observed_days: new Set(windows.filter(window => window.usable_s > 0).map(window => localDate(new Date(window.observed_at)))).size,
    period_days: Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000) + 1,
    updated_at: updated.at(-1) || null,
    locations: [...new Set(referenced.map(recording => recording.station_id))], spans, evidence,
    msd: {
      score, band: msdBand(score), immediate_action: score !== null && score >= 11,
      findings: [...findings.values()].sort((a, b) => b.duration_s - a.duration_s),
      exposure_s: exposure, exposure_pct: valid > 0 ? exposure / valid * 100 : null,
      longest_hold_s: holdingAvailable ? holds.length ? Math.max(...holds.map(hold => hold.end_s - hold.start_s)) : 0 : null,
      event_count: holdingAvailable ? episodes.length : null, static_holds: holdingAvailable ? holds.length : null, episodes,
      points, points_per_hour: points !== null && valid > 0 ? points / (valid / 3600) : null, points_complete: pointsComplete,
      extra_hold_s: holdingAvailable && holds.every(hold => hold.holding_context_complete && hold.holding_threshold_s !== null)
        ? holds.reduce((sum, hold) => sum + Math.max(0, hold.end_s - hold.start_s - hold.holding_threshold_s!), 0) : null,
      table_c_values: [...new Set(windows.flatMap(window => window.msd?.table_c === null || window.msd?.table_c === undefined ? [] : [window.msd.table_c]))].sort((a, b) => a - b),
      interventions: dedupeInterventions(windows.flatMap(window => window.msd?.interventions || [])),
      input_context: [...new Map(windows.flatMap(window => window.msd?.input_context || []).map(field => [field.field + field.value, field])).values()],
    },
    noise: {
      readings: noise, status: primaryNoise?.assessment_status || 'Data pengukuran belum tersedia',
      finding: primaryNoise?.finding || 'Belum ada pembacaan kebisingan untuk pegawai dan periode ini.',
      rationale: primaryNoise?.rationale || 'Nilai dBA, interval pengukuran, cakupan personal/area, dan profil perlu disediakan.',
      levels: [...new Set(noise.flatMap(reading => reading.level_dba === null ? [] : [reading.level_dba]))].sort((a, b) => a - b),
      covered_s: unionSeconds(noise), personal_s: unionSeconds(noise.filter(reading => reading.scope === 'personal')),
      area_s: unionSeconds(noise.filter(reading => reading.scope === 'area')),
      scopes: [...new Set(noise.map(reading => reading.scope))], daily_doses: noiseDailyDoses(noise),
      interventions: dedupeInterventions(noise.flatMap(reading => reading.interventions)),
    },
  };
}
