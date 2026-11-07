"""Train and apply synthetic ergonomic exposure classifiers, with explicit input limits."""

import argparse
import csv
import gzip
import hashlib
import json
import random
import time
from pathlib import Path

from risk import BACK_DEST_FIELDS, BACK_FIELDS, CTS_FIELDS, assess_back, assess_cts


FORMAT = "sustage_synthetic_exposure_v1"
CLASSES = {
    "cts": ("below_action_limit", "at_or_above_action_limit", "at_or_above_tlv"),
    "low_back": ("at_or_below_1", "above_1", "above_3"),
}
NUMERIC_FIELDS = {
    "cts": ("hal", "normalized_peak_force"),
    "low_back": ("load_kg", "origin_h_cm", "origin_v_cm", "origin_asymmetry_deg",
                 "destination_v_cm", "destination_control", "destination_h_cm", "destination_asymmetry_deg",
                 "frequency_per_min"),
}
DOMAIN = {
    "cts": {"hal": (0, 9.8), "normalized_peak_force": (.1, 9)},
    "low_back": {"load_kg": (2, 30), "origin_h_cm": (25, 60), "origin_v_cm": (0, 120),
                 "origin_asymmetry_deg": (0, 90), "destination_v_cm": (25, 175),
                 "destination_h_cm": (25, 60), "destination_asymmetry_deg": (0, 90),
                 "frequency_per_min": (.2, 8)},
}
ML_NOTE = ("Model belajar kategori rumus dari data sintetis. Hasilnya belum mengukur risiko penyakit pada pekerja. "
           "Kategori ML menggunakan metadata tugas; video saja belum menyediakan gaya, beban, atau HAL.")


def features(target, data):
    """Explicit input allowlist: no indices, RWL, labels, IDs, or posture-demo scores."""
    if target not in CLASSES:
        raise ValueError(f"Unknown target: {target}")
    selected = {key: float(data[key]) for key in NUMERIC_FIELDS[target] if key in data and data[key] is not None}
    if target == "low_back":
        selected.update({key: data[key] for key in ("duration_category", "coupling")})
        # Destination geometry is irrelevant when the task does not require placement control.
        if not data["destination_control"]:
            selected["destination_h_cm"] = float(data["origin_h_cm"])
            selected["destination_asymmetry_deg"] = float(data["origin_asymmetry_deg"])
    if len(selected) != len(NUMERIC_FIELDS[target]) + (2 if target == "low_back" else 0):
        raise ValueError(f"Incomplete inputs for {target}")
    return selected


def outside_domain(target, data):
    values = features(target, data)
    outside = [key for key, (lo, hi) in DOMAIN[target].items() if not lo <= values[key] <= hi]
    if target == "low_back" and not 25 <= data["destination_v_cm"] - data["origin_v_cm"] <= 175:
        outside.append("upward_travel_25_to_175_cm")
    return outside


def predict(artifact, target, data, assessment=None):
    reference = assessment if assessment is not None else (assess_cts(data) if target == "cts" else assess_back(data))
    if reference["status"] != "assessed":
        return {"status": reference["status"], "category": None, "reason": reference["reason"]}
    outside = outside_domain(target, data)
    if outside:
        return {"status": "outside_training_domain", "category": None,
                "reason": "Di luar cakupan skenario training: " + ", ".join(outside)}
    from threadpoolctl import threadpool_limits

    with threadpool_limits(limits=1):
        category = str(artifact["models"][target].predict([features(target, data)])[0])
    if category not in CLASSES[target]:
        raise ValueError("Model returned an unsupported category")
    return {"status": "predicted_synthetic_model", "category": category, "reason": ML_NOTE}


def load_model(path):
    import joblib
    import sklearn

    # joblib can execute code during loading; only load artifacts from trusted sources.
    artifact = joblib.load(path)
    if not isinstance(artifact, dict) or artifact.get("format") != FORMAT or artifact.get("training_origin") != "synthetic":
        raise ValueError("Expected a sustAGE synthetic exposure model")
    if artifact.get("sklearn_version") != sklearn.__version__:
        raise ValueError(f"Use scikit-learn {artifact.get('sklearn_version')} to load this model")
    if set(artifact.get("models", {})) != set(CLASSES) or artifact.get("domain") != DOMAIN:
        raise ValueError("Unsupported model targets or input domain")
    for target, model in artifact["models"].items():
        if set(model.classes_) != set(CLASSES[target]):
            raise ValueError(f"Unexpected classes for {target}")
    return artifact


