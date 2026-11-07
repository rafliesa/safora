import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from integration import observation_windows


class IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.result = {'schema_version': 'healy.model.v1', 'input': {'duration_s': 2.5},
                       'samples': [{'timestamp_s': i, 'sample_interval_s': min(1, 2.5-i), 'uwiom_level': level}
                                   for i, level in enumerate(['moderate', None, 'low'])]}
        self.context = dict(recording_id='r1', worker_id='w1', recorded_at='2026-11-07T10:00:00+07:00', subject_verified=True)

    def test_intervals_unknown_and_unavailable_clinical_scores(self):
        rows = observation_windows(self.result, **self.context)
        self.assertEqual(sum(r['usable_s'] for r in rows), 1.5)
        self.assertEqual(sum(r['flagged_s'] for r in rows), 1)
        self.assertEqual(rows[-1]['end_s'], 2.5)
        self.assertEqual(rows[1]['observed_at'], '2026-11-07T10:00:01+07:00')
        self.assertTrue(all(r['reba_score'] is None and r['exposure_points'] is None for r in rows))
        self.assertTrue(all(r['review_state'] == 'needs_evidence' for r in rows))

    def test_ids_survive_revisions_and_numeric_serialization(self):
        a = observation_windows(self.result, **self.context)
        changed = copy.deepcopy(self.result)
        changed['samples'][0]['timestamp_s'] = 0.0
        changed['samples'][0]['uwiom_level'] = 'high'
        b = observation_windows(changed, revision=2, **self.context)
        self.assertEqual([r['id'] for r in a], [r['id'] for r in b])
        self.assertTrue(all(r['revision'] == 2 for r in b))

    def test_identity_time_and_overlap_are_validated(self):
        for override in ({'subject_verified': False}, {'subject_verified': 'false'},
                         {'recorded_at': '2026-11-07T10:00:00'}, {'worker_id': ''}, {'revision': True}):
            with self.assertRaises(ValueError):
                observation_windows(self.result, **{**self.context, **override})
        for invalid in (0, float('nan'), '1'):
            broken = copy.deepcopy(self.result); broken['samples'][1]['timestamp_s'] = invalid
            with self.assertRaises(ValueError):
                observation_windows(broken, **self.context)


if __name__ == '__main__':
    unittest.main()
