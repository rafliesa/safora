import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyTotals, inDateRange, intradayTotals, summarizeWorker, uniqueWindows, validateLabels } from '../src/lib/workforce.ts';
import type { ManualLabel, ObservationWindow, Worker } from '../src/lib/workforce.ts';
import { exampleRecordings } from '../src/lib/demo.ts';

const worker: Worker = { id: 'W1', name: 'Worker One', department: 'Operations', initials: 'WO' };
const observation: ObservationWindow = { id: 'interval-1', revision: 1, worker_id: 'W1', recording_id: 'recording-1', observed_at: '2026-11-06T02:00:00Z', start_s: 0, end_s: 60, usable_s: 45, flagged_s: 15, reba_score: 9, exposure_points: 0.5, requires_review: true, review_state: 'draft', finding: 'Review posture evidence', source: 'service' };

test('refreshing the same interval never adds its exposure twice', () => {
  const result = summarizeWorker(worker, [observation, { ...observation }, { ...observation }]);
  assert.equal(result.windows.length, 1);
  assert.equal(result.exposure_points, 0.5);
  assert.equal(result.usable_s, 45);
});

test('a revised interval replaces the earlier revision instead of accumulating both', () => {
  const revised = { ...observation, revision: 2, exposure_points: 1 };
  assert.equal(uniqueWindows([revised, observation])[0].revision, 2);
  assert.equal(summarizeWorker(worker, [observation, revised]).exposure_points, 1);
});

test('new intervals accumulate points while REBA remains the period maximum', () => {
  const next = { ...observation, id: 'interval-2', start_s: 60, end_s: 120, reba_score: 4, exposure_points: 1 };
  const result = summarizeWorker(worker, [observation, next]);
  assert.equal(result.exposure_points, 1.5);
  assert.equal(result.peak_reba, 9);
  assert.equal(result.needs_review, true);
});

test('unreviewed AI findings are included immediately and review status is separate', () => {
  assert.equal(summarizeWorker(worker, [observation]).usable_s, 45);
  assert.equal(summarizeWorker(worker, [observation]).needs_review, true);
  const reviewed = summarizeWorker(worker, [{ ...observation, review_state: 'approved' }]);
  assert.equal(reviewed.exposure_points, 0.5);
  assert.equal(reviewed.needs_review, false);
});

test('daily and cumulative totals retain empty days as unobserved', () => {
  const next = { ...observation, id: 'interval-2', observed_at: '2026-11-07T02:00:00Z', exposure_points: 1 };
  const days = dailyTotals([observation, next, next], '2026-11-05', '2026-11-07');
  assert.deepEqual(days.map(day => day.points), [0, 0.5, 1]);
  assert.deepEqual(days.map(day => day.cumulative), [0, 0.5, 1.5]);
  assert.equal(days[0].windows, 0);
});

test('per-worker summaries never include another worker from the same video', () => {
  const other = { ...observation, id: 'other', worker_id: 'W2', exposure_points: 99 };
  assert.equal(summarizeWorker(worker, [observation, other]).exposure_points, 0.5);
});

test('daily trends accumulate minute intervals without inventing observations in gaps', () => {
  const next = { ...observation, id: 'later-minute', observed_at: '2026-11-06T02:05:00Z', exposure_points: 1 };
  const intervals = intradayTotals([next, observation, observation]);
  assert.equal(intervals.length, 2);
  assert.deepEqual(intervals.map(interval => interval.cumulative), [0.5, 1.5]);
  assert.equal(new Date(intervals[1].date).getTime() - new Date(intervals[0].date).getTime(), 5 * 60_000);
});

test('date grouping uses Jakarta date rather than UTC', () => {
  const afterMidnightJakarta = { ...observation, observed_at: '2026-11-06T18:00:00Z' };
  assert.equal(inDateRange(afterMidnightJakarta, '2026-11-07', '2026-11-07'), true);
  assert.equal(inDateRange(afterMidnightJakarta, '2026-11-06', '2026-11-06'), false);
});

test('manual labeling supports several people in one video and validates time/target ambiguity', () => {
  const first: ManualLabel = { worker_id: 'W1', worker_name: 'One', subject_label: 'Left', start_s: 0, end_s: 60, origin: 'manual' };
  const second = { ...first, worker_id: 'W2', worker_name: 'Two', subject_label: 'Right' };
  assert.equal(validateLabels([first, second], 60), null);
  assert.match(validateLabels([first, { ...second, subject_label: 'Left' }], 60) || '', /subject identifier/);
  assert.match(validateLabels([first, { ...second, end_s: 61 }], 60) || '', /Label intervals/);
  assert.match(validateLabels([first, { ...second, worker_id: 'W1' }], 60) || '', /overlap/);
  assert.equal(validateLabels([first, { ...first, subject_label: 'Later', start_s: 60, end_s: 120 }], 120), null);
});

test('the archive has multiple days and does not equate cameras with workers', () => {
  assert.ok(new Set(exampleRecordings.map(recording => recording.recorded_at.slice(0, 10))).size > 1);
  assert.ok(exampleRecordings.some(recording => recording.labels.length > 1));
  const cameraAWorkers = new Set(exampleRecordings.filter(recording => recording.camera_id === 'A').flatMap(recording => recording.labels.map(label => label.worker_id)));
  assert.ok(cameraAWorkers.size > 1);
  assert.ok(exampleRecordings.every(recording => recording.source === 'example' && !recording.playback_url));
});
