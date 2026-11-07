import io
import json
import os
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from backend.msd import analyze_msd


class MsdTests(unittest.TestCase):
    def setUp(self):
        self.metrics = {'regions': {'arm': {'valid_s': 20}, 'back': {'valid_s': 0}}}
        self.output = {'summary': 'Tinjau paparan bahu; punggung tidak terbaca.', 'clinical_msd_probability_pct': None,
                       'limitations': ['Gaya tidak diukur.'], 'findings': [
            {'region': 'arm', 'potential_msd': 'shoulder_tendinopathy', 'review_priority': 'moderate', 'rationale': 'Paparan teramati.', 'recommendation': 'Evaluasi tinggi meja.'},
            {'region': 'back', 'potential_msd': 'insufficient_evidence', 'review_priority': 'insufficient_data', 'rationale': 'Tidak terbaca.', 'recommendation': 'Perbaiki sudut kamera.'}]}

    def response(self):
        return io.BytesIO(json.dumps({'status': 'completed', 'model': 'test-model', 'output': [
            {'type': 'message', 'content': [{'type': 'output_text', 'text': json.dumps(self.output)}]}]}).encode())

    def test_structured_output_server_only_key_and_no_clinical_percentage(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-secret', 'OPENAI_MSD_MODEL': 'test-model'}), patch('backend.msd.urlopen', return_value=self.response()) as request:
            report = analyze_msd(self.metrics)
        self.assertIsNone(report['interpretation']['clinical_msd_probability_pct'])
        self.assertNotIn('test-secret', json.dumps(report))
        body = json.loads(request.call_args.args[0].data)
        self.assertFalse(body['store'])
        self.assertTrue(body['text']['format']['strict'])
        self.assertEqual(json.loads(body['input']), self.metrics)

    def test_rejects_probability_and_unobserved_region_claims(self):
        for probability, condition in ((75, 'insufficient_evidence'), (None, 'low_back_pain')):
            self.output['clinical_msd_probability_pct'] = probability
            self.output['findings'][1]['potential_msd'] = condition
            with patch.dict(os.environ, {'OPENAI_API_KEY': 'test'}), patch('backend.msd.urlopen', return_value=self.response()):
                with self.assertRaises(ValueError): analyze_msd(self.metrics)

    def test_api_errors_do_not_return_provider_body_or_key(self):
        error = HTTPError('https://api.openai.com/v1/responses', 401, 'test-secret', {}, None)
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-secret'}), patch('backend.msd.urlopen', side_effect=error):
            with self.assertRaisesRegex(RuntimeError, 'HTTP 401') as raised: analyze_msd(self.metrics)
        self.assertNotIn('test-secret', str(raised.exception))

    def test_missing_key_does_not_call_api(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': ''}), patch('backend.msd.urlopen') as request:
            with self.assertRaises(RuntimeError): analyze_msd(self.metrics)
        request.assert_not_called()
