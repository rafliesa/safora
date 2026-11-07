"""YOLO keypoints and supervised MURI score baseline for sustAGE."""

import argparse
import hashlib
import json
import math
import re
import time
from pathlib import Path

import numpy as np


POSTURES = ("waist_flexion", "waist_rotation", "arm_height", "knee_flexion")
POSE_MODEL = "yolo11s-pose.pt"


def muri_seconds(value):
    """The spreadsheets encode minutes.seconds, including values such as 3.60."""
    if isinstance(value, str) and ":" in value:
        parts = [float(part) for part in value.strip().split(":")]
        if len(parts) != 2 or not all(math.isfinite(v) for v in parts) or not 0 <= parts[1] < 60 or parts[0] < 0:
            raise ValueError(f"Invalid timestamp: {value}")
        return parts[0] * 60 + parts[1]
    value = float(value)
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"Invalid timestamp: {value}")
    minutes = math.floor(value)
    seconds = round((value - minutes) * 100, 5)
    if seconds > 60:
        raise ValueError(f"Invalid minutes.seconds timestamp: {value}")
    return minutes * 60 + seconds


def pose_features(keypoints, box):
    """Keep missing joints missing; normalize image coordinates by person height."""
    keypoints = np.asarray(keypoints, dtype=np.float32)
    box = np.asarray(box, dtype=np.float32)
    if keypoints.shape != (17, 3) or box.shape != (4,):
        raise ValueError("Expected 17 COCO keypoints and an xyxy box")
    visible = keypoints[:, 2] >= 0.3
    height = float(box[3] - box[1])
    if height <= 0 or visible[5:].sum() < 6:
        return None
    coords = (keypoints[:, :2] - (box[:2] + box[2:]) / 2) / height
    coords[~visible] = np.nan
    features = [*coords[5:].ravel(), *keypoints[5:, 2]]
    for a, b, c in ((5, 7, 9), (6, 8, 10), (11, 13, 15), (12, 14, 16),
                    (7, 5, 11), (8, 6, 12), (5, 11, 13), (6, 12, 14)):
        u, v = coords[a] - coords[b], coords[c] - coords[b]
        norm = np.linalg.norm(u) * np.linalg.norm(v)
        cosine = np.dot(u, v) / norm if norm > 1e-8 else np.nan
        features.append(np.arccos(np.clip(cosine, -1, 1)))
    return np.asarray(features, dtype=np.float32)


def worker_pose(result, roi=None, min_foot_y=.55):
    if result.keypoints is None or len(result.boxes) == 0:
        return None, None
    boxes = result.boxes.xyxy.cpu().numpy()
    height, width = result.orig_shape
    centers = (boxes[:, :2] + boxes[:, 2:]) / 2 / [width, height]
    roi = roi or [0, 0, 1, 1]
    eligible = ((boxes[:, 3] > height * min_foot_y) & ((boxes[:, 3] - boxes[:, 1]) > height * .2)
                & (centers[:, 0] >= roi[0]) & (centers[:, 0] <= roi[2])
                & (centers[:, 1] >= roi[1]) & (centers[:, 1] <= roi[3]))
    candidates = np.flatnonzero(eligible)
    if not len(candidates):
        return None, None
    # shortcut: largest foreground person in the ROI; use tracking for multi-worker scenes.
    area = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
    index = candidates[np.argmax(area[candidates])]
    points = result.keypoints.data[index].cpu().numpy()
    return pose_features(points, boxes[index]), index


