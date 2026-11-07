"""Calibrate MURI scores using a few posture-specific geometric measurements."""

import argparse
import json
import time
from pathlib import Path

import joblib
import numpy as np
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

from improve import balanced_segment_weights
from sustage import POSTURES, evaluate, fit_score, write_json


def physical_features(raw):
    raw = np.atleast_2d(raw)
    points = raw[:, :24].reshape(-1, 12, 2)
    shoulders = (points[:, 0] + points[:, 1]) / 2
    hips = (points[:, 6] + points[:, 7]) / 2
    torso = shoulders - hips
    height = np.linalg.norm(torso, axis=1)
    height[height < 1e-4] = np.nan
    lean = np.arctan2(np.abs(torso[:, 0]), np.abs(torso[:, 1]))
    shoulder_line, hip_line = points[:, 1] - points[:, 0], points[:, 7] - points[:, 6]
    shoulder_width, hip_width = np.linalg.norm(shoulder_line, axis=1), np.linalg.norm(hip_line, axis=1)
    cross = shoulder_line[:, 0] * hip_line[:, 1] - shoulder_line[:, 1] * hip_line[:, 0]
    twist = np.arctan2(np.abs(cross), np.abs((shoulder_line * hip_line).sum(axis=1)))
    elbows = (points[:, :2, 1] - points[:, 2:4, 1]) / height[:, None]
    wrists = (points[:, :2, 1] - points[:, 4:6, 1]) / height[:, None]
    hip_bend = np.pi - raw[:, 42:44]
    knee_bend = np.pi - raw[:, 38:40]
    # Missing joints remain NaN; calibration never treats an occluded leg as straight.
    return {
        "waist_flexion": np.column_stack([lean, shoulder_width / height, hip_bend]),
        "waist_rotation": np.column_stack([twist, shoulder_width / height, hip_width / height,
                                            shoulder_width / np.maximum(hip_width, 1e-4)]),
        "arm_height": np.column_stack([elbows, wrists, raw[:, 40:42]]),
        "knee_flexion": np.column_stack([knee_bend, hip_bend,
                    (points[:, 8:10, 1] - points[:, 6:8, 1]) / height[:, None]]),
    }


def fit(name, X, y, segments):
    if len(np.unique(y)) == 1:
        return DummyClassifier(strategy="most_frequent").fit(X, y)
    if name == "baseline":
        return fit_score(X, y, segments)
    classifier = {"linear": lambda: LogisticRegression(C=1, max_iter=1000),
                  "tree": lambda: DecisionTreeClassifier(max_depth=3, min_samples_leaf=10, random_state=42),
                  "boost": lambda: HistGradientBoostingClassifier(max_iter=100, max_depth=2,
                                   min_samples_leaf=20, l2_regularization=2, random_state=42)}[name]()
    model = make_pipeline(SimpleImputer(strategy="median", keep_empty_features=True), StandardScaler(), classifier)
    return model.fit(X, y, **{model.steps[-1][0] + "__sample_weight": balanced_segment_weights(y, segments)})


def run(source, output):
    started = time.monotonic()
    output.mkdir(parents=True, exist_ok=True)
    extraction = json.loads((source / "extraction_config.json").read_text())
    pose_settings = {"pose_model": Path(extraction["pose_model"]).name, "imgsz": extraction.get("imgsz", 640)}
    for key in ("fallback_pose_model", "fallback_imgsz"):
        if key in extraction:
            pose_settings[key] = extraction[key]
    arrays = []
    for path in sorted((source / "keypoints").glob("*.npz")):
        with np.load(path) as data:arrays.append({k: data[k].copy() for k in data.files})
    raw, y, workers, segments = (np.concatenate([a[k] for a in arrays]) for k in ("X", "y", "worker", "segment"))
    features = physical_features(raw)
    names = ("baseline", "linear", "tree", "boost")
    predicted = {name: np.zeros_like(y) for name in names}
    selected = np.zeros_like(y)
    choices = {}
    for worker in np.unique(workers):
        models, kinds = {}, {}
        choices[worker] = {}
        for column, posture in enumerate(POSTURES):
            train, test = (workers != worker) & (y[:, column] > 0), (workers == worker) & (y[:, column] > 0)
            scores, fitted = {}, {}
            for name in names:
                X = raw if name == "baseline" else features[posture]
                validation_scores = []
                for validation_worker in np.unique(workers[train]):
                    inner, validation = train & (workers != validation_worker), train & (workers == validation_worker)
                    model = fit(name, X[inner], y[inner, column], segments[inner])
                    validation_scores.append(f1_score(y[validation, column], model.predict(X[validation]), average="macro", zero_division=0))
                scores[name] = float(np.mean(validation_scores))
                fitted[name] = fit(name, X[train], y[train, column], segments[train])
                predicted[name][test, column] = fitted[name].predict(X[test])
            best = max(scores, key=scores.get)
            selected[test, column] = predicted[best][test, column]
            models[posture], kinds[posture] = fitted[best], "baseline" if best == "baseline" else "physical_" + posture
            choices[worker][posture] = {"selected": best, "inner_worker_macro_f1": scores}
            print(worker, posture, best, scores, flush=True)
        joblib.dump({"models": models, "model_features": kinds, "feature_version": 2, "unit": "frame",
                     "held_out_worker": worker, **pose_settings}, output / f"heldout_{worker}.joblib", compress=3)
    report = {"evaluation": "Nested leave-one-worker-out; physical calibration", "sample_count": len(y),
              "choices": choices, "variants": {}, "selected": {}, "unit": "frame"}
    for name, prediction in {**predicted, "selected": selected}.items():
        score = {p: evaluate(y[y[:, i] > 0, i], prediction[y[:, i] > 0, i]) for i, p in enumerate(POSTURES)}
        if name == "selected":
            report["selected"] = score
        else:
            report["variants"][name] = score
        print(name, {p: round(m["macro_f1"], 4) for p, m in score.items()}, flush=True)
    models, kinds = {}, {}
    for i, posture in enumerate(POSTURES):
        scores = {name: np.mean([choices[w][posture]["inner_worker_macro_f1"][name] for w in choices]) for name in names}
        best = max(scores, key=scores.get)
        mask = y[:, i] > 0
        models[posture] = fit(best, (raw if best == "baseline" else features[posture])[mask], y[mask, i], segments[mask])
        kinds[posture] = "baseline" if best == "baseline" else "physical_" + posture
    joblib.dump({"models": models, "model_features": kinds, "feature_version": 2, "unit": "frame",
                 "held_out_worker": None, **pose_settings}, output / "muri_model.joblib", compress=3)
    report["deployment_features"] = kinds
    report["seconds"] = time.monotonic() - started
    write_json(output / "metrics.json", report)
    np.savez_compressed(output / "heldout_predictions.npz", y=y, prediction=selected, worker=workers, segment=segments)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    run(args.source, args.output)
