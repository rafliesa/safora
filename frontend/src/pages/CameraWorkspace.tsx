import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Camera, ChevronDown, Clock3, FileVideo, FolderArchive, HardDrive, LoaderCircle, Maximize2, Plus, Radio, Save, Search, ShieldCheck, Sparkles, Tag, Upload, Users, X } from 'lucide-react';
import { Badge, Dialog, EmptyState, IconButton, PageTitle, SectionTitle } from '../components/UI';
import WorkstationScene from '../components/WorkstationScene';
import { cameras, localDate, time } from '../lib/utils';
import { formatDate, validateLabels } from '../lib/workforce';
import type { LiveSource, ManualLabel, Recording, Worker } from '../lib/workforce';
import { exampleWorkers } from '../lib/demo';

type Attach = (file: File, cameraId: string, existingId?: string, recordedAt?: string) => Promise<Recording>;

interface LibraryProps {
  recordings: Recording[];
  playback: Record<string, string>;
  onAttach: Attach;
  notify: (message: string) => void;
}

export function CameraHub({ sources, archive, cameraFilter, ...library }: LibraryProps & { sources: LiveSource[]; archive: boolean; cameraFilter?: string }) {
  const [pod, setPod] = useState('all');
  const [upload, setUpload] = useState(false);
  const visible = cameras.filter(camera => pod === 'all' || camera.department === pod);
  const online = sources.filter(source => source.status === 'online').length;
  return <>
    <PageTitle title={archive ? 'Recording Archive' : 'Camera Hub'} actions={<><span className="connection-pill"><span className={`small-dot ${online ? 'dot-success' : ''}`} />{online} cameras connected</span><button className="button button-dark" onClick={() => setUpload(true)}><Plus size={16} />Add recording</button></>} />
    <div className="camera-hub-tabs"><nav aria-label="Camera hub views"><a className={!archive ? 'active' : ''} aria-current={!archive ? 'page' : undefined} href="#/cameras"><Radio size={16} />Camera sources<span>{cameras.length}</span></a><a className={archive ? 'active' : ''} aria-current={archive ? 'page' : undefined} href="#/cameras/archive"><FolderArchive size={16} />Saved recordings<span>{library.recordings.length}</span></a></nav></div>
    {archive ? <RecordingArchive {...library} initialCamera={cameraFilter} /> : <>
      <div className="hub-toolbar"><label className="filter-select workstation-filter"><Camera size={14} /><select value={pod} onChange={event => setPod(event.target.value)} aria-label="Filter workstation pod"><option value="all">All Pods</option>{cameras.map(camera => <option key={camera.id} value={camera.department}>{camera.department}</option>)}</select><ChevronDown size={13} /></label></div>
      <div className="camera-grid">{visible.map((camera, index) => {
        const source = sources.find(item => item.camera_id === camera.id);
        const live = source?.status === 'online';
        const records = library.recordings.filter(recording => recording.camera_id === camera.id);
        return <article className="camera-card" key={camera.id}><div className="camera-card-heading"><div className="camera-card-name"><span className={`camera-letter ${index < 2 ? 'camera-letter-accent' : ''}`}>{camera.id}</span><div><h2>Camera {camera.id}<span className="camera-title-divider">/</span><span>Pod {camera.department}</span></h2><p>WORKSTATION {camera.station}</p></div></div><Badge tone={live ? 'success' : 'neutral'} dot>{live ? 'Live' : 'Not connected'}</Badge></div>
          <a className="camera-preview" href={`#/cameras/${camera.id}`} aria-label={`Open camera source ${camera.id}, Pod ${camera.department}`}>{live && source.playback_url ? <video muted autoPlay playsInline src={source.playback_url} aria-label={`Live camera preview ${camera.id}`} /> : <WorkstationScene view={camera.view} variant={camera.id} />}<div className="preview-top"><span className="preview-chip"><Camera size={12} />{camera.angle}</span><span className="preview-number">CAM_{camera.id} / 0{cameras.indexOf(camera) + 1}</span></div><div className="preview-bottom"><span><span className="preview-dot" />{live ? 'Source connects to the service' : 'Illustration · source not connected'}</span><span className="preview-open"><ArrowUpRight size={15} /></span></div></a>
          <div className="camera-source-footer"><div><FolderArchive size={17} /><span><strong>{records.length} recordings available</strong></span></div><a href={`#/cameras/${camera.id}`} className={`button camera-open ${index === 0 ? 'button-lime' : index === 1 ? 'button-dark' : 'button-muted'}`}>View source<ArrowUpRight size={15} /></a></div>
        </article>;
      })}</div>
    </>}
    {upload && <AttachRecording onAttach={library.onAttach} onClose={() => setUpload(false)} onSaved={recording => { setUpload(false); library.notify('Recording saved. Confirm the employee labels for this recording.'); window.location.hash = `/recordings/${recording.id}`; }} />}
  </>;
}

