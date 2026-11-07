import { BarChart3, Info } from 'lucide-react';
import type { NoiseReading } from '../lib/assessment-types';
import { formatDate } from '../lib/workforce';

export default function NoiseHistoryChart({ readings, from, to }: { readings: NoiseReading[]; from: string; to: string }) {
  const valid = readings.filter(reading => reading.level_dba !== null);
  const day = from === to;
  const start = new Date(`${from}T08:00:00+07:00`).getTime();
  const end = new Date(`${to}T17:00:00+07:00`).getTime();
  const minTime = Math.min(start, ...valid.map(reading => new Date(reading.start_at).getTime()));
  const maxTime = Math.max(end, ...valid.map(reading => new Date(reading.end_at).getTime()));
  const minDb = valid.length ? Math.floor((Math.min(...valid.map(reading => reading.level_dba!)) - 5) / 5) * 5 : 70;
  const maxDb = valid.length ? Math.ceil((Math.max(...valid.map(reading => reading.level_dba!)) + 5) / 5) * 5 : 100;
  const x = (timestamp: string | number) => 40 + ((typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime()) - minTime) / Math.max(1, maxTime - minTime) * 590;
  const y = (db: number) => 155 - (db - minDb) / Math.max(1, maxDb - minDb) * 125;
  const label = (timestamp: number) => day ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp)) : formatDate(new Date(timestamp).toISOString());
  const ticks = Array.from({ length: day ? 4 : 5 }, (_, index) => index);
  return <div className="noise-history-chart"><div className="noise-chart-legend"><span><i />Personal</span><span><i />Area</span><span>dBA · measured intervals only</span></div><div className="noise-history-plot"><svg viewBox="0 0 660 195" role="img" aria-label={valid.length ? 'Noise history by measurement interval' : 'Noise chart unavailable'}>
    {[0, 1, 2, 3].map(index => { const db = minDb + (maxDb - minDb) * index / 3; return <g key={index}><line x1="40" x2="630" y1={y(db)} y2={y(db)} stroke="#DDE5EC" strokeDasharray="3 5" /><text x="30" y={y(db) + 4} textAnchor="end" className="noise-axis">{Math.round(db)}</text></g>; })}
    {valid.map(reading => <g key={reading.id}><line x1={x(reading.start_at)} x2={x(reading.end_at)} y1={y(reading.level_dba!)} y2={y(reading.level_dba!)} stroke={reading.scope === 'personal' ? '#243F57' : '#9BBEDC'} strokeWidth="5" strokeDasharray={reading.scope === 'area' ? '6 4' : undefined} strokeLinecap="round" /><circle cx={x(reading.start_at)} cy={y(reading.level_dba!)} r="3.5" fill={reading.scope === 'personal' ? '#243F57' : '#9BBEDC'} /><title>{reading.level_dba} dBA · {reading.scope} · {formatDate(reading.start_at, { hour: '2-digit', minute: '2-digit' })}–{formatDate(reading.end_at, { hour: '2-digit', minute: '2-digit' })} · Simulated</title></g>)}
    {ticks.map((_, index) => { const timestamp = minTime + (maxTime - minTime) * index / (ticks.length - 1); return <text key={index} x={x(timestamp)} y="180" textAnchor="middle" className="noise-axis">{label(timestamp)}</text>; })}
  </svg>{!valid.length && <div className="noise-chart-empty"><BarChart3 size={25} strokeWidth={1.4} /><strong>No measurement history available</strong><p>Noise levels in dBA and measurement intervals are required.</p></div>}</div><div className="noise-chart-note"><Info size={13} /><p>Gaps are unmeasured periods. Area readings do not establish personal dose.</p></div></div>;
}
