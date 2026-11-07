import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEmployeeSnapshot, msdBand, noiseDailyDoses } from '../src/lib/assessment-model.ts';
import { exampleNoiseReadings, exampleRecordings, exampleWindows, exampleWorkers } from '../src/lib/demo.ts';
import { dateRange, localDate } from '../src/lib/utils.ts';
import type { NoiseReading } from '../src/lib/assessment-types.ts';

const today = localDate();
export function snapshot(workerIndex = 0, period: 'day' | 'week' = 'day') {
  return buildEmployeeSnapshot({ worker: exampleWorkers[workerIndex], windows: exampleWindows, recordings: exampleRecordings, noiseReadings: exampleNoiseReadings, period, ...dateRange(today, period), example: true });
}

test('reference daily fixture: 40 recorded, 30 valid, REBA 5 Medium, 12 min / 40%, 45 sec, 28 points / 56 per hour', () => {
  const result = snapshot();
  assert.equal(result.recorded_s, 2400);
  assert.equal(result.valid_s, 1800);
  assert.equal(result.unknown_s, 600);
  assert.equal(result.msd.score, 5);
  assert.equal(result.msd.band, 'Medium');
  assert.equal(result.msd.exposure_s, 720);
  assert.equal(result.msd.exposure_pct, 40);
  assert.equal(result.msd.longest_hold_s, 45);
  assert.equal(result.msd.static_holds, 8);
  assert.equal(result.msd.event_count, 14);
  assert.equal(result.msd.extra_hold_s, 120);
  assert.equal(result.msd.points, 28);
  assert.equal(result.msd.points_per_hour, 56);
});

test('reference noise is personal 88 dBA for 40 minutes: 16.7% interval contribution under example 85/3', () => {
  const result = snapshot();
  assert.deepEqual(result.noise.levels, [88]);
  assert.deepEqual(result.noise.scopes, ['personal']);
  assert.equal(result.noise.covered_s, 2400);
  assert.ok(Math.abs(result.noise.daily_doses[0].pct! - 100 / 6) < 1e-9);
  assert.equal(result.noise.readings[0].profile?.criterion_dba, 85);
  assert.equal(result.noise.readings[0].profile?.exchange_rate_db, 3);
  assert.equal(result.noise.status, 'Cakupan parsial, perlu review HSE');
  assert.ok(result.noise.readings.every(reading => reading.source === 'simulated'));
});

test('REBA alone supplies Low/Medium/High; missing scores never become Low', () => {
  assert.equal(msdBand(3), 'Low'); assert.equal(msdBand(4), 'Medium');
  assert.equal(msdBand(8), 'High'); assert.equal(msdBand(15), 'High');
  assert.equal(msdBand(null), null); assert.equal(msdBand(0), null);
  assert.equal(snapshot(3).msd.band, 'Low');
  assert.equal(snapshot(2).msd.band, 'High');
  assert.equal(snapshot(2).msd.immediate_action, true);
});

test('noise status comes from measurement mock data without reusing an MSD band', () => {
  const original = snapshot().noise.readings[0];
  const result = buildEmployeeSnapshot({ worker: exampleWorkers[0], windows: exampleWindows, recordings: exampleRecordings,
    noiseReadings: [{ ...original, assessment_status: 'Status khusus pada fixture', level_dba: 72 }], period: 'day', from: today, to: today, example: true });
  assert.equal(result.noise.status, 'Status khusus pada fixture');
  assert.equal(result.msd.band, 'Medium');
});

test('area readings retain their scope and never become a personal dose', () => {
  const result = snapshot(3);
  assert.deepEqual(result.noise.scopes, ['area']);
  assert.deepEqual(result.noise.daily_doses, []);
  assert.ok(result.noise.readings.every(reading => reading.dose_contribution_pct === null));
  assert.equal(result.noise.status, 'Cakupan area · asesmen personal diperlukan');
});

