import { useCallback, useEffect, useState } from 'react';
import { workspaceApi } from './workspace-api';
import { REFRESH_INTERVAL_MS } from './workforce';
import type { LiveSource, ObservationWindow, Recording, Worker } from './workforce';
import { localDate } from './utils';
import type { NoiseReading } from './assessment-types';

export function usePeriodicRefresh(refresh: () => void, interval = REFRESH_INTERVAL_MS) {
  useEffect(() => {
    const timer = window.setInterval(refresh, interval);
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [refresh, interval]);
}

export function useWorkspace(selectedDate = localDate()) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [windows, setWindows] = useState<ObservationWindow[]>([]);
  const [sources, setSources] = useState<LiveSource[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [noiseReadings, setNoiseReadings] = useState<NoiseReading[]>([]);
  const [noiseUnavailableReason, setNoiseUnavailableReason] = useState('');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  usePeriodicRefresh(refresh);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const from = new Date(`${selectedDate}T12:00:00Z`); from.setUTCDate(from.getUTCDate() - 90);
    // Read only: camera/pipeline lifecycle belongs to the service, independently
    // of whether an HSE dashboard is open. There is no POST analysis trigger.
    const noise = workspaceApi.noiseReadings(localDate(from), selectedDate).then(result => ({ ...result, unavailable: '' })).catch(cause => ({ items: [] as NoiseReading[], unavailable: cause instanceof Error ? `Noise readings could not be loaded: ${cause.message}` : 'Noise readings could not be loaded.' }));
    void Promise.all([workspaceApi.workers(), workspaceApi.observations(localDate(from), selectedDate), workspaceApi.sources(), workspaceApi.recordings(), noise]).then(([people, observations, live, archive, instrument]) => {
      if (!active) return;
      setWorkers(people.items); setWindows(observations.items); setSources(live.items); setRecordings(archive.items); setLastSynced(new Date()); setError('');
      setNoiseReadings(instrument.items); setNoiseUnavailableReason(instrument.unavailable);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'The update could not be completed.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision, selectedDate]);
  return { workers, windows, sources, recordings, noiseReadings, noiseUnavailableReason, lastSynced, error, loading, refresh };
}
