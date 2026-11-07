"""One observation per video second, with MURI scores and pixel-space COCO keypoints."""

import csv
import math

import numpy as np

from sustage import POSTURES, frame_features, worker_pose


KEYPOINTS = ("nose", "left_eye", "right_eye", "left_ear", "right_ear", "left_shoulder",
             "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist",
             "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle")
FIELDS = ("second", "timestamp_s", "frame_index", "frame_time_s", "frame_width_px", "frame_height_px",
          "status", *POSTURES, "pose_model", "person_confidence",
          *(f"{name}_{field}" for name in KEYPOINTS for field in ("x_px", "y_px", "confidence")))


def sample_frames(start, duration, fps, frame_count):
    if not all(math.isfinite(v) for v in (start, duration, fps)) or start < 0 or duration <= 0 or fps < 1:
        raise ValueError("Start and duration must be finite and valid; video frame rate must be at least 1 FPS")
    for second in range(math.ceil(duration)):
        target = start + second
        index = math.floor(target * fps + .5)
        if index >= frame_count:
            break
        yield second, target, index


def observation(second, timestamp, index, fps, shape, scores=None, points=None,
                person_confidence=None, pose_model=""):
    row = dict.fromkeys(FIELDS, "")
    row.update(second=second, timestamp_s=round(timestamp, 6), frame_index=index,
               frame_time_s=round(index / fps, 6), frame_width_px=shape[1], frame_height_px=shape[0],
               status="pose_unavailable")
    if scores is None:
        return row
    points = np.asarray(points)
    if points.shape != (17, 3) or set(scores) != set(POSTURES) or any(s not in (1, 2, 3) for s in scores.values()):
        raise ValueError("Expected four valid scores and 17 COCO keypoints")
    row.update(scores)
    row.update(status="ok", pose_model=pose_model, person_confidence=round(float(person_confidence), 6))
    for name, (x, y, confidence) in zip(KEYPOINTS, points):
        row[name + "_confidence"] = round(float(confidence), 6) if np.isfinite(confidence) else ""
        # Match the feature extractor's visibility threshold; hidden coordinates stay blank.
        if np.isfinite([x, y, confidence]).all() and confidence >= .3:
            row[name + "_x_px"] = round(float(x), 3)
            row[name + "_y_px"] = round(float(y), 3)
    return row


def export(args):
    import cv2
    import joblib
    from ultralytics import YOLO

    if args.csv_output.resolve() in (args.video.resolve(), args.model.resolve()):
        raise ValueError("CSV output must differ from input video and model")
    if args.csv_output.exists():
        raise FileExistsError(f"Choose a new CSV filename: {args.csv_output}")
    artifact = joblib.load(args.model)
    kinds = artifact.get("model_features", {p: "baseline" for p in POSTURES})
    supported = {"baseline", "geometry", *(prefix + p for prefix in ("physical_", "invariant_") for p in POSTURES)}
    if artifact.get("unit", "frame") != "frame" or not set(kinds.values()) <= supported:
        raise ValueError("Per-second export requires a current-frame model such as run_audited/muri_model.joblib")
    for classifier in artifact["models"].values():
        estimator = classifier.steps[-1][1] if hasattr(classifier, "steps") else classifier
        if hasattr(estimator, "n_jobs"):
            estimator.n_jobs = 1
    primary_name = artifact.get("pose_model", "yolo11s-pose.pt")
    model = YOLO(str(args.model.parent / primary_name))
    fallback_name = artifact.get("fallback_pose_model")
    fallback = YOLO(str(args.model.parent / fallback_name)) if fallback_name else None
    cap = cv2.VideoCapture(str(args.video))
    written = 0
    try:
        fps, count = cap.get(cv2.CAP_PROP_FPS), int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if not math.isfinite(fps) or fps <= 0 or count <= 0:
            raise ValueError(f"Unreadable video or missing frame rate: {args.video}")
        remaining = count / fps - args.start
        duration = min(args.seconds, remaining) if args.seconds is not None else remaining
        schedule = iter(sample_frames(args.start, duration, fps, count))
        first = next(schedule, None)
        if first is None:
            raise ValueError("No frames in the requested time range")
        if not cap.set(cv2.CAP_PROP_POS_FRAMES, first[2]):
            raise RuntimeError("Cannot seek the requested video start")
        position = first[2]
        from itertools import chain

        with args.csv_output.open("x", newline="", encoding="utf-8-sig") as file:
            writer = csv.DictWriter(file, fieldnames=FIELDS)
            writer.writeheader()
            for second, timestamp, target in chain([first], schedule):
                while position < target:
                    if not cap.grab():
                        raise RuntimeError(f"Unexpected EOF before frame {target}; CSV contains {written} completed rows")
                    position += 1
                ok, frame = cap.read()
                position += 1
                if not ok:
                    raise RuntimeError(f"Cannot decode frame {target}; CSV contains {written} completed rows")
                result = model.predict(frame, device=args.device, imgsz=artifact.get("imgsz", 640), verbose=False)[0]
                feature, person = worker_pose(result, args.roi, artifact.get("min_foot_y", .55))
                pose_name = primary_name
                if feature is None and fallback is not None:
                    result = fallback.predict(frame, device=args.device, imgsz=artifact.get("fallback_imgsz", 640), verbose=False)[0]
                    feature, person = worker_pose(result, args.roi, artifact.get("min_foot_y", .55))
                    pose_name = fallback_name
                extra = {}
                if feature is not None:
                    transforms = frame_features(feature, kinds.values())
                    scores = {p: int(classifier.predict(transforms[kinds[p]])[0]) for p, classifier in artifact["models"].items()}
                    extra = {"scores": scores, "points": result.keypoints.data[person].cpu().numpy(),
                             "person_confidence": float(result.boxes.conf[person]), "pose_model": pose_name}
                writer.writerow(observation(second, timestamp, target, fps, frame.shape[:2], **extra))
                file.flush()
                written += 1
    finally:
        cap.release()
    print(f"Exported {written} observations (one per video second) to {args.csv_output}", flush=True)
