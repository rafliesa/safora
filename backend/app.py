"""Local recording API and a single inference worker. No simulated observations."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager, contextmanager
from datetime import date, datetime, timezone
import hashlib
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
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, StrictBool, ValidationError, field_validator

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from model.integration import observation_windows

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


def create_app(data_root=None, runner=run_model):
    store = Store(data_root or os.environ.get('HEALY_DATA_DIR', ROOT/'backend/data'))

    @asynccontextmanager
    async def lifespan(app):
        pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix='model')
        app.state.pool = pool
        for record in store.all():
            if record['analysis']['status'] in ('queued', 'processing'):
                store.update(record['id'], analysis={'status': 'failed', 'message': 'Analysis interrupted by service restart. Upload again.'})
        yield
        pool.shutdown(wait=True)

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

    def public(record):
        return {k: v for k, v in record.items() if k not in ('stored_file', 'playback_file')}

    def result_for(identifier):
        record = store.get(identifier)
        if record['analysis']['status'] != 'complete':
            raise HTTPException(409, 'Analysis is not complete')
        return json.loads((store.root/identifier/'result/result.json').read_text())

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
        workers = {}
        for record in store.all():
            for label in record['labels']:
                workers[label['worker_id']] = {'id': label['worker_id'], 'name': label['worker_name'],
                    'department': record['station_id'], 'initials': ''.join(w[0] for w in label['worker_name'].split())[:2].upper()}
        return {'items': list(workers.values())}

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
        record = store.get(identifier)
        if record['analysis']['status'] != 'complete':
            raise HTTPException(409, 'Analysis is not complete')
        return FileResponse(store.root/identifier/'result/samples.csv', media_type='text/csv', filename='samples.csv')

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
