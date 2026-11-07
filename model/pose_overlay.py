"""Cache a pose for every video frame using the same checkpoints as exposure inference."""
import argparse
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT/'training'))


def visible_points(points, width, height):
    if len(points) != 17:
        raise ValueError('Expected 17 COCO joints')
    return [[round(float(x), 2), round(float(y), 2), round(float(confidence), 3)]
            if all(math.isfinite(v) for v in (x, y, confidence)) and 0 <= x <= width and 0 <= y <= height and .5 <= confidence <= 1
            else None for x, y, confidence in points]


def export(video, output, device='auto'):
    import cv2
    import joblib
    import torch
    from ultralytics import YOLO
    from infer import resolve_device, verify_weights
    from sustage import worker_pose

    hashes = verify_weights()
    artifact = joblib.load(ROOT/'weights/muri_model.joblib')
    primary_name = artifact.get('pose_model', 'yolo11s-pose.pt')
    fallback_name = artifact.get('fallback_pose_model')
    primary = YOLO(str(ROOT/'weights'/primary_name))
    fallback = YOLO(str(ROOT/'weights'/fallback_name)) if fallback_name else None
    device = resolve_device(device)
    if device == 'cpu':
        torch.set_num_threads(min(4, torch.get_num_threads()))
    capture = cv2.VideoCapture(str(video))
    temporary = output.with_suffix('.tmp')
    try:
        fps = capture.get(cv2.CAP_PROP_FPS)
        count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        width, height = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)), int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        if not math.isfinite(fps) or fps <= 0 or count <= 0 or width <= 0 or height <= 0:
            raise ValueError('Invalid video metadata')
        metadata = {'schema_version': 'healy.pose.v1', 'fps': fps, 'width': width, 'height': height,
                    'frame_count': count, 'pose_model': primary_name, 'pose_model_sha256': hashes[primary_name],
                    'fallback_pose_model': fallback_name, 'selection': 'largest_foreground_person'}
        output.parent.mkdir(parents=True, exist_ok=True)
        print(f'Pose overlay: {count} frames at {fps:g} FPS; {primary_name}; device {device}', flush=True)
        with temporary.open('w') as file:
            file.write(json.dumps(metadata)[:-1] + ', "frames": [')
            cuda = str(device) not in ('cpu', 'mps')
            batch_size = 4 if cuda else 1
            for start in range(0, count, batch_size):
                batch = []
                for index in range(start, min(start + batch_size, count)):
                    ok, frame = capture.read()
                    if not ok:
                        raise ValueError(f'Video decoding stopped at frame {index}')
                    batch.append(frame)
                predictions = primary.predict(batch, device=device, half=cuda, imgsz=artifact.get('imgsz', 640), verbose=False)
                for offset, (frame, prediction) in enumerate(zip(batch, predictions)):
                    index = start + offset
                    feature, person = worker_pose(prediction, min_foot_y=artifact.get('min_foot_y', .55))
                    if feature is None and fallback is not None:
                        prediction = fallback.predict(frame, device=device, half=cuda, imgsz=artifact.get('fallback_imgsz', 640), verbose=False)[0]
                        feature, person = worker_pose(prediction, min_foot_y=artifact.get('min_foot_y', .55))
                    points = visible_points(prediction.keypoints.data[person].cpu().numpy(), width, height) if feature is not None else None
                    if index:
                        file.write(',')
                    file.write(json.dumps(points, allow_nan=False, separators=(',', ':')))
                if start % 100 == 0:
                    print(f'Pose frames: {start + len(batch)}/{count}', flush=True)
            file.write(']}')
        temporary.replace(output)
        print(f'Saved {count} pose frames to {output}', flush=True)
    finally:
        capture.release()
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--device', default='auto')
    args = parser.parse_args()
    export(args.video, args.output, args.device)
