import unittest
from model.repetitions import add_repetitions


def result(levels):
    return {'input': {'duration_s': len(levels)}, 'summary': {}, 'samples': [
        {'timestamp_s': i, 'sample_interval_s': 1, 'arm_level': level, 'back_level': 'low'}
        for i, level in enumerate(levels)]}


class RepetitionTests(unittest.TestCase):
    def test_complete_bouts_plateaus_high_and_unfinished_cycles(self):
        data = add_repetitions(result(['moderate', 'low', 'moderate', 'moderate', 'high', 'low', 'low', 'high', 'low', 'moderate']))
        self.assertEqual([s['arm_repetitions_so_far'] for s in data['samples']], [0, 0, 0, 0, 0, 1, 1, 1, 1, 1])
        self.assertEqual(data['summary']['repetitions']['arm']['count'], 1)
        self.assertEqual(data['summary']['repetitions']['back']['count'], 0)

    def test_missing_and_gapped_samples_break_cycles(self):
        data = add_repetitions(result(['low', 'moderate', None, 'low']))
        self.assertEqual(data['summary']['repetitions']['arm']['count'], 0)
        data = result(['low', 'moderate', 'low', 'low'])
        del data['samples'][2]
        self.assertEqual(add_repetitions(data)['summary']['repetitions']['arm']['count'], 0)

    def test_duration_weighting_unknown_and_idempotence(self):
        data = result(['low', 'moderate', None])
        data['input']['duration_s'] = 2.5
        data['samples'][-1]['sample_interval_s'] = .5
        add_repetitions(data)
        self.assertEqual(data['summary']['repetitions']['arm']['exposure_pct'], 50)
        self.assertEqual(data['summary']['repetitions']['arm']['coverage_pct'], 80)
        self.assertIsNone(data['summary']['repetitions']['uwiom']['exposure_pct'])
        self.assertEqual(add_repetitions(data)['summary']['repetitions']['arm']['count'], 0)

    def test_invalid_samples_rejected(self):
        for value in (-1, float('nan'), 100):
            data = result(['low'])
            data['samples'][0]['timestamp_s'] = value
            with self.assertRaises(ValueError):
                add_repetitions(data)
