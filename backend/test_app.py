import copy
import csv
import io
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from backend.app import create_app
from model.repetitions import add_repetitions

RESULT = {'schema_version': 'healy.model.v1', 'input': {'duration_s': 2.5},
          'samples': [{'timestamp_s': i, 'sample_interval_s': min(1, 2.5-i), 'uwiom_level': level}
                      for i, level in enumerate(['moderate', None, 'low'])],
          'summary': {'uwiom': {'valid_samples': 2, 'samples': 3, 'coverage': 2/3}}}


def runner(video, output):
    output.mkdir()
    (output/'result.json').write_text(json.dumps(RESULT))
    (output/'samples.csv').write_text('timestamp_s,uwiom_level\n0,moderate\n1,\n2,low\n')
    return copy.deepcopy(RESULT)


def pose_runner(video, output):
    output.write_text(json.dumps({'schema_version': 'healy.pose.v1', 'fps': 30, 'width': 1280, 'height': 720, 'frames': [None] * 75}))


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.probe = patch('backend.app.inspect_video', return_value={'duration_s': 2.5, 'width': 1280, 'height': 720})
        self.probe.start()
        self.msd_analyzer = Mock(return_value={'status': 'complete', 'interpretation': {'summary': 'Test review'}})
        self.app = create_app(self.root, runner, msd_analyzer=self.msd_analyzer, pose_runner=pose_runner)
        self.client = TestClient(self.app).__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.probe.stop(); self.temp.cleanup()

    def upload(self, metadata=None, filename="clip.mp4"):
        info = {'camera_id': 'A', 'station_id': 'S1', 'title': 'Test', 'recorded_at': '2026-11-07T10:00:00+07:00'}
        if metadata: info.update(metadata)
        response = self.client.post('/recordings', files={'file': (filename, b'test-video', 'application/octet-stream')}, data={'metadata': json.dumps(info)})
        self.assertEqual(response.status_code, 202, response.text)
        record = response.json()
        for _ in range(100):
            record = self.client.get('/recordings/'+record['id']).json()
            if record['analysis']['status'] in ('complete', 'failed'): break
            time.sleep(.01)
        return record

    def labels(self, record, verified=True):
        return self.client.put('/recordings/'+record['id']+'/labels', json={'labels': [{'worker_id': 'w1', 'worker_name': 'Worker One', 'subject_label': 'Foreground', 'start_s': 0, 'end_s': 2.5, 'origin': 'manual'}], 'subject_verified': verified})

    def observations(self):
        return self.client.get('/observations', params={'from': '2026-11-07', 'to': '2026-11-07', 'timezone': 'Asia/Jakarta'}).json()['items']

    def test_upload_results_ranges_and_no_automatic_association(self):
        record = self.upload()
        self.assertEqual(record['analysis']['status'], 'complete')
        self.assertNotIn('stored_file', record)
        self.assertEqual(self.observations(), [])
        self.assertEqual(self.client.get('/recordings/'+record['id']+'/result').json(), add_repetitions(copy.deepcopy(RESULT)))
        video = self.client.get(record['playback_url'], headers={'Range': 'bytes=0-3'})
        self.assertEqual(video.status_code, 206)
        self.assertEqual(video.content, b'test')
        csv_result = self.client.get('/recordings/'+record['id']+'/samples.csv')
        self.assertEqual(len(list(csv.DictReader(io.StringIO(csv_result.text)))), 3)
        self.assertEqual(self.client.get('/noise-readings').json(), {'items': []})
        self.assertEqual(self.client.get('/live-sources').json(), {'items': []})

    def test_demo_msd_cached_and_does_not_assign_identity(self):
        record = self.upload()
        endpoint = '/recordings/'+record['id']+'/msd-analysis'
        self.assertEqual(self.client.post(endpoint).status_code, 202)
        for _ in range(100):
            report = self.client.get('/workers/demo-a/msd-analysis').json()
            if report['items'][0]['analysis']['status'] == 'complete': break
            time.sleep(.01)
        item = report['items'][0]
        self.assertEqual(item['analysis']['status'], 'complete')
        self.assertEqual(report['assignment'], 'demo_assumption')
        self.assertAlmostEqual(item['metrics']['regions']['uwiom']['exposure_pct'], 100 / 1.5)
        self.assertIsNone(item['metrics']['regions']['arm']['exposure_pct'])
        self.assertEqual(self.client.post(endpoint).json()['status'], 'complete')
        self.msd_analyzer.assert_called_once()
        self.assertEqual(self.client.get('/recordings/'+record['id']).json()['labels'], [])
        self.assertEqual(self.observations(), [])
        self.assertIn('demo-a', [worker['id'] for worker in self.client.get('/workers').json()['items']])

    def test_frame_pose_cache_can_be_read_without_reprocessing(self):
        record = self.upload()
        endpoint = '/recordings/'+record['id']+'/pose'
        for _ in range(100):
            data = self.client.get(endpoint).json()
            if data.get('schema_version'): break
            time.sleep(.01)
        self.assertEqual(data['fps'], 30)
        self.assertEqual(len(data['frames']), 75)
        self.assertEqual(self.client.post(endpoint).json()['status'], 'complete')
        self.assertEqual(self.client.get('/recordings/missing/pose').status_code, 404)

    def test_msd_failure_can_retry_without_failing_model_analysis(self):
        record = self.upload()
        self.msd_analyzer.side_effect = [RuntimeError('OpenAI unavailable'), {'status': 'complete'}]
        endpoint = '/recordings/'+record['id']+'/msd-analysis'
        self.client.post(endpoint)
        for _ in range(100):
            latest = self.client.get('/recordings/'+record['id']).json()
            if latest.get('msd_analysis', {}).get('status') == 'failed': break
            time.sleep(.01)
        self.assertEqual(latest['analysis']['status'], 'complete')
        self.assertEqual(latest['msd_analysis']['status'], 'failed')
        self.client.post(endpoint)
        for _ in range(100):
            latest = self.client.get('/recordings/'+record['id']).json()
            if latest.get('msd_analysis', {}).get('status') == 'complete': break
            time.sleep(.01)
        self.assertEqual(latest['msd_analysis']['status'], 'complete')
        self.assertEqual(self.msd_analyzer.call_count, 2)

    def test_avi_conversion_preserves_original_and_serves_mp4(self):
        def convert(video):
            self.assertEqual(video.suffix, '.avi')
            self.assertEqual(video.read_bytes(), b'test-video')
            (video.parent/'playback.mp4').write_bytes(b'browser-video')
            return 'playback.mp4'
        with patch('backend.app.prepare_playback', side_effect=convert) as conversion:
            record = self.upload(filename='clip.AVI')
        conversion.assert_called_once()
        self.assertEqual(record['analysis']['status'], 'complete')
        response = self.client.get(record['playback_url'])
        self.assertEqual(response.headers['content-type'], 'video/mp4')
        self.assertEqual(response.content, b'browser-video')
        self.assertEqual((self.root/record['id']/'source.avi').read_bytes(), b'test-video')

    def test_conversion_failure_has_no_broken_playback_url(self):
        with patch('backend.app.prepare_playback', side_effect=RuntimeError('conversion failed')):
            record = self.upload(filename='clip.avi')
        self.assertEqual(record['analysis']['status'], 'failed')
        self.assertIsNone(record['playback_url'])
        self.assertEqual(self.client.get('/recordings/'+record['id']+'/video').status_code, 409)

    def test_manual_confirmation_null_scores_and_stable_revisions(self):
        record = self.upload()
        self.assertEqual(self.labels(record, False).status_code, 200)
        self.assertEqual(self.observations(), [])
        self.assertEqual(self.labels(record).status_code, 200)
        rows = self.observations()
        self.assertEqual(len(rows), 3)
        self.assertEqual(sum(r['usable_s'] for r in rows), 1.5)
        self.assertEqual(sum(r['flagged_s'] for r in rows), 1)
        self.assertTrue(all(r['reba_score'] is None and r['exposure_points'] is None for r in rows))
        self.labels(record)
        updated = self.observations()
        self.assertEqual([r['id'] for r in rows], [r['id'] for r in updated])
        self.assertEqual(updated[0]['revision'], rows[0]['revision']+1)
        self.labels(record, False)
        self.assertEqual(self.observations(), [])

    def test_overlap_is_not_double_counted_and_data_survives_restart(self):
        for _ in range(2): self.labels(self.upload())
        self.assertEqual(len(self.observations()), 3)
        with TestClient(create_app(self.root, runner, pose_runner=pose_runner)) as other:
            self.assertEqual(len(other.get('/recordings').json()['items']), 2)
            rows = other.get('/observations?from=2026-11-07&to=2026-11-07').json()['items']
            self.assertEqual(len(rows), 3)

    def test_validation_unknown_ids_and_origins(self):
        self.assertEqual(self.client.get('/recordings/not-a-job').status_code, 404)
        self.assertEqual(self.client.get('/observations?from=2026-11-08&to=2026-11-07').status_code, 422)
        self.assertEqual(self.client.get('/observations?from=2026-11-07&to=2026-11-07&timezone=bad').status_code, 422)
        self.assertEqual(self.client.get('/observations?from=2026-11-07&to=2026-11-07&timezone=/bad').status_code, 422)
        self.assertEqual(self.client.post('/recordings', headers={'origin': 'https://other.example'}).status_code, 403)
        self.assertEqual(self.client.post('/recordings', files={'file': ('x.mp4', b'bad')}, data={'metadata': '{}'}).status_code, 422)
        record = self.upload()
        for labels, verified in (([], True), ([{'worker_id': 'x', 'worker_name': 'X', 'subject_label': 'x', 'start_s': 1, 'end_s': 2, 'origin': 'manual'}], True)):
            self.assertEqual(self.client.put('/recordings/'+record['id']+'/labels', json={'labels': labels, 'subject_verified': verified}).status_code, 422)

    def test_incomplete_job_cannot_return_results(self):
        gate = threading.Event()
        def blocked(video, output):
            gate.wait(5)
            raise RuntimeError('test failure')
        with tempfile.TemporaryDirectory() as directory:
            with TestClient(create_app(directory, blocked)) as client:
                try:
                    record = client.post('/recordings', files={'file': ('x.mp4', b'video')}, data={'metadata': json.dumps({'camera_id': 'A', 'station_id': 'S', 'title': 'x', 'recorded_at': '2026-11-07T10:00:00Z'})}).json()
                    self.assertEqual(client.get('/recordings/'+record['id']+'/result').status_code, 409)
                    self.assertEqual(client.get('/recordings/'+record['id']+'/samples.csv').status_code, 409)
                finally: gate.set()
                for _ in range(100):
                    record = client.get('/recordings/'+record['id']).json()
                    if record['analysis']['status'] == 'failed': break
                    time.sleep(.01)
                self.assertEqual(record['analysis']['status'], 'failed')
