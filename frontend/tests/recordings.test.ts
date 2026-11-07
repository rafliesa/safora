import './dom.ts';
import { indexedDB } from 'fake-indexeddb';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { readLocalRecordings, readVideo, storeVideo, writeLocalRecordings } from '../src/lib/recording-storage.ts';
import { exampleRecordings } from '../src/lib/demo.ts';

Object.defineProperty(globalThis, 'indexedDB', { value: indexedDB, configurable: true, writable: true });

afterEach(() => window.localStorage.clear());

test('manual label metadata survives reading the library again', () => {
  const recording = { ...exampleRecordings[0], labels: [{ worker_id: 'W-NEW', worker_name: 'Manual Worker', subject_label: 'Left subject', start_s: 0, end_s: 30, origin: 'manual' as const }] };
  writeLocalRecordings([recording]);
  assert.equal(readLocalRecordings()[0].labels[0].worker_id, 'W-NEW');
  assert.equal(readLocalRecordings()[0].camera_id, recording.camera_id);
});

test('temporary blob URLs are never mistaken for a persisted video file', () => {
  writeLocalRecordings([{ ...exampleRecordings[0], playback_url: 'blob:expired-after-refresh', local_file_id: 'stored-video-1' }]);
  const recording = readLocalRecordings()[0];
  assert.equal(recording.playback_url, undefined);
  assert.equal(recording.local_file_id, 'stored-video-1');
});

test('video bytes survive an IndexedDB save and later database reopen', async () => {
  const bytes = 'persisted binary video fixture';
  await storeVideo('roundtrip-file', new File([bytes], 'recording.webm', { type: 'video/webm' }));
  const restored = await readVideo('roundtrip-file');
  assert.ok(restored instanceof Blob);
  assert.equal(await restored.text(), bytes);
  assert.equal(restored.type, 'video/webm');
});

test('a missing local file is reported as missing, not a playable recording', async () => {
  assert.equal(await readVideo('nonexistent-file'), null);
});

test('the RAISE rename still reads previously saved recording metadata', () => {
  window.localStorage.setItem('healy-recording-library-v2', JSON.stringify([{ ...exampleRecordings[0], local_file_id: 'existing-video-bytes' }]));
  const restored = readLocalRecordings()[0];
  assert.equal(restored.id, exampleRecordings[0].id);
  assert.equal(restored.local_file_id, 'existing-video-bytes');
});
