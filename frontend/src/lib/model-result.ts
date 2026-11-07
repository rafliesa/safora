export type ExposureLevel = 'low' | 'moderate' | 'high' | null;
export interface ModelSample {
  timestamp_s: number;
  sample_interval_s: number;
  uwiom_level: ExposureLevel;
  uwiom_status: string;
  arm_level: ExposureLevel;
  back_level: ExposureLevel;
  arm_posture_cycles_so_far: number;
  back_posture_cycles_so_far: number;
  clinical_msd_probability: null;
}
export interface ModelResult {
  schema_version: 'healy.model.v1';
  input: { duration_s: number; cadence_s: number };
  samples: ModelSample[];
  summary: { uwiom: { valid_samples: number; samples: number; coverage: number; level_samples: Record<'low' | 'moderate' | 'high', number> } };
}
