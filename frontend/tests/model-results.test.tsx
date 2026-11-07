import './dom.ts';
import React from 'react';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import ModelResults from '../src/components/ModelResults.tsx';
import { workspaceApi } from '../src/lib/workspace-api.ts';
import type { Recording } from '../src/lib/workforce.ts';
import type { ModelResult } from '../src/lib/model-result.ts';

const original = { recording: workspaceApi.recording, modelResult: workspaceApi.modelResult };
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