def write_json(path, data):
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def read_annotations(path):
    import openpyxl

    sheet = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    rows = list(sheet.values)
    header = next(i for i, row in enumerate(rows)
                  if any(str(v).strip().lower() == "start ts" for v in row))
    start_col = next(i for i, v in enumerate(rows[header]) if str(v).strip().lower() == "start ts")
    score_col = next(i for i, v in enumerate(rows[4]) if str(v).strip().lower() == "score") + 1
    if list(rows[4][score_col:score_col + 12]) != [3, 2, 1] * 4:
        raise ValueError(f"Unexpected posture columns in {path}")
    video_col = next((i for i, v in enumerate(rows[header]) if str(v).strip().lower() == "video"), None)
    candidates = []
    for number, row in enumerate(rows[header + 1:], header + 2):
        if not isinstance(row[start_col - 1], str) or row[start_col] is None or row[start_col + 1] is None:
            continue
        candidates.append((number, row))

    def fit(converter):
        errors = []
        for _, row in candidates:
            try:
                duration = converter(row[start_col + 1]) - converter(row[start_col])
                expected = float(row[start_col + 2])
                errors.append(abs(duration - expected) if duration > 0 else math.inf)
            except (TypeError, ValueError):
                errors.append(math.inf)
        return sum(error <= 1 for error in errors) / max(len(errors), 1)

    fits = {"minutes.seconds": fit(muri_seconds), "seconds": fit(float)}
    mode = max(fits, key=fits.get)
    if fits[mode] < 0.7:
        raise ValueError(f"Ambiguous time units in {path}: {fits}")
    converter = muri_seconds if mode == "minutes.seconds" else float
    segments, issues = [], []
    video = 1
    for number, row in candidates:
        if video_col is not None and row[video_col] is not None:
            video = int(row[video_col])
        try:
            start, end = converter(row[start_col]), converter(row[start_col + 1])
            if not math.isfinite(start + end) or not 0 <= start < end:
                raise ValueError("Invalid time interval")
            labels = []
            for offset in range(0, 12, 3):
                group = row[score_col + offset:score_col + offset + 3]
                filled = [(i, v) for i, v in enumerate(group) if v is not None and str(v).strip()]
                if not filled:
                    labels.append(-1)
                elif len(filled) == 1 and float(filled[0][1]) == 3 - filled[0][0]:
                    labels.append(3 - filled[0][0])
                else:
                    raise ValueError(f"Conflicting or misplaced posture score: {group}")
            # Duration inconsistencies are quarantined, not silently repaired.
            expected = row[start_col + 2]
            if expected is not None and abs(end - start - float(expected)) > 1:
                raise ValueError(f"Duration {end - start:g}s differs from total Tt={expected}")
            if all(label < 0 for label in labels):
                raise ValueError("No annotated posture scores")
            segments.append({"row": number, "start": start, "end": end,
                             "labels": labels, "video_number": video,
                             "activity": row[start_col - 1]})
        except (ValueError, TypeError) as error:
            issues.append({"row": number, "reason": str(error)})
    return segments, {"file": path.name, "time_mode": mode, "time_fit": fits,
                      "accepted_rows": len(segments), "quarantined_rows": issues,
                      "has_video_column": video_col is not None,
                      "video_reference": str(rows[6][1])}


def prepare(args):
    import cv2

    args.output.mkdir(parents=True, exist_ok=True)
    manifest, audit = [], []
    for workbook in sorted(args.data.rglob("*.xlsx")):
        segments, report = read_annotations(workbook)
        videos = sorted(workbook.parent.glob(workbook.name.split(".")[0] + ".*.avi"))
        if not videos:
            raise ValueError(f"No matching video: {workbook}")
        worker = re.search(r"User(\d+)", workbook.parent.name).group(1)
        for video in videos:
            cap = cv2.VideoCapture(str(video))
            fps = cap.get(cv2.CAP_PROP_FPS)
            duration = cap.get(cv2.CAP_PROP_FRAME_COUNT) / fps if fps > 0 else 0
            cap.release()
            if duration <= 0:
                raise ValueError(f"Unreadable video: {video}")
            selected = segments
            if report["has_video_column"]:
                number = 1 if "inner" in video.name else 2
                selected = [s for s in segments if s["video_number"] == number]
            exclusion = None
            if len(videos) > 1 and not report["has_video_column"] and ("SN24760" in video.name or "outer" in video.name):
                exclusion = "Worker mostly occluded; use the clearer paired camera for this cycle"
                selected = []
            outside = [s["row"] for s in selected if s["end"] > duration + 0.1]
            selected = [s for s in selected if s["end"] <= duration + 0.1]
            item = {"video": str(video.resolve()), "workbook": str(workbook.resolve()),
                    "worker": worker, "fps": fps, "duration": duration,
                    "segments": selected, "out_of_bounds_rows": outside,
                    "training_exclusion_reason": exclusion}
            # This camera sees another assembly line behind the target door on the right.
            item["roi"] = [.55, 0, 1, 1] if "SN24760" in video.name else [0, 0, 1, 1]
            manifest.append(item)
        audit.append(report)
    if not manifest:
        raise ValueError("No annotated videos found")
    write_json(args.output / "manifest.json", manifest)
    write_json(args.output / "annotation_audit.json", audit)
    for item in manifest:
        print(Path(item["video"]).name, len(item["segments"]), "segments", flush=True)


