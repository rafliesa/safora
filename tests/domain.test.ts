import assert from 'node:assert/strict';
import test from 'node:test';
import { dateRange, exposurePoints, localDate, risk, time, validateRange } from '../src/lib/utils.ts';

test('RAISE PRD reference: 28 points, 56 points per usable hour', () => {
  assert.deepEqual(exposurePoints([{ tableC: 5, durationMinutes: 12, extraHoldMinutes: 2 }], 30), { points: 28, perHour: 56 });
});

test('points use Table C severity and never count a REBA activity adjustment twice', () => {
  assert.equal(exposurePoints([{ tableC: 3, durationMinutes: 1, extraHoldMinutes: 0 }, { tableC: 4, durationMinutes: 1, extraHoldMinutes: 0 }, { tableC: 8, durationMinutes: 1, extraHoldMinutes: 0 }], 3).points, 6);
});

test('zero observed time has no fabricated exposure rate', () => {
  assert.deepEqual(exposurePoints([], 0), { points: 0, perHour: null });
  assert.throws(() => exposurePoints([{ tableC: 5, durationMinutes: 1, extraHoldMinutes: 0 }], 0));
});

test('invalid or overlapping-duration totals cannot become a numeric result', () => {
  assert.throws(() => exposurePoints([{ tableC: 13, durationMinutes: 1, extraHoldMinutes: 0 }], 5));
  assert.throws(() => exposurePoints([{ tableC: 5, durationMinutes: 2, extraHoldMinutes: 3 }], 5));
  assert.throws(() => exposurePoints([{ tableC: 5, durationMinutes: 6, extraHoldMinutes: 0 }], 5));
  assert.throws(() => exposurePoints([], Number.NaN));
});

test('REBA 11–15 preserves the Immediate action direction', () => {
  for (const score of [11, 12, 15]) assert.match(risk(score).label, /tindakan segera/);
  assert.equal(risk(10).label, 'Tinggi');
  assert.equal(risk(7).label, 'Sedang');
  assert.equal(risk(3).label, 'Rendah');
  assert.equal(risk(null).label, 'Belum dinilai');
  assert.equal(risk(16).label, 'Belum dinilai');
});

test('selected range remains within the actual source duration', () => {
  assert.equal(validateRange(0, 5, 5), true);
  for (const input of [[-1, 3, 5], [3, 3, 5], [4, 3, 5], [0, 6, 5], [0, Number.NaN, 5]]) assert.equal(validateRange(...input as [number, number, number]), false);
});

test('daily and weekly grouping follows Jakarta date across UTC midnight', () => {
  assert.equal(localDate(new Date('2026-11-06T18:30:00Z')), '2026-11-07');
  assert.deepEqual(dateRange('2026-11-07', 'day'), { from: '2026-11-07', to: '2026-11-07' });
  assert.deepEqual(dateRange('2026-11-03', 'week'), { from: '2026-10-28', to: '2026-11-03' });
  assert.deepEqual(dateRange('2026-11-07', 'month'), { from: '2026-11-01', to: '2026-11-07' });
});

test('time display never fabricates a valid negative or unknown duration', () => {
  assert.equal(time(74.9), '01:14');
  assert.equal(time(-1), '00:00');
  assert.equal(time(Number.NaN), '00:00');
});
