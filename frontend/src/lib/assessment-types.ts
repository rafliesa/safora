export type InterventionPriority = 'P1' | 'P2' | 'P3';

export interface ExposureIntervention {
  id: string;
  action: string;
  reason: string;
  priority: InterventionPriority;
}

export interface MsdEpisode {
  id: string;
  kind: 'static_hold' | 'dynamic';
  start_s: number;
  end_s: number;
  holding_threshold_s: number | null;
  holding_context_complete: boolean;
}

export interface MsdObservation {
  body_region: string;
  activity: string;
  rationale: string;
  table_c: number | null;
  episodes: MsdEpisode[];
  holding_tracking_available: boolean;
  interventions: ExposureIntervention[];
  input_context?: { field: string; value: string | null }[];
}

export interface NoiseProfile {
  id: string;
  name: string;
  criterion_dba: number;
  exchange_rate_db: number;
  reference_hours: number;
  integration_threshold_dba: number | null;
  version: number;
}

export interface NoiseReading {
  id: string;
  revision: number;
  worker_id: string | null;
  station_id: string;
  recording_id: string;
  scope: 'personal' | 'area';
  start_at: string;
  end_at: string;
  level_dba: number | null;
  covered_s: number;
  dose_contribution_pct: number | null;
  interval_model: 'constant_simulated' | 'instrument_interval';
  instrument_id: string;
  source: 'simulated';
  profile: NoiseProfile | null;
  assessment_status: string;
  status_priority: number;
  finding: string;
  rationale: string;
  interventions: ExposureIntervention[];
  updated_at: string;
}