def extract(args):
    import cv2
    from ultralytics import YOLO

    model = YOLO(str(args.pose_model))
    manifest_text = (args.output / "manifest.json").read_text()
    manifest = json.loads(manifest_text)
    cache = args.output / "keypoints"
    cache.mkdir(exist_ok=True)
    config_path = args.output / "extraction_config.json"
    config = {"pose_model": str(args.pose_model.resolve()), "sample_fps": args.sample_fps,
              "imgsz": 640, "batch": args.batch,
              "manifest_sha256": hashlib.sha256(manifest_text.encode()).hexdigest()}
    if list(cache.glob("*.npz")):
        previous = json.loads(config_path.read_text())
        if any(previous.get(key) != value for key, value in config.items()):
            raise ValueError("Extraction settings changed; use a fresh output directory")
    write_json(config_path, config)
    started = time.monotonic()
    for number, item in enumerate(manifest):
        target = cache / f"{number:02d}.npz"
        if target.exists():
            continue
        video_start = time.monotonic()
        cap = cv2.VideoCapture(item["video"])
        jobs = {}
        overlaps = set()
        for segment in item["segments"]:
            for stamp in np.arange(segment["start"] + 0.25, segment["end"] - 0.24, 1 / args.sample_fps):
                index = round(stamp * item["fps"])
                if index in jobs:
                    overlaps.add(index)
                jobs[index] = segment
        for index in overlaps:
            jobs.pop(index)
        features, labels, segments, stamps = [], [], [], []
        frames, metadata = [], []
        skipped = 0

        def flush():
            nonlocal skipped
            if not frames:
                return
            results = model.predict(frames, device=args.device, imgsz=640, verbose=False)
            for result, (index, segment) in zip(results, metadata):
                feature, _ = worker_pose(result, item["roi"])
                if feature is None:
                    skipped += 1
                    continue
                features.append(feature)
                labels.append(segment["labels"])
                segments.append(f"{number}:{segment['row']}")
                stamps.append(index / item["fps"])
            frames.clear()
            metadata.clear()

        # Seek only across gaps; grab() skips decoding unused output frames.
        position = 0
        for index, segment in sorted(jobs.items()):
            if index - position > item["fps"] * 2:
                if not cap.set(cv2.CAP_PROP_POS_FRAMES, index):
                    raise RuntimeError(f"Cannot seek video: {item['video']}")
                position = index
            while position < index:
                if not cap.grab():
                    raise RuntimeError(f"Premature EOF: {item['video']} at {position}")
                position += 1
            ok, frame = cap.read()
            position += 1
            if not ok:
                raise RuntimeError(f"Cannot read frame {index}: {item['video']}")
            frames.append(frame)
            metadata.append((index, segment))
            if len(frames) == args.batch:
                flush()
        flush()
        cap.release()
        np.savez_compressed(target, X=np.asarray(features).reshape(-1, 44),
                            y=np.asarray(labels, dtype=int).reshape(-1, 4),
                            segment=np.asarray(segments, dtype=str), timestamp=stamps,
                            worker=np.repeat(item["worker"], len(features)))
        print(json.dumps({"video": number, "name": Path(item["video"]).name,
                          "samples": len(features), "no_pose": skipped,
                          "overlap_frames_dropped": len(overlaps),
                          "seconds": round(time.monotonic() - video_start, 2)}), flush=True)
    config["seconds"] = time.monotonic() - started
    write_json(config_path, config)


def evaluate(y, predicted):
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score

    return {"accuracy": accuracy_score(y, predicted),
            "macro_f1": f1_score(y, predicted, average="macro", zero_division=0),
            "confusion_matrix_1_2_3": confusion_matrix(y, predicted, labels=[1, 2, 3]).tolist(),
            "classes": classification_report(y, predicted, output_dict=True, zero_division=0)}


def fit_score(X, y, segments):
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.impute import SimpleImputer
    from sklearn.pipeline import make_pipeline

    _, group_index, counts = np.unique(segments, return_inverse=True, return_counts=True)
    model = make_pipeline(SimpleImputer(strategy="median", keep_empty_features=True),
                          RandomForestClassifier(n_estimators=200, max_depth=16,
                              min_samples_leaf=5, class_weight="balanced_subsample",
                              random_state=42, n_jobs=4))
    model.fit(X, y, randomforestclassifier__sample_weight=1 / counts[group_index])
    return model


