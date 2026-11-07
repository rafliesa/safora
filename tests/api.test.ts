import assert from 'node:assert/strict';
import test from 'node:test';
import { api, ApiError, defaultConfig } from '../src/lib/api.ts';
import type { AnalysisInput } from '../src/lib/types.ts';

const validInput: AnalysisInput = { video_id: 'video-1', camera_id: 'A', worker_id: 'WORKER-01', worker_name: '', station_id: 'B-12', task: 'Observation', session_date: '2026-11-07', timezone: 'Asia/Jakarta', shift: { start: '08:00', end: '17:00' }, start_s: 0, end_s: 5, fixture_id: null, fixture_version: null, modules: ['posture'] };
const hasStatus = (status: number) => (error: unknown) => error instanceof ApiError && error.status === status;

test('route-only reads return honest empty collections and coverage', async () => {
  assert.deepEqual(await api.sessions(), { items: [], total: 0 });
  assert.deepEqual(await api.videos(), { items: [], total: 0 });
  const dashboard = await api.dashboard('');
  assert.equal(dashboard.totals.sessions, 0);
  assert.equal(dashboard.totals.coverage_pct, null);
  assert.deepEqual(dashboard.trends, []);
});

test('configuration keeps the assumed Jakarta shift separate from observation', async () => {
  assert.deepEqual(await api.config(), defaultConfig);
  assert.equal(defaultConfig.timezone, 'Asia/Jakarta');
  assert.deepEqual(defaultConfig.shift, { start: '08:00', end: '17:00' });
  assert.equal(defaultConfig.analysis_available, false);
});

test('unknown sessions and assessments return 404', async () => {
  await assert.rejects(api.session('unknown'), hasStatus(404));
  await assert.rejects(api.assessment('unknown'), hasStatus(404));
});

test('valid analysis returns 503; malformed analysis returns 422', async () => {
  await assert.rejects(api.startAnalysis(validInput), hasStatus(503));
  await assert.rejects(api.startAnalysis({ ...validInput, worker_id: '' }), hasStatus(422));
  await assert.rejects(api.startAnalysis({ ...validInput, end_s: 0 }), hasStatus(422));
});

test('deferred registration, edits, and reviews return 501 without creating data', async () => {
  await assert.rejects(api.registerVideo(new File([], 'clip.mp4'), { filename: 'clip.mp4', duration_s: 5, width: 640, height: 480, content_hash: 'test' }), hasStatus(501));
  await assert.rejects(api.updateAssessment('unknown', {}), hasStatus(501));
  await assert.rejects(api.saveReview('unknown', { reviewer: 'HSE', decision: 'approved', rationale: 'Reference review' }), hasStatus(501));
  assert.deepEqual(await api.sessions(), { items: [], total: 0 });
});
