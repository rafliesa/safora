import type { AnalysisInput, AnalysisSession, Assessment, DashboardSummary, PageResult, ReviewInput, SiteConfig, VideoAsset } from './types';

const baseUrl = (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');
export const isConnectedMode = Boolean(baseUrl);

export const defaultConfig: SiteConfig = {
  timezone: 'Asia/Jakarta',
  shift: { start: '08:00', end: '17:00' },
  analysis_available: false,
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!baseUrl) throw new ApiError(503, 'Layanan analisis belum terhubung. Video dan parameter Anda tetap tersedia di halaman ini.');
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(15000),
      headers: { ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init?.headers },
    });
  } catch {
    throw new ApiError(503, 'Layanan tidak dapat dijangkau. Periksa koneksi lalu coba lagi.');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body && typeof body === 'object' && 'detail' in body ? (body as { detail: unknown }).detail : null;
    const messages: Record<number, string> = {
      404: 'Sesi atau asesmen ini belum tersedia.',
      422: 'Parameter belum valid. Periksa rentang waktu dan identitas subjek.',
      501: 'Penyimpanan belum tersedia pada tahap frontend ini. Data belum dikirim atau disimpan sebagai asesmen.',
      503: 'Pipeline analisis belum tersedia. Belum ada inferensi atau penilaian yang dijalankan.',
    };
    throw new ApiError(response.status, typeof detail === 'string' ? detail : messages[response.status] || 'Permintaan gagal. Silakan coba lagi.');
  }
  return body as T;
}

const emptyDashboard = (): DashboardSummary => ({
  totals: { sessions: 0, workers: 0, reviewed_high: 0, pending: 0, sampled_s: 0, usable_s: 0, coverage_pct: null },
  trends: [],
});

export const api = {
  health: () => baseUrl ? request<{ status: string }>('/health') : Promise.resolve({ status: 'frontend_only' }),
  config: () => baseUrl ? request<SiteConfig>('/config') : Promise.resolve(defaultConfig),
  videos: () => baseUrl ? request<PageResult<VideoAsset>>('/videos') : Promise.resolve({ items: [], total: 0 }),
  sessions: (query = '') => baseUrl ? request<PageResult<AnalysisSession>>(`/analysis-sessions${query}`) : Promise.resolve({ items: [], total: 0 }),
  dashboard: (query: string) => baseUrl ? request<DashboardSummary>(`/dashboard${query}`) : Promise.resolve(emptyDashboard()),
  session: (id: string) => baseUrl ? request<AnalysisSession>(`/analysis-sessions/${encodeURIComponent(id)}`) : Promise.reject<AnalysisSession>(new ApiError(404, 'Sesi ini belum tersedia. Belum ada sesi analisis yang tersimpan.')),
  assessment: (id: string) => baseUrl ? request<Assessment>(`/analysis-sessions/${encodeURIComponent(id)}/assessment`) : Promise.reject<Assessment>(new ApiError(404, 'Asesmen ini belum tersedia. Belum ada hasil analisis yang tersimpan.')),
  registerVideo: (file: File, metadata: Omit<VideoAsset, 'id' | 'url'>) => {
    if (!baseUrl) return Promise.reject<VideoAsset>(new ApiError(501, 'Pendaftaran video belum tersedia. Pratinjau lokal dan parameter tetap tersedia; belum ada video yang diunggah.'));
    const data = new FormData();
    data.append('file', file);
    data.append('metadata', JSON.stringify(metadata));
    return request<VideoAsset>('/videos', { method: 'POST', body: data });
  },
  startAnalysis: (input: AnalysisInput) => {
    if (!input.worker_id.trim() || !input.station_id.trim() || !input.task.trim() || !Number.isFinite(input.start_s) || !Number.isFinite(input.end_s) || input.start_s < 0 || input.end_s <= input.start_s) {
      return Promise.reject<AnalysisSession>(new ApiError(422, 'Lengkapi identitas, tugas, stasiun, dan rentang waktu yang valid.'));
    }
    return request<AnalysisSession>('/analysis-sessions', { method: 'POST', body: JSON.stringify(input) });
  },
  updateAssessment: (id: string, inputs: Record<string, unknown>) => baseUrl
    ? request<Assessment>(`/analysis-sessions/${encodeURIComponent(id)}/assessment`, { method: 'PATCH', body: JSON.stringify(inputs) })
    : Promise.reject<Assessment>(new ApiError(501, 'Perubahan asesmen belum tersedia. Belum ada versi baru yang dibuat.')),
  saveReview: (id: string, input: ReviewInput) => baseUrl
    ? request<Assessment>(`/assessment-versions/${encodeURIComponent(id)}/reviews`, { method: 'POST', body: JSON.stringify(input) })
    : Promise.reject<Assessment>(new ApiError(501, 'Penyimpanan review belum tersedia. Belum ada persetujuan yang dicatat.')),
};