function RecordingArchive({ recordings, playback, initialCamera }: LibraryProps & { initialCamera?: string }) {
  const [camera, setCamera] = useState(initialCamera || 'all');
  const [date, setDate] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => { setCamera(initialCamera || 'all'); }, [initialCamera]);
  const visible = recordings.filter(recording => (camera === 'all' || recording.camera_id === camera) && (!date || localDate(new Date(recording.recorded_at)) === date) && `${recording.filename} ${recording.labels.map(label => `${label.worker_id} ${label.worker_name}`).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <div className="archive-filters"><div className="search-field"><Search size={16} /><input aria-label="Search recordings" placeholder="Search by filename, employee, or ID…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="Clear recording search" onClick={() => setSearch('')}><X size={14} /></button>}</div><label className="filter-select"><Camera size={14} /><select aria-label="Filter recordings by camera" value={camera} onChange={event => setCamera(event.target.value)}><option value="all">All cameras</option>{cameras.map(item => <option value={item.id} key={item.id}>Camera {item.id}</option>)}</select><ChevronDown size={13} /></label><label className="date-filter"><CalendarDays size={14} /><input aria-label="Recording date" type="date" value={date} onChange={event => setDate(event.target.value)} /></label>{date && <button className="text-link" onClick={() => setDate('')}>All dates<X size={13} /></button>}</div>
    <div className="archive-result-count">{visible.length} recordings<span>·</span>Newest first</div>
    {visible.length ? <div className="recording-grid">{visible.map(recording => <RecordingCard key={recording.id} recording={recording} playbackUrl={recording.playback_url || playback[recording.id]} />)}</div> : <section className="panel"><EmptyState icon={FolderArchive} title="No matching recordings" description="Change the date, camera, or search term to explore other recordings." /></section>}
  </>;
}

function RecordingCard({ recording, playbackUrl }: { recording: Recording; playbackUrl?: string }) {
  const camera = cameras.find(item => item.id === recording.camera_id);
  return <article className="recording-card"><a className="recording-thumbnail" href={`#/recordings/${recording.id}`} aria-label={`Open recording ${recording.filename}`}>{playbackUrl ? <video preload="metadata" muted playsInline src={playbackUrl} /> : <WorkstationScene view={camera?.view} variant={recording.camera_id} />}<div className="recording-thumbnail-top"><span><Camera size={11} />CAM {recording.camera_id}</span><Badge tone={recording.source === 'example' ? 'demo' : 'neutral'}>{recording.source === 'example' ? 'Sample metadata' : recording.source === 'local' ? 'Saved locally' : 'Saved'}</Badge></div><div className="recording-thumbnail-bottom"><span>{playbackUrl ? 'Video available' : 'No file linked'}</span><span>{time(recording.duration_s)}</span></div></a><div className="recording-card-content"><div className="recording-card-date"><CalendarDays size={13} />{formatDate(recording.recorded_at, { year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div><h2>{recording.title}</h2><p className="recording-filename" title={recording.filename}>{recording.filename}</p><div className="recording-label-chips">{recording.labels.length ? recording.labels.map((label, index) => <span key={`${label.worker_id}-${index}`}><Users size={10} />{label.worker_name}</span>) : <span className="unlabeled"><Tag size={10} />Not labeled</span>}</div><a className="recording-detail-link" href={`#/recordings/${recording.id}`}>Recording details & labels<ArrowUpRight size={14} /></a></div></article>;
}

