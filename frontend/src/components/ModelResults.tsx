import { useEffect, useState } from 'react';
import { Badge, SectionTitle } from './UI';
import { serviceFileUrl, workspaceApi } from '../lib/workspace-api';
import type { Recording } from '../lib/workforce';
import type { ExposureLevel, ModelResult } from '../lib/model-result';
import { time } from '../lib/utils';

const label = (level: ExposureLevel) => level === null ? 'Not readable' : ({ low: 'Low', moderate: 'Moderate', high: 'High' })[level];

export default function ModelResults({ recording, currentTime, onPlaybackReady, onResultReady }: { recording: Recording; currentTime: number; onPlaybackReady?: (recording: Recording) => void; onResultReady?: (result: ModelResult | null) => void }) {
  const [analysis, setAnalysis] = useState(recording.analysis);
  const [result, setResult] = useState<ModelResult | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setResult(null); setError(''); setAnalysis(recording.analysis);
    onResultReady?.(null);
    async function refresh() {
      try {
        const latest = await workspaceApi.recording(recording.id);
        if (!active) return;
        onPlaybackReady?.(latest);
        setAnalysis(latest.analysis); setError('');
        if (latest.analysis?.status === 'complete') {
          const data = await workspaceApi.modelResult(recording.id);
          if (active) { setResult(data); onResultReady?.(data); }
          return;
        }
        if (latest.analysis?.status === 'failed') return;
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Could not load model results.'); }
      if (active) timer = setTimeout(refresh, 3000);
    }
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [recording.id]);
  const sample = result?.samples.find(row => row.timestamp_s <= currentTime && currentTime < row.timestamp_s + row.sample_interval_s);
  const coverage = result?.summary.uwiom;
  return <section className="panel model-results" aria-label="Model exposure results">
    <SectionTitle aside={<Badge>{analysis?.status || 'Waiting'}</Badge>}>Model exposure results</SectionTitle>
    <p role="status">{analysis?.message || 'Waiting for analysis status.'}</p>
    {error && <p role="alert" className="error-message">{error}</p>}
    {result && <>
      <p>Video sample {time(currentTime)} · UW-IOM readable in {coverage?.valid_samples}/{coverage?.samples} samples ({Math.round((coverage?.coverage || 0) * 100)}%).</p>
      <div className="model-exposure-grid">
        <article><h3>UW-IOM exposure</h3><strong data-testid="uwiom-level">{label(sample?.uwiom_level ?? null)}</strong><span>Experimental whole-pose class</span><span>{sample?.uwiom_repetitions_so_far ?? 'Unknown'} repetitions so far</span><span>Full recording: {result.summary.repetitions?.uwiom.count ?? 'Unknown'} repetitions</span></article>
        <article><h3>Arm / shoulder</h3><strong>{label(sample?.arm_level ?? null)}</strong><span>{sample?.arm_repetitions_so_far ?? 'Unknown'} repetitions so far</span><span>Full recording: {result.summary.repetitions?.arm.count ?? 'Unknown'} repetitions</span></article>
        <article><h3>Back</h3><strong>{label(sample?.back_level ?? null)}</strong><span>{sample?.back_repetitions_so_far ?? 'Unknown'} repetitions so far</span><span>Full recording: {result.summary.repetitions?.back.count ?? 'Unknown'} repetitions</span></article>
      </div>
      <p>1 repetition = Low → Moderate → Low. High may occur within the cycle, but Moderate must be observed. Unreadable data or sample gaps break the cycle. Counts use one-second samples, not individual lifts or grips.</p>
      <p className="model-limits">Missing joints remain unknown. UW-IOM and MURI are exposure indicators, not a probability of developing MSD. REBA and exposure points remain unavailable.</p>
      <div className="dialog-actions"><a className="button button-dark" href="/employees/demo-a">MSD analysis · Employee A (Demo)</a><a className="button button-outline" href={serviceFileUrl(`/recordings/${encodeURIComponent(recording.id)}/samples.csv`)} download>Download per-second CSV</a><a className="button button-outline" href={serviceFileUrl(`/recordings/${encodeURIComponent(recording.id)}/result`)} target="_blank" rel="noreferrer">View JSON</a></div>
    </>}
  </section>;
}
