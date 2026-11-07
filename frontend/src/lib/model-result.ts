export type ExposureLevel = 'low' | 'moderate' | 'high' | null;
export type PoseJoint = 'nose' | `${'left' | 'right'}_${'eye' | 'ear' | 'shoulder' | 'elbow' | 'wrist' | 'hip' | 'knee' | 'ankle'}`;
export interface ModelSample extends Partial<Record<`${PoseJoint}_${'x_px' | 'y_px' | 'confidence'}`, number | null>> {
  timestamp_s: number;
  sample_interval_s: number;
  uwiom_level: ExposureLevel;
  uwiom_status: string;
  arm_level: ExposureLevel;
  back_level: ExposureLevel;
  arm_posture_cycles_so_far: number;
  back_posture_cycles_so_far: number;
  clinical_msd_probability: null;
  arm_repetitions_so_far?: number;
  back_repetitions_so_far?: number;
  uwiom_repetitions_so_far?: number;
  frame_width_px?: number;
  frame_height_px?: number;
  pose_status?: string;
}
export interface RepetitionMetrics { count: number; valid_s: number; elevated_s: number; exposure_pct: number | null; coverage_pct: number }
export interface ModelResult {
  schema_version: 'healy.model.v1';
  input: { duration_s: number; cadence_s: number };
  samples: ModelSample[];
  summary: { uwiom: { valid_samples: number; samples: number; coverage: number; level_samples: Record<'low' | 'moderate' | 'high', number> }; repetitions?: Record<'arm' | 'back' | 'uwiom', RepetitionMetrics> };
}

export interface MsdAnalysis {
  status: 'not_started' | 'queued' | 'processing' | 'complete' | 'failed';
  message?: string;
  model?: string;
  generated_at?: string;
  source_url?: string;
  interpretation?: {
    summary: string;
    clinical_msd_probability_pct: null;
    findings: { region: 'arm' | 'back'; potential_msd: 'shoulder_tendinopathy' | 'low_back_pain' | 'insufficient_evidence'; review_priority: 'low' | 'moderate' | 'high' | 'insufficient_data'; rationale: string; recommendation: string }[];
    limitations: string[];
  };
}
export interface MsdRecordingReview {
  recording_id: string;
  filename: string;
  recorded_at: string;
  metrics: { duration_s: number; regions: Record<'arm' | 'back' | 'uwiom', RepetitionMetrics> };
  analysis: MsdAnalysis;
}

export interface PoseFrames {
  schema_version: 'healy.pose.v1';
  fps: number;
  width: number;
  height: number;
  frame_count: number;
  pose_model: string;
  frames: (Array<[number, number, number] | null> | null)[];
}
export interface PoseStatus { status: 'queued' | 'processing' | 'complete' | 'failed'; message?: string }