export function SourceDetail({ cameraId, sources, recordings, playback }: { cameraId: string; sources: LiveSource[]; recordings: Recording[]; playback: Record<string, string> }) {
  const camera = cameras.find(item => item.id === cameraId);
  const source = sources.find(item => item.camera_id === cameraId);
  const preview = useRef<HTMLDivElement>(null);
  const [playbackError, setPlaybackError] = useState('');
  const related = recordings.filter(recording => recording.camera_id === cameraId);
  if (!camera) return <><PageTitle title="Camera Not Found" /><a className="button button-dark" href="#/cameras"><ArrowLeft size={15} />Back to camera hub</a></>;
  return <>
    <a className="back-link" href="#/cameras"><ArrowLeft size={14} />Camera hub</a>
    <PageTitle title={`Camera ${camera.id} · Pod ${camera.department}`} actions={<Badge tone={source?.status === 'online' ? 'success' : 'neutral'} dot>{source?.status === 'online' ? 'Live · source connected' : 'Source not connected'}</Badge>} />
    <div className="source-detail-grid"><div><div className="video-workspace source-preview" ref={preview}><div className="video-toolbar"><span className="video-toolbar-title"><span className={`small-dot ${source?.status === 'online' ? 'dot-lime' : ''}`} />CAMERA SOURCE {camera.id}</span><IconButton icon={Maximize2} label="Full-screen camera source" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => setPlaybackError('Full screen is unavailable.')); else void preview.current?.requestFullscreen().catch(() => setPlaybackError('Full screen is unavailable on this device.')); }} /></div><div className="large-preview">{source?.status === 'online' && source.playback_url ? <video controls autoPlay muted playsInline src={source.playback_url} aria-label={`Live camera video ${camera.id}`} onError={() => setPlaybackError('The source could not be played. Check the camera service connection and stream format.')} /> : <><WorkstationScene view={camera.view} variant={camera.id} large /><div className="source-waiting-overlay"><span><Radio size={24} /></span><strong>Waiting for camera source</strong><p>Workstation illustration · not a live feed</p></div></>}</div><div className="source-stream-footer"><span><Camera size={14} />{camera.angle}</span></div></div>{playbackError && <div className="error-message" role="alert"><AlertCircle size={17} /><p>{playbackError}</p></div>}</div>
      <div className="source-detail-sidebar"><section className="panel"><SectionTitle>Source Status</SectionTitle><div className="automatic-status"><Sparkles size={23} /><div><strong>{source?.analysis_status === 'running' ? 'Pipeline running' : 'Waiting for source & service'}</strong></div></div><div className="source-facts"><span>Workstation<strong>{camera.station}</strong></span><span>Connection status<strong>{source?.status === 'online' ? 'Connected' : 'Not connected'}</strong></span><span>Last observation<strong>{source?.last_observation_at ? formatDate(source.last_observation_at, { hour: '2-digit', minute: '2-digit' }) : 'Unavailable'}</strong></span></div><a href="#/overview" className="button button-outline full-width">Company dashboard<ArrowUpRight size={15} /></a></section></div></div>
    <section className="source-related"><SectionTitle aside={<a className="text-link" href={`#/cameras/archive?camera=${camera.id}`}>All recordings<ArrowRight size={14} /></a>}>Recordings from This Source</SectionTitle><div className="recording-grid">{related.slice(0, 3).map(recording => <RecordingCard key={recording.id} recording={recording} playbackUrl={recording.playback_url || playback[recording.id]} />)}</div></section>
  </>;
}

