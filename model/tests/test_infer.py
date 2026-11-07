import csv
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from infer import ROOT, analyze, verify_weights


class InferenceTests(unittest.TestCase):
    def test_packaged_checkpoint_and_csv_pipeline(self):
        source = ROOT/'tests/fixtures/postures.csv'
        expected = json.loads((ROOT/'reports/uwiom.json').read_text())
        self.assertEqual(verify_weights()['exposure_model.pt'], expected['model_sha256'])
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)/'run'
            result = analyze(source, output, from_csv=True, duration=246.5666666667)
            self.assertEqual(len(result['samples']), 247)
            self.assertEqual(result['summary']['uwiom']['valid_samples'], 48)
            self.assertEqual(result['summary']['postural']['regions']['arm']['posture_cycles'], 7)
            self.assertEqual(result['summary']['postural']['regions']['back']['posture_cycles'], 19)
            self.assertIsNone(result['samples'][60]['uwiom_level'])
            self.assertIsNone(result['models']['muri_sha256'])
            self.assertNotIn('right_candidate_cycles_so_far', result['samples'][0])
            self.assertEqual(result, json.loads((output/'result.json').read_text()))
            with (output/'samples.csv').open(encoding='utf-8-sig') as file:
                rows = list(csv.DictReader(file))
            self.assertEqual(len(rows), 247)
            self.assertTrue(all(r['clinical_msd_probability'] == '' for r in rows))
            with self.assertRaises(FileExistsError):
                analyze(source, output, from_csv=True, duration=246.5666666667)
            with self.assertRaises(ValueError):
                analyze(source, Path(directory)/'invalid', from_csv=True, duration=float('nan'))
