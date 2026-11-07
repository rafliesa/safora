import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Camera, ChevronDown, Clock3, FileVideo, FolderArchive, HardDrive, Info, LoaderCircle, Maximize2, Plus, Radio, Save, Search, ShieldCheck, Sparkles, Tag, Upload, Users, Video, X } from 'lucide-react';
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
    <PageTitle eyebrow="CAMERA HUB & RECORDINGS" title={archive ? 'Arsip Rekaman Workstation' : 'Pusat Kamera Workstation'} description={archive ? 'Rekaman tersimpan, label pegawai, dan bukti observasi dari hari-hari sebelumnya.' : 'Kamera adalah sumber observasi. Pegawai diasosiasikan secara manual pada setiap rekaman.'} actions={<><span className="connection-pill"><span className={`small-dot ${online ? 'dot-success' : ''}`} />{online} kamera terhubung</span><button className="button button-dark" onClick={() => setUpload(true)}><Plus size={16} />Tambahkan rekaman</button></>} />
    <div className="camera-hub-tabs"><nav aria-label="Tampilan camera hub"><a className={!archive ? 'active' : ''} aria-current={!archive ? 'page' : undefined} href="#/cameras"><Radio size={16} />Sumber kamera<span>{cameras.length}</span></a><a className={archive ? 'active' : ''} aria-current={archive ? 'page' : undefined} href="#/cameras/archive"><FolderArchive size={16} />Rekaman tersimpan<span>{library.recordings.length}</span></a></nav><span><Sparkles size={14} />Analisis otomatis · tiap 1 menit</span></div>
    {archive ? <RecordingArchive {...library} initialCamera={cameraFilter} /> : <>
      <div className="hub-toolbar"><div className="toolbar-context"><span className="live-icon"><Video size={17} /></span><strong>Sumber Workstation</strong><span className="count-pill">{cameras.length.toString().padStart(2, '0')}</span></div><label className="filter-select"><Camera size={14} /><select value={pod} onChange={event => setPod(event.target.value)} aria-label="Filter pod workstation"><option value="all">Semua Pod</option>{cameras.map(camera => <option key={camera.id} value={camera.department}>{camera.department}</option>)}</select><ChevronDown size={13} /></label></div>
      <div className="camera-grid">{visible.map((camera, index) => {
        const source = sources.find(item => item.camera_id === camera.id);
        const live = source?.status === 'online';
        const records = library.recordings.filter(recording => recording.camera_id === camera.id);
        return <article className="camera-card" key={camera.id}><div className="camera-card-heading"><div className="camera-card-name"><span className={`camera-letter ${index < 2 ? 'camera-letter-accent' : ''}`}>{camera.id}</span><div><h2>Kamera {camera.id}<span className="camera-title-divider">/</span><span>Pod {camera.department}</span></h2><p>WORKSTATION {camera.station}</p></div></div><Badge tone={live ? 'success' : 'neutral'} dot>{live ? 'Live' : 'Belum terhubung'}</Badge></div>
          <a className="camera-preview" href={`#/cameras/${camera.id}`} aria-label={`Buka sumber Kamera ${camera.id}, Pod ${camera.department}`}>{live && source.playback_url ? <video muted autoPlay playsInline src={source.playback_url} aria-label={`Pratinjau live Kamera ${camera.id}`} /> : <WorkstationScene view={camera.view} variant={camera.id} />}<div className="preview-top"><span className="preview-chip"><Camera size={12} />{camera.angle}</span><span className="preview-number">CAM_{camera.id} / 0{cameras.indexOf(camera) + 1}</span></div><div className="preview-bottom"><span><span className="preview-dot" />{live ? 'Sumber terhubung ke layanan' : 'Ilustrasi · sumber belum terhubung'}</span><span className="preview-open"><ArrowUpRight size={15} /></span></div></a>
          <div className="camera-source-footer"><div><FolderArchive size={17} /><span><strong>{records.length} rekaman tersedia</strong><small>Label pegawai per rekaman</small></span></div><a href={`#/cameras/${camera.id}`} className={`button camera-open ${index === 0 ? 'button-lime' : index === 1 ? 'button-dark' : 'button-muted'}`}>Lihat sumber<ArrowUpRight size={15} /></a></div>
        </article>;
      })}</div>
      <div className="hub-bottom"><p><Users size={15} />Satu kamera dapat memuat beberapa pegawai. Label tidak melekat pada kamera.</p><a className="text-link" href="#/cameras/archive">Lihat rekaman hari sebelumnya<ArrowRight size={14} /></a></div>
    </>}
    {upload && <AttachRecording onAttach={library.onAttach} onClose={() => setUpload(false)} onSaved={recording => { setUpload(false); library.notify('Rekaman tersimpan. Konfirmasi label pegawai pada rekaman ini.'); window.location.hash = `/recordings/${recording.id}`; }} />}
  </>;
}