export function RecordingDetail({ recordingId, recordings, playback, onAttach, notify, workers, onSaveLabels }: LibraryProps & { recordingId: string; workers: Worker[]; onSaveLabels: (id: string, labels: ManualLabel[]) => Promise<Recording> }) {
  const recording = recordings.find(item => item.id === recordingId);
  const [labeling, setLabeling] = useState(false);
  const [attach, setAttach] = useState(false);
  const [error, setError] = useState('');
  const player = useRef<HTMLVideoElement>(null);
  if (!recording) return <><PageTitle title="Recording Not Found" /><a className="button button-dark" href="#/cameras/archive"><ArrowLeft size={15} />Open archive</a></>;
  const url = recording.playback_url || playback[recording.id];
  const camera = cameras.find(item => item.id === recording.camera_id);
  return <>
    <a className="back-link" href="#/cameras/archive"><ArrowLeft size={14} />Recording archive</a>
    <PageTitle title={`Camera Recording ${recording.camera_id}`} actions={<><Badge tone={recording.source === 'example' ? 'demo' : 'neutral'}>{recording.source === 'example' ? 'Sample metadata' : recording.source === 'local' ? 'Saved in browser' : 'Saved recordings'}</Badge><button className="button button-dark" onClick={() => setLabeling(true)}><Tag size={16} />Edit employee labels</button></>} />
    <div className="recording-detail-grid"><section className="panel recording-player-panel"><SectionTitle aside={<Badge>{time(recording.duration_s)}</Badge>}>Saved Recording</SectionTitle><div className="archive-video-player">{url ? <video controls playsInline preload="metadata" ref={player} src={url} aria-label={`Play recording ${recording.filename}`} onError={() => setError('The video could not be played. Relink the matching file.')} /> : <><WorkstationScene view={camera?.view} variant={recording.camera_id} /><div className="source-waiting-overlay"><span><FileVideo size={27} /></span><strong>No recording file linked</strong><p>Illustration for this archive entry</p><button className="button button-lime" onClick={() => setAttach(true)}><Upload size={15} />Link recording file</button></div></>}</div><div className="recording-file-details"><FileVideo size={17} /><div><strong>{recording.filename}</strong><span>{formatDate(recording.recorded_at, { year: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB · {recording.station_id} · {time(recording.duration_s)}</span></div>{url && <button className="text-link" onClick={() => setAttach(true)}>Replace file<Upload size={13} /></button>}</div>{error && <div className="error-message" role="alert"><AlertCircle size={16} /><p>{error}</p></div>}<div className="inline-note"><ShieldCheck size={16} /><p>Files are saved in this browser.</p></div></section>
      <section className="panel recording-label-panel"><SectionTitle aside={<Badge>{recording.labels.length} label</Badge>}>Employees in This Recording</SectionTitle>{recording.labels.length ? <div className="saved-labels">{recording.labels.map((label, index) => <div key={`${label.worker_id}-${index}`}><span className="label-subject-number">{index + 1}</span><div><strong>{label.worker_name}</strong><span>{label.worker_id}</span><p>{label.subject_label}</p><button className="text-link" disabled={!url} onClick={() => { if (player.current) { player.current.currentTime = label.start_s; player.current.focus(); } }}><Clock3 size={12} />{time(label.start_s)}–{time(label.end_s)}</button></div><Badge tone="lime">Manual</Badge></div>)}</div> : <EmptyState icon={Tag} title="No employee labels yet" description="Add identities and subject identifiers for people visible in the recording." compact />}<button className="button button-outline full-width" onClick={() => setLabeling(true)}><Plus size={15} />Manage manual labels</button></section></div>
    {labeling && <LabelRecording recording={recording} workers={workers} onSave={onSaveLabels} onClose={() => setLabeling(false)} onSaved={() => { setLabeling(false); notify('Manual recording labels saved.'); }} />}
    {attach && <AttachRecording existing={recording} onAttach={onAttach} onClose={() => setAttach(false)} onSaved={saved => { setAttach(false); notify('Recording saved. Reconfirm the labels for this file.'); window.location.hash = `/recordings/${saved.id}`; }} />}
  </>;
}

function LabelRecording({ recording, workers, onSave, onClose, onSaved }: { recording: Recording; workers: Worker[]; onSave: (id: string, labels: ManualLabel[]) => Promise<Recording>; onClose: () => void; onSaved: () => void }) {
  const [labels, setLabels] = useState(recording.labels.map(label => ({ ...label })));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const listId = useId();
  const known = new Map([...exampleWorkers, ...workers].map(worker => [worker.id, worker]));
  function change(index: number, patch: Partial<ManualLabel>) { setLabels(values => values.map((value, i) => i === index ? { ...value, ...patch } : value)); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    const validation = validateLabels(labels, recording.duration_s);
    if (validation) { setError(validation); return; }
    setBusy(true);
    try { await onSave(recording.id, labels.map(label => ({ ...label, worker_id: label.worker_id.trim(), worker_name: label.worker_name.trim(), subject_label: label.subject_label.trim() }))); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Labels could not be saved.'); }
    finally { setBusy(false); }
  }
  return <Dialog title="Employee Recording Labels" onClose={onClose} wide><div className="label-recording-context"><FileVideo size={18} /><div><strong>{recording.filename}</strong><p>Camera {recording.camera_id} · {time(recording.duration_s)} · labels apply to this video only</p></div></div><datalist id={listId}>{[...known.values()].map(worker => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</datalist><form onSubmit={submit}><div className="manual-label-list">{labels.map((label, index) => <fieldset className="manual-label-item" key={index}><legend>Subject {index + 1}</legend><button type="button" className="remove-label" aria-label={`Remove subject label ${index + 1}`} onClick={() => setLabels(values => values.filter((_, i) => i !== index))}><X size={16} /></button><div className="field-row"><label className="field">Employee ID<input required list={listId} placeholder="Select or enter an employee ID" value={label.worker_id} onChange={event => { const id = event.target.value; change(index, { worker_id: id, ...(known.has(id) ? { worker_name: known.get(id)!.name } : {}) }); }} /></label><label className="field">Employee name<input required placeholder="Name or anonymous identifier" value={label.worker_name} onChange={event => change(index, { worker_name: event.target.value })} /></label></div><label className="field">Subject identifier in video<input required placeholder="e.g. worker on the left, blue shirt" value={label.subject_label} onChange={event => change(index, { subject_label: event.target.value })} /></label><div className="field-row"><label className="field">Visible from (seconds)<input required type="number" min="0" max={recording.duration_s} step="0.1" value={label.start_s} onChange={event => change(index, { start_s: Number(event.target.value) })} /></label><label className="field">Visible until (seconds)<input required type="number" min="0" max={recording.duration_s} step="0.1" value={label.end_s} onChange={event => change(index, { end_s: Number(event.target.value) })} /></label></div></fieldset>)}</div><button type="button" className="button button-outline add-subject-button" onClick={() => setLabels(values => [...values, { worker_id: '', worker_name: '', subject_label: `Subject ${values.length + 1}`, start_s: 0, end_s: recording.duration_s, origin: 'manual' }])}><Plus size={15} />Add employee to video</button>{error && <div className="error-message" role="alert"><AlertCircle size={17} /><p>{error}</p></div>}<div className="dialog-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button type="submit" className="button button-dark" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}Save recording labels</button></div></form></Dialog>;
}

function AttachRecording({ existing, onAttach, onClose, onSaved }: { existing?: Recording; onAttach: Attach; onClose: () => void; onSaved: (recording: Recording) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [camera, setCamera] = useState(existing?.camera_id || 'A');
  const instant = existing ? new Date(existing.recorded_at) : new Date();
  const initialTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant);
  const [recordedAt, setRecordedAt] = useState(`${localDate(instant)}T${initialTime}`);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) { setError('Choose a video file to save.'); return; }
    setBusy(true); setError('');
    try { onSaved(await onAttach(file, camera, existing?.id, `${recordedAt}:00+07:00`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The video could not be saved.'); }
    finally { setBusy(false); }
  }
  return <Dialog title={existing ? 'Link Recording File' : 'Add Recording'} onClose={onClose}><form onSubmit={submit}><label className="field">Video file<input className="video-file-input" required type="file" accept="video/*,.mp4,.webm,.mov,.m4v" onChange={event => setFile(event.target.files?.[0] || null)} /></label><div className="field-row"><label className="field">Camera sources<div className="select-wrap"><select aria-label="Recording source camera" value={camera} onChange={event => setCamera(event.target.value)} disabled={Boolean(existing)}>{cameras.map(item => <option key={item.id} value={item.id}>Camera {item.id}</option>)}</select><ChevronDown size={14} /></div></label><label className="field">Recording start (WIB)<input required type="datetime-local" value={recordedAt} onChange={event => setRecordedAt(event.target.value)} /></label></div><div className="storage-note"><HardDrive size={19} /><p>Files are saved in this browser for archive playback.</p></div>{error && <div className="error-message" role="alert"><AlertCircle size={17} /><p>{error}</p></div>}<div className="dialog-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button type="submit" className="button button-dark" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />}{busy ? 'Saving recording…' : 'Save recording'}</button></div></form></Dialog>;
}
