export type JobState = 'queued' | 'processing' | 'completed' | 'failed';
export type ReviewState = 'draft' | 'needs_evidence' | 'approved';
export type Period = 'day' | 'week' | 'month';

export interface SiteConfig {
  timezone: string;
  shift: { start: string; end: string };
  analysis_available: boolean;
}

export interface CameraTemplate {
  id: string;
  department: string;
  station: string;
  device: string;
  angle: string;
  view: 'side' | 'front';
}

export interface VideoAsset {
  id: string;
  filename: string;
  duration_s: number;
  width: number;
  height: number;
  content_hash: string;
  url?: string;
}

export interface LocalVideo extends Omit<VideoAsset, 'id'> {
  file: File;
  url: string;
}

export interface AnalysisInput {
  video_id: string;
  camera_id: string;
  worker_id: string;
  worker_name: string;
  station_id: string;
  task: string;
  session_date: string;
  timezone: string;
  shift: { start: string; end: string };
  start_s: number;
  end_s: number;
  fixture_id: string | null;
  fixture_version: number | null;
  modules: string[];
}

export interface AnalysisSession extends AnalysisInput {
  id: string;
  status: JobState;
  progress: number;
  created_at: string;
  review_state: ReviewState;
  error?: string;
}

export interface Finding {
  id: string;
  title: string;
  rationale: string;
  timestamp_s: number;
  end_s: number;
  status: string;
}

export interface Assessment {
  id: string;
  session_id: string;
  version: number;
  review_state: ReviewState;
  source: string;
  recorded_s: number;
  usable_s: number;
  flagged_s: number;
  longest_hold_s: number;
  reba_score: number | null;
  table_c: number | null;
  exposure_points: number | null;
  inputs_complete: boolean;
  worksheet_inputs?: Record<string, string | number | boolean>;
  findings: Finding[];
  interventions: { id: string; finding_id: string; action: string; owner: string; reassessment: string }[];
  reviews: { reviewer: string; decision: ReviewState; rationale: string; created_at: string; version: number }[];
  sensors?: { source: 'simulated'; fixture_id: string; version: number; noise_dba?: number; body_temperature_c?: number; body_temperature_type?: string; air_temperature_c?: number; relative_humidity_pct?: number };
}

export interface DashboardSummary {
  totals: {
    sessions: number;
    workers: number;
    reviewed_high: number;
    pending: number;
    sampled_s: number;
    usable_s: number;
    coverage_pct: number | null;
  };
  trends: { date: string; usable_s: number; exposure_points: number }[];
}

export interface PageResult<T> { items: T[]; total: number }

export interface ReviewInput {
  reviewer: string;
  decision: 'approved' | 'needs_evidence';
  rationale: string;
}
