import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

import joblib
import sklearn
from sklearn.dummy import DummyClassifier
from sklearn.feature_extraction import DictVectorizer
from sklearn.pipeline import make_pipeline

from risk import assess_cts, build_report, read_observations, read_tasks, write_report
from risk_demo import example_tasks, hand, lift, scenarios
from risk_ml import (CLASSES, DOMAIN, FORMAT, ML_NOTE, boundary_cases, decode_row, features,
                     load_model, predict, train, unique_splits)


def fixture_model():
    models = {}
    for target, values in (("cts", hand()), ("low_back", lift())):
        models[target] = make_pipeline(DictVectorizer(sparse=False), DummyClassifier(strategy="constant", constant=CLASSES[target][-1]))
        models[target].fit([features(target, values)] * 3, list(CLASSES[target]))
    return {"format": FORMAT, "training_origin": "synthetic", "sklearn_version": sklearn.__version__,
            "models": models, "domain": DOMAIN, "selected": {k: "test_dummy" for k in CLASSES},
            "note": ML_NOTE, "split_sizes": {"train": 3, "validation": 0, "test": 0}}


class RiskMLTests(unittest.TestCase):
    def test_outcomes_are_never_features(self):
        row = next(scenarios(1))
        before = decode_row(row)
        row.update(cts_index=-999, low_back_index=999, low_back_rwl_kg=1000, scenario_id="changed")
        after = decode_row(row)
        for target in CLASSES:
            self.assertEqual(features(target, before["inputs"][target]), features(target, after["inputs"][target]))
            forbidden = {"cts_category", "low_back_category", "cts_index", "low_back_index", "low_back_rwl_kg", "scenario_id"}
            self.assertFalse(forbidden & set(features(target, after["inputs"][target])))
        polluted = {**hand(), "cts_index": 1000, "cts_category": "at_or_above_tlv"}
        self.assertEqual(features("cts", hand()), features("cts", polluted))

    def test_labels_must_match_declared_formula_and_origin(self):
        row = next(scenarios(1))
        for name, value in (("cts_category", "invented"), ("data_origin", "real"), ("label_origin", "diagnosis")):
            with self.subTest(name=name), self.assertRaises(ValueError):
                decode_row({**row, name: value})

    def test_uncontrolled_destination_cannot_change_features(self):
        self.assertEqual(features("low_back", lift()), features("low_back", lift(destination_h_cm=60, destination_asymmetry_deg=90)))
        incomplete = lift()
        del incomplete["destination_h_cm"]
        del incomplete["destination_asymmetry_deg"]
        self.assertEqual(features("low_back", lift()), features("low_back", incomplete))
        self.assertNotEqual(features("low_back", lift(destination_control=True)),
                            features("low_back", lift(destination_control=True, destination_h_cm=60)))

    def test_predictions_come_from_classifier_not_formula(self):
        artifact = fixture_model()
        self.assertEqual(assess_cts(hand())["category"], "below_action_limit")
        self.assertEqual(predict(artifact, "cts", hand())["category"], "at_or_above_tlv")
        self.assertEqual(predict(artifact, "cts", hand())["status"], "predicted_synthetic_model")

    def test_unavailable_inputs_never_call_model(self):
        spy = Mock()
        artifact = {"models": {"cts": spy, "low_back": spy}}
        self.assertEqual(predict(artifact, "cts", {"applicable": True, "hal": 2})["status"], "insufficient_data")
        self.assertEqual(predict(artifact, "low_back", {"applicable": False})["status"], "not_applicable")
        self.assertEqual(predict(artifact, "cts", {**hand(), "task_hours_per_day": 1})["status"], "outside_scope")
        spy.predict.assert_not_called()

    def test_extrapolation_and_lowering_are_not_silent(self):
        artifact = fixture_model()
        for target, values in (("cts", hand(10, 2)), ("cts", hand(3, 9.5)),
                               ("low_back", lift(load_kg=35)), ("low_back", lift(frequency_per_min=10)),
                               ("low_back", lift(origin_v_cm=100, destination_v_cm=50))):
            with self.subTest(target=target, values=values):
                output = predict(artifact, target, values)
                self.assertEqual(output["status"], "outside_training_domain")
                self.assertIsNone(output["category"])

    def test_duplicate_inputs_across_targets_do_not_leak_between_splits(self):
        records = [decode_row(row) for row in scenarios(4)]
        same_hand = copy.deepcopy(records[3])
        same_hand["inputs"]["cts"] = records[0]["inputs"]["cts"]
        same_back = copy.deepcopy(records[3])
        same_back["inputs"]["low_back"] = records[1]["inputs"]["low_back"]
        groups, removed = unique_splits({"train": records[:2], "validation": [same_hand, records[2]], "test": [same_back, records[3]]})
        self.assertEqual(removed, {"train": 0, "validation": 1, "test": 1})
        self.assertEqual([len(group) for group in groups.values()], [2, 1, 1])

    def test_report_keeps_formula_model_and_provenance_separate(self):
        observations = [{"timestamp_s": t, "pose_status": "pose_unavailable", "observation_origin": "synthetic",
                         "waist_flexion": None, "waist_rotation": None, "arm_height": None, "knee_flexion": None}
                        for t in (0, 90, 120, 150)]
        rows, summary = build_report(observations, example_tasks(), fixture_model())
        self.assertEqual(rows[0]["cts_right_category"], "below_action_limit")
        self.assertEqual(rows[0]["cts_right_ml_category"], "at_or_above_tlv")
        self.assertEqual(rows[1]["cts_right_ml_status"], "insufficient_data")
        self.assertEqual(rows[2]["cts_right_ml_status"], "not_applicable")
        self.assertEqual(rows[3]["low_back_ml_status"], "insufficient_data")
        self.assertEqual(summary["ml_model"]["training_origin"], "synthetic")
        self.assertIsNone(rows[0]["waist_flexion"])

    def test_real_video_without_metadata_stays_unassessed(self):
        observations = read_observations(Path(__file__).parent / "fixtures/posture_30s.csv")
        rows, summary = build_report(observations, read_tasks(None), fixture_model())
        self.assertFalse(summary["synthetic"])
        self.assertEqual(summary["ml_model"]["training_origin"], "synthetic")
        self.assertTrue(all(row["low_back_ml_category"] is None and row["cts_left_ml_category"] is None for row in rows))

    def test_model_schema_and_output_overwrite_checks(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.joblib"
            for invalid in (None, {"format": "muri"}, {**fixture_model(), "sklearn_version": "0"}):
                joblib.dump(invalid, path)
                with self.assertRaises(ValueError):
                    load_model(path)
            joblib.dump(fixture_model(), path)
            self.assertEqual(load_model(path)["format"], FORMAT)
            original = path.read_bytes()
            with self.assertRaises(FileExistsError):
                train(path, directory)
            with self.assertRaises(FileExistsError):
                write_report(path, path, model_path=path)
            self.assertEqual(path.read_bytes(), original)

    def test_saved_model_export_has_matching_csv_and_excel_columns(self):
        from openpyxl import load_workbook

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            model = root / "model.joblib"
            joblib.dump(fixture_model(), model)
            observation = Path(__file__).parent / "fixtures/posture_30s.csv"
            summary = write_report(observation, root / "out", model_path=model)
            self.assertEqual(len(summary["ml_model"]["sha256"]), 64)
            workbook = load_workbook(root / "out/risk_per_second.xlsx", read_only=True)
            headers = next(workbook["Per_second"].values)
            self.assertIn("cts_left_ml_category", headers)
            self.assertIn("low_back_ml_status", headers)
            self.assertEqual(workbook["Per_second"].max_row, 31)
            workbook.close()

    def test_boundary_cases_are_valid_separate_synthetic_probes(self):
        cases = boundary_cases()
        self.assertGreater(len(cases["cts"]), 500)
        self.assertGreater(len(cases["low_back"]), 500)
        for target, rows in cases.items():
            self.assertEqual(set(label for _, label in rows), set(CLASSES[target]))


if __name__ == "__main__":
    unittest.main()
