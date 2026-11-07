import { useEffect, useMemo, useState } from 'react';
import { exampleRecordings } from './demo';
import { isConnectedMode } from './api';
import { readLocalRecordings, readVideo, storeVideo, writeLocalRecordings } from './recording-storage';
import { inspectVideo } from './utils';
import { validateLabels } from './workforce';
import type { ManualLabel, Recording } from './workforce';
import { workspaceApi } from './workspace-api';

export function useRecordingLibrary(serviceRecordings: Recording[]) {
  const [local, setLocal] = useState(readLocalRecordings);
  const [playback, setPlayback] = useState<Record<string, string>>({});
  const [storageError, setStorageError] = useState('');
  const recordings = useMemo(() => {
    const entries = new Map(exampleRecordings.map(recording => [recording.id, recording]));
    for (const recording of [...local, ...serviceRecordings]) entries.set(recording.id, recording);
    return [...entries.values()].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
  }, [local, serviceRecordings]);
  const localFiles = recordings.filter(recording => recording.local_file_id).map(recording => `${recording.id}:${recording.local_file_id}`).join('|');
  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    void Promise.all(recordings.filter(recording => recording.local_file_id).map(async recording => {
      try {
        const blob = await readVideo(recording.local_file_id!);
        if (!blob || !active) return null;
        const url = URL.createObjectURL(blob); urls.push(url);
        return [recording.id, url] as const;
      } catch (cause) { if (active) setStorageError(cause instanceof Error ? cause.message : 'Video lokal belum dapat dibaca.'); return null; }
    })).then(entries => { if (active) setPlayback(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null))); });
    return () => { active = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [localFiles]);

  function persist(recording: Recording) {
    const next = [...local.filter(item => item.id !== recording.id), recording];
    try { writeLocalRecordings(next); }
    catch { throw new Error('Perubahan belum tersimpan. Penyimpanan browser penuh atau dibatasi.'); }
    setLocal(next);
    return recording;
  }

  async function saveLabels(id: string, labels: ManualLabel[]) {
    const recording = recordings.find(item => item.id === id);
    if (!recording) throw new Error('Rekaman tidak ditemukan.');
    const validation = validateLabels(labels, recording.duration_s);
    if (validation) throw new Error(validation);
    if (isConnectedMode && recording.source === 'service') return persist(await workspaceApi.saveLabels(id, labels));
    return persist({ ...recording, labels, labels_updated_at: new Date().toISOString() });
  }

  async function attachVideo(file: File, cameraId: string, existingId?: string, recordedAt?: string): Promise<Recording> {
    if (recordedAt && Number.isNaN(new Date(recordedAt).getTime())) throw new Error('Waktu mulai rekaman tidak valid. Periksa tanggal dan waktu WIB.');
    if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v|ogg)$/i.test(file.name)) throw new Error('Pilih video MP4 atau WebM yang didukung browser.');
    const metadata = await inspectVideo(file);
    const existing = recordings.find(recording => recording.id === existingId);
    const id = existing?.id || `local-${crypto.randomUUID()}`;
    const recording: Recording = {
      id, camera_id: cameraId, station_id: existing?.station_id || `STATION-${cameraId}`,
      title: existing?.title || file.name, filename: file.name,
      recorded_at: recordedAt || existing?.recorded_at || new Date().toISOString(),
      duration_s: metadata.duration_s, width: metadata.width, height: metadata.height,
      content_hash: metadata.content_hash, source: 'local', labels: [],
    };
    if (isConnectedMode) return persist(await workspaceApi.uploadRecording(file, recording));
    const fileId = `${id}-${crypto.randomUUID()}`;
    await storeVideo(fileId, file);
    return persist({ ...recording, local_file_id: fileId });
  }

  return { recordings, playback, storageError, saveLabels, attachVideo };
}
