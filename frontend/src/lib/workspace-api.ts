import { ApiError } from './api';
import { cameras } from './utils';
import type { LiveSource, ManualLabel, ObservationWindow, Recording, Worker } from './workforce';
import type { ModelResult } from './model-result';
import type { NoiseReading } from './assessment-types';

const origin = (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');

async function call<T>(path: string, init?: RequestInit, timeout = 15000): Promise<T> {
  if (!origin) throw new ApiError(503, 'The service is not connected. Automatic analysis runs through the camera service when available.');
  let response: Response;
  try { response = await fetch(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(timeout), headers: { ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init?.headers } }); }
  catch { throw new ApiError(503, 'The service could not be reached. The most recent data is still displayed.'); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, typeof body?.detail === 'string' ? body.detail : 'The request could not be completed.');
  if (body === null) throw new ApiError(502, 'The service returned an invalid response.');
  return body as T;
}

export const serviceFileUrl = (path: string) => /^https?:\/\//.test(path) ? path : `${origin || ''}${path}`;
const recordingUrls = (recording: Recording): Recording => ({ ...recording, playback_url: recording.playback_url ? serviceFileUrl(recording.playback_url) : undefined });

export const workspaceApi = {
  sources: () => origin ? call<{ items: LiveSource[] }>('/live-sources') : Promise.resolve({ items: cameras.map(camera => ({ id: camera.id, camera_id: camera.id, status: 'offline' as const, analysis_status: 'unavailable' as const, cadence_s: 60, last_observation_at: null })) }),
  workers: () => origin ? call<{ items: Worker[] }>('/workers') : Promise.resolve({ items: [] as Worker[] }),
  observations: (from: string, to: string) => origin ? call<{ items: ObservationWindow[] }>(`/observations?from=${from}&to=${to}&timezone=Asia%2FJakarta`) : Promise.resolve({ items: [] as ObservationWindow[] }),
  noiseReadings: (from: string, to: string) => origin ? call<{ items: NoiseReading[] }>(`/noise-readings?from=${from}&to=${to}&timezone=Asia%2FJakarta`) : Promise.resolve({ items: [] as NoiseReading[] }),
  recordings: () => origin ? call<{ items: Recording[] }>('/recordings').then(data => ({ items: data.items.map(recordingUrls) })) : Promise.resolve({ items: [] as Recording[] }),
  saveLabels: (id: string, labels: ManualLabel[], subjectVerified = false) => call<Recording>(`/recordings/${encodeURIComponent(id)}/labels`, { method: 'PUT', body: JSON.stringify({ labels, subject_verified: subjectVerified }) }).then(recordingUrls),
  recording: (id: string) => call<Recording>(`/recordings/${encodeURIComponent(id)}`).then(recordingUrls),
  modelResult: (id: string) => call<ModelResult>(`/recordings/${encodeURIComponent(id)}/result`),
  uploadRecording: (file: File, recording: Pick<Recording, 'camera_id' | 'station_id' | 'title' | 'recorded_at'>) => {
    const body = new FormData(); body.append('file', file); body.append('metadata', JSON.stringify(recording));
    return call<Recording>('/recordings', { method: 'POST', body }, 120000).then(recordingUrls);
  },
  reviewWorker: (workerId: string, data: { reviewer: string; rationale: string; window_versions: { id: string; revision: number }[] }) => origin
    ? call<{ saved: boolean }>(`/workers/${encodeURIComponent(workerId)}/reviews`, { method: 'POST', body: JSON.stringify(data) })
    : Promise.reject(new ApiError(501, 'The review cannot be saved without the service. No results have been marked as approved.')),
};