function RecordingArchive({ recordings, playback, initialCamera }: LibraryProps & { initialCamera?: string }) {
  const [camera, setCamera] = useState(initialCamera || 'all');
  const [date, setDate] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => { setCamera(initialCamera || 'all'); }, [initialCamera]);
  const visible = recordings.filter(recording => (camera === 'all' || recording.camera_id === camera) && (!date || localDate(new Date(recording.recorded_at)) === date) && `${recording.filename} ${recording.labels.map(label => `${label.worker_id} ${label.worker_name}`).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <div className="archive-intro"><FolderArchive size={18} /><p><strong>Arsip lintas hari, tetap bisa ditelusuri.</strong> Catatan contoh disediakan untuk hackathon. Tautkan file video agar rekaman contoh dapat diputar.</p><Badge tone="warning">Contoh metadata diberi label</Badge></div>
    <div className="archive-filters"><div className="search-field"><Search size={16} /><input aria-label="Cari rekaman" placeholder="Cari nama file, pegawai, atau ID…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="Hapus pencarian rekaman" onClick={() => setSearch('')}><X size={14} /></button>}</div><label className="filter-select"><Camera size={14} /><select aria-label="Filter kamera rekaman" value={camera} onChange={event => setCamera(event.target.value)}><option value="all">Semua kamera</option>{cameras.map(item => <option value={item.id} key={item.id}>Kamera {item.id}</option>)}</select><ChevronDown size={13} /></label><label className="date-filter"><CalendarDays size={14} /><input aria-label="Tanggal rekaman" type="date" value={date} onChange={event => setDate(event.target.value)} /></label>{date && <button className="text-link" onClick={() => setDate('')}>Semua hari<X size={13} /></button>}</div>
    <div className="archive-result-count">{visible.length} rekaman<span>·</span>Urutan terbaru</div>
    {visible.length ? <div className="recording-grid">{visible.map(recording => <RecordingCard key={recording.id} recording={recording} playbackUrl={recording.playback_url || playback[recording.id]} />)}</div> : <section className="panel"><EmptyState icon={FolderArchive} title="Tidak ada rekaman yang cocok" description="Ubah tanggal, kamera, atau kata kunci untuk menelusuri arsip lainnya." /></section>}
  </>;
}

function RecordingCard({ recording, playbackUrl }: { recording: Recording; playbackUrl?: string }) {
  const camera = cameras.find(item => item.id === recording.camera_id);
  return <article className="recording-card"><a className="recording-thumbnail" href={`#/recordings/${recording.id}`} aria-label={`Buka rekaman ${recording.filename}`}>{playbackUrl ? <video preload="metadata" muted playsInline src={playbackUrl} /> : <WorkstationScene view={camera?.view} variant={recording.camera_id} />}<div className="recording-thumbnail-top"><span><Camera size={11} />CAM {recording.camera_id}</span><Badge tone={recording.source === 'example' ? 'demo' : 'neutral'}>{recording.source === 'example' ? 'Contoh metadata' : recording.source === 'local' ? 'Tersimpan lokal' : 'Tersimpan'}</Badge></div><div className="recording-thumbnail-bottom"><span>{playbackUrl ? 'Video tersedia' : 'File belum ditautkan'}</span><span>{time(recording.duration_s)}</span></div></a><div className="recording-card-content"><div className="recording-card-date"><CalendarDays size={13} />{formatDate(recording.recorded_at, { year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div><h2>{recording.title}</h2><p className="recording-filename" title={recording.filename}>{recording.filename}</p><div className="recording-label-chips">{recording.labels.length ? recording.labels.map((label, index) => <span key={`${label.worker_id}-${index}`}><Users size={10} />{label.worker_name}</span>) : <span className="unlabeled"><Tag size={10} />Belum dilabel</span>}</div><a className="recording-detail-link" href={`#/recordings/${recording.id}`}>Detail & label rekaman<ArrowUpRight size={14} /></a></div></article>;
}

