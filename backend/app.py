"""Local recording API and a single inference worker. No simulated observations."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager, contextmanager
from datetime import date, datetime, timezone
import hashlib
import csv
import io
import json
import logging
import math
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import threading
from typing import Literal
import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, ConfigDict, Field, StrictBool, ValidationError, field_validator

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from model.integration import observation_windows
from model.repetitions import add_repetitions
from backend.msd import analyze_msd, DEMO_WORKER, DEMO_WORKER_ID

MAX_BYTES = 2 * 1024**3


class Metadata(BaseModel):
    camera_id: str = Field(min_length=1, max_length=80)
    station_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=250)
    recorded_at: datetime

    @field_validator('recorded_at')
    @classmethod
    def zoned(cls, value):
        if value.tzinfo is None:
            raise ValueError('Recording time must include a timezone')
        return value


class Label(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    worker_id: str = Field(min_length=1, max_length=100)
    worker_name: str = Field(min_length=1, max_length=150)
    subject_label: str = Field(min_length=1, max_length=250)
    start_s: float = Field(ge=0)
    end_s: float = Field(gt=0)
    origin: Literal['manual']

    @field_validator('worker_id', 'worker_name', 'subject_label')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('Label fields cannot be blank')
        return value.strip()


class Labels(BaseModel):
    model_config = ConfigDict(extra='forbid')
    labels: list[Label] = Field(max_length=50)
    subject_verified: StrictBool = False


class Store:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS recordings (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.root/'recordings.sqlite3', timeout=30)
        try:
            with db:
                yield db
        finally:
            db.close()

    def all(self):
        with self.connect() as db:
            return [json.loads(row[0]) for row in db.execute('SELECT payload FROM recordings ORDER BY id')]

    def get(self, identifier):
        with self.connect() as db:
            row = db.execute('SELECT payload FROM recordings WHERE id=?', (identifier,)).fetchone()
        if row is None:
            raise HTTPException(404, 'Recording not found')
        return json.loads(row[0])

    def put(self, record):
        with self.lock, self.connect() as db:
            db.execute('INSERT INTO recordings VALUES (?,?)', (record['id'], json.dumps(record, allow_nan=False)))

    def update(self, identifier, **patch):
        with self.lock, self.connect() as db:
            record = self.get(identifier)
            record.update(patch)
            db.execute('UPDATE recordings SET payload=? WHERE id=?', (json.dumps(record, allow_nan=False), identifier))
        return record


def inspect_video(path):
    import cv2
    cap = cv2.VideoCapture(str(path))
    try:
        fps, frames = cap.get(cv2.CAP_PROP_FPS), cap.get(cv2.CAP_PROP_FRAME_COUNT)
        width, height = cap.get(cv2.CAP_PROP_FRAME_WIDTH), cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
        ok, _ = cap.read()
        if not ok or any(not math.isfinite(v) or v <= 0 for v in (fps, frames, width, height)):
            raise HTTPException(422, 'Video cannot be decoded')
        return {'duration_s': frames/fps, 'width': int(width), 'height': int(height)}
    finally:
        cap.release()


def run_model(video, output):
    with (video.parent/'analysis.log').open('w') as log:
        subprocess.run([str(ROOT/'model/.venv/bin/python'), str(ROOT/'model/infer.py'),
                        '--video', str(video), '--output-dir', str(output),
                        '--device', os.environ.get('MODEL_DEVICE', 'auto')],
                       stdout=log, stderr=subprocess.STDOUT, check=True)
    return json.loads((output/'result.json').read_text())


def run_pose(video, output):
    with (video.parent/'pose.log').open('w') as log:
        subprocess.run([str(ROOT/'model/.venv/bin/python'), str(ROOT/'model/pose_overlay.py'),
                        '--video', str(video), '--output', str(output),
                        '--device', os.environ.get('MODEL_DEVICE', 'auto')],
                       stdout=log, stderr=subprocess.STDOUT, check=True)



def prepare_playback(video):
    target = video.parent/'playback.mp4'
    with (video.parent/'playback.log').open('w') as log:
        subprocess.run([os.environ.get('FFMPEG_BINARY', 'ffmpeg'), '-nostdin', '-n',
                        '-i', str(video), '-map', '0:v:0', '-map', '0:a?',
                        '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
                        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart',
                        str(target)], stdout=log, stderr=subprocess.STDOUT, check=True)
    return target.name


def create_app(data_root=None, runner=run_model, msd_analyzer=analyze_msd, pose_runner=run_pose):
    store = Store(data_root or os.environ.get('HEALY_DATA_DIR', ROOT/'backend/data'))

    @asynccontextmanager
    async def lifespan(app):
        pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix='model')
        app.state.pool = pool
        app.state.msd_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix='msd')
        for record in store.all():
            if record['analysis']['status'] in ('queued', 'processing'):
                store.update(record['id'], analysis={'status': 'failed', 'message': 'Analysis interrupted by service restart. Upload again.'})
            elif record['analysis']['status'] == 'complete':
                if (store.root/record['id']/'pose.json').is_file():
                    store.update(record['id'], pose={'status': 'complete'})
                elif not record.get('pose'):
                    queue_pose(record['id'])
                elif record['pose']['status'] in ('queued', 'processing'):
                    store.update(record['id'], pose={'status': 'failed', 'message': 'Frame analysis interrupted by restart. Retry skeleton analysis.'})
                if record.get('msd_analysis', {}).get('status') in ('queued', 'processing'):
                    store.update(record['id'], msd_analysis={'status': 'failed', 'message': 'Interpretation interrupted by restart. Please retry.'})
                if not record.get('msd_analysis') and os.environ.get('OPENAI_API_KEY'):
                    queue_msd(record['id'])
                elif record.get('msd_analysis', {}).get('status') == 'complete' and record['msd_analysis'].get('language') != 'en' and os.environ.get('OPENAI_API_KEY'):
                    store.update(record['id'], msd_analysis={'status': 'not_started'})
                    queue_msd(record['id'])
        yield
        pool.shutdown(wait=True)
        app.state.msd_pool.shutdown(wait=True)

    app = FastAPI(title='HEALY Model Service', lifespan=lifespan)
    app.state.store = store
    allowed = ['http://localhost:3000', 'http://127.0.0.1:3000']
    app.add_middleware(CORSMiddleware, allow_origins=allowed, allow_methods=['GET', 'POST', 'PUT'], allow_headers=['Content-Type'])

    @app.middleware('http')
    async def local_writes(request, call_next):
        from fastapi.responses import JSONResponse
        origin = request.headers.get('origin')
        if request.method in ('POST', 'PUT') and origin and origin not in allowed:
            return JSONResponse({'detail': 'Origin not allowed'}, status_code=403)
        length = request.headers.get('content-length', '0')
        if not length.isdigit() or int(length) > MAX_BYTES + 1024**2:
            return JSONResponse({'detail': 'Upload limit is 2 GB'}, status_code=413)
        return await call_next(request)

    def process(identifier):
        record = store.update(identifier, analysis={'status': 'processing', 'message': 'Extracting pose and estimating exposure.'})
        folder = store.root/identifier
        try:
            if Path(record['stored_file']).suffix in ('.avi', '.mkv'):
                store.update(identifier, analysis={'status': 'processing', 'message': 'Preparing MP4 browser playback.'})
                playback_file = prepare_playback(folder/record['stored_file'])
                store.update(identifier, playback_file=playback_file, playback_url=f'/recordings/{identifier}/video',
                             analysis={'status': 'processing', 'message': 'Extracting pose and estimating exposure.'})
            result = runner(folder/record['stored_file'], folder/'result')
            if result['schema_version'] != 'healy.model.v1' or not result['samples']:
                raise ValueError('Invalid model output')
            store.update(identifier, analysis={'status': 'complete', 'message': 'Analysis complete.', 'summary': result['summary']})
        except Exception:
            logging.exception('Analysis failed for %s', identifier)
            store.update(identifier, analysis={'status': 'failed', 'message': 'Analysis failed. See the local analysis.log or playback.log; upload again to retry.'})
            return
        if os.environ.get('OPENAI_API_KEY'):
            queue_msd(identifier)
        queue_pose(identifier)

    def public(record):
        return {k: v for k, v in record.items() if k not in ('stored_file', 'playback_file')}

    def result_for(identifier):
        record = store.get(identifier)
        if record['analysis']['status'] != 'complete':
            raise HTTPException(409, 'Analysis is not complete')
        return add_repetitions(json.loads((store.root/identifier/'result/result.json').read_text()))

    def msd_metrics(identifier):
        result = result_for(identifier)
        return {'duration_s': result['input']['duration_s'], 'regions': result['summary']['repetitions'],
                'repetition_definition': 'Low → Moderate → Low; unknown/gaps interrupt; High may occur within the bout.',
                'cadence_s': result['input'].get('cadence_s', 1)}

    def process_pose(identifier):
        record = store.update(identifier, pose={'status': 'processing', 'message': 'Analyzing every video frame with the existing pose model.'})
        try:
            pose_runner(store.root/identifier/record['stored_file'], store.root/identifier/'pose.json')
            store.update(identifier, pose={'status': 'complete'})
        except Exception:
            logging.error('Frame pose analysis failed for %s; see pose.log', identifier)
            store.update(identifier, pose={'status': 'failed', 'message': 'Frame pose analysis failed. Check pose.log, then retry.'})

    def queue_pose(identifier):
        with store.lock:
            record = store.get(identifier)
            if record['analysis']['status'] != 'complete':
                raise HTTPException(409, 'Wait for exposure analysis to complete')
            current = record.get('pose', {})
            if current.get('status') in ('queued', 'processing', 'complete'):
                return current
            pending = {'status': 'queued', 'message': 'Waiting for frame-by-frame skeleton analysis.'}
            store.update(identifier, pose=pending)
            app.state.pool.submit(process_pose, identifier)
            return pending

    def process_msd(identifier, metrics):
        store.update(identifier, msd_analysis={'status': 'processing', 'message': 'The LLM is interpreting exposure and repetitions.'})
        try:
            report = msd_analyzer(metrics)
            store.update(identifier, msd_analysis=report)
        except RuntimeError as error:
            store.update(identifier, msd_analysis={'status': 'failed', 'message': str(error)})
        except Exception:
            logging.error('Invalid MSD interpretation for %s', identifier)
            store.update(identifier, msd_analysis={'status': 'failed', 'message': 'Invalid LLM response. Please retry; model results are still saved.'})

    def queue_msd(identifier):
        with store.lock:
            metrics = msd_metrics(identifier)
            current = store.get(identifier).get('msd_analysis', {})
            if current.get('status') in ('queued', 'processing', 'complete'):
                return current
            pending = {'status': 'queued', 'message': 'Waiting for LLM interpretation.'}
            store.update(identifier, msd_analysis=pending)
            app.state.msd_pool.submit(process_msd, identifier, metrics)
            return pending

    @app.get('/health')
    def health():
        return {'status': 'ok', 'analysis_available': (ROOT/'model/weights/exposure_model.pt').is_file()}

    @app.get('/live-sources')
    def sources():
        return {'items': []}  # File analysis does not imply a connected camera.

    @app.get('/noise-readings')
    def noise():
        return {'items': []}

    @app.get('/workers')
    def workers():
        workers = {DEMO_WORKER_ID: DEMO_WORKER} if store.all() else {}
        for record in store.all():
            for label in record['labels']:
                workers[label['worker_id']] = {'id': label['worker_id'], 'name': label['worker_name'],
                    'department': record['station_id'], 'initials': ''.join(w[0] for w in label['worker_name'].split())[:2].upper()}
        return {'items': list(workers.values())}

    @app.get('/workers/demo-a/msd-analysis')
    def demo_msd():
        return {'worker_id': DEMO_WORKER_ID, 'assignment': 'demo_assumption', 'items': [
            {'recording_id': record['id'], 'filename': record['filename'], 'recorded_at': record['recorded_at'],
             'metrics': msd_metrics(record['id']),
             'analysis': record.get('msd_analysis', {'status': 'not_started', 'message': 'LLM interpretation has not started.'})}
            for record in store.all() if record['analysis']['status'] == 'complete']}

    @app.post('/recordings/{identifier}/msd-analysis', status_code=202)
    def start_msd(identifier: str):
        return queue_msd(identifier)

    @app.get('/recordings/{identifier}/pose')
    def poses(identifier: str):
        record = store.get(identifier)
        if record.get('pose', {}).get('status') == 'complete':
            return FileResponse(store.root/identifier/'pose.json', media_type='application/json')
        return record.get('pose', {'status': 'queued', 'message': 'Skeleton analysis starts after exposure analysis.'})

    @app.post('/recordings/{identifier}/pose', status_code=202)
    def start_pose(identifier: str):
        return queue_pose(identifier)

    @app.get('/recordings')
    def recordings():
        return {'items': [public(record) for record in store.all()]}

    @app.post('/recordings', status_code=202)
    def upload(file: UploadFile = File(...), metadata: str = Form(...)):
        try:
            info = Metadata.model_validate_json(metadata)
        except ValidationError:
            raise HTTPException(422, 'Invalid recording metadata or missing timezone')
        suffix = Path(file.filename or '').suffix.lower()
        if suffix not in ('.mp4', '.webm', '.mov', '.m4v', '.ogg', '.avi', '.mkv'):
            raise HTTPException(422, 'Unsupported video extension')
        identifier = uuid.uuid4().hex
        folder = store.root/identifier
        folder.mkdir()
        target = folder/('source'+suffix)
        size, digest = 0, hashlib.sha256()
        try:
            with target.open('xb') as destination:
                while chunk := file.file.read(1024**2):
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise HTTPException(413, 'Upload limit is 2 GB')
                    digest.update(chunk); destination.write(chunk)
            measured = inspect_video(target)
            record = {**info.model_dump(mode='json'), **measured, 'id': identifier,
                      'filename': Path(file.filename).name, 'stored_file': target.name, 'source': 'service',
                      'content_hash': digest.hexdigest(), 'labels': [], 'subject_verified': False,
                      'revision': 1, 'playback_url': None if suffix in ('.avi', '.mkv') else f'/recordings/{identifier}/video',
                      'analysis': {'status': 'queued', 'message': 'Waiting for the inference worker.'}}
            store.put(record)
        except Exception:
            shutil.rmtree(folder)
            raise
        finally:
            file.file.close()
        app.state.pool.submit(process, identifier)
        return public(record)

    @app.get('/recordings/{identifier}')
    def recording(identifier: str):
        return public(store.get(identifier))

    @app.get('/recordings/{identifier}/video')
    def video(identifier: str):
        record = store.get(identifier)
        if not record.get('playback_url'):
            raise HTTPException(409, 'Browser playback is not ready')
        return FileResponse(store.root/identifier/record.get('playback_file', record['stored_file']), content_disposition_type='inline')

    @app.get('/recordings/{identifier}/result')
    def result(identifier: str):
        return result_for(identifier)

    @app.get('/recordings/{identifier}/samples.csv')
    def csv_result(identifier: str):
        samples = result_for(identifier)['samples']
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=list(samples[0]))
        writer.writeheader()
        writer.writerows(samples)
        return Response('\ufeff' + output.getvalue(), media_type='text/csv',
                        headers={'Content-Disposition': 'attachment; filename="samples.csv"'})

    @app.put('/recordings/{identifier}/labels')
    def save_labels(identifier: str, body: Labels):
        with store.lock:
            record = store.get(identifier)
            subjects = set()
            for label in body.labels:
                if label.end_s <= label.start_s or label.end_s > record['duration_s']+1e-6 or label.subject_label.casefold() in subjects:
                    raise HTTPException(422, 'Invalid or duplicate subject interval')
                subjects.add(label.subject_label.casefold())
            for i, a in enumerate(body.labels):
                if any(a.worker_id == b.worker_id and a.start_s < b.end_s and b.start_s < a.end_s for b in body.labels[i+1:]):
                    raise HTTPException(422, 'Overlapping labels for the same employee')
            if body.subject_verified and not (len(body.labels) == 1 and body.labels[0].start_s == 0 and abs(body.labels[0].end_s-record['duration_s']) < 1e-6):
                raise HTTPException(422, 'Association requires one confirmed foreground employee for the entire recording')
            now = datetime.now(timezone.utc).isoformat()
            record = store.update(identifier, labels=[label.model_dump() for label in body.labels],
                subject_verified=body.subject_verified, association_origin='operator_confirmation' if body.subject_verified else None,
                labels_updated_at=now, revision=record['revision']+1)
        return public(record)

    @app.get('/observations')
    def observations(from_date: date = Query(alias='from'), to: date = Query(), timezone: str = 'Asia/Jakarta'):
        if from_date > to or (to-from_date).days > 366:
            raise HTTPException(422, 'Invalid date range (maximum 366 days)')
        try:
            zone = ZoneInfo(timezone)
        except (ZoneInfoNotFoundError, ValueError):
            raise HTTPException(422, 'Unknown timezone')
        rows = []
        for record in sorted(store.all(), key=lambda r: (r['recorded_at'], r['id'])):
            if record['analysis']['status'] != 'complete' or not record.get('subject_verified'):
                continue
            rows.extend(observation_windows(result_for(record['id']), recording_id=record['id'],
                worker_id=record['labels'][0]['worker_id'], recorded_at=record['recorded_at'],
                subject_verified=True, revision=record['revision']))
        rows.sort(key=lambda r: (datetime.fromisoformat(r['observed_at']), r['recording_id'], r['id']))
        # Earliest canonical interval wins overlapping camera coverage; never double-count it.
        ends, unique = {}, []
        from datetime import timedelta
        for row in rows:
            instant = datetime.fromisoformat(row['observed_at'])
            if row['worker_id'] in ends and instant < ends[row['worker_id']]:
                continue
            ends[row['worker_id']] = instant+timedelta(seconds=row['end_s']-row['start_s'])
            if from_date <= instant.astimezone(zone).date() <= to:
                unique.append(row)
        return {'items': unique}

    return app
