"""Compare geometry and causal temporal MURI models with worker-held-out evaluation."""

import argparse
import json
import time
import warnings
from pathlib import Path

import joblib
import numpy as np
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import f1_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from sustage import POSTURES, evaluate, fit_score, segment_votes, write_json


VARIANTS = ("baseline", "geometry", "temporal_forest", "temporal_svm")


def geometry(raw):
    raw = np.atleast_2d(raw)
    points = raw[:, :24].reshape(-1, 12, 2)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        hips = np.nanmean(points[:, 6:8], axis=1)
        shoulders = np.nanmean(points[:, :2], axis=1)
    scale = np.linalg.norm(shoulders - hips, axis=1)
    scale[scale < 1e-4] = np.nan
    normalized = (points - hips[:, None]) / scale[:, None, None]
    distances = [np.linalg.norm(normalized[:, a] - normalized[:, b], axis=1)
                 for a in range(12) for b in range(a + 1, 12)]
    torso = shoulders - hips
    lean = np.arctan2(np.abs(torso[:, 0]), np.abs(torso[:, 1]))
    return np.column_stack([normalized.reshape(-1, 24), raw[:, 24:], *distances, lean])


def temporal_features(raw, timestamps, videos, seconds=4):
    """Use current/past observations from the same video, without activity boundaries."""
    physical = geometry(raw)
    output = []
    for i, stamp in enumerate(timestamps):
        indices = np.flatnonzero((videos[:i + 1] == videos[i]) &
                                 (timestamps[:i + 1] >= stamp - seconds))
        history = physical[indices]
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            low, median, high = np.nanpercentile(history, [10, 50, 90], axis=0)
        output.append(np.concatenate([physical[i], low, median, high, high - low]))
    return np.asarray(output, dtype=np.float32)


def balanced_segment_weights(y, segments):
    """Give each class equal total weight, then each activity equal weight within class."""
    _, first, inverse, counts = np.unique(segments, return_index=True, return_inverse=True, return_counts=True)
    if any(len(np.unique(y[inverse == i])) != 1 for i in range(len(first))):
        raise ValueError("A segment contains conflicting labels")
    class_counts = np.bincount(y[first], minlength=4)
    weights = 1 / (counts[inverse] * class_counts[y])
    return weights * len(y) / weights.sum()


def pool_rows(values):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        low, median, high = np.nanpercentile(values, [10, 50, 90], axis=0)
    return np.concatenate([low, median, high, high - low])


def activity_features(raw, visual=None):
    physical = geometry(raw)
    pooled = pool_rows(physical)
    features = {"baseline": pool_rows(raw)[raw.shape[1]:raw.shape[1] * 2],
                "geometry": pool_rows(physical)[physical.shape[1]:physical.shape[1] * 2],
                "temporal_forest": pooled, "temporal_svm": pooled}
    if visual is not None:
        combined = np.concatenate([pooled, visual.mean(axis=0)])
        features.update(visual_svm=combined, visual_forest=combined)
    return features


def score_activity(video, pose, artifact, start, seconds, roi, encoder=None, device="cuda:0"):
    import cv2
    from sustage import worker_pose
    from visual import crop_worker, encode

    cap = cv2.VideoCapture(str(video))
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        raise ValueError(f"Unreadable video: {video}")
    cap.set(cv2.CAP_PROP_POS_FRAMES, round(start * fps))
    raw, crops = [], []
    for i in range(round(seconds * fps)):
        if i % max(1, round(fps / 2)):
            if not cap.grab():
                break
            continue
        ok, frame = cap.read()
        if not ok:
            break
        result = pose.predict(frame, device="cpu" if device == "cpu" else int(device.split(":")[-1]),
                              imgsz=640, verbose=False)[0]
        feature, index = worker_pose(result, roi)
        if feature is None:
            continue
        raw.append(feature)
        if encoder is not None:
            crops.append(crop_worker(frame, result.boxes.xyxy[index].cpu().numpy()))
    cap.release()
    if not raw:
        raise ValueError("No usable worker poses in this activity clip")
    vectors = None
    if crops:
        vectors = np.concatenate([encode(encoder, crops[i:i + 32], device) for i in range(0, len(crops), 32)])
        vectors /= np.maximum(np.linalg.norm(vectors, axis=1, keepdims=True), 1e-8)
    features = activity_features(np.asarray(raw), vectors)
    return {p: int(model.predict(features[artifact["model_features"][p]][None])[0])
            for p, model in artifact["models"].items()}


