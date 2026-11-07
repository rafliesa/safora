"""Export audited development models and compare on exactly matching samples."""

import argparse
import json
import shutil
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics import accuracy_score, classification_report, f1_score

from deep import CANDIDATES, fit_candidate, invariant_features
from improve import geometry
from physical import physical_features
from sustage import POSTURES, evaluate, write_json


def run(source, experiment, previous, output):
    if output.exists():
        raise ValueError("Use a new output directory")
    output.mkdir(parents=True)
    arrays = [dict(np.load(p)) for p in sorted((source / "canonical").glob("*.npz"))]
    X, y, workers, segments, stamps, available = (np.concatenate([a[k] for a in arrays])
            for k in ("X", "y", "worker", "segment", "timestamp", "available"))
    videos = np.concatenate([np.repeat(i, len(a["X"])) for i, a in enumerate(arrays)])
    old = dict(np.load(previous / "validation_predictions.npz"))
    new = dict(np.load(experiment / "heldout_predictions.npz"))
    for name, value in {"y": y, "worker": workers, "segment": segments, "timestamp": stamps}.items():
        np.testing.assert_array_equal(value, old[name])
        np.testing.assert_array_equal(value[available], new[name])
    report = json.loads((experiment / "metrics.json").read_text())
    chosen = report["deployment_candidates"]
    config = json.loads((source / "extraction_config.json").read_text())
    settings = {k: config[k] for k in ("pose_model", "imgsz", "fallback_pose_model", "fallback_imgsz", "min_foot_y") if k in config}
    features = {"baseline": X[available], "geometry": geometry(X[available]),
                "physical": physical_features(X[available]), "invariant": invariant_features(X[available])}
    clean_y, clean_workers, clean_segments = y[available], workers[available], segments[available]
    predicted = np.zeros_like(y)
    clean_prediction = np.zeros_like(clean_y)
    for worker in np.unique(workers):
        train, test = clean_workers != worker, clean_workers == worker
        models, kinds = {}, {}
        for i, posture in enumerate(POSTURES):
            name = chosen[posture]
            kind = CANDIDATES[name][0]
            values = features[kind][posture] if kind in ("physical", "invariant") else features[kind]
            model = fit_candidate(name, values[train], clean_y[train, i], clean_segments[train], clean_workers[train])
            clean_prediction[test, i] = model.predict(values[test])
            np.testing.assert_array_equal(clean_prediction[test, i], new[name][test, i])
            models[posture] = model
            kinds[posture] = kind + "_" + posture if kind in ("physical", "invariant") else kind
        joblib.dump({"models": models, "model_features": kinds, "feature_version": 2, "unit": "frame",
                     "held_out_worker": worker, **settings}, output / f"heldout_{worker}.joblib", compress=3)
    predicted[available] = clean_prediction
    shutil.copy2(experiment / "muri_model.joblib", output / "muri_model.joblib")
    result = {"protocol": "Development worker-CV with per-component candidate selection on the same development workers",
              "warning": "Requires an independent new-worker test; matched comparison excludes unavailable foreground equally from both models",
              "canonical_samples": len(y), "available_samples": int(available.sum()), "coverage": float(available.mean()),
              "selected_candidates": chosen, "matched": {}, "all_canonical_with_abstention": {},
              "per_worker": {}, "class_coverage": {}, "nested_selection": report["selected"]}
    for i, posture in enumerate(POSTURES):
        result["matched"][posture] = {"previous": evaluate(y[available, i], old["prediction"][available, i]),
            "new": evaluate(y[available, i], predicted[available, i])}
        # Abstention is a missed target, never a new MURI class or a correct low-risk score.
        classes = np.union1d(y[:, i], predicted[predicted[:, i] > 0, i])
        result["all_canonical_with_abstention"][posture] = {
            "macro_f1": f1_score(y[:, i], predicted[:, i], labels=classes, average="macro", zero_division=0),
            "accuracy": accuracy_score(y[:, i], predicted[:, i]),
            "classes": classification_report(y[:, i], predicted[:, i], labels=classes, output_dict=True, zero_division=0)}
        result["class_coverage"][posture] = {str(c): {"canonical": int(sum(y[:, i] == c)),
            "available": int(sum(available & (y[:, i] == c)))} for c in (1, 2, 3)}
    for worker in np.unique(workers):
        mask = available & (workers == worker)
        result["per_worker"][worker] = {p: evaluate(y[mask, i], predicted[mask, i]) for i, p in enumerate(POSTURES)}
    write_json(output / "metrics.json", result)
    np.savez_compressed(output / "validation_predictions.npz", y=y, prediction=predicted, previous=old["prediction"],
                        worker=workers, segment=segments, timestamp=stamps, video=videos, available=available)
    (output / "validation_checks.txt").write_text(
        "Canonical timestamps, labels, workers, and activities match the previous run.\n"
        "Every exported fold prediction matches its recorded candidate prediction.\n"
        "Unavailable foreground samples stay in the canonical audit with prediction 0 (no score).\n")
    for p, scores in result["matched"].items():
        print(p, "previous", round(scores["previous"]["macro_f1"], 4), "new", round(scores["new"]["macro_f1"], 4), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source", "experiment", "previous", "output"):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    run(args.source, args.experiment, args.previous, args.output)
