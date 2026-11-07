import { BarChart3, Info } from 'lucide-react';
import { dailyTotals, formatDate as formatDay, intradayTotals } from '../lib/workforce';
import type { ObservationWindow } from '../lib/workforce';

export default function ExposureChart({ windows, from, to, compact = false }: { windows: ObservationWindow[]; from: string; to: string; compact?: boolean }) {
  const intraday = from === to;
  const days = intraday ? intradayTotals(windows) : dailyTotals(windows, from, to);
  const formatDate = (date: string) => intraday ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(new Date(date)) : formatDay(date);
  const hasData = days.some(day => day.windows > 0);
  const max = Math.max(1, ...days.map(day => day.cumulative));
  const plotWidth = 620;
  const step = plotWidth / Math.max(1, days.length);
  const y = (value: number) => 165 - value / max * 145;
  const firstTime = days.length ? new Date(days[0].date).getTime() : 0;
  const timeSpan = days.length > 1 ? new Date(days.at(-1)!.date).getTime() - firstTime : 0;
  const point = (index: number) => intraday && timeSpan > 0 ? 46 + (new Date(days[index].date).getTime() - firstTime) / timeSpan * (plotWidth - 24) : 34 + step * index + step / 2;
  const barWidth = intraday && timeSpan > 0 ? Math.max(1.2, Math.min(26, plotWidth * 60_000 / (timeSpan + 60_000) * .5)) : Math.min(36, step * .44);
  const segments: number[][] = [];
  let segment: number[] = [];
  days.forEach((day, index) => {
    const previous = segment.at(-1);
    const timeGap = intraday && previous !== undefined && new Date(day.date).getTime() - new Date(days[previous].date).getTime() > 90_000;
    if (day.usable_s <= 0 || timeGap) { if (segment.length) segments.push(segment); segment = []; }
    if (day.usable_s > 0) segment.push(index);
  });
  if (segment.length) segments.push(segment);
  const labels = days.filter((_, index) => days.length <= 7 || index % Math.ceil(days.length / 7) === 0 || index === days.length - 1);
  return <div className={`exposure-chart ${compact ? 'exposure-chart-compact' : ''}`}>
    <div className="exposure-chart-legend"><span><i />{intraday ? 'Points per interval' : 'Points per day'}</span><span><i />Cumulative total for period</span><span className="chart-unit">RAISE points · experimental</span></div>
    <div className="exposure-plot" key={`${from}:${to}`}><svg viewBox="0 0 690 205" role="img" aria-label={hasData ? `Cumulative exposure from ${from} to ${to}` : 'No exposure data for the selected period'}>
      {[0, 1, 2, 3, 4].map(tick => <g key={tick}><path d={`M34 ${20 + tick * 36.25}H655`} stroke="#DDE5EC" strokeDasharray="3 5" /><text x="25" y={24 + tick * 36.25} textAnchor="end" className="plot-axis">{hasData ? Math.round(max * (1 - tick / 4)) : '—'}</text></g>)}
      {hasData && <><g>{days.map((day, index) => <rect key={day.date} x={point(index) - barWidth / 2} y={y(day.points)} width={barWidth} height={Math.max(0, 165 - y(day.points))} rx={Math.min(4, barWidth / 2)} fill="#9BBEDC"><title>{formatDate(day.date)}: {day.points.toFixed(1)} points, {day.windows} interval</title></rect>)}</g>{segments.map((indices, key) => <polyline key={key} points={indices.map(index => `${point(index)},${y(days[index].cumulative)}`).join(' ')} fill="none" stroke="#47769E" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />)}{days.map((day, index) => day.usable_s > 0 && <circle key={day.date} cx={point(index)} cy={y(day.cumulative)} r={intraday ? '2.3' : '3.5'} fill="#47769E" stroke="#fff" strokeWidth="1.5"><title>Cumulative {formatDate(day.date)}: {day.cumulative.toFixed(1)} points</title></circle>)}</>}
      {labels.map(day => { const index = days.indexOf(day); return <text key={day.date} x={point(index)} y="190" textAnchor="middle" className="plot-axis">{formatDate(day.date)}</text>; })}
    </svg>{!hasData && <div className="plot-empty"><BarChart3 size={28} strokeWidth={1.3} /><strong>Trends build as observations arrive</strong><p>Periodic results accumulate as they become available.</p></div>}</div>
    {hasData && <details className="chart-data"><summary>{intraday ? 'View interval data' : 'View daily data'}</summary><div className="chart-explanation"><Info size={13} /><p>Each interval is counted once. Exposure points accumulate; REBA scores are not added together. Time without observations is not treated as zero exposure.</p></div><div className="table-scroll"><table className="measurement-table"><thead><tr><th>{intraday ? 'Time (WIB)' : 'Date'}</th><th>{intraday ? 'Interval points' : 'Daily points'}</th><th>Cumulative</th><th>Valid observation time</th></tr></thead><tbody>{days.map(day => <tr key={day.date}><td>{formatDate(day.date)}</td><td>{day.windows ? day.points.toFixed(1) : 'Not observed'}</td><td>{day.cumulative.toFixed(1)}</td><td>{(day.usable_s / 60).toFixed(1)} min</td></tr>)}</tbody></table></div></details>}
  </div>;
}
