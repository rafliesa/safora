"""Video or pose CSV → MURI, posture cycles and experimental UW-IOM exposure."""
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
import shutil
import sys
from argparse import Namespace

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT/'training'))
sys.path.insert(0, str(ROOT.parent))
from model.repetitions import add_repetitions


def sha256(path):
    with Path(path).open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()


def verify_weights():
    expected = json.loads((ROOT/'weights/manifest.json').read_text())
    for name, digest in expected.items():
        if sha256(ROOT/'weights'/name) != digest:
            raise ValueError(f'Checkpoint checksum mismatch: {name}')
    return expected


def resolve_device(device):
    if device != 'auto':
        return device
    import torch
    if torch.cuda.is_available():
        return '0'
    if torch.backends.mps.is_available():
        return 'mps'
    return 'cpu'


def analyze(source, output, *, from_csv=False, duration=None, device='auto', roi=None):
    from video_exposure import screen
    from uwiom.model import predict_rows

    source, output = Path(source).resolve(), Path(output).resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    hashes = verify_weights()
    if from_csv:
        if duration is None or not math.isfinite(duration) or duration <= 0:
            raise ValueError('CSV mode requires positive, finite --duration from the source video')
    else:
        import cv2
        capture = cv2.VideoCapture(str(source))
        try:
            fps, frames = capture.get(cv2.CAP_PROP_FPS), capture.get(cv2.CAP_PROP_FRAME_COUNT)
        finally:
            capture.release()
        if not math.isfinite(fps) or fps <= 0 or not math.isfinite(frames) or frames <= 0:
            raise ValueError('Unreadable video or invalid frame metadata')
        duration = frames/fps
    output.mkdir(parents=True, exist_ok=False)
    raw_path = output/'postures.csv'
    if from_csv:
        shutil.copyfile(source, raw_path)
    else:
        from tabular import export
        device = resolve_device(device)
        print(f'Inference device: {device}', flush=True)
        export(Namespace(video=source, model=ROOT/'weights/muri_model.joblib', csv_output=raw_path,
                         start=0, seconds=None, device=device, roi=roi or [0, 0, 1, 1]))
    with raw_path.open(encoding='utf-8-sig', newline='') as file:
        raw = list(csv.DictReader(file))
    exposures, summary = screen(raw, [], [], duration)
    predictions = predict_rows(raw, ROOT/'weights/exposure_model.pt')
    counts = dict.fromkeys(('low', 'moderate', 'high'), 0)
    samples = []
    for original, exposure, prediction in zip(raw, exposures, predictions):
        # No elbow-motion extraction here; absent motion must not be exported as observed zero cycles.
        exposure = {k: v for k, v in exposure.items() if not k.startswith(('left_', 'right_', 'motion_'))}
        row = {}
        for key, value in original.items():
            if value == '':
                row[key] = None
            else:
                try:
                    row[key] = float(value)
                    if not math.isfinite(row[key]):
                        raise ValueError(f'Nonfinite input: {key}')
                except ValueError:
                    if key not in ('status', 'pose_model'):
                        raise
                    row[key] = value
        level = prediction['exposure_level']
        if level is not None:
            counts[level] += 1
        row.update(exposure)
        row.update(uwiom_level=level, uwiom_status=prediction['status'],
                   uwiom_label_source=prediction['label_source'], uwiom_domain_validated=False,
                   clinical_msd_probability=None)
        samples.append(row)
    valid = sum(counts.values())
    result = {'schema_version': 'healy.model.v1',
              'input': {'kind': 'pose_csv' if from_csv else 'video', 'sha256': sha256(source),
                        'duration_s': duration, 'cadence_s': 1},
              'models': {'uwiom_sha256': hashes['exposure_model.pt'],
                         'muri_sha256': None if from_csv else hashes['muri_model.joblib'],
                         'pose_weights_sha256': None if from_csv else {k: v for k, v in hashes.items() if k.startswith('yolo')}},
              'summary': {'postural': summary, 'uwiom': {'valid_samples': valid, 'samples': len(samples),
                          'coverage': valid/len(samples), 'level_samples': counts, 'domain_validated': False}},
              'samples': samples}
    add_repetitions(result)
    with (output/'samples.csv').open('x', encoding='utf-8-sig', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=list(samples[0])); writer.writeheader(); writer.writerows(samples)
    # result.json is the completion marker; failed jobs may contain a partial postures.csv only.
    temporary = output/'result.tmp'
    temporary.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False, indent=2)+'\n')
    temporary.replace(output/'result.json')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--video', type=Path); source.add_argument('--postures', type=Path)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--duration', type=float, help='Original video duration, required only with --postures')
    parser.add_argument('--device', default='auto', help='auto (CUDA, MPS, then CPU), cpu, mps or GPU index such as 0')
    parser.add_argument('--roi', nargs=4, type=float, metavar=('XMIN', 'YMIN', 'XMAX', 'YMAX'))
    args = parser.parse_args()
    if args.roi and not (0 <= args.roi[0] < args.roi[2] <= 1 and 0 <= args.roi[1] < args.roi[3] <= 1):
        parser.error('--roi must be ordered normalized bounds in 0..1')
    if args.video and args.duration is not None:
        parser.error('--duration is only valid with --postures')
    result = analyze(args.postures or args.video, args.output_dir, from_csv=args.postures is not None,
                     duration=args.duration, device=args.device, roi=args.roi)
    print(json.dumps({'result': str(args.output_dir/'result.json'), 'uwiom': result['summary']['uwiom']}))
