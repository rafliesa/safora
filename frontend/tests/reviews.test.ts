import './dom.ts';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { readLocalReviews, reviewForSnapshot, saveLocalReview } from '../src/lib/local-reviews.ts';
import { buildEmployeeSnapshot } from '../src/lib/assessment-model.ts';
import { exampleNoiseReadings, exampleRecordings, exampleWindows, exampleWorkers } from '../src/lib/demo.ts';
import { dateRange, localDate } from '../src/lib/utils.ts';

afterEach(() => window.localStorage.clear());
const input = { worker: exampleWorkers[0], windows: exampleWindows, recordings: exampleRecordings, noiseReadings: exampleNoiseReadings, period: 'day' as const, ...dateRange(localDate(), 'day'), example: true };
const current = () => buildEmployeeSnapshot(input);

test('results start unreviewed and local notes persist for the exact snapshot', () => {
  const snapshot = current();
  assert.equal(reviewForSnapshot(readLocalReviews(), snapshot), null);
  const review = saveLocalReview(snapshot, snapshot, { status: 'reviewed', reviewer: 'HSE-01', notes: 'Bukti dan cakupan telah ditinjau.' });
  assert.equal(reviewForSnapshot(readLocalReviews(), snapshot)?.status, 'reviewed');
  assert.equal(review.storage, 'frontend_local');
  assert.equal(review.workerId, snapshot.worker.id);
  assert.equal(review.snapshotId, snapshot.scope.snapshotId);
  assert.equal(review.revision, snapshot.scope.revision);
});

test('review does not leak to another worker, period, date, or data source', () => {
  const snapshot = current();
  saveLocalReview(snapshot, snapshot, { status: 'reviewed', reviewer: 'HSE-01', notes: 'Daily scope reviewed.' });
  const store = readLocalReviews();
  assert.equal(reviewForSnapshot(store, buildEmployeeSnapshot({ ...input, worker: exampleWorkers[1] })), null);
  assert.equal(reviewForSnapshot(store, buildEmployeeSnapshot({ ...input, period: 'week', ...dateRange(localDate(), 'week') })), null);
  assert.equal(reviewForSnapshot(store, buildEmployeeSnapshot({ ...input, from: '2020-01-01', to: '2020-01-01' })), null);
  assert.equal(reviewForSnapshot(store, buildEmployeeSnapshot({ ...input, example: false })), null);
});

test('new revisions show unreviewed while earlier review history is retained', () => {
  const original = current();
  saveLocalReview(original, original, { status: 'reviewed', reviewer: 'HSE-01', notes: 'Original version reviewed.' });
  const target = original.windows[0];
  const revised = buildEmployeeSnapshot({ ...input, windows: exampleWindows.map(window => window.id === target.id ? { ...window, revision: 2 } : window) });
  assert.equal(reviewForSnapshot(readLocalReviews(), revised), null);
  assert.ok(reviewForSnapshot(readLocalReviews(), original));
});

test('stale dialogs cannot save against a newer displayed snapshot', () => {
  const original = current();
  const revised = buildEmployeeSnapshot({ ...input, windows: [...exampleWindows, { ...original.windows[0], id: 'new-interval' }] });
  assert.throws(() => saveLocalReview(original, revised, { status: 'reviewed', reviewer: 'HSE-01', notes: 'Outdated selection.' }), /The snapshot changed/);
  assert.deepEqual(readLocalReviews(), {});
});

test('needs-evidence state retains the HSE note and exact scope', () => {
  const snapshot = current();
  saveLocalReview(snapshot, snapshot, { status: 'needs_evidence', reviewer: 'HSE-02', notes: 'Butuh video of sisi kiri pada episode holding.' });
  const stored = reviewForSnapshot(readLocalReviews(), snapshot)!;
  assert.equal(stored.status, 'needs_evidence');
  assert.match(stored.notes, /sisi kiri/);
});

test('storage failures do not claim a saved review', () => {
  const prototype = Object.getPrototypeOf(window.localStorage);
  const original = prototype.setItem;
  prototype.setItem = () => { throw new Error('Quota exceeded'); };
  try { const snapshot = current(); assert.throws(() => saveLocalReview(snapshot, snapshot, { status: 'reviewed', reviewer: 'HSE', notes: 'Storage failure fixture.' }), /The review could not be saved/); }
  finally { prototype.setItem = original; }
  assert.deepEqual(readLocalReviews(), {});
});
