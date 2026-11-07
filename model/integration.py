"""Map model intervals to origin/master's ObservationWindow contract; no clinical score conversion."""
from datetime import datetime, timedelta
import hashlib
import json
import math


def observation_windows(result, *, recording_id, worker_id, recorded_at, subject_verified=False, revision=1):
    if subject_verified is not True:
        raise ValueError('Backend must verify that this single-person analysis belongs to the selected worker')
    if not isinstance(recording_id, str) or not recording_id.strip() or not isinstance(worker_id, str) or not worker_id.strip() or type(revision) is not int or revision < 1:
        raise ValueError('Recording, worker and positive integer revision required')
    start = datetime.fromisoformat(recorded_at.replace('Z', '+00:00'))
    if start.tzinfo is None or start.utcoffset() is None:
        raise ValueError('recorded_at must include a timezone offset')
    if result['schema_version'] != 'healy.model.v1':
        raise ValueError('Unsupported result schema')
    duration = result['input']['duration_s']
    if not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration <= 0:
        raise ValueError('Finite positive duration required')
    windows, previous_end = [], 0
    names = {'low': 'rendah', 'moderate': 'sedang', 'high': 'tinggi'}
    for sample in result['samples']:
        t, length = sample['timestamp_s'], sample['sample_interval_s']
        if any(type(v) not in (int, float) or not math.isfinite(v) for v in (t, length)):
            raise ValueError('Finite numeric intervals required')
        t, length = float(t), float(length)
        if not (t >= previous_end and length > 0 and t+length <= result['input']['duration_s']+1e-6):
            raise ValueError('Intervals must be nonoverlapping and within video duration')
        previous_end = t+length
        level = sample['uwiom_level']
        if level is not None and level not in names:
            raise ValueError('Unknown exposure category')
        known = level is not None
        identity = json.dumps([recording_id, worker_id, t, t+length], separators=(',', ':'))
        finding = f'Paparan UW-IOM {names[level]} (eksperimental, bukan REBA).' if known else 'Paparan UW-IOM tidak terbaca; sendi tidak memenuhi syarat.'
        windows.append({'id': hashlib.sha256(identity.encode()).hexdigest()[:24], 'revision': revision,
                        'worker_id': worker_id, 'recording_id': recording_id,
                        'observed_at': (start+timedelta(seconds=t)).isoformat(), 'start_s': t, 'end_s': t+length,
                        'usable_s': length if known else 0, 'flagged_s': length if level in ('moderate', 'high') else 0,
                        'reba_score': None, 'exposure_points': None, 'requires_review': True,
                        'review_state': 'needs_evidence', 'finding': finding, 'source': 'service'})
    return windows
