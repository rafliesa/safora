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
  return { worker_id: worker.id, worker_name: worker.name, subject_label: index === 0 ? 'Subjek 1 · sisi kiri' : 'Subjek 2 · sisi kanan', start_s: 0, end_s: 2400, origin: 'manual' };
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
    title: `Observasi workstation · Kamera ${camera}`,
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
    title: `Observasi harian · Kamera ${camera}`,
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
  { tableC: 5, activityAdjustment: 0, validMinutes: 30, holds: 8, holdSeconds: 45, dynamicEvents: 6, dynamicSeconds: 60, region: 'Punggung bawah', activity: 'Membungkuk saat menjangkau material', rationale: 'Postur membungkuk berulang pada tugas menjangkau material menjadi dasar penilaian REBA pada fixture ini.', action: 'Dekatkan material dan sesuaikan tinggi area kerja untuk mengurangi membungkuk.', actionReason: 'Menangani postur punggung bawah dan durasi membungkuk yang terlihat pada rekaman.', priority: 'P2' },
  { tableC: 8, activityAdjustment: 1, validMinutes: 33, holds: 6, holdSeconds: 75, dynamicEvents: 5, dynamicSeconds: 60, region: 'Bahu dan lengan atas', activity: 'Menjangkau rak dengan lengan terangkat', rationale: 'Elevasi lengan dan jangkauan berulang memerlukan perbaikan susunan material dan peninjauan HSE.', action: 'Turunkan posisi rak yang sering digunakan dan sediakan tumpuan lengan yang sesuai.', actionReason: 'Mengurangi kebutuhan menjangkau di atas bahu selama aktivitas yang dinilai.', priority: 'P1' },
  { tableC: 10, activityAdjustment: 2, validMinutes: 28, holds: 4, holdSeconds: 90, dynamicEvents: 8, dynamicSeconds: 60, region: 'Punggung bawah dan tungkai', activity: 'Membungkuk dalam saat memindahkan material', rationale: 'Fase pemindahan pada fixture memiliki postur membungkuk dalam dan penyesuaian aktivitas yang perlu ditinjau segera.', action: 'Tinjau metode pemindahan dan alat bantu sesuai prosedur tindakan segera di lokasi.', actionReason: 'REBA fixture 12 memerlukan konfirmasi HSE dan penanganan tugas yang diprioritaskan.', priority: 'P1' },
  { tableC: 2, activityAdjustment: 0, validMinutes: 38, holds: 0, holdSeconds: 0, dynamicEvents: 0, dynamicSeconds: 0, region: 'Bahu dan punggung', activity: 'Perakitan dengan jangkauan dekat', rationale: 'Postur yang dinilai pada fixture memiliki jangkauan dekat; tidak ada episode terflag dalam interval valid.', action: 'Pertahankan jangkauan dekat dan jadwalkan observasi ulang saat tugas berubah.', actionReason: 'Mempertahankan pengaturan tugas yang teramati dan mendeteksi perubahan pola kerja.', priority: 'P3' },
  { tableC: 3, activityAdjustment: 0, validMinutes: 35, holds: 4, holdSeconds: 30, dynamicEvents: 2, dynamicSeconds: 30, region: 'Leher', activity: 'Menunduk singkat saat inspeksi', rationale: 'Episode menunduk singkat tercatat saat inspeksi; penilaian tetap perlu dibaca bersama cakupan dan konteks tugas.', action: 'Posisikan objek inspeksi agar lebih mudah dilihat tanpa menunduk berulang.', actionReason: 'Menangani aktivitas leher yang ditandai dalam interval observasi.', priority: 'P3' },
  { tableC: 6, activityAdjustment: 0, validMinutes: 32, holds: 6, holdSeconds: 60, dynamicEvents: 4, dynamicSeconds: 45, region: 'Pergelangan dan lengan bawah', activity: 'Menjangkau perangkat input berulang', rationale: 'Posisi pergelangan dan jangkauan berulang pada fixture mendasari kebutuhan perbaikan pengaturan perangkat.', action: 'Dekatkan perangkat input dan atur tumpuan lengan sesuai tugas.', actionReason: 'Mengurangi jangkauan berulang dan mempertahankan posisi pergelangan yang lebih sesuai.', priority: 'P2' },
  { tableC: 4, activityAdjustment: 0, validMinutes: 30, holds: 5, holdSeconds: 40, dynamicEvents: 3, dynamicSeconds: 40, region: 'Punggung atas', activity: 'Menahan posisi saat inspeksi', rationale: 'Posisi statis dan episode punggung atas pada fixture perlu ditinjau bersama durasi serta dukungan tubuh.', action: 'Sesuaikan posisi objek inspeksi dan sediakan dukungan tubuh yang sesuai.', actionReason: 'Menangani durasi posisi statis yang berulang pada tugas inspeksi.', priority: 'P2' },
  { tableC: 1, activityAdjustment: 0, validMinutes: 37, holds: 0, holdSeconds: 0, dynamicEvents: 0, dynamicSeconds: 0, region: 'Punggung dan lengan', activity: 'Pekerjaan meja dengan dukungan', rationale: 'Tidak ada episode terflag pada fixture ini; cakupan tetap terbatas pada rekaman yang dinilai.', action: 'Pertahankan pengaturan kerja dan ulangi observasi jika aktivitas berubah.', actionReason: 'Memantau perubahan paparan tanpa menyimpulkan kondisi di luar waktu yang diamati.', priority: 'P3' },
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
      finding: usable ? `Paparan ${profile.region.toLowerCase()} · ${profile.activity.toLowerCase()}` : 'Unknown · interval tidak memenuhi kualitas pengamatan',
      source: 'example',
      msd: {
        body_region: profile.region, activity: profile.activity, rationale: profile.rationale,
        table_c: usable ? tableC : null, episodes: here, holding_tracking_available: true,
        interventions: [{ id: `msd-action-${workerIndex}`, action: profile.action, reason: profile.actionReason, priority: profile.priority }],
        input_context: [{ field: 'Table C pada fixture', value: String(tableC) }, { field: 'Activity adjustment pada fixture', value: String(profile.activityAdjustment) }, { field: 'Load / force, coupling, dan support', value: null }, { field: 'Detail lookup Table A / B', value: null }],
      },
    };
  });
}));

