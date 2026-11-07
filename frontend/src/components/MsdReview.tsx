import { useEffect, useState } from 'react';
import { Badge, SectionTitle } from './UI';
import { workspaceApi } from '../lib/workspace-api';
import { formatDate } from '../lib/workforce';
import type { MsdRecordingReview } from '../lib/model-result';

const regionNames = { arm: 'Arm / shoulder', back: 'Back', uwiom: 'UW-IOM · whole posture' };
const conditions = { shoulder_tendinopathy: 'Shoulder tendinopathy', low_back_pain: 'Low back pain', insufficient_evidence: 'Insufficient evidence to classify' };
const priorities = { low: 'Low', moderate: 'Moderate', high: 'High', insufficient_data: 'Insufficient data' };
const value = (number: number | null) => number === null ? 'Not available' : number.toLocaleString('en-GB', { maximumFractionDigits: 1 });

export default function MsdReview() {
  const [items, setItems] = useState<MsdRecordingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const data = await workspaceApi.demoMsd();
        if (!active) return;
        setItems(data.items); setError(''); setLoading(false);
        timer = setTimeout(refresh, data.items.some(item => ['queued', 'processing'].includes(item.analysis.status)) ? 3000 : 60000);
      } catch (cause) {
        if (active) { setError(cause instanceof Error ? cause.message : 'Could not load the analysis.'); setLoading(false); timer = setTimeout(refresh, 5000); }
      }
    }
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [revision]);
  async function analyze(id: string) {
    setPending(id); setError('');
    try {
      const analysis = await workspaceApi.analyzeMsd(id);
      setItems(current => current.map(item => item.recording_id === id ? { ...item, analysis } : item));
      setRevision(current => current + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start the analysis.'); }
    finally { setPending(null); }
  }
  return <section className="panel msd-review" aria-label="Employee A MSD analysis">
    <SectionTitle aside={<Badge tone="demo">Demo assumption</Badge>}>Exposure & MSD review</SectionTitle>
    <p>All service recordings are assigned to Employee A for this demo. Identity has not been verified. Results cover the entire archive, rather than a selected period or a full shift.</p>
    <p><strong>Probability of developing an MSD: not established.</strong> Percentages below measure time in Moderate/High postures divided by readable time. The LLM suggests conditions to review, not a diagnosis.</p>
    {loading && <p role="status">Loading model results and LLM interpretation…</p>}
    {error && <div role="alert" className="error-message"><p>{error}</p><button className="button button-outline" onClick={() => setRevision(current => current + 1)}>Reload</button></div>}
    {!loading && !error && !items.length && <p>No recordings have completed analysis yet. <a href="/cameras/archive">Open the archive to upload a recording.</a></p>}
    {items.map(item => <article className="msd-recording-review" key={item.recording_id}>
      <h3><a href={`/recordings/${item.recording_id}`}>{item.filename}</a></h3>
      <p>{formatDate(item.recorded_at, { year: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB · {value(item.metrics.duration_s)} seconds</p>
      <div className="model-exposure-grid">{(['arm', 'back', 'uwiom'] as const).map(region => {
        const metrics = item.metrics.regions[region];
        return <article key={region}><h4>{regionNames[region]}</h4><strong>{value(metrics.exposure_pct)}{metrics.exposure_pct !== null && '%'}</strong><span>Time in Moderate/High postures</span><span>{value(metrics.elevated_s)} / {value(metrics.valid_s)} readable seconds</span><span>Coverage: {value(metrics.coverage_pct)}% of the video</span><p><b>{metrics.valid_s ? `${metrics.count} repetitions` : 'Repetitions unavailable'}</b> · Low → Moderate → Low</p></article>;
      })}</div>
      {item.analysis.status !== 'complete' && <p role={item.analysis.status === 'failed' ? 'alert' : 'status'}>{item.analysis.message}</p>}
      {['failed', 'not_started'].includes(item.analysis.status) && <button className="button button-dark" disabled={pending !== null} onClick={() => void analyze(item.recording_id)}>{pending === item.recording_id ? 'Starting…' : item.analysis.status === 'failed' ? 'Retry LLM analysis' : 'Analyze with LLM'}</button>}
      {item.analysis.interpretation && <>
        <h4>LLM interpretation · HSE review required</h4>
        <p>{item.analysis.interpretation.summary}</p>
        <div className="msd-findings">{item.analysis.interpretation.findings.map(finding => <section key={finding.region}>
          <h4>{regionNames[finding.region]}: {conditions[finding.potential_msd]}</h4>
          <p><strong>Ergonomic review priority: {priorities[finding.review_priority]}</strong></p>
          <p>{finding.rationale}</p><p><strong>Recommendation:</strong> {finding.recommendation}</p>
        </section>)}</div>
      </>}
    </article>)}
  </section>;
}