def decode_row(row):
    if row.get("data_origin") != "synthetic" or row.get("label_origin") != "ergonomic_formula":
        raise ValueError("Training requires explicitly labelled synthetic formula scenarios")
    data = {}
    for target, prefix, fields in (("cts", "cts_input_", CTS_FIELDS),
                                   ("low_back", "back_input_", (*BACK_FIELDS, *BACK_DEST_FIELDS))):
        values = {}
        for field in fields:
            raw = row[prefix + field]
            if field in ("applicable", "destination_control"):
                if type(raw) is bool:
                    values[field] = raw
                elif raw in ("True", "False"):
                    values[field] = raw == "True"
                else:
                    raise ValueError(f"Expected boolean {prefix + field}")
            elif field in ("duration_category", "coupling"):
                values[field] = raw
            else:
                values[field] = float(raw)
        assessment = assess_cts(values) if target == "cts" else assess_back(values)
        if assessment["status"] != "assessed" or outside_domain(target, values):
            raise ValueError("Training scenario is outside the supported domain")
        label = row["cts_category" if target == "cts" else "low_back_category"]
        if label != assessment["category"] or label not in CLASSES[target]:
            raise ValueError("Scenario category does not match its stated formula")
        data[target] = values
    return {"id": row["scenario_id"], "inputs": data,
            "labels": {"cts": row["cts_category"], "low_back": row["low_back_category"]}}


def fingerprint(target, record):
    return tuple(sorted(features(target, record["inputs"][target]).items()))


def unique_splits(groups):
    """Remove collisions using only input features, independently for both targets."""
    seen, output, removed = {name: set() for name in CLASSES}, {}, {}
    for name, records in groups.items():
        output[name], removed[name] = [], 0
        for record in records:
            signatures = {target: fingerprint(target, record) for target in CLASSES}
            if any(signatures[target] in seen[target] for target in CLASSES):
                removed[name] += 1
                continue
            output[name].append(record)
            for target in CLASSES:
                seen[target].add(signatures[target])
    return output, removed


def evaluate(target, truth, predicted):
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score

    labels = CLASSES[target]
    high = labels[-1]
    high_count = sum(t == high for t in truth)
    return {"samples": len(truth), "accuracy": accuracy_score(truth, predicted),
            "macro_f1": f1_score(truth, predicted, labels=list(labels), average="macro", zero_division=0),
            "class_order": list(labels), "confusion_matrix": confusion_matrix(truth, predicted, labels=list(labels)).tolist(),
            "per_class": classification_report(truth, predicted, labels=list(labels), output_dict=True, zero_division=0),
            "highest_exposure_recall": sum(t == p == high for t, p in zip(truth, predicted)) / high_count if high_count else None,
            "highest_to_lowest_errors": sum(t == high and p == labels[0] for t, p in zip(truth, predicted))}


def boundary_cases(seed=20261115):
    from risk_demo import hand, scenarios

    rng = random.Random(seed)
    cases = {target: [] for target in CLASSES}
    for i in range(250):
        hal = rng.uniform(.1, 9.5)
        tlv = .56 * (10 - hal)
        for boundary in (tlv - 2, tlv):
            for delta in (-.02, .02):
                force = boundary + delta
                if .1 <= force <= 9:
                    values = hand(hal, force)
                    cases["cts"].append((values, assess_cts(values)["category"]))
    for row in scenarios(250, seed):
        values = decode_row(row)["inputs"]["low_back"]
        values["frequency_per_min"] = rng.uniform(.2, 8)
        reference = assess_back(values)
        for threshold in (1, 3):
            for delta in (-.02, .02):
                candidate = {**values, "load_kg": reference["rwl_kg"] * (threshold + delta)}
                if not outside_domain("low_back", candidate):
                    cases["low_back"].append((candidate, assess_back(candidate)["category"]))
    return cases