def segment_votes(y, predicted, baseline, segments):
    true, pred, dummy = [], [], []
    for segment in np.unique(segments):
        mask = segments == segment
        if len(np.unique(y[mask])) != 1:
            raise ValueError(f"Conflicting segment ground truth: {segment}")
        true.append(int(y[mask][0]))
        pred.append(int(np.bincount(predicted[mask], minlength=4).argmax()))
        dummy.append(int(np.bincount(baseline[mask], minlength=4).argmax()))
    return {"segments": len(true), "model": evaluate(true, pred), "baseline": evaluate(true, dummy)}


def train(args):
    import csv
    import joblib
    from sklearn.dummy import DummyClassifier

    started = time.monotonic()
    manifest = json.loads((args.output / "manifest.json").read_text())
    extraction = json.loads((args.output / "extraction_config.json").read_text())
    pose_settings = {"pose_model": Path(extraction["pose_model"]).name, "imgsz": extraction.get("imgsz", 640)}
    for key in ("fallback_pose_model", "fallback_imgsz"):
        if key in extraction:
            pose_settings[key] = extraction[key]
    arrays = []
    for number in range(len(manifest)):
        with np.load(args.output / "keypoints" / f"{number:02d}.npz") as data:
            arrays.append({key: data[key].copy() for key in data.files})
    X, y, workers, segments, timestamps = (np.concatenate([a[key] for a in arrays])
                 for key in ("X", "y", "worker", "segment", "timestamp"))
    if len(np.unique(workers)) < 3:
        raise ValueError("Expected all three workers for independent evaluation")
    predictions = np.zeros_like(y)
    baselines = np.zeros_like(y)
    report = {"evaluation": "leave-one-worker-out; no frame-level random split",
              "label_scope": "Expert scores for activity intervals, inherited by sampled frames",
              "sample_count": len(X), "worker_counts": {w: int(sum(workers == w)) for w in np.unique(workers)},
              "folds": {}, "pooled": {}, "activity_votes": {}}
    model_dir = args.output / "models"
    model_dir.mkdir(exist_ok=True)
    for held_out in np.unique(workers):
        models, metrics = {}, {}
        for i, posture in enumerate(POSTURES):
            train_mask = (workers != held_out) & (y[:, i] > 0)
            test_mask = (workers == held_out) & (y[:, i] > 0)
            if not train_mask.any() or not test_mask.any():
                raise ValueError(f"Insufficient labels: worker {held_out}, {posture}")
            model = fit_score(X[train_mask], y[train_mask, i], segments[train_mask])
            models[posture] = model
            predicted = model.predict(X[test_mask])
            baseline = DummyClassifier(strategy="most_frequent").fit(X[train_mask], y[train_mask, i])
            dummy = baseline.predict(X[test_mask])
            predictions[test_mask, i] = predicted
            baselines[test_mask, i] = dummy
            metrics[posture] = {"train_classes": np.unique(y[train_mask, i]).tolist(),
                 "test_classes": np.unique(y[test_mask, i]).tolist(),
                 "constant_training_label": len(np.unique(y[train_mask, i])) == 1,
                 "model": evaluate(y[test_mask, i], predicted),
                 "baseline": evaluate(y[test_mask, i], dummy)}
        report["folds"][held_out] = metrics
        joblib.dump({"models": models, "held_out_worker": held_out, **pose_settings},
                    model_dir / f"heldout_{held_out}.joblib", compress=3)
        print("Evaluated held-out worker", held_out,
              {p: round(m["model"]["macro_f1"], 3) for p, m in metrics.items()}, flush=True)
    final_models = {}
    for i, posture in enumerate(POSTURES):
        mask = y[:, i] > 0
        report["pooled"][posture] = {"label_counts": {str(c): int(sum(y[mask, i] == c)) for c in (1, 2, 3)},
            "constant_label": len(np.unique(y[mask, i])) == 1,
            "model": evaluate(y[mask, i], predictions[mask, i]),
            "baseline": evaluate(y[mask, i], baselines[mask, i])}
        report["activity_votes"][posture] = segment_votes(
            y[mask, i], predictions[mask, i], baselines[mask, i], segments[mask])
        final_models[posture] = fit_score(X[mask], y[mask, i], segments[mask])
    joblib.dump({"models": final_models, "held_out_worker": None, **pose_settings},
                args.output / "muri_model.joblib", compress=3)
    with (args.output / "heldout_predictions.csv").open("w") as file:
        writer = csv.writer(file)
        writer.writerow(["worker", "video_id", "row", "timestamp"] +
                        [f"{p}_{kind}" for p in POSTURES for kind in ("true", "predicted")])
        for worker, segment, stamp, true, pred in zip(workers, segments, timestamps, y, predictions):
            writer.writerow([worker, *segment.split(":"), stamp,
                             *[int(value) for pair in zip(true, pred) for value in pair]])
    report["training_seconds"] = time.monotonic() - started
    write_json(args.output / "metrics.json", report)
    print("Saved final MURI model and held-out evaluation", flush=True)