export function SourceDetail({ cameraId, sources, recordings, playback }: { cameraId: string; sources: LiveSource[]; recordings: Recording[]; playback: Record<string, string> }) {
  const camera = cameras.find(item => item.id === cameraId);
  const source = sources.find(item => item.camera_id === cameraId);
  const preview = useRef<HTMLDivElement>(null);
  const [playbackError, setPlaybackError] = useState('');
  const related = recordings.filter(recording => recording.camera_id === cameraId);
  if (!camera) return <><PageTitle eyebrow="SUMBER KAMERA" title="Kamera Tidak Ditemukan" /><a className="button button-dark" href="#/cameras"><ArrowLeft size={15} />Kembali ke camera hub</a></>;
  return <>
    <a className="back-link" href="#/cameras"><ArrowLeft size={14} />Camera hub</a>
    <PageTitle eyebrow="SUMBER KAMERA" title={`Kamera ${camera.id} · Pod ${camera.department}`} description={`Workstation ${camera.station} · sumber bersama, tanpa pegawai tetap`} actions={<Badge tone={source?.status === 'online' ? 'success' : 'neutral'} dot>{source?.status === 'online' ? 'Live · sumber terhubung' : 'Sumber belum terhubung'}</Badge>} />
    <div className="source-detail-grid"><div><div className="video-workspace source-preview" ref={preview}><div className="video-toolbar"><span className="video-toolbar-title"><span className={`small-dot ${source?.status === 'online' ? 'dot-lime' : ''}`} />SUMBER KAMERA {camera.id}</span><IconButton icon={Maximize2} label="Layar penuh sumber kamera" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => setPlaybackError('Layar penuh belum tersedia.')); else void preview.current?.requestFullscreen().catch(() => setPlaybackError('Layar penuh belum tersedia pada perangkat ini.')); }} /></div><div className="large-preview">{source?.status === 'online' && source.playback_url ? <video controls autoPlay muted playsInline src={source.playback_url} aria-label={`Video live Kamera ${camera.id}`} onError={() => setPlaybackError('Sumber belum dapat diputar. Periksa koneksi dan format stream pada layanan kamera.')} /> : <><WorkstationScene view={camera.view} variant={camera.id} large /><div className="source-waiting-overlay"><span><Radio size={24} /></span><strong>Menunggu sumber kamera</strong><p>Ilustrasi workstation · bukan live feed</p></div></>}</div><div className="source-stream-footer"><span><Camera size={14} />{camera.angle}</span><span><Sparkles size={14} />Analisis otomatis setiap {source?.cadence_s || 60} detik</span></div></div>{playbackError && <div className="error-message" role="alert"><AlertCircle size={17} /><p>{playbackError}</p></div>}<div className="inline-note source-auto-note"><Info size={16} /><p>Analisis dimulai oleh layanan sejak kamera menyala. Membuka halaman ini hanya menampilkan sumber dan hasil; tidak memulai ulang perhitungan.</p></div></div>
      <div className="source-detail-sidebar"><section className="panel"><SectionTitle>Analisis Otomatis</SectionTitle><div className="automatic-status"><Sparkles size={23} /><div><strong>{source?.analysis_status === 'running' ? 'Pipeline berjalan' : 'Menunggu sumber & layanan'}</strong><p>Interval hasil {source?.cadence_s || 60} detik</p></div></div><div className="source-facts"><span>Identitas sumber<strong>Kamera {camera.id}</strong></span><span>Status koneksi<strong>{source?.status === 'online' ? 'Terhubung' : 'Belum terhubung'}</strong></span><span>Observasi terakhir<strong>{source?.last_observation_at ? formatDate(source.last_observation_at, { hour: '2-digit', minute: '2-digit' }) : 'Belum tersedia'}</strong></span></div><a href="#/overview" className="button button-outline full-width">Dashboard perusahaan<ArrowUpRight size={15} /></a></section><section className="panel source-identity-note"><SectionTitle>Label pada Rekaman</SectionTitle><Users size={26} strokeWidth={1.4} /><h3>Satu sumber, berbagai pegawai.</h3><p>Konfirmasi pegawai secara manual pada rekaman terkait. Satu video dapat memiliki beberapa label subjek beserta intervalnya.</p><a className="text-link" href={`#/cameras/archive?camera=${camera.id}`}>Buka arsip Kamera {camera.id}<ArrowRight size={14} /></a></section></div></div>
    <section className="source-related"><SectionTitle aside={<a className="text-link" href={`#/cameras/archive?camera=${camera.id}`}>Semua rekaman<ArrowRight size={14} /></a>}>Rekaman dari Sumber Ini</SectionTitle><div className="recording-grid">{related.slice(0, 3).map(recording => <RecordingCard key={recording.id} recording={recording} playbackUrl={recording.playback_url || playback[recording.id]} />)}</div></section>
  </>;
}

