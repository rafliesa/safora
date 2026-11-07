import { useState } from 'react';

interface Segment { label: string; count: number; color: string }

export default function EmployeePie({ title, segments, chartLabel }: {
  title: string; segments: Segment[]; chartLabel: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  const selected = segments.find(segment => segment.label === active);
  let offset = 0;
  const point = (fraction: number) => `${80 + 72 * Math.sin(fraction * Math.PI * 2)},${80 - 72 * Math.cos(fraction * Math.PI * 2)}`;
  const detail = (segment: Segment) => `${segment.label}: ${segment.count} of ${total} employees (${total ? Math.round(segment.count / total * 100) : 0}%)`;
  return <section className="panel employee-pie" aria-label={title}>
    <h2>{title}</h2>
    {total ? <>
      <div className="employee-pie-body">
        <svg viewBox="0 0 160 160" role="img" aria-label={chartLabel} onMouseLeave={() => setActive(null)}>
          {segments.map(segment => {
            const start = offset;
            offset += segment.count / total;
            if (!segment.count) return null;
            const events = { onMouseEnter: () => setActive(segment.label), onClick: () => setActive(segment.label) };
            const opacity = active && active !== segment.label ? 0.45 : 1;
            return segment.count === total
              ? <circle key={segment.label} cx="80" cy="80" r="72" fill={segment.color} opacity={opacity} {...events}><title>{detail(segment)}</title></circle>
              : <path key={segment.label} d={`M80,80 L${point(start)} A72,72 0 ${segment.count / total > 0.5 ? 1 : 0},1 ${point(offset)} Z`}
                  fill={segment.color} stroke="white" strokeWidth="2" opacity={opacity} {...events}><title>{detail(segment)}</title></path>;
          })}
        </svg>
        <div className="employee-pie-legend">
          {segments.map(segment => <button key={segment.label} type="button" aria-label={detail(segment)}
            onMouseEnter={() => setActive(segment.label)} onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(segment.label)} onBlur={() => setActive(null)}
            onClick={() => setActive(segment.label)} onKeyDown={event => { if (event.key === 'Escape') setActive(null); }}>
            <i style={{ background: segment.color }} /><span>{segment.label}</span><strong>{segment.count}</strong>
          </button>)}
        </div>
      </div>
      <p className="employee-pie-detail" aria-live="polite">{selected ? detail(selected) : `${total} employees · Hover or select a category`}</p>
    </> : <p>No employees available.</p>}
  </section>;
}
