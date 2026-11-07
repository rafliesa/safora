"""Test side-invariant posture features with nested worker-held-out validation."""

import argparse
import json
import time
from pathlib import Path

import joblib
import numpy as np
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import ExtraTreesClassifier, HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from improve import balanced_segment_weights, fit_variant, geometry
from physical import fit as fit_physical, physical_features
from sustage import POSTURES, evaluate, fit_score, write_json


# These candidates are fixed before evaluating this experiment's outer folds.
CANDIDATES = {
    "baseline": ("baseline", "baseline", "segment"),
    "previous_geometry": ("geometry", "previous", "segment"),
    "previous_physical": ("physical", "previous", "segment"),
    "symmetric_linear": ("invariant", "linear", "worker"),
    "symmetric_svm": ("invariant", "svm", "worker"),
    "symmetric_boost": ("invariant", "boost", "worker"),
    "symmetric_forest": ("invariant", "forest", "worker"),
    "frame_svm": ("invariant", "svm", "frame"),
    "frame_forest": ("invariant", "forest", "frame"),
}


def invariant_features(raw):
    """Symmetric left/right measurements; never use worker, station, or time as inputs."""
    raw = np.atleast_2d(raw)
    points = raw[:, :24].reshape(-1, 12, 2)
    shoulders = points[:, :2].mean(axis=1)
    hips = points[:, 6:8].mean(axis=1)
    torso = shoulders - hips
    scale = np.linalg.norm(torso, axis=1)
    scale[scale < 1e-4] = np.nan
    physical = physical_features(raw)

    def pair(values):
        return np.sort(values, axis=1)

    def bone(a, b):
        vector = points[:, b] - points[:, a]
        length = np.linalg.norm(vector, axis=2)
        safe = np.where(length > 1e-4, length, np.nan)
        return np.column_stack([pair(length / scale[:, None]),
                                pair(np.abs(vector[:, :, 0]) / safe),
                                pair(vector[:, :, 1] / safe)])

    shoulder_width = np.linalg.norm(points[:, 1] - points[:, 0], axis=1)
    hip_width = np.linalg.norm(points[:, 7] - points[:, 6], axis=1)
    view = np.column_stack([shoulder_width / scale, hip_width / scale,
                           np.abs(torso[:, 0]) / scale, torso[:, 1] / scale])
    hip_bend = pair(np.pi - raw[:, 42:44])
    knee_bend = pair(np.pi - raw[:, 38:40])
    thigh, shank = bone([6, 7], [8, 9]), bone([8, 9], [10, 11])
    upper_arm, forearm = bone([0, 1], [2, 3]), bone([2, 3], [4, 5])
    elbow_height = pair((points[:, :2, 1] - points[:, 2:4, 1]) / scale[:, None])
    wrist_height = pair((points[:, :2, 1] - points[:, 4:6, 1]) / scale[:, None])
    return {
        "waist_flexion": np.column_stack([view, hip_bend, thigh, knee_bend]),
        "waist_rotation": np.column_stack([physical["waist_rotation"], view,
            pair(np.abs(points[:, 6:8, 0] - points[:, :2, 0]) / scale[:, None])]),
        "arm_height": np.column_stack([elbow_height, wrist_height, pair(raw[:, 40:42]),
                                       pair(raw[:, 36:38]), upper_arm, forearm]),
        "knee_flexion": np.column_stack([knee_bend, hip_bend, thigh, shank, view]),
    }


def weights_for(y, segments, workers, mode):
    if mode == "segment":
        return balanced_segment_weights(y, segments)
    if mode == "frame":
        _, inverse, counts = np.unique(y, return_inverse=True, return_counts=True)
        result = 1. / counts[inverse]
    elif mode == "worker":
        groups, first, inverse, counts = np.unique(segments, return_index=True, return_inverse=True, return_counts=True)
        if any(len(np.unique(y[inverse == i])) != 1 or len(np.unique(workers[inverse == i])) != 1
               for i in range(len(groups))):
            raise ValueError("An activity must belong to one worker and one score")
        labels, people = y[first], workers[first]
        mass = np.array([1. / (sum((labels == label) & (people == worker)) *
                                   len(np.unique(people[labels == label])))
                         for label, worker in zip(labels, people)])
        result = mass[inverse] / counts[inverse]
    else:
        raise ValueError(mode)
    return result * len(y) / result.sum()


def fit_candidate(name, X, y, segments, workers):
    kind, estimator, weight_mode = CANDIDATES[name]
    if len(np.unique(y)) == 1:
        return DummyClassifier(strategy="most_frequent").fit(X, y)
    if name == "baseline":
        return fit_score(X, y, segments)
    if name == "previous_geometry":
        return fit_variant("geometry", X, y, segments)
    if name == "previous_physical":
        return fit_physical("linear", X, y, segments)
    classifier = {
        "linear": lambda: LogisticRegression(C=1, max_iter=2000),
        "svm": lambda: SVC(C=3, gamma="scale", cache_size=256),
        "boost": lambda: HistGradientBoostingClassifier(max_iter=120, max_depth=3,
                    min_samples_leaf=20, l2_regularization=5, early_stopping=False, random_state=42),
        "forest": lambda: ExtraTreesClassifier(n_estimators=200, max_depth=12,
                    min_samples_leaf=5, max_features=.8, random_state=42, n_jobs=4),
    }[estimator]()
    model = make_pipeline(SimpleImputer(strategy="median", keep_empty_features=True), StandardScaler(), classifier)
    return model.fit(X, y, **{model.steps[-1][0] + "__sample_weight": weights_for(y, segments, workers, weight_mode)})