def fit_variant(name, X, y, segments):
    if len(np.unique(y)) == 1:
        return DummyClassifier(strategy="most_frequent").fit(X, y)
    if name == "baseline":
        return fit_score(X, y, segments)
    weights = balanced_segment_weights(y, segments)
    if name.endswith("svm"):
        model = make_pipeline(SimpleImputer(strategy="median", keep_empty_features=True),
                              StandardScaler(), SVC(C=3, gamma="scale", cache_size=1024))
        return model.fit(X, y, svc__sample_weight=weights)
    classifier = (ExtraTreesClassifier if name.endswith("forest") else RandomForestClassifier)(
        n_estimators=200, max_depth=16, min_samples_leaf=2,
        max_features=.7, random_state=42, n_jobs=4)
    model = make_pipeline(SimpleImputer(strategy="median", keep_empty_features=True), classifier)
    return model.fit(X, y, **{model.steps[-1][0] + "__sample_weight": weights})


def run(args):
    started = time.monotonic()
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((args.source / "manifest.json").read_text())
    extraction = json.loads((args.source / "extraction_config.json").read_text())
    pose_settings = {"pose_model": Path(extraction["pose_model"]).name, "imgsz": extraction.get("imgsz", 640)}
    for key in ("fallback_pose_model", "fallback_imgsz"):
        if key in extraction:
            pose_settings[key] = extraction[key]
    arrays = []
    for i in range(len(manifest)):
        with np.load(args.source / "keypoints" / f"{i:02d}.npz") as data:
            arrays.append({key: data[key].copy() for key in data.files})
    raw, y, workers, segments, stamps = (np.concatenate([a[key] for a in arrays])
        for key in ("X", "y", "worker", "segment", "timestamp"))
    videos = np.concatenate([np.repeat(i, len(a["X"])) for i, a in enumerate(arrays)])
    visual = None
    if args.visual:
        visual_arrays = []
        for i, array in enumerate(arrays):
            with np.load(args.visual / f"{i:02d}.npz") as embedding:
                if not np.array_equal(embedding["timestamp"], array["timestamp"]):
                    raise ValueError(f"Visual feature timestamps differ for video {i}")
                visual_arrays.append(embedding["vectors"].copy())
        visual = np.concatenate(visual_arrays)
        visual /= np.maximum(np.linalg.norm(visual, axis=1, keepdims=True), 1e-8)
    if args.unit == "frame":
        temporal = temporal_features(raw, stamps, videos)
        features = {"baseline": raw, "geometry": geometry(raw),
                    "temporal_forest": temporal, "temporal_svm": temporal}
        if visual is not None:
            combined = np.column_stack([geometry(raw), visual])
            features.update(visual_svm=combined, visual_forest=combined)
    else:
        keys, first = np.unique(segments, return_index=True)
        grouped = [activity_features(raw[segments == key], visual[segments == key] if visual is not None else None)
                   for key in keys]
        features = {name: np.asarray([group[name] for group in grouped]) for name in grouped[0]}
        for key in keys:
            if len(np.unique(y[segments == key], axis=0)) != 1:
                raise ValueError(f"Conflicting scores for activity {key}")
        y, workers, stamps, videos, segments = y[first], workers[first], stamps[first], videos[first], keys
    variants = tuple(features)
    predictions = {name: np.zeros_like(y) for name in variants}
    selected = np.zeros_like(y)
    choices, all_models = {}, {}
    for held_out in np.unique(workers):
        choices[held_out], all_models[held_out] = {}, {}
        for column, posture in enumerate(POSTURES):
            train = (workers != held_out) & (y[:, column] > 0)
            test = (workers == held_out) & (y[:, column] > 0)
            scores = {}
            for name in variants:
                X = features[name]
                inner_scores = []
                for validation_worker in np.unique(workers[train]):
                    inner_train = train & (workers != validation_worker)
                    validation = train & (workers == validation_worker)
                    model = fit_variant(name, X[inner_train], y[inner_train, column], segments[inner_train])
                    inner_scores.append(f1_score(y[validation, column], model.predict(X[validation]),
                                                 average="macro", zero_division=0))
                scores[name] = float(np.mean(inner_scores))
                model = fit_variant(name, X[train], y[train, column], segments[train])
                all_models[held_out][(posture, name)] = model
                predictions[name][test, column] = model.predict(X[test])
            best = max(scores, key=scores.get)
            selected[test, column] = predictions[best][test, column]
            choices[held_out][posture] = {"selected": best, "inner_worker_macro_f1": scores}
            print(held_out, posture, best, scores, flush=True)
        artifact = {"models": {p: all_models[held_out][(p, choices[held_out][p]["selected"])] for p in POSTURES},
                    "model_features": {p: choices[held_out][p]["selected"] for p in POSTURES},
                    "held_out_worker": held_out, **pose_settings, "feature_version": 2,
                    "unit": args.unit, "visual_model": "dinov2_vits14" if visual is not None else None}
        joblib.dump(artifact, args.output / f"heldout_{held_out}.joblib", compress=3)
    report = {"evaluation": "Nested leave-one-worker-out; model selection uses training workers only",
              "unit": args.unit, "sample_count": len(y), "choices": choices, "variants": {}, "selected": {}}
    old = json.loads((args.source / "metrics.json").read_text())
    report["reference_baseline"] = {p: old["pooled"][p]["model"] if args.unit == "frame"
                                    else old["activity_votes"][p]["model"] for p in POSTURES}
    score_key = "frame" if args.unit == "frame" else "activity"
    for name, pred in {**predictions, "selected": selected}.items():
        scores = {}
        for i, posture in enumerate(POSTURES):
            mask = y[:, i] > 0
            scores[posture] = {score_key: evaluate(y[mask, i], pred[mask, i]),
                "activity_votes": segment_votes(y[mask, i], pred[mask, i], predictions["baseline"][mask, i], segments[mask])}
        if name == "selected":
            report["selected"] = scores
        else:
            report["variants"][name] = scores
        print(name, {p: round(m[score_key]["macro_f1"], 4) for p, m in scores.items()}, flush=True)
    final_models, feature_kinds = {}, {}
    for i, posture in enumerate(POSTURES):
        mask = y[:, i] > 0
        # Deployment selection uses the same worker-validation scores, never deployment accuracy.
        validation_scores = {name: np.mean([choices[w][posture]["inner_worker_macro_f1"][name]
                                            for w in choices]) for name in variants}
        best = max(validation_scores, key=validation_scores.get)
        final_models[posture] = fit_variant(best, features[best][mask], y[mask, i], segments[mask])
        feature_kinds[posture] = best
    joblib.dump({"models": final_models, "model_features": feature_kinds, **pose_settings,
                "feature_version": 2, "held_out_worker": None, "unit": args.unit,
                "visual_model": "dinov2_vits14" if visual is not None else None}, args.output / "muri_model.joblib", compress=3)
    report["deployment_features"] = feature_kinds
    report["seconds"] = time.monotonic() - started
    write_json(args.output / "metrics.json", report)
    np.savez_compressed(args.output / "heldout_predictions.npz", y=y, prediction=selected,
                        worker=workers, timestamp=stamps, video=videos, segment=segments,
                        **{name: pred for name, pred in predictions.items()})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--visual", type=Path)
    parser.add_argument("--unit", choices=["frame", "activity"], default="frame")
    run(parser.parse_args())
