"""Select a development model from recorded worker-cross-validation experiments."""

import argparse
import json
from pathlib import Path

import joblib
import numpy as np

from improve import fit_variant, geometry, temporal_features
from physical import fit as fit_physical, physical_features
from sustage import POSTURES, evaluate, write_json


def run(args):
    args.output.mkdir(parents=True, exist_ok=True)
    arrays = []
    for path in sorted((args.source / "keypoints").glob("*.npz")):
        with np.load(path) as data:arrays.append({key: data[key].copy() for key in data.files})
    raw, y, workers, segments, stamps = (np.concatenate([a[k] for a in arrays])
                  for k in ("X", "y", "worker", "segment", "timestamp"))
    videos = np.concatenate([np.repeat(i, len(a["X"])) for i, a in enumerate(arrays)])
    candidates = json.loads((args.temporal / "metrics.json").read_text())["variants"]
    physical = json.loads((args.physical / "metrics.json").read_text())["variants"]
    scores = {name: {p: item[p]["frame"]["macro_f1"] for p in POSTURES} for name, item in candidates.items()}
    scores.update({"physical_" + name: {p: item[p]["macro_f1"] for p in POSTURES}
                   for name, item in physical.items() if name != "baseline"})
    chosen = {p: max(scores, key=lambda name: scores[name][p]) for p in POSTURES}
    feature_sets = {"baseline": raw, "geometry": geometry(raw)}
    if any(name.startswith("temporal_") for name in chosen.values()):
        temporal = temporal_features(raw, stamps, videos)
        feature_sets.update(temporal_forest=temporal, temporal_svm=temporal)
    physical_data = physical_features(raw)
    config = json.loads((args.source / "extraction_config.json").read_text())
    settings = {key: config[key] for key in ("pose_model", "imgsz", "fallback_pose_model", "fallback_imgsz") if key in config}
    settings["pose_model"] = Path(settings["pose_model"]).name
    prediction = np.zeros_like(y)

    def build(mask):
        models, kinds = {}, {}
        for i, posture in enumerate(POSTURES):
            candidate = chosen[posture]
            valid = mask & (y[:, i] > 0)
            if candidate.startswith("physical_"):
                kind = "physical_" + posture
                models[posture] = fit_physical(candidate.removeprefix("physical_"), physical_data[posture][valid],
                                               y[valid, i], segments[valid])
            else:
                kind = candidate
                models[posture] = fit_variant(candidate, feature_sets[candidate][valid], y[valid, i], segments[valid])
            kinds[posture] = kind
        return {"models": models, "model_features": kinds, "feature_version": 2, "unit": "frame",
                "selection_protocol": "Selected using these three workers' development CV; requires a new worker test",
                "known_classes": {p: np.unique(y[mask & (y[:, i] > 0), i]).tolist() for i, p in enumerate(POSTURES)},
                **settings}

    for worker in np.unique(workers):
        test = workers == worker
        artifact = build(~test)
        artifact["held_out_worker"] = worker
        for i, posture in enumerate(POSTURES):
            candidate = chosen[posture]
            X = physical_data[posture] if candidate.startswith("physical_") else feature_sets[candidate]
            prediction[test, i] = artifact["models"][posture].predict(X[test])
        joblib.dump(artifact, args.output / f"heldout_{worker}.joblib", compress=3)
    final = build(np.ones(len(y), dtype=bool))
    final["held_out_worker"] = None
    joblib.dump(final, args.output / "muri_model.joblib", compress=3)
    metrics = {p: evaluate(y[y[:, i] > 0, i], prediction[y[:, i] > 0, i]) for i, p in enumerate(POSTURES)}
    for posture in POSTURES:
        if not np.isclose(metrics[posture]["macro_f1"], scores[chosen[posture]][posture], atol=1e-8):
            raise ValueError(f"Re-fitted model differs from recorded CV results: {posture}")
    reference = json.loads((args.reference / "metrics.json").read_text())
    write_json(args.output / "metrics.json", {"evaluation": final["selection_protocol"],
               "unit": "frame", "sample_count": len(y), "selected_candidates": chosen,
               "all_candidate_macro_f1": scores, "pooled": metrics,
               "baseline": {p: reference["pooled"][p]["model"] for p in POSTURES},
               "known_classes": final["known_classes"],
               "warning": "CV used for model selection; these scores are development validation, not an independent final test"})
    np.savez_compressed(args.output / "validation_predictions.npz", y=y, prediction=prediction,
                        worker=workers, segment=segments, timestamp=stamps, video=videos)
    print("Selected", chosen, flush=True)
    print("Development macro-F1", {p: round(m["macro_f1"], 4) for p, m in metrics.items()}, flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source", "temporal", "physical", "reference", "output"):
        parser.add_argument(name, type=Path)
    run(parser.parse_args())