test('different workers have distinct results, including missing instrument data', () => {
  assert.notEqual(snapshot(0).msd.score, snapshot(1).msd.score);
  assert.equal(snapshot(2).noise.status, 'Kriteria paparan tercapai');
  assert.ok(snapshot(2).noise.daily_doses[0].pct! > 100);
  assert.deepEqual(snapshot(5).noise.readings, []);
  assert.equal(snapshot(5).noise.status, 'Data pengukuran belum tersedia');
});

test('weekly points use usable hours; REBA is a maximum, and evidence can span cameras', () => {
  const day = snapshot(), week = snapshot(0, 'week');
  assert.ok(week.msd.points! > day.msd.points!);
  assert.ok(week.msd.score! <= 15);
  assert.equal(week.msd.points_per_hour, week.msd.points! / (week.valid_s / 3600));
  assert.ok(new Set(week.evidence.map(evidence => evidence.cameraId)).size > 1);
  assert.ok(week.evidence.every(evidence => evidence.subjectLabel && evidence.filename));
  assert.ok(week.noise.daily_doses.length > 1);
  for (const dose of week.noise.daily_doses) assert.ok(Math.abs(dose.pct! - 100 / 6) < 1e-9);
});

test('duplicate refresh data keeps snapshot identity; content/revision changes invalidate it', () => {
  const input = { worker: exampleWorkers[0], windows: exampleWindows, recordings: exampleRecordings, noiseReadings: exampleNoiseReadings, period: 'day' as const, from: today, to: today, example: true };
  const original = buildEmployeeSnapshot(input);
  assert.equal(buildEmployeeSnapshot({ ...input, windows: [...exampleWindows, ...exampleWindows] }).scopeKey, original.scopeKey);
  const target = original.windows[0];
  const changed = exampleWindows.map(window => window.id === target.id ? { ...window, revision: window.revision + 1 } : window);
  assert.notEqual(buildEmployeeSnapshot({ ...input, windows: changed }).scopeKey, original.scopeKey);
  const reading = original.noise.readings[0];
  assert.notEqual(buildEmployeeSnapshot({ ...input, noiseReadings: exampleNoiseReadings.map(item => item.id === reading.id ? { ...item, revision: 2, level_dba: 89 } : item) }).scopeKey, original.scopeKey);
});

test('missing holding context and zero valid time remain explicit, not fabricated metrics', () => {
  const window = snapshot().windows[0];
  const result = buildEmployeeSnapshot({ worker: exampleWorkers[0], windows: [{ ...window, msd: undefined, usable_s: 0, reba_score: null, exposure_points: null, flagged_s: 0 }], recordings: [], period: 'day', from: today, to: today, example: false });
  assert.equal(result.msd.longest_hold_s, null);
  assert.equal(result.msd.event_count, null);
  assert.equal(result.msd.exposure_pct, null);
  assert.equal(result.msd.points_per_hour, null);
});

test('overlapping personal noise intervals do not silently double the dose', () => {
  const first = snapshot().noise.readings[0];
  const doses = noiseDailyDoses([first, { ...first, id: 'overlapping-second-instrument' }]);
  assert.equal(doses[0].pct, null);
  assert.equal(doses[0].covered_s, 2400);
  assert.match(doses[0].reason!, /bertumpang tindih/);
});

test('constant simulated readings are clipped at the selected Jakarta day boundary', () => {
  const first = snapshot().noise.readings[0];
  const reading: NoiseReading = { ...first, id: 'midnight', start_at: `${today}T23:50:00+07:00`, end_at: new Date(new Date(`${today}T23:50:00+07:00`).getTime() + 20 * 60_000).toISOString(), covered_s: 1200, dose_contribution_pct: 100 / 12 };
  const result = buildEmployeeSnapshot({ worker: exampleWorkers[0], windows: [], recordings: exampleRecordings, noiseReadings: [reading], period: 'day', from: today, to: today, example: true });
  assert.equal(result.noise.covered_s, 600);
  assert.ok(Math.abs(result.noise.daily_doses[0].pct! - 100 / 24) < 1e-9);
});