export function RecordingDetail({ recordingId, recordings, playback, onAttach, notify, workers, onSaveLabels }: LibraryProps & { recordingId: string; workers: Worker[]; onSaveLabels: (id: string, labels: ManualLabel[]) => Promise<Recording> }) {
  const recording = recordings.find(item => item.id === recordingId);
  const [labeling, setLabeling] = useState(false);
  const [attach, setAttach] = useState(false);
  const [error, setError] = useState('');
  const player = useRef<HTMLVideoElement>(null);
  if (!recording) return <><PageTitle eyebrow="ARSIP REKAMAN" title="Rekaman Tidak Ditemukan" description="Pilih rekaman dari arsip yang tersedia." /><a className="button button-dark" href="#/cameras/archive"><ArrowLeft size={15} />Buka arsip</a></>;
  const url = recording.playback_url || playback[recording.id];
  const camera = cameras.find(item => item.id === recording.camera_id);
  return <>
    <a className="back-link" href="#/cameras/archive"><ArrowLeft size={14} />Arsip rekaman</a>
    <PageTitle eyebrow={`REKAMAN / ${recording.id}`} title={`Rekaman Kamera ${recording.camera_id}`} description={`${formatDate(recording.recorded_at, { year: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB · ${recording.station_id}`} actions={<><Badge tone={recording.source === 'example' ? 'demo' : 'neutral'}>{recording.source === 'example' ? 'Contoh metadata' : recording.source === 'local' ? 'Tersimpan di browser' : 'Rekaman tersimpan'}</Badge><button className="button button-dark" onClick={() => setLabeling(true)}><Tag size={16} />Edit label pegawai</button></>} />
    <div className="recording-detail-grid"><section className="panel recording-player-panel"><SectionTitle aside={<Badge>{time(recording.duration_s)}</Badge>}>Rekaman Tersimpan</SectionTitle><div className="archive-video-player">{url ? <video controls playsInline preload="metadata" ref={player} src={url} aria-label={`Putar rekaman ${recording.filename}`} onError={() => setError('Video belum dapat diputar. Tautkan kembali file yang sesuai.')} /> : <><WorkstationScene view={camera?.view} variant={recording.camera_id} /><div className="source-waiting-overlay"><span><FileVideo size={27} /></span><strong>File rekaman belum ditautkan</strong><p>Ilustrasi untuk catatan arsip ini</p><button className="button button-lime" onClick={() => setAttach(true)}><Upload size={15} />Tautkan file rekaman</button></div></>}</div><div className="recording-file-details"><FileVideo size={17} /><div><strong>{recording.filename}</strong><span>{recording.width ? `${recording.width} × ${recording.height} · ` : ''}{time(recording.duration_s)} · Kamera {recording.camera_id}</span></div>{url && <button className="text-link" onClick={() => setAttach(true)}>Ganti file<Upload size={13} /></button>}</div>{error && <div className="error-message" role="alert"><AlertCircle size={16} /><p>{error}</p></div>}<div className="inline-note"><ShieldCheck size={16} /><p>Rekaman lokal disimpan di browser ini. Berkas contoh perlu ditautkan sebelum dapat diputar; tidak ada video asli yang dihasilkan dari ilustrasi.</p></div></section>
      <section className="panel recording-label-panel"><SectionTitle aside={<Badge>{recording.labels.length} label</Badge>}>Pegawai pada Rekaman</SectionTitle><p className="workforce-helper">Identitas dikonfirmasi manual per video, termasuk penanda subjek dan interval kemunculannya.</p>{recording.labels.length ? <div className="saved-labels">{recording.labels.map((label, index) => <div key={`${label.worker_id}-${index}`}><span className="label-subject-number">{index + 1}</span><div><strong>{label.worker_name}</strong><span>{label.worker_id}</span><p>{label.subject_label}</p><button className="text-link" disabled={!url} onClick={() => { if (player.current) { player.current.currentTime = label.start_s; player.current.focus(); } }}><Clock3 size={12} />{time(label.start_s)}–{time(label.end_s)}</button></div><Badge tone="lime">Manual</Badge></div>)}</div> : <EmptyState icon={Tag} title="Belum ada label pegawai" description="Tambahkan identitas dan penanda subjek yang terlihat pada rekaman." compact />}<button className="button button-outline full-width" onClick={() => setLabeling(true)}><Plus size={15} />Kelola label manual</button><div className="recording-label-note"><Info size={14} /><p>Label video ini tidak menetapkan pemilik kamera. Sumber yang sama dapat merekam pegawai lain pada waktu berbeda.</p></div></section></div>
    {labeling && <LabelRecording recording={recording} workers={workers} onSave={onSaveLabels} onClose={() => setLabeling(false)} onSaved={() => { setLabeling(false); notify('Label manual rekaman tersimpan.'); }} />}
    {attach && <AttachRecording existing={recording} onAttach={onAttach} onClose={() => setAttach(false)} onSaved={saved => { setAttach(false); notify('Rekaman tersimpan. Label perlu dikonfirmasi kembali untuk file ini.'); window.location.hash = `/recordings/${saved.id}`; }} />}
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
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Label belum tersimpan.'); }
    finally { setBusy(false); }
  }
  return <Dialog title="Label Pegawai pada Rekaman" onClose={onClose} wide><div className="label-recording-context"><FileVideo size={18} /><div><strong>{recording.filename}</strong><p>Kamera {recording.camera_id} · {time(recording.duration_s)} · label hanya untuk video ini</p></div></div><datalist id={listId}>{[...known.values()].map(worker => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</datalist><form onSubmit={submit}><div className="manual-label-list">{labels.map((label, index) => <fieldset className="manual-label-item" key={index}><legend>Subjek {index + 1}</legend><button type="button" className="remove-label" aria-label={`Hapus label subjek ${index + 1}`} onClick={() => setLabels(values => values.filter((_, i) => i !== index))}><X size={16} /></button><div className="field-row"><label className="field">ID pegawai<input required list={listId} placeholder="Pilih / ketik ID pegawai" value={label.worker_id} onChange={event => { const id = event.target.value; change(index, { worker_id: id, ...(known.has(id) ? { worker_name: known.get(id)!.name } : {}) }); }} /></label><label className="field">Nama pegawai<input required placeholder="Nama atau identitas anonim" value={label.worker_name} onChange={event => change(index, { worker_name: event.target.value })} /></label></div><label className="field">Penanda subjek dalam video<input required placeholder="Mis. pekerja sisi kiri, baju biru" value={label.subject_label} onChange={event => change(index, { subject_label: event.target.value })} /></label><div className="field-row"><label className="field">Mulai terlihat (detik)<input required type="number" min="0" max={recording.duration_s} step="0.1" value={label.start_s} onChange={event => change(index, { start_s: Number(event.target.value) })} /></label><label className="field">Selesai terlihat (detik)<input required type="number" min="0" max={recording.duration_s} step="0.1" value={label.end_s} onChange={event => change(index, { end_s: Number(event.target.value) })} /></label></div></fieldset>)}</div><button type="button" className="button button-outline add-subject-button" onClick={() => setLabels(values => [...values, { worker_id: '', worker_name: '', subject_label: `Subjek ${values.length + 1}`, start_s: 0, end_s: recording.duration_s, origin: 'manual' }])}><Plus size={15} />Tambah pegawai pada video</button><div className="inline-note"><Info size={15} /><p>Satu rekaman bisa memiliki beberapa label. Label menentukan asosiasi manual; identifikasi otomatis tidak diasumsikan.</p></div>{error && <div className="error-message" role="alert"><AlertCircle size={17} /><p>{error}</p></div>}<div className="dialog-actions"><button type="button" className="button button-outline" onClick={onClose}>Batal</button><button type="submit" className="button button-dark" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}Simpan label rekaman</button></div></form></Dialog>;
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
    if (!file) { setError('Pilih file video untuk disimpan.'); return; }
    setBusy(true); setError('');
    try { onSaved(await onAttach(file, camera, existing?.id, `${recordedAt}:00+07:00`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Video belum tersimpan.'); }
    finally { setBusy(false); }
  }
  return <Dialog title={existing ? 'Tautkan File Rekaman' : 'Tambahkan Rekaman'} onClose={onClose}><form onSubmit={submit}><label className="field">File video<input className="video-file-input" required type="file" accept="video/*,.mp4,.webm,.mov,.m4v" onChange={event => setFile(event.target.files?.[0] || null)} /></label><div className="field-row"><label className="field">Sumber kamera<div className="select-wrap"><select aria-label="Kamera asal rekaman" value={camera} onChange={event => setCamera(event.target.value)} disabled={Boolean(existing)}>{cameras.map(item => <option key={item.id} value={item.id}>Kamera {item.id}</option>)}</select><ChevronDown size={14} /></div></label><label className="field">Mulai rekaman (WIB)<input required type="datetime-local" value={recordedAt} onChange={event => setRecordedAt(event.target.value)} /></label></div><div className="storage-note"><HardDrive size={19} /><p>File disimpan agar dapat diputar kembali dari arsip. Saat layanan belum terhubung, penyimpanan memakai browser perangkat ini.</p></div><div className="inline-note"><Tag size={15} /><p>Setelah file dipilih, konfirmasi label pegawai pada rekaman. Tidak ada tombol untuk memulai analisis AI.</p></div>{error && <div className="error-message" role="alert"><AlertCircle size={17} /><p>{error}</p></div>}<div className="dialog-actions"><button type="button" className="button button-outline" onClick={onClose}>Batal</button><button type="submit" className="button button-dark" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />}{busy ? 'Menyimpan rekaman…' : 'Simpan rekaman'}</button></div></form></Dialog>;
}
