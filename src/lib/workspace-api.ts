import { ApiError } from './api';
import { cameras } from './utils';
import type { LiveSource, ManualLabel, ObservationWindow, Recording, Worker } from './workforce';
import type { NoiseReading } from './assessment-types';

const origin = (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!origin) throw new ApiError(503, 'Layanan belum terhubung. Analisis otomatis berjalan di layanan kamera saat tersedia.');
  let response: Response;
  try { response = await fetch(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(15000), headers: { ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init?.headers } }); }
  catch { throw new ApiError(503, 'Layanan tidak dapat dijangkau. Data terakhir tetap ditampilkan.'); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, typeof body?.detail === 'string' ? body.detail : 'Permintaan belum dapat diselesaikan.');
  if (body === null) throw new ApiError(502, 'Respons layanan belum valid.');
  return body as T;
}

export const workspaceApi = {
  sources: () => origin ? call<{ items: LiveSource[] }>('/live-sources') : Promise.resolve({ items: cameras.map(camera => ({ id: camera.id, camera_id: camera.id, status: 'offline' as const, analysis_status: 'unavailable' as const, cadence_s: 60, last_observation_at: null })) }),
  workers: () => origin ? call<{ items: Worker[] }>('/workers') : Promise.resolve({ items: [] as Worker[] }),
  observations: (from: string, to: string) => origin ? call<{ items: ObservationWindow[] }>(`/observations?from=${from}&to=${to}&timezone=Asia%2FJakarta`) : Promise.resolve({ items: [] as ObservationWindow[] }),
  noiseReadings: (from: string, to: string) => origin ? call<{ items: NoiseReading[] }>(`/noise-readings?from=${from}&to=${to}&timezone=Asia%2FJakarta`) : Promise.resolve({ items: [] as NoiseReading[] }),
  recordings: () => origin ? call<{ items: Recording[] }>('/recordings') : Promise.resolve({ items: [] as Recording[] }),
  saveLabels: (id: string, labels: ManualLabel[]) => call<Recording>(`/recordings/${encodeURIComponent(id)}/labels`, { method: 'PUT', body: JSON.stringify({ labels }) }),
  uploadRecording: (file: File, recording: Recording) => {
    const body = new FormData(); body.append('file', file); body.append('metadata', JSON.stringify(recording));
    return call<Recording>('/recordings', { method: 'POST', body });
  },
  reviewWorker: (workerId: string, data: { reviewer: string; rationale: string; window_versions: { id: string; revision: number }[] }) => origin
    ? call<{ saved: boolean }>(`/workers/${encodeURIComponent(workerId)}/reviews`, { method: 'POST', body: JSON.stringify(data) })
    : Promise.reject(new ApiError(501, 'Review belum dapat disimpan tanpa layanan. Belum ada hasil yang ditandai disetujui.')),
};
