"""Separate session generalization from unseen-worker generalization."""

import argparse
import json
from pathlib import Path

import numpy as np

from deep import fit_candidate, invariant_features
from improve import geometry
from physical import physical_features
from sustage import POSTURES, evaluate, write_json


def run(source, output):
    output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((source / "manifest.json").read_text())
    arrays = [dict(np.load(p)) for p in sorted((source / "keypoints").glob("*.npz"))]
    X, y, workers, segments = (np.concatenate([a[k] for a in arrays]) for k in ("X", "y", "worker", "segment"))
    sessions = np.concatenate([np.repeat("afternoon" if Path(m["workbook"]).name.startswith("1.") else "morning", len(a["X"]))
                               for a, m in zip(arrays, manifest)])
    groups = np.concatenate([np.repeat(m["workbook"], len(a["X"])) for a, m in zip(arrays, manifest)])
    geo, physical, symmetric = geometry(X), physical_features(X), invariant_features(X)
    variants = {"baseline": ["baseline"] * 4,
                "previous_combination": ["previous_geometry", "previous_physical", "previous_geometry", "baseline"],
                "symmetric_linear": ["symmetric_linear"] * 4}
    predictions = {name: np.zeros_like(y) for name in variants}
    folds = {}
    for test_session in ("afternoon", "morning"):
        test = sessions == test_session
        train = ~test
        assert not set(groups[train]) & set(groups[test]), "Paired cameras must stay in one split"
        folds[test_session] = {"training_workers": np.unique(workers[train]).tolist(),
                              "test_workers": np.unique(workers[test]).tolist(), "scores": {}}
        for name, candidates in variants.items():
            for i, (posture, candidate) in enumerate(zip(POSTURES, candidates)):
                values = (X if candidate == "baseline" else geo if candidate == "previous_geometry"
                          else physical[posture] if candidate == "previous_physical" else symmetric[posture])
                model = fit_candidate(candidate, values[train], y[train, i], segments[train], workers[train])
                predictions[name][test, i] = model.predict(values[test])
            folds[test_session]["scores"][name] = {p: evaluate(y[test, i], predictions[name][test, i]) for i, p in enumerate(POSTURES)}
            print(test_session, name, {p: round(r["macro_f1"], 4) for p, r in folds[test_session]["scores"][name].items()}, flush=True)
    pooled = {name: {p: evaluate(y[:, i], pred[:, i]) for i, p in enumerate(POSTURES)} for name, pred in predictions.items()}
    write_json(output / "metrics.json", {"protocol": "Two fixed session folds: train all mornings/test afternoons and reverse; workers overlap",
        "warning": "This is not unseen-worker performance and is not comparable to leave-one-worker-out F1",
        "sample_count": len(y), "folds": folds, "pooled": pooled})
    np.savez_compressed(output / "predictions.npz", y=y, worker=workers, session=sessions, segment=segments, **predictions)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    run(args.source, args.output)
