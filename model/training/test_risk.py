import copy
import json
import math
import tempfile
import unittest
from pathlib import Path

from risk import (BACK_METHOD, CTS_METHOD, assess_back, assess_cts, build_report,
                  frequency_multiplier, read_observations, read_tasks, write_csv, write_report)
from risk_demo import example_tasks, hand, lift, scenarios


class RiskTests(unittest.TestCase):
    def test_hal_2018_limits_and_exact_boundaries(self):
        low = assess_cts(hand(4, 1))
        self.assertEqual(low["method"], CTS_METHOD)
        self.assertAlmostEqual(low["action_limit"], 1.36)
        self.assertAlmostEqual(low["tlv"], 3.36)
        self.assertEqual(low["category"], "below_action_limit")
        self.assertEqual(assess_cts(hand(4, 1.36))["category"], "at_or_above_action_limit")
        self.assertEqual(assess_cts(hand(4, 3.36))["category"], "at_or_above_tlv")
        self.assertAlmostEqual(assess_cts(hand(4, 3.36))["index"], 1)

    def test_hal_negative_action_limit_and_zero_tlv_are_not_low_risk(self):
        assessed = assess_cts(hand(8, .1))
        self.assertLess(assessed["action_limit"], 0)
        self.assertEqual(assessed["category"], "at_or_above_action_limit")
        endpoint = assess_cts(hand(10, 2))
        self.assertEqual(endpoint["category"], "at_or_above_tlv")
        self.assertIsNone(endpoint["index"])
        json.dumps(endpoint, allow_nan=False)

    def test_missing_force_does_not_get_invented(self):
        for function, data in ((assess_cts, {"hal": 6, "applicable": True}),
                               (assess_back, {"load_kg": 20, "applicable": True})):
            result = function(data)
            self.assertEqual(result["status"], "insufficient_data")
            self.assertIsNone(result["index"])
            self.assertIsNone(result["category"])
        self.assertEqual(assess_cts({"applicable": False})["status"], "not_applicable")
        self.assertEqual(assess_back({"applicable": False})["status"], "not_applicable")
        self.assertEqual(assess_cts({**hand(), "task_hours_per_day": 1})["status"], "outside_scope")

    def test_invalid_numeric_values_and_units_are_rejected(self):
        for value in (math.nan, math.inf, -1, 11, True, "3"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                assess_cts(hand(value))
        for value in (math.inf, -1, True, "12kg"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                assess_back(lift(load_kg=value))
        with self.assertRaises(ValueError):
            assess_cts({**hand(), "applicable": "true"})
        with self.assertRaises(ValueError):
            assess_back(lift(duration_category="30 seconds"))

    def test_rnle_ideal_lift_and_weight_changes(self):
        result = assess_back(lift(load_kg=23))
        self.assertEqual(result["method"], BACK_METHOD)
        self.assertAlmostEqual(result["rwl_kg"], 23)
        self.assertAlmostEqual(result["index"], 1)
        self.assertEqual(result["category"], "at_or_below_1")
        self.assertEqual(assess_back(lift(load_kg=46))["category"], "above_1")
        self.assertEqual(assess_back(lift(load_kg=70))["category"], "above_3")

    def test_rnle_manual_example_one(self):
        # NIOSH 2021, pp. 33-35: 44 lb reel; origin/destination RWL 16.3/14.5 lb.
        result = assess_back(lift(load_kg=44 * .45359237, origin_h_cm=23 * 2.54,
                                 origin_v_cm=15 * 2.54, destination_h_cm=23 * 2.54,
                                 destination_v_cm=63 * 2.54, destination_control=True, coupling="fair"))
        # SI/imperial constants are approximate conversions (25 cm vs 10 in); tables add rounding.
        self.assertAlmostEqual(result["endpoint_rwl_kg"]["origin"] / .45359237, 16.3, delta=.05 * 16.3)
        self.assertAlmostEqual(result["endpoint_rwl_kg"]["destination"] / .45359237, 14.5, delta=.05 * 14.5)
        self.assertAlmostEqual(result["index"], 3.0, delta=.2)

    def test_frequency_interpolation_and_origin_height(self):
        self.assertAlmostEqual(frequency_multiplier(1.5, 50, "long"), .70)
        self.assertEqual(frequency_multiplier(.05, 50, "short"), 1)
        self.assertEqual(frequency_multiplier(10, 74.9, "long"), 0)
        self.assertEqual(frequency_multiplier(10, 75, "long"), .13)
        result = assess_back(lift(origin_v_cm=50, destination_v_cm=100, destination_control=True,
                                 frequency_per_min=10, duration_category="long"))
        self.assertEqual(result["multipliers"]["destination"]["FM"], 0)
        self.assertEqual(result["category"], "zero_recommended_weight_limit")
        self.assertIsNone(result["index"])
        json.dumps(result, allow_nan=False)

    def test_destination_control_cannot_be_ignored(self):
        ordinary = assess_back(lift(destination_h_cm=60, destination_control=False))
        controlled = assess_back(lift(destination_h_cm=60, destination_control=True))
        self.assertLess(controlled["rwl_kg"], ordinary["rwl_kg"])
        incomplete = lift(destination_control=True)
        incomplete.pop("destination_h_cm")
        self.assertEqual(assess_back(incomplete)["status"], "insufficient_data")

    def test_unsupported_lifts_never_appear_below_limits(self):
        for changes in ({"origin_h_cm": 64}, {"origin_asymmetry_deg": 136},
                        {"destination_v_cm": 180}, {"destination_v_cm": 75}):
            result = assess_back(lift(**changes))
            self.assertEqual(result["status"], "outside_scope")
            self.assertIsNone(result["index"])
        self.assertEqual(assess_back(lift(load_kg=0))["status"], "not_applicable")

    def test_task_intervals_provenance_and_typo_validation(self):
        base = example_tasks()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tasks.json"
            path.write_text(json.dumps(base))
            self.assertEqual(len(read_tasks(path)["tasks"]), 5)
            for kind in ("overlap", "provenance", "typo", "duplicate", "formula_id"):
                data = copy.deepcopy(base)
                if kind == "overlap":
                    data["tasks"][1]["start_s"] = 29
                elif kind == "provenance":
                    data["data_origin"] = "unknown"
                elif kind == "typo":
                    data["tasks"][0]["low_back"]["load_kgg"] = 9
                elif kind == "duplicate":
                    data["tasks"][1]["id"] = data["tasks"][0]["id"]
                else:
                    data["tasks"][0]["id"] = "=1+1"
                path.write_text(json.dumps(data))
                with self.subTest(kind=kind), self.assertRaises(ValueError):
                    read_tasks(path)

    def test_real_csv_is_unassessed_without_measurements(self):
        observations = read_observations(Path(__file__).parent / "fixtures/posture_30s.csv")
        rows, summary = build_report(observations, read_tasks(None))
        self.assertFalse(summary["synthetic"])
        self.assertEqual(summary["valid_pose_samples"], 30)
        self.assertAlmostEqual(summary["posture_ge2_fraction_of_valid_samples"]["waist_flexion"], .1)
        for row in rows:
            self.assertEqual(row["cts_right_status"], "insufficient_data")
            self.assertEqual(row["low_back_status"], "insufficient_data")
            self.assertIsNone(row["low_back_index"])

    def test_past_posture_summaries_do_not_change_with_future_samples(self):
        observations = [{"timestamp_s": i, "pose_status": "ok", "observation_origin": "synthetic",
                         "waist_flexion": 3 if i >= 5 else 1, "waist_rotation": 1, "arm_height": 1, "knee_flexion": 1}
                        for i in range(10)]
        full, _ = build_report(observations, read_tasks(None))
        partial, _ = build_report(observations[:5], read_tasks(None))
        self.assertEqual(full[:5], partial)
        self.assertEqual(full[-1]["waist_flexion_ge2_fraction_so_far"], .5)

    def test_missing_observations_and_all_unknown_have_no_zero_risk(self):
        observations = [{"timestamp_s": i, "pose_status": "pose_unavailable", "observation_origin": "synthetic",
                         **{p: None for p in ("waist_flexion", "waist_rotation", "arm_height", "knee_flexion")}}
                        for i in (0, 2)]
        rows, summary = build_report(observations, read_tasks(None))
        self.assertEqual(summary["missing_rows"], 1)
        self.assertEqual(summary["pose_coverage"], 0)
        self.assertIsNone(summary["posture_ge2_fraction_of_valid_samples"]["waist_flexion"])
        self.assertIsNone(rows[0]["cts_left_index"])

    def test_task_boundary_half_open_and_missing_pose_preserved(self):
        observations = [{"timestamp_s": t, "pose_status": "pose_unavailable", "observation_origin": "synthetic",
                         **{p: None for p in ("waist_flexion", "waist_rotation", "arm_height", "knee_flexion")}}
                        for t in (29, 30, 150)]
        rows, _ = build_report(observations, example_tasks())
        self.assertEqual(rows[0]["task_id"], "demo_lower_exposure")
        self.assertEqual(rows[1]["task_id"], "demo_action_needed")
        self.assertEqual(rows[1]["cts_right_status"], "assessed")
        self.assertEqual(rows[1]["assessment_scope"], "task_metadata")
        self.assertIsNone(rows[1]["waist_flexion"])
        self.assertEqual(rows[2]["cts_right_status"], "insufficient_data")

    def test_invalid_csv_and_stale_scores_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            for i, (timestamp, status, score) in enumerate(((0, "ok", 1), (0, "pose_unavailable", 1),
                                                         (0, "ok", ""), (.3, "ok", 1), (2, "bad", 1))):
                path = Path(directory) / f"{i}.csv"
                rows = [{"timestamp_s": t, "status": s, "waist_flexion": v, "waist_rotation": v,
                         "arm_height": v, "knee_flexion": v} for t, s, v in ((0, "ok", 1), (timestamp, status, score))]
                write_csv(path, rows)
                with self.assertRaises(ValueError):
                    read_observations(path)

    def test_synthetic_generation_is_reproducible_and_labelled(self):
        rows = list(scenarios(50))
        self.assertEqual(rows, list(scenarios(50)))
        self.assertTrue(all(row["data_origin"] == "synthetic" and row["label_origin"] == "ergonomic_formula" for row in rows))
        self.assertTrue(all(row["low_back_index"] > 0 and row["cts_index"] >= 0 for row in rows))
        self.assertFalse(any("probability" in key for key in rows[0]))

    def test_report_does_not_overwrite_and_preserves_provenance(self):
        from openpyxl import load_workbook

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            observation = root / "input.csv"
            write_csv(observation, [{"timestamp_s": 0, "status": "ok", "waist_flexion": 1,
                                     "waist_rotation": 1, "arm_height": 1, "knee_flexion": 1}])
            original = observation.read_bytes()
            with self.assertRaises(FileExistsError):
                write_report(observation, observation)
            config = example_tasks()
            config["note"] = "=1+1"
            task_file = root / "tasks.json"
            task_file.write_text(json.dumps(config))
            output = root / "report"
            summary = write_report(observation, output, task_file)
            self.assertTrue(summary["synthetic"])
            wb = load_workbook(output / "risk_per_second.xlsx")
            self.assertEqual(wb["Task_inputs"]["B2"].data_type, "s")
            self.assertEqual(wb["ReadMe"]["A1"].value, "SYNTHETIC DEMO")
            wb.close()
            with self.assertRaises(FileExistsError):
                write_report(observation, output)
            self.assertEqual(observation.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
