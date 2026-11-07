import type { ManualLabel, ObservationWindow, Recording, Worker } from './workforce';
import { localDate } from './utils';
import type { MsdEpisode, NoiseProfile, NoiseReading } from './assessment-types';

export const exampleWorkers: Worker[] = [
  { id: 'EMP-8021', name: 'Priyapta Naufal', department: 'Engineering', initials: 'PN' },
  { id: 'EMP-7402', name: 'Sarah Jenkins', department: 'Operations', initials: 'SJ' },
  { id: 'EMP-8109', name: 'Dimas Aditya', department: 'Support', initials: 'DA' },
  { id: 'EMP-6920', name: 'Jessica Tan', department: 'Design', initials: 'JT' },
  { id: 'EMP-7311', name: 'Reza Pratama', department: 'Operations', initials: 'RP' },
  { id: 'EMP-8044', name: 'Maya Putri', department: 'Engineering', initials: 'MP' },
  { id: 'EMP-7128', name: 'Fajar Rahman', department: 'Support', initials: 'FR' },
  { id: 'EMP-6936', name: 'Nadia Prameswari', department: 'Design', initials: 'NP' },
];

function dayAgo(days: number): string {
  const date = new Date(`${localDate()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function label(worker: Worker, index = 0): ManualLabel {
  return { worker_id: worker.id, worker_name: worker.name, subject_label: index === 0 ? 'Subject 1 · left side' : 'Subject 2 · right side', start_s: 0, end_s: 2400, origin: 'manual' };
}

// Requested hardcoded archive metadata. No fake file URLs or live camera status.
export const exampleRecordings: Recording[] = Array.from({ length: 12 }, (_, index) => {
  const camera = ['A', 'B', 'C', 'D'][index % 4];
  const date = dayAgo(Math.floor(index / 2) + 1);
  const worker = exampleWorkers[(index * 3) % exampleWorkers.length];
  const second = exampleWorkers[(index * 3 + 1) % exampleWorkers.length];
  const hour = index % 2 === 0 ? '09:00' : '14:00';
  return {
    id: `archive-${index + 1}`, camera_id: camera,
    station_id: ['B-12', 'O-04', 'S-08', 'D-02'][index % 4],
    title: `Workstation observation · Camera ${camera}`,
    filename: `CAM-${camera}_${date}_${hour.replace(':', '')}.mp4`,
    recorded_at: `${date}T${hour}:00+07:00`, duration_s: 2400, source: 'example',
    labels: index % 3 === 0 ? [label(worker), label(second, 1)] : [label(worker)],
  };
});

// Today has a separate recorded fixture for each shared source. Two people may
// be manually labeled in one recording. Older archives remain available.
for (let index = 0; index < 4; index++) {
  const camera = ['A', 'B', 'C', 'D'][index];
  const date = localDate();
  const hour = index % 2 === 0 ? '09:00' : '14:00';
  exampleRecordings.push({
    id: `sample-today-${camera}`, camera_id: camera,
    station_id: ['B-12', 'O-04', 'S-08', 'D-02'][index],
    title: `Daily observation · Camera ${camera}`,
    filename: `CAM-${camera}_${date}_${hour.replace(':', '')}.mp4`,
    recorded_at: `${date}T${hour}:00+07:00`, duration_s: 2400, source: 'example',
    labels: [label(exampleWorkers[index * 2]), label(exampleWorkers[index * 2 + 1], 1)],
  });
}
// The same employee has evidence on another camera on a different day.
exampleRecordings[10].labels.push(label(exampleWorkers[0], 1));

interface DisplayProfile {
  tableC: number; activityAdjustment: number; validMinutes: number;
  holds: number; holdSeconds: number; dynamicEvents: number; dynamicSeconds: number;
  region: string; activity: string; rationale: string; action: string; actionReason: string;
  priority: 'P1' | 'P2' | 'P3';
}
const displayProfiles: DisplayProfile[] = [
  { tableC: 5, activityAdjustment: 0, validMinutes: 30, holds: 8, holdSeconds: 45, dynamicEvents: 6, dynamicSeconds: 60, region: 'Lower back', activity: 'Bending to reach materials', rationale: 'Repeated bending while reaching for materials informs the REBA assessment in this demo.', action: 'Move materials closer and adjust the work surface height to reduce bending.', actionReason: 'Addresses lower-back posture and bending duration observed in the recording.', priority: 'P2' },
  { tableC: 8, activityAdjustment: 1, validMinutes: 33, holds: 6, holdSeconds: 75, dynamicEvents: 5, dynamicSeconds: 60, region: 'Shoulder and upper arm', activity: 'Reaching for shelves with raised arms', rationale: 'Raised arms and repeated reaching call for changes to material placement and HSE review.', action: 'Lower frequently used shelves and provide suitable arm support.', actionReason: 'Reduces the need to reach above shoulder level during the assessed task.', priority: 'P1' },
  { tableC: 10, activityAdjustment: 2, validMinutes: 28, holds: 4, holdSeconds: 90, dynamicEvents: 8, dynamicSeconds: 60, region: 'Lower back and legs', activity: 'Deep bending while moving materials', rationale: 'The demo transfer phase includes deep bending and activity adjustments requiring prompt review.', action: 'Review transfer methods and handling aids under the site’s immediate action procedures.', actionReason: 'The demo REBA score of 12 calls for HSE confirmation and prioritized task intervention.', priority: 'P1' },
  { tableC: 2, activityAdjustment: 0, validMinutes: 38, holds: 0, holdSeconds: 0, dynamicEvents: 0, dynamicSeconds: 0, region: 'Shoulder and back', activity: 'Assembly within easy reach', rationale: 'The assessed demo posture uses a close reach; no episodes are flagged within valid intervals.', action: 'Keep materials within easy reach and schedule another observation when the task changes.', actionReason: 'Maintains the observed task setup and helps detect changes in work patterns.', priority: 'P3' },
  { tableC: 3, activityAdjustment: 0, validMinutes: 35, holds: 4, holdSeconds: 30, dynamicEvents: 2, dynamicSeconds: 30, region: 'Neck', activity: 'Brief neck bending during inspection', rationale: 'Brief neck-bending episodes are recorded during inspection. Interpret the assessment alongside coverage and task context.', action: 'Reposition inspection items for a clear view without repeated neck bending.', actionReason: 'Addresses the neck activity flagged during observed intervals.', priority: 'P3' },
  { tableC: 6, activityAdjustment: 0, validMinutes: 32, holds: 6, holdSeconds: 60, dynamicEvents: 4, dynamicSeconds: 45, region: 'Wrist and forearm', activity: 'Repeated reaching for input devices', rationale: 'Wrist position and repeated reaching in this demo indicate a need to improve device placement.', action: 'Bring input devices closer and adjust arm support to suit the task.', actionReason: 'Reduces repeated reaching and supports a more suitable wrist position.', priority: 'P2' },
  { tableC: 4, activityAdjustment: 0, validMinutes: 30, holds: 5, holdSeconds: 40, dynamicEvents: 3, dynamicSeconds: 40, region: 'Upper back', activity: 'Holding a static posture during inspection', rationale: 'Static posture and upper-back episodes in this demo need review alongside duration and body support.', action: 'Adjust the inspection item position and provide suitable body support.', actionReason: 'Addresses repeated static posture during inspection tasks.', priority: 'P2' },
  { tableC: 1, activityAdjustment: 0, validMinutes: 37, holds: 0, holdSeconds: 0, dynamicEvents: 0, dynamicSeconds: 0, region: 'Back and arms', activity: 'Supported desk work', rationale: 'No episodes are flagged in this demo. Coverage remains limited to the assessed recording.', action: 'Maintain the work setup and repeat observation when activities change.', actionReason: 'Monitors exposure changes within the observed periods.', priority: 'P3' },
];

function episodesFor(recording: Recording, workerId: string, profile: DisplayProfile): MsdEpisode[] {
  const holds: MsdEpisode[] = Array.from({ length: profile.holds }, (_, index) => ({
    id: `${recording.id}-${workerId}-hold-${index}`, kind: 'static_hold',
    start_s: index * 120, end_s: index * 120 + profile.holdSeconds,
    holding_threshold_s: 30, holding_context_complete: true,
  }));
  const dynamicStart = holds.length ? Math.ceil((holds.at(-1)!.end_s + 60) / 60) * 60 : 0;
  return [...holds, ...Array.from({ length: profile.dynamicEvents }, (_, index): MsdEpisode => ({
    id: `${recording.id}-${workerId}-dynamic-${index}`, kind: 'dynamic',
    start_s: dynamicStart + index * 120, end_s: dynamicStart + index * 120 + profile.dynamicSeconds,
    holding_threshold_s: null, holding_context_complete: true,
  }))];
}

// Opt-in display fixtures, never written to the inference API. The reference
// daily fixture is C=5, REBA=5, 12 flagged minutes + 2 extra-hold minutes:
// 2 × (12 + 2) = 28 prototype points / 0.5 usable hours = 56 points/hour.
export const exampleWindows: ObservationWindow[] = exampleRecordings.flatMap((recording, recordIndex) => recording.labels.flatMap(subject => {
  const workerIndex = exampleWorkers.findIndex(worker => worker.id === subject.worker_id);
  const profile = displayProfiles[workerIndex];
  const today = localDate(new Date(recording.recorded_at)) === localDate();
  const tableC = Math.max(1, Math.min(12, profile.tableC + (today ? 0 : recordIndex % 3 - 1)));
  const score = Math.min(15, tableC + profile.activityAdjustment);
  const weight = tableC <= 3 ? 1 : tableC <= 7 ? 2 : 3;
  const episodes = episodesFor(recording, subject.worker_id, profile);
  const overlap = (start: number, end: number, left: number, right: number) => Math.max(0, Math.min(end, right) - Math.max(start, left));
  return Array.from({ length: 40 }, (_, minute): ObservationWindow => {
    const start = minute * 60, end = start + 60;
    const usable = minute < profile.validMinutes ? 60 : 0;
    const here = episodes.filter(episode => overlap(start, end, episode.start_s, episode.end_s) > 0);
    const flagged = usable ? here.reduce((sum, episode) => sum + overlap(start, end, episode.start_s, episode.end_s), 0) : 0;
    const extra = usable ? here.reduce((sum, episode) => sum + (episode.kind === 'static_hold' ? overlap(start, end, episode.start_s + (episode.holding_threshold_s || 0), episode.end_s) : 0), 0) : 0;
    return {
      id: `example-${recording.id}-${subject.worker_id}-${minute}`, revision: 1,
      worker_id: subject.worker_id, recording_id: recording.id,
      observed_at: new Date(new Date(recording.recorded_at).getTime() + start * 1000).toISOString(),
      updated_at: new Date(new Date(recording.recorded_at).getTime() + end * 1000).toISOString(),
      start_s: start, end_s: end, usable_s: usable, flagged_s: flagged,
      reba_score: usable ? score : null, exposure_points: usable ? weight * (flagged + extra) / 60 : null,
      requires_review: flagged > 0, review_state: 'draft',
      finding: usable ? `Exposure ${profile.region.toLowerCase()} · ${profile.activity.toLowerCase()}` : 'Unknown · interval does not meet observation quality requirements',
      source: 'example',
      msd: {
        body_region: profile.region, activity: profile.activity, rationale: profile.rationale,
        table_c: usable ? tableC : null, episodes: here, holding_tracking_available: true,
        interventions: [{ id: `msd-action-${workerIndex}`, action: profile.action, reason: profile.actionReason, priority: profile.priority }],
        input_context: [{ field: 'Demo Table C', value: String(tableC) }, { field: 'Demo activity adjustment', value: String(profile.activityAdjustment) }, { field: 'Load / force, coupling, and support', value: null }, { field: 'Table A / B lookup details', value: null }],
      },
    };
  });
}));

const noiseProfile: NoiseProfile = { id: 'example-85-3-v1', name: 'Example 85/3 profile', criterion_dba: 85, exchange_rate_db: 3, reference_hours: 8, integration_threshold_dba: 80, version: 1 };
const noiseFixtures = [
  { level: 88, scope: 'personal', status: 'Partial coverage, HSE review needed', rank: 2, finding: 'Personal noise exposure during the measured interval', reason: 'The reading covers 40 minutes. It does not represent a full shift and requires HSE review.', priority: 'P2' },
  { level: 91, scope: 'personal', status: 'Needs review', rank: 3, finding: 'Personal noise exposure during operational work', reason: 'Noise is recorded during the work interval. Review the source and completeness of measurement coverage.', priority: 'P1' },
  { level: 97, scope: 'personal', status: 'Exposure criterion reached', rank: 4, finding: 'Demo dose contribution reaches the example profile criterion', reason: 'The simulated personal reading of 97 dBA over 40 minutes contributes 133.3% under the example 85/3 profile. This status comes from demo data.', priority: 'P1' },
  { level: 82, scope: 'area', status: 'Area coverage · personal assessment needed', rank: 1, finding: 'Area noise at the observed workstation', reason: 'Area readings provide location context. They do not establish an employee’s personal dose.', priority: 'P2' },
  { level: 84, scope: 'personal', status: 'Partial coverage', rank: 1, finding: 'Personal readings cover part of the work period', reason: 'Measurement coverage is limited to this recording. Unmeasured parts of the shift are not assessed.', priority: 'P3' },
  null,
  { level: 91, scope: 'area', status: 'Needs review', rank: 3, finding: 'Area noise context requires review', reason: 'Values come from an area sensor. Personal measurement and a review of source controls are still required.', priority: 'P1' },
  { level: null, scope: 'personal', status: 'Measurement value unavailable', rank: 1, finding: 'Instrument interval recorded without a dBA value', reason: 'The measurement value and calculation profile are unavailable, so dose contribution cannot be displayed.', priority: 'P2' },
] as const;

export const exampleNoiseReadings: NoiseReading[] = exampleRecordings.flatMap(recording => recording.labels.flatMap(subject => {
  const index = exampleWorkers.findIndex(worker => worker.id === subject.worker_id);
  const fixture = noiseFixtures[index];
  if (!fixture) return [];
  const covered = fixture.level === null ? 1200 : recording.duration_s;
  const dose = fixture.scope === 'personal' && fixture.level !== null
    ? 100 * (covered / 3600) / (8 * 2 ** ((85 - fixture.level) / 3)) : null;
  return [{
    id: `noise-${recording.id}-${subject.worker_id}`, revision: 1,
    worker_id: fixture.scope === 'personal' ? subject.worker_id : null,
    station_id: recording.station_id, recording_id: recording.id,
    scope: fixture.scope, start_at: recording.recorded_at,
    end_at: new Date(new Date(recording.recorded_at).getTime() + covered * 1000).toISOString(),
    level_dba: fixture.level, covered_s: covered, dose_contribution_pct: dose,
    interval_model: 'constant_simulated', instrument_id: `assumed-${fixture.scope}-sensor-${index + 1}`,
    source: 'simulated', profile: fixture.level === null ? null : noiseProfile,
    assessment_status: fixture.status, status_priority: fixture.rank,
    finding: fixture.finding, rationale: fixture.reason,
    interventions: [{ id: `noise-action-${index}`,
      action: fixture.scope === 'area' ? 'Take personal measurements and review noise sources at this workstation.' : 'Verify personal measurements and review noise source controls during the relevant task.',
      reason: fixture.scope === 'area' ? 'Area readings do not describe an employee’s personal dose.' : 'Follows up on measured exposure and fills gaps in measurement coverage.',
      priority: fixture.priority }],
    updated_at: new Date(new Date(recording.recorded_at).getTime() + covered * 1000).toISOString(),
  } satisfies NoiseReading];
}));
