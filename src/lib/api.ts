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
  if (!baseUrl) throw new ApiError(503, 'The analysis service is not connected. Your video and settings remain available on this page.');
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(15000),
      headers: { ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init?.headers },
    });
  } catch {
    throw new ApiError(503, 'The service could not be reached. Check your connection and try again.');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body && typeof body === 'object' && 'detail' in body ? (body as { detail: unknown }).detail : null;
    const messages: Record<number, string> = {
      404: 'This session or assessment is unavailable.',
      422: 'Invalid parameters. Check the time range and subject identity.',
      501: 'Assessment storage is unavailable in this frontend preview. No data has been submitted or saved as an assessment.',
      503: 'The analysis pipeline is unavailable. No inference or assessment has been run.',
    };
    throw new ApiError(response.status, typeof detail === 'string' ? detail : messages[response.status] || 'The request failed. Please try again.');
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
  session: (id: string) => baseUrl ? request<AnalysisSession>(`/analysis-sessions/${encodeURIComponent(id)}`) : Promise.reject<AnalysisSession>(new ApiError(404, 'This session is unavailable. No analysis session has been saved.')),
  assessment: (id: string) => baseUrl ? request<Assessment>(`/analysis-sessions/${encodeURIComponent(id)}/assessment`) : Promise.reject<Assessment>(new ApiError(404, 'This assessment is unavailable. No analysis results have been saved.')),
  registerVideo: (file: File, metadata: Omit<VideoAsset, 'id' | 'url'>) => {
    if (!baseUrl) return Promise.reject<VideoAsset>(new ApiError(501, 'Video registration is unavailable. Your local preview and settings remain available; no video has been uploaded.'));
    const data = new FormData();
    data.append('file', file);
    data.append('metadata', JSON.stringify(metadata));
    return request<VideoAsset>('/videos', { method: 'POST', body: data });
  },
  startAnalysis: (input: AnalysisInput) => {
    if (!input.worker_id.trim() || !input.station_id.trim() || !input.task.trim() || !Number.isFinite(input.start_s) || !Number.isFinite(input.end_s) || input.start_s < 0 || input.end_s <= input.start_s) {
      return Promise.reject<AnalysisSession>(new ApiError(422, 'Enter an identity, task, station, and valid time range.'));
    }
    return request<AnalysisSession>('/analysis-sessions', { method: 'POST', body: JSON.stringify(input) });
  },
  updateAssessment: (id: string, inputs: Record<string, unknown>) => baseUrl
    ? request<Assessment>(`/analysis-sessions/${encodeURIComponent(id)}/assessment`, { method: 'PATCH', body: JSON.stringify(inputs) })
    : Promise.reject<Assessment>(new ApiError(501, 'Assessment editing is unavailable. No new version has been created.')),
  saveReview: (id: string, input: ReviewInput) => baseUrl
    ? request<Assessment>(`/assessment-versions/${encodeURIComponent(id)}/reviews`, { method: 'POST', body: JSON.stringify(input) })
    : Promise.reject<Assessment>(new ApiError(501, 'Review storage is unavailable. No approval has been recorded.')),
};