def train(input_csv, output):
    import joblib
    import numpy as np
    import sklearn
    from sklearn.ensemble import ExtraTreesClassifier, HistGradientBoostingClassifier
    from sklearn.feature_extraction import DictVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import train_test_split
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from threadpoolctl import threadpool_limits
    from risk_demo import scenarios

    output = Path(output)
    if output.exists():
        raise FileExistsError(f"Choose a new training directory: {output}")
    started = time.monotonic()
    with Path(input_csv).open(encoding="utf-8-sig", newline="") as file:
        original = [decode_row(row) for row in csv.DictReader(file)]
    if len(original) < 100:
        raise ValueError("At least 100 original scenarios are required")
    trainval, heldout = train_test_split(original, test_size=.2, random_state=20261107,
                                       stratify=[r["labels"]["cts"] for r in original])
    fitting, validation = train_test_split(trainval, test_size=.2, random_state=20261108,
                                          stratify=[r["labels"]["cts"] for r in trainval])
    groups = {"train": fitting, "validation": validation, "test": heldout}
    generation = {"train": (30000, 20261110), "validation": (2000, 20261111), "test": (5000, 20261112)}
    for name, (count, seed) in generation.items():
        for row in scenarios(count, seed):
            row["scenario_id"] = f"{name}_{seed}_{row['scenario_id']}"
            groups[name].append(decode_row(row))
    groups, removed = unique_splits(groups)
    for target in CLASSES:
        for group in groups.values():
            if set(r["labels"][target] for r in group) != set(CLASSES[target]):
                raise ValueError("Every split must contain every target class")
    output.mkdir(parents=True)
    (output / "data").mkdir()
    plan = {"evaluation": "synthetic_formula_agreement_only", "original_rows": len(original),
            "original_sha256": hashlib.sha256(Path(input_csv).read_bytes()).hexdigest(),
            "generation": generation, "split_sizes": {k: len(v) for k, v in groups.items()},
            "removed_duplicate_features": removed,
            "candidate_selection": "validation macro-F1 only; test and boundary cases never used to select or refit",
            "fit_uses": "training split only, including final saved model",
            "feature_inputs": {k: list(features(k, groups['train'][0]['inputs'][k])) for k in CLASSES},
            "excluded_inputs": ["scenario_id", "cts_index", "low_back_index", "low_back_rwl_kg", "all category columns", "MURI demo scores"],
            "note": ML_NOTE}
    (output / "training_plan.json").write_text(json.dumps(plan, indent=2) + "\n")
    for name, records in groups.items():
        with gzip.open(output / "data" / f"{name}.jsonl.gz", "wt", encoding="utf-8") as file:
            for record in records:
                file.write(json.dumps(record, allow_nan=False) + "\n")
    print("Training split sizes:", plan["split_sizes"], flush=True)
    models, validation_metrics, selected = {}, {}, {}
    for target in CLASSES:
        x = {name: [features(target, r["inputs"][target]) for r in records] for name, records in groups.items()}
        y = {name: [r["labels"][target] for r in records] for name, records in groups.items()}
        candidates = {
            "hist_gradient_boosting": make_pipeline(DictVectorizer(sparse=False), HistGradientBoostingClassifier(
                max_iter=400, learning_rate=.08, max_leaf_nodes=31, l2_regularization=1,
                class_weight="balanced", early_stopping=True, random_state=20261107)),
        }
        if target == "cts":
            candidates["logistic_regression"] = make_pipeline(DictVectorizer(sparse=False), StandardScaler(),
                                                              LogisticRegression(C=100, max_iter=2000))
        else:
            candidates["extra_trees"] = make_pipeline(DictVectorizer(sparse=False), ExtraTreesClassifier(
                n_estimators=300, min_samples_leaf=2, class_weight="balanced", n_jobs=4, random_state=20261107))
        validation_metrics[target] = {}
        for name, candidate in candidates.items():
            with threadpool_limits(limits=4):
                candidate.fit(x["train"], y["train"])
                predicted = candidate.predict(x["validation"])
            validation_metrics[target][name] = evaluate(target, y["validation"], predicted)
            print(target, name, "validation macro-F1:", round(validation_metrics[target][name]["macro_f1"], 4), flush=True)
        winner = max(candidates, key=lambda name: validation_metrics[target][name]["macro_f1"])
        models[target], selected[target] = candidates[winner], winner
    artifact = {"format": FORMAT, "training_origin": "synthetic", "sklearn_version": sklearn.__version__,
                "numpy_version": np.__version__, "models": models, "selected": selected,
                "domain": DOMAIN, "note": ML_NOTE, "split_sizes": plan["split_sizes"]}
    joblib.dump(artifact, output / "risk_model.joblib", compress=3)
    metrics = {"evaluation": plan["evaluation"], "selected": selected, "validation": validation_metrics,
               "test": {}, "boundary_test": {}, "note": ML_NOTE}
    boundary = boundary_cases()
    prediction_rows = []
    for target in CLASSES:
        records = groups["test"]
        inputs = [features(target, r["inputs"][target]) for r in records]
        truth = [r["labels"][target] for r in records]
        with threadpool_limits(limits=4):
            predicted = models[target].predict(inputs)
            stress_prediction = models[target].predict([features(target, data) for data, _ in boundary[target]])
        metrics["test"][target] = evaluate(target, truth, predicted)
        metrics["boundary_test"][target] = evaluate(target, [label for _, label in boundary[target]], stress_prediction)
        for record, label, predicted_label in zip(records, truth, predicted):
            prediction_rows.append({"scenario_id": record["id"], "data_origin": "synthetic", "split": "test",
                                    "target": target, "formula_category": label, "model_category": str(predicted_label)})
        for i, ((data, label), prediction) in enumerate(zip(boundary[target], stress_prediction)):
            prediction_rows.append({"scenario_id": f"boundary_{target}_{i}", "data_origin": "synthetic", "split": "boundary",
                                    "target": target, "formula_category": label, "model_category": str(prediction)})
        # The serialized artifact must reproduce all locked-test predictions.
        with threadpool_limits(limits=4):
            np.testing.assert_array_equal(joblib.load(output / "risk_model.joblib")["models"][target].predict(inputs), predicted)
    with gzip.open(output / "data" / "boundary.json.gz", "wt", encoding="utf-8") as file:
        json.dump(boundary, file, allow_nan=False)
    from risk import write_csv

    write_csv(output / "test_predictions.csv", prediction_rows)
    metrics["wall_seconds"] = time.monotonic() - started
    (output / "metrics.json").write_text(json.dumps(metrics, indent=2, allow_nan=False) + "\n")
    for target in CLASSES:
        print(target, "locked test macro-F1:", round(metrics["test"][target]["macro_f1"], 4),
              "boundary macro-F1:", round(metrics["boundary_test"][target]["macro_f1"], 4), flush=True)
    print("Saved", output / "risk_model.joblib", "in", round(metrics["wall_seconds"], 2), "seconds", flush=True)
    return metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scenarios", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    train(args.scenarios, args.output)
