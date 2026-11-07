import './dom.ts';
import React from 'react';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ModelResults from '../src/components/ModelResults.tsx';
import MsdReview from '../src/components/MsdReview.tsx';
import PoseOverlay from '../src/components/PoseOverlay.tsx';
import { workspaceApi } from '../src/lib/workspace-api.ts';
import type { Recording } from '../src/lib/workforce.ts';
import type { ModelResult, MsdRecordingReview, PoseFrames } from '../src/lib/model-result.ts';

const original = { recording: workspaceApi.recording, modelResult: workspaceApi.modelResult, demoMsd: workspaceApi.demoMsd, analyzeMsd: workspaceApi.analyzeMsd };
afterEach(() => { cleanup(); Object.assign(workspaceApi, original); });
const recording: Recording = { id: 'r1', camera_id: 'A', station_id: 's1', title: 'Video', filename: 'video.mp4', recorded_at: '2026-11-07T10:00:00Z', duration_s: 3, source: 'service', labels: [] };
const result: ModelResult = { schema_version: 'healy.model.v1', input: { duration_s: 3, cadence_s: 1 },
  samples: [null, 'moderate', 'low'].map((level, i) => ({ timestamp_s: i, sample_interval_s: 1, uwiom_level: level as null | 'moderate' | 'low', uwiom_status: level ? 'experimental_prediction' : 'pose_unavailable', arm_level: null, back_level: null, arm_posture_cycles_so_far: 0, back_posture_cycles_so_far: 0, clinical_msd_probability: null })),
  summary: { uwiom: { valid_samples: 2, samples: 3, coverage: 2 / 3, level_samples: { low: 1, moderate: 1, high: 0 } } } };

test('model panel follows playback time without filling missing samples', async () => {
  workspaceApi.recording = async () => ({ ...recording, analysis: { status: 'complete', message: 'Analysis complete.' } });
  workspaceApi.modelResult = async () => result;
  const view = render(<ModelResults recording={recording} currentTime={0} />);
  await waitFor(() => assert.equal(screen.getByTestId('uwiom-level').textContent, 'Not readable'));
  view.rerender(<ModelResults recording={recording} currentTime={1.2} />);
  assert.equal(screen.getByTestId('uwiom-level').textContent, 'Moderate');
  view.rerender(<ModelResults recording={recording} currentTime={2.1} />);
  assert.equal(screen.getByTestId('uwiom-level').textContent, 'Low');
  view.rerender(<ModelResults recording={recording} currentTime={0} />);
  assert.equal(screen.getByTestId('uwiom-level').textContent, 'Not readable');
  assert.ok(screen.getByText(/REBA and exposure points remain unavailable/));
  assert.equal(screen.getByRole('link', { name: 'Download per-second CSV' }).getAttribute('href'), '/recordings/r1/samples.csv');
});

test('failed analysis does not display invented categories', async () => {
  workspaceApi.recording = async () => ({ ...recording, analysis: { status: 'failed', message: 'Video failed to decode.' } });
  workspaceApi.modelResult = async () => { throw new Error('Must not fetch failed result'); };
  render(<ModelResults recording={recording} currentTime={0} />);
  await waitFor(() => assert.match(screen.getByRole('status').textContent || '', /Video failed/));
  assert.equal(screen.queryByTestId('uwiom-level'), null);
});

test('repetitions follow playback and distinguish the full recording total', async () => {
  workspaceApi.recording = async () => ({ ...recording, analysis: { status: 'complete' } });
  const data = structuredClone(result);
  data.samples[0].arm_repetitions_so_far = 0;
  data.samples[2].arm_repetitions_so_far = 2;
  const metrics = { count: 2, valid_s: 3, elevated_s: 1, exposure_pct: 100 / 3, coverage_pct: 100 };
  data.summary.repetitions = { arm: metrics, back: { ...metrics, count: 0 }, uwiom: { ...metrics, count: 0 } };
  workspaceApi.modelResult = async () => data;
  const view = render(<ModelResults recording={recording} currentTime={0} />);
  await screen.findByText('Full recording: 2 repetitions');
  assert.ok(screen.getByText('0 repetitions so far'));
  view.rerender(<ModelResults recording={recording} currentTime={2.1} />);
  assert.ok(screen.getByText('2 repetitions so far'));
  assert.equal(screen.getByRole('link', { name: 'MSD analysis · Employee A (Demo)' }).getAttribute('href'), '/employees/demo-a');
});

