"""Observed low → moderate → low repetitions and duration-weighted exposure."""
import math


def add_repetitions(result):
    duration = result['input']['duration_s']
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('Positive finite duration required')
    regions = ('uwiom', 'arm', 'back')
    state = dict.fromkeys(regions)
    totals = {region: {'count': 0, 'valid_s': 0.0, 'elevated_s': 0.0} for region in regions}
    previous_end = None
    for sample in result['samples']:
        start, length = sample['timestamp_s'], sample['sample_interval_s']
        if not all(math.isfinite(v) for v in (start, length)) or start < 0 or length <= 0 or start + length > duration + 1e-6:
            raise ValueError('Invalid sample interval')
        if previous_end is not None:
            if start < previous_end - 1e-6:
                raise ValueError('Overlapping sample intervals')
            if abs(start - previous_end) > 1e-6:
                state = dict.fromkeys(regions)
        previous_end = start + length
        for region in regions:
            level = sample.get(f'{region}_level')
            if level not in (None, 'low', 'moderate', 'high'):
                raise ValueError('Unknown exposure level')
            stats = totals[region]
            completed = level == 'low' and state[region] == 'moderate'
            stats['count'] += int(completed)
            if level is None:
                state[region] = None
            elif level == 'low':
                state[region] = 'low'
            elif level == 'moderate' and state[region] == 'low':
                state[region] = 'moderate'
            # High can occur within a bout, but Moderate must be observed before returning to Low.
            if level is not None:
                stats['valid_s'] += length
            if level in ('moderate', 'high'):
                stats['elevated_s'] += length
            sample[f'{region}_repetition_completed'] = int(completed)
            sample[f'{region}_repetitions_so_far'] = stats['count']
    for stats in totals.values():
        stats['coverage_pct'] = stats['valid_s'] / duration * 100
        stats['exposure_pct'] = stats['elevated_s'] / stats['valid_s'] * 100 if stats['valid_s'] else None
    result['summary']['repetitions'] = totals
    return result