def frame_features(feature, kinds):
    """Shared transforms for video overlays and per-second table exports."""
    from improve import geometry

    values = {"baseline": feature[None], "geometry": geometry(feature)}
    if any(kind.startswith("physical_") for kind in kinds):
        from physical import physical_features

        values.update({"physical_" + p: v for p, v in physical_features(feature).items()})
    if any(kind.startswith("invariant_") for kind in kinds):
        from deep import invariant_features

        values.update({"invariant_" + p: v for p, v in invariant_features(feature).items()})
    return values


def predict(args):
    import cv2
    import joblib
    from ultralytics import YOLO

    if args.video.resolve() == args.video_output.resolve():
        raise ValueError("Output video must differ from the input video")
    artifact = joblib.load(args.model)
    # Single-frame inference avoids the overhead of starting forest worker threads.
    for classifier in artifact.get("models", {}).values():
        estimator = classifier.steps[-1][1] if hasattr(classifier, "steps") else classifier
        if hasattr(estimator, "n_jobs"):
            estimator.n_jobs = 1
    model = YOLO(str(args.pose_model or artifact.get("pose_model", POSE_MODEL)))
    fallback_pose = YOLO(artifact["fallback_pose_model"]) if artifact.get("fallback_pose_model") else None
    needs_visual = any(kind.startswith("visual") for kind in artifact.get("model_features", {}).values())
    encoder = None
    encoder_device = "cpu" if args.device == "cpu" else "cuda:" + str(args.device)
    if needs_visual:
        from visual import load_encoder

        encoder = load_encoder(encoder_device)
    activity_scores = None
    if artifact.get("unit") == "activity":
        from improve import score_activity

        activity_scores = score_activity(args.video, model, artifact, args.start, args.seconds,
                                        args.roi, encoder, encoder_device)
    cap = cv2.VideoCapture(str(args.video))
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        raise ValueError(f"Unreadable video: {args.video}")
    stride = max(1, round(fps / 10))
    width, height = (int(cap.get(prop)) for prop in (cv2.CAP_PROP_FRAME_WIDTH, cv2.CAP_PROP_FRAME_HEIGHT))
    writer = cv2.VideoWriter(str(args.video_output), cv2.VideoWriter_fourcc(*"mp4v"),
                            fps / stride, (width, height))
    if not writer.isOpened():
        raise RuntimeError(f"Cannot write output: {args.video_output}")
    temporal = artifact.get("feature_version") == 2 and artifact.get("unit", "frame") == "frame"
    needs_context = any(kind.startswith("temporal_") for kind in artifact.get("model_features", {}).values())
    warmup = min(args.start, 4) if temporal and needs_context else 0
    read_start = args.start - warmup
    cap.set(cv2.CAP_PROP_POS_FRAMES, round(read_start * fps))
    history, history_times, scores = [], [], {}
    frames_written = 0
    for frame_number in range(round((args.seconds + warmup) * fps)):
        ok, frame = cap.read()
        if not ok:
            break
        if frame_number % stride:
            continue
        result = model.predict(frame, device=args.device, imgsz=artifact.get("imgsz", 640), verbose=False)[0]
        feature, index = worker_pose(result, args.roi, artifact.get("min_foot_y", .55))
        if feature is None and fallback_pose is not None:
            result = fallback_pose.predict(frame, device=args.device, imgsz=artifact.get("fallback_imgsz", 640), verbose=False)[0]
            feature, index = worker_pose(result, args.roi, artifact.get("min_foot_y", .55))
        timestamp = read_start + frame_number / fps
        lines = ["MURI activity estimate (complete clip)" if activity_scores is not None
                 else "MURI estimate: 4 posture components (1 low, 2 medium, 3 high)"]
        if feature is None and activity_scores is None:
            lines.append("Pose unavailable - no score")
        else:
            if index is not None:
                frame = result[index].plot(boxes=False, labels=False)
            if temporal and (not needs_context or not history_times or timestamp - history_times[-1] >= .49):
                from improve import geometry, temporal_features

                history.append(feature)
                history_times.append(timestamp)
                while history_times[0] < timestamp - 4:
                    history.pop(0)
                    history_times.pop(0)
                transforms = frame_features(feature, artifact["model_features"].values())
                if needs_context:
                    transforms["temporal_forest"] = temporal_features(np.asarray(history), np.asarray(history_times),
                                                                      np.zeros(len(history)))[-1:]
                    transforms["temporal_svm"] = transforms["temporal_forest"]
                if needs_visual:
                    from visual import crop_worker, encode

                    crop = crop_worker(result.orig_img, result.boxes.xyxy[index].cpu().numpy())
                    vector = encode(encoder, [crop], encoder_device)
                    vector /= np.maximum(np.linalg.norm(vector, axis=1, keepdims=True), 1e-8)
                    transforms["visual_svm"] = np.column_stack([geometry(feature), vector])
                    transforms["visual_forest"] = transforms["visual_svm"]
                scores = {p: int(classifier.predict(transforms[artifact["model_features"][p]])[0])
                          for p, classifier in artifact["models"].items()}
            for posture, classifier in artifact["models"].items():
                score = (activity_scores[posture] if activity_scores is not None else
                         scores[posture] if temporal else int(classifier.predict(feature[None])[0]))
                suffix = " (constant training label)" if len(classifier.classes_) == 1 else ""
                lines.append(f"{posture}: {score}{suffix}")
        cv2.rectangle(frame, (0, 0), (width, 32 * len(lines) + 12), (20, 20, 20), -1)
        for i, line in enumerate(lines):
            cv2.putText(frame, line, (12, 28 + 32 * i), cv2.FONT_HERSHEY_SIMPLEX,
                        .6, (255, 255, 255), 1, cv2.LINE_AA)
        if timestamp + 1e-6 >= args.start:
            writer.write(frame)
            frames_written += 1
    cap.release()
    writer.release()
    if frames_written == 0:
        raise ValueError("No frames rendered; check the requested time range")
    print("Rendered", frames_written, "frames to", args.video_output, flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    prep = sub.add_parser("prepare")
    prep.add_argument("data", type=Path)
    for command in (prep, sub.add_parser("extract"), sub.add_parser("train")):
        command.add_argument("output", type=Path)
    ext = sub.choices["extract"]
    ext.add_argument("--sample-fps", type=float, default=2)
    ext.add_argument("--batch", type=int, default=32)
    pred = sub.add_parser("predict")
    pred.add_argument("video", type=Path)
    pred.add_argument("model", type=Path)
    pred.add_argument("video_output", type=Path)
    pred.add_argument("--start", type=float, default=0)
    pred.add_argument("--seconds", type=float, default=30)
    pred.add_argument("--roi", type=float, nargs=4, help="Normalized worker ROI: xmin ymin xmax ymax")
    table = sub.add_parser("export", help="Export scores and 17 body keypoints once per video second")
    table.add_argument("video", type=Path)
    table.add_argument("model", type=Path)
    table.add_argument("csv_output", type=Path)
    table.add_argument("--start", type=float, default=0)
    table.add_argument("--seconds", type=float, help="Default: remaining video duration")
    table.add_argument("--roi", type=float, nargs=4, help="Normalized worker ROI: xmin ymin xmax ymax")
    table.add_argument("--device", default="0")
    for command in (ext, pred):
        command.add_argument("--pose-model", type=Path, default=Path(POSE_MODEL))
        command.add_argument("--device", default="0")
    pred.set_defaults(pose_model=None)
    args = parser.parse_args()
    if args.command == "extract" and (not math.isfinite(args.sample_fps) or args.sample_fps <= 0 or args.batch < 1):
        parser.error("Sampling rate and batch size must be positive")
    if args.command in ("predict", "export") and (not math.isfinite(args.start) or args.start < 0 or
            (args.seconds is not None and (not math.isfinite(args.seconds) or args.seconds <= 0))):
        parser.error("Start must be nonnegative and duration must be positive")
    if args.command in ("predict", "export") and args.roi and not (0 <= args.roi[0] < args.roi[2] <= 1 and 0 <= args.roi[1] < args.roi[3] <= 1):
        parser.error("ROI must satisfy 0 <= xmin < xmax <= 1 and 0 <= ymin < ymax <= 1")
    if args.command == "export":
        from tabular import export

        export(args)
    else:
        {"prepare": prepare, "extract": extract, "train": train, "predict": predict}[args.command](args)


if __name__ == "__main__":
    main()