def run(source, output):
    started = time.monotonic()
    output.mkdir(parents=True, exist_ok=True)
    arrays = [dict(np.load(p)) for p in sorted((source / "keypoints").glob("*.npz"))]
    raw, y, workers, segments, stamps = (np.concatenate([a[k] for a in arrays])
                       for k in ("X", "y", "worker", "segment", "timestamp"))
    video = np.concatenate([np.repeat(i, len(a["X"])) for i, a in enumerate(arrays)])
    features = {"baseline": raw, "geometry": geometry(raw),
                "physical": physical_features(raw), "invariant": invariant_features(raw)}
    config = json.loads((source / "extraction_config.json").read_text())
    settings = {k: config[k] for k in ("pose_model", "imgsz", "fallback_pose_model", "fallback_imgsz", "min_foot_y") if k in config}
    settings["pose_model"] = Path(settings["pose_model"]).name
    predictions = {name: np.zeros_like(y) for name in CANDIDATES}
    selected = np.zeros_like(y)
    choices, fitted = {}, {}

    def feature_set(name, posture):
        kind = CANDIDATES[name][0]
        return features[kind][posture] if kind in ("physical", "invariant") else features[kind]

    def feature_name(name, posture):
        kind = CANDIDATES[name][0]
        return kind + "_" + posture if kind in ("physical", "invariant") else kind

    # Cache single-worker fits: they recur in multiple inner validation folds.
    for column, posture in enumerate(POSTURES):
        for held_out in np.unique(workers):
            train = (workers != held_out) & (y[:, column] > 0)
            test = (workers == held_out) & (y[:, column] > 0)
            scores = {}
            for name in CANDIDATES:
                X = feature_set(name, posture)
                inner_pred = np.zeros(len(y), dtype=np.int8)
                for validation_worker in np.unique(workers[train]):
                    inner, validation = train & (workers != validation_worker), train & (workers == validation_worker)
                    key = (posture, name, tuple(np.unique(workers[inner])))
                    if key not in fitted:
                        fitted[key] = fit_candidate(name, X[inner], y[inner, column], segments[inner], workers[inner])
                    inner_pred[validation] = fitted[key].predict(X[validation])
                scores[name] = evaluate(y[train, column], inner_pred[train])["macro_f1"]
                model = fit_candidate(name, X[train], y[train, column], segments[train], workers[train])
                predictions[name][test, column] = model.predict(X[test])
                fitted[(posture, name, tuple(np.unique(workers[train])))] = model
            best = max(scores, key=scores.get)
            selected[test, column] = predictions[best][test, column]
            choices.setdefault(held_out, {})[posture] = {"selected": best, "inner_scores": scores}
            print(held_out, posture, best, {n: round(v, 4) for n, v in scores.items()}, flush=True)

    report = {"protocol": "Nested worker-held-out selection; inner predictions pooled over training workers only",
              "sample_count": len(y), "choices": choices, "variants": {}, "selected": {}, "unit": "frame"}
    for name, pred in {**predictions, "selected": selected}.items():
        scores = {p: evaluate(y[:, i], pred[:, i]) for i, p in enumerate(POSTURES)}
        if name == "selected":
            report["selected"] = scores
        else:
            report["variants"][name] = scores
        print(name, {p: round(v["macro_f1"], 4) for p, v in scores.items()}, flush=True)
    for worker in np.unique(workers):
        names = {p: choices[worker][p]["selected"] for p in POSTURES}
        train_workers = tuple(np.unique(workers[workers != worker]))
        artifact = {"models": {p: fitted[(p, name, train_workers)] for p, name in names.items()},
                    "model_features": {p: feature_name(name, p) for p, name in names.items()},
                    "feature_version": 2, "unit": "frame", "held_out_worker": worker, **settings}
        joblib.dump(artifact, output / f"heldout_{worker}.joblib", compress=3)
    names = {p: max(CANDIDATES, key=lambda n: report["variants"][n][p]["macro_f1"]) for p in POSTURES}
    final = {"models": {p: fit_candidate(n, feature_set(n, p), y[:, i], segments, workers)
                        for i, (p, n) in enumerate(names.items())},
             "model_features": {p: feature_name(n, p) for p, n in names.items()},
             "feature_version": 2, "unit": "frame", "held_out_worker": None, **settings}
    joblib.dump(final, output / "muri_model.joblib", compress=3)
    report["deployment_candidates"] = names
    report["seconds"] = time.monotonic() - started
    report["warning"] = "Three development workers reused across experiments; a new-worker final test is still required"
    write_json(output / "metrics.json", report)
    np.savez_compressed(output / "heldout_predictions.npz", y=y, prediction=selected, worker=workers,
                        segment=segments, video=video, timestamp=stamps, **predictions)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    run(args.source, args.output)
