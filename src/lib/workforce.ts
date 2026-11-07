import type { ReviewState } from './types';
import { localDate } from './utils';
import type { MsdObservation } from './assessment-types';

export const REFRESH_INTERVAL_MS = 60_000;

export interface Worker {
  id: string;
  name: string;
  department: string;
  initials: string;
}

export interface ManualLabel {
  worker_id: string;
  worker_name: string;
  subject_label: string;
  start_s: number;
  end_s: number;
  origin: 'manual';
}

export interface Recording {
  id: string;
  camera_id: string;
  station_id: string;
  title: string;
  filename: string;
  recorded_at: string;
  duration_s: number;
  source: 'example' | 'local' | 'service';
  labels: ManualLabel[];
  playback_url?: string;
  content_hash?: string;
  width?: number;
  height?: number;
  local_file_id?: string;
  labels_updated_at?: string;
}

export interface LiveSource {
  id: string;
  camera_id: string;
  status: 'offline' | 'online' | 'error';
  playback_url?: string;
  analysis_status: 'waiting' | 'running' | 'unavailable';
  cadence_s: number;
  device_name?: string;
  last_observation_at: string | null;
}

// Each result represents an incremental interval, never a running total.
// Repeated refreshes replace results by stable ID/revision instead of adding them.
export interface ObservationWindow {
  id: string;
  revision: number;
  worker_id: string;
  recording_id: string;
  observed_at: string;
  start_s: number;
  end_s: number;
  usable_s: number;
  flagged_s: number;
  reba_score: number | null;
  exposure_points: number | null;
  requires_review: boolean;
  review_state: ReviewState;
  finding: string | null;
  source: 'example' | 'service';
  msd?: MsdObservation;
  updated_at?: string;
}

export interface WorkerSummary {
  worker: Worker;
  windows: ObservationWindow[];
  usable_s: number;
  sampled_s: number;
  flagged_s: number;
  exposure_points: number;
  has_points: boolean;
  peak_reba: number | null;
  needs_review: boolean;
  recordings: number;
  last_observation_at: string | null;
}

export function uniqueWindows(windows: ObservationWindow[]): ObservationWindow[] {
  const unique = new Map<string, ObservationWindow>();
  for (const window of windows) {
    const previous = unique.get(window.id);
    if (!previous || window.revision > previous.revision) unique.set(window.id, window);
  }
  return [...unique.values()].sort((a, b) => a.observed_at.localeCompare(b.observed_at) || a.id.localeCompare(b.id));
}

export function inDateRange(window: ObservationWindow, from: string, to: string): boolean {
  const date = localDate(new Date(window.observed_at));
  return date >= from && date <= to;
}

export function summarizeWorker(worker: Worker, windows: ObservationWindow[]): WorkerSummary {
  const selected = uniqueWindows(windows.filter(window => window.worker_id === worker.id));
  const scores = selected.flatMap(window => window.reba_score === null ? [] : [window.reba_score]);
  return {
    worker, windows: selected,
    usable_s: selected.reduce((total, window) => total + window.usable_s, 0),
    sampled_s: selected.reduce((total, window) => total + window.end_s - window.start_s, 0),
    flagged_s: selected.reduce((total, window) => total + window.flagged_s, 0),
    exposure_points: selected.reduce((total, window) => total + (window.exposure_points ?? 0), 0),
    has_points: selected.some(window => window.exposure_points !== null),
    peak_reba: scores.length ? Math.max(...scores) : null,
    needs_review: selected.some(window => window.requires_review && window.review_state !== 'approved'),
    recordings: new Set(selected.map(window => window.recording_id)).size,
    last_observation_at: selected.at(-1)?.observed_at || null,
  };
}

export function dailyTotals(windows: ObservationWindow[], from: string, to: string) {
  const dates: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor <= end) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); }
  const selected = uniqueWindows(windows);
  let cumulative = 0;
  return dates.map(date => {
    const day = selected.filter(window => localDate(new Date(window.observed_at)) === date);
    const points = day.reduce((sum, window) => sum + (window.exposure_points ?? 0), 0);
    cumulative += points;
    return { date, points, cumulative, usable_s: day.reduce((sum, window) => sum + window.usable_s, 0), windows: day.length };
  });
}

export function intradayTotals(windows: ObservationWindow[]) {
  const intervals = new Map<number, ObservationWindow[]>();
  for (const window of uniqueWindows(windows)) {
    const minute = Math.floor(new Date(window.observed_at).getTime() / 60_000) * 60_000;
    intervals.set(minute, [...(intervals.get(minute) || []), window]);
  }
  let cumulative = 0;
  return [...intervals].sort(([a], [b]) => a - b).map(([timestamp, results]) => {
    const points = results.reduce((sum, window) => sum + (window.exposure_points || 0), 0);
    cumulative += points;
    return { date: new Date(timestamp).toISOString(), points, cumulative, usable_s: results.reduce((sum, window) => sum + window.usable_s, 0), windows: results.length };
  });
}

export function validateLabels(labels: ManualLabel[], duration: number): string | null {
  const targets = new Set<string>();
  for (const label of labels) {
    if (!label.worker_id.trim() || !label.worker_name.trim() || !label.subject_label.trim()) return 'Lengkapi ID, nama, dan penanda subjek pada setiap label.';
    if (![label.start_s, label.end_s].every(Number.isFinite) || label.start_s < 0 || label.end_s <= label.start_s || label.end_s > duration) return 'Rentang label harus berada di dalam durasi rekaman.';
    if (targets.has(label.subject_label.trim().toLowerCase())) return 'Gunakan penanda subjek yang berbeda untuk setiap orang dalam rekaman.';
    targets.add(label.subject_label.trim().toLowerCase());
  }
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
    if (labels[i].worker_id.trim() === labels[j].worker_id.trim() && labels[i].start_s < labels[j].end_s && labels[j].start_s < labels[i].end_s) return 'Pegawai yang sama memiliki label waktu bertumpang tindih. Periksa interval dan penanda subjek.';
  }
  return null;
}

export function formatDate(date: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', ...options, timeZone: 'Asia/Jakarta' }).format(new Date(date.length === 10 ? `${date}T12:00:00Z` : date));
}

export function observationMinutes(seconds: number): string {
  return (seconds / 60).toLocaleString('id-ID', { maximumFractionDigits: 1 });
}