const noiseProfile: NoiseProfile = { id: 'example-85-3-v1', name: 'Profil contoh 85/3', criterion_dba: 85, exchange_rate_db: 3, reference_hours: 8, integration_threshold_dba: 80, version: 1 };
const noiseFixtures = [
  { level: 88, scope: 'personal', status: 'Cakupan parsial, perlu review HSE', rank: 2, finding: 'Paparan kebisingan personal pada interval yang terukur', reason: 'Pembacaan mencakup 40 menit. Data ini belum mewakili seluruh shift dan memerlukan review HSE.', priority: 'P2' },
  { level: 91, scope: 'personal', status: 'Perlu review', rank: 3, finding: 'Paparan kebisingan personal saat pekerjaan operasional', reason: 'Kebisingan tercatat pada interval kerja; evaluasi sumber dan kelengkapan cakupan pengukuran diperlukan.', priority: 'P1' },
  { level: 97, scope: 'personal', status: 'Kriteria paparan tercapai', rank: 4, finding: 'Kontribusi dosis pada fixture mencapai kriteria profil contoh', reason: 'Fixture personal 97 dBA selama 40 menit memiliki kontribusi 133,3% menurut profil contoh 85/3. Status ini berasal dari data mock.', priority: 'P1' },
  { level: 82, scope: 'area', status: 'Cakupan area · asesmen personal diperlukan', rank: 1, finding: 'Kebisingan area pada workstation yang teramati', reason: 'Pembacaan area memberi konteks lokasi. Pembacaan ini tidak menetapkan dosis personal pegawai.', priority: 'P2' },
  { level: 84, scope: 'personal', status: 'Cakupan parsial', rank: 1, finding: 'Pembacaan personal tersedia untuk sebagian waktu kerja', reason: 'Cakupan pengukuran terbatas pada rekaman ini; tidak ada klaim untuk bagian shift yang belum diukur.', priority: 'P3' },
  null,
  { level: 91, scope: 'area', status: 'Perlu review', rank: 3, finding: 'Konteks kebisingan area memerlukan peninjauan', reason: 'Nilai berasal dari sensor area. Pengukuran personal dan peninjauan kontrol sumber masih diperlukan.', priority: 'P1' },
  { level: null, scope: 'personal', status: 'Nilai pembacaan belum tersedia', rank: 1, finding: 'Interval instrumen tercatat tanpa nilai dBA', reason: 'Nilai pembacaan dan profil perhitungan belum tersedia, sehingga kontribusi dosis belum dapat ditampilkan.', priority: 'P2' },
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
      action: fixture.scope === 'area' ? 'Lakukan pengukuran personal dan tinjau sumber kebisingan di workstation ini.' : 'Verifikasi pengukuran personal dan tinjau kontrol sumber kebisingan selama tugas terkait.',
      reason: fixture.scope === 'area' ? 'Pembacaan area belum menggambarkan dosis personal pegawai.' : 'Menindaklanjuti paparan yang terukur dan melengkapi bagian periode yang belum tercakup.',
      priority: fixture.priority }],
    updated_at: new Date(new Date(recording.recorded_at).getTime() + covered * 1000).toISOString(),
  } satisfies NoiseReading];
}));
