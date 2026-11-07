import { useEffect, useId, useRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight, CircleHelp, X } from 'lucide-react';
import type { Period } from '../lib/types';

export function IconButton({ icon: Icon, label, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} {...props}><Icon size={19} strokeWidth={1.7} /></button>;
}

export function Badge({ children, tone = 'neutral', dot = false }: { children: ReactNode; tone?: string; dot?: boolean }) {
  return <span className={`badge badge-${tone}`}>{dot && <span className="status-dot" />}{children}</span>;
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return <div className="section-heading"><h2><span className="section-marker" />{children}</h2>{aside}</div>;
}

export function PageTitle({ title, actions }: { title: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1></div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

export function EmptyState({ icon: Icon = CircleHelp, title, description, action, compact = false }: { icon?: LucideIcon; title: string; description: string; action?: ReactNode; compact?: boolean }) {
  return <div className={`empty-state ${compact ? 'compact' : ''}`}><div className="empty-illustration"><span /><Icon size={30} strokeWidth={1.4} /><span /></div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function PeriodTabs({ value, onChange }: { value: Period; onChange: (value: Period) => void }) {
  return <div className="period-tabs" aria-label="Observation period">{([['day', 'Day'], ['week', 'Week'], ['month', 'Month']] as const).map(([key, label]) => <button type="button" aria-pressed={value === key} className={value === key ? 'active' : ''} key={key} onClick={() => onChange(key)}>{label}</button>)}</div>;
}

export function MetricCard({ label, value, unit, detail, icon: Icon, accent, danger }: { label: string; value: string | number; unit?: string; detail: string; icon: LucideIcon; accent?: boolean; danger?: boolean }) {
  return <article className={`metric-card ${accent ? 'metric-accent' : ''} ${danger ? 'metric-danger' : ''}`}><div className="metric-label">{label}<Icon size={17} strokeWidth={1.6} /></div><div className="metric-value">{value}<span>{unit}</span></div><p><span className="small-dot" />{detail}</p></article>;
}

export function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`} aria-labelledby={id} onCancel={onClose} onClick={event => { if (event.target === ref.current) onClose(); }}><div className="dialog-header"><div><h2 id={id}>{title}</h2></div><IconButton icon={X} label="Close dialog" onClick={onClose} /></div><div className="dialog-body">{children}</div></dialog>;
}

export function TextLink({ children, href }: { children: ReactNode; href: string }) {
  return <a className="text-link" href={href}>{children}<ArrowUpRight size={15} /></a>;
}