test('skeleton draws only observed joints and updates to the actual video frame', async () => {
  const player = document.createElement('video');
  let onFrame: (time: number, metadata: VideoFrameCallbackMetadata) => void = () => {};
  player.requestVideoFrameCallback = callback => { onFrame = callback; return 1; };
  player.cancelVideoFrameCallback = () => {};
  const previousCancel = globalThis.cancelAnimationFrame;
  globalThis.cancelAnimationFrame = () => {};
  const a: PoseFrames['frames'][number] = Array.from({ length: 17 }, () => null);
  a[5] = [100, 150, .9]; a[7] = [140, 180, .9]; a[9] = [200, 190, .1];
  const b = structuredClone(a); b[7] = [180, 200, .9];
  const frames: PoseFrames = { schema_version: 'healy.pose.v1', fps: 30, width: 640, height: 480, frame_count: 3, pose_model: 'test', frames: [a, b, null] };
  try {
    const view = render(<PoseOverlay frames={frames} video={{ current: player }} />);
    assert.equal(view.container.querySelectorAll('circle').length, 2);
    const firstPath = view.container.querySelector('path')?.getAttribute('d');
    const { act } = await import('@testing-library/react');
    act(() => onFrame(0, { mediaTime: 1 / 30 } as VideoFrameCallbackMetadata));
    assert.notEqual(view.container.querySelector('path')?.getAttribute('d'), firstPath);
    assert.equal(view.container.querySelector('svg')?.getAttribute('data-frame'), '1');
    act(() => onFrame(0, { mediaTime: 2 / 30 } as VideoFrameCallbackMetadata));
    assert.equal(view.container.querySelector('svg'), null);
    view.unmount();
  } finally { globalThis.cancelAnimationFrame = previousCancel; }
});

test('demo review shows measured percentages, classification, and retry without the limitations section', async () => {
  const metrics = { count: 3, valid_s: 100, elevated_s: 25, exposure_pct: 25, coverage_pct: 50 };
  const item: MsdRecordingReview = { recording_id: 'r1', filename: 'video.mp4', recorded_at: recording.recorded_at,
    metrics: { duration_s: 200, regions: { arm: metrics, back: metrics, uwiom: metrics } },
    analysis: { status: 'failed', message: 'OpenAI unavailable' } };
  workspaceApi.demoMsd = async () => ({ items: [structuredClone(item)] });
  let calls = 0;
  workspaceApi.analyzeMsd = async () => {
    calls++;
    item.analysis = { status: 'complete', interpretation: { summary: 'Review the shoulder posture.', clinical_msd_probability_pct: null, limitations: ['Hidden limitations.'],
      findings: [{ region: 'arm', potential_msd: 'shoulder_tendinopathy', review_priority: 'moderate', rationale: 'Measured exposure.', recommendation: 'Review workstation height.' }] } };
    return item.analysis;
  };
  render(<MsdReview />);
  await screen.findByText('OpenAI unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Retry LLM analysis' }));
  await screen.findByText('Review the shoulder posture.');
  assert.equal(calls, 1);
  assert.equal(screen.getAllByText('25%').length, 3);
  assert.ok(screen.getByText('Arm / shoulder: Shoulder tendinopathy'));
  assert.equal(screen.queryByText('Limitations & sources'), null);
  assert.equal(screen.queryByText('Hidden limitations.'), null);
  assert.ok(screen.getByText('Probability of developing an MSD: not established.'));
});
