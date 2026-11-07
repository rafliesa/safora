import copy
import unittest

from video_exposure import component_scores, screen, posture_cycles


def pose(second, arm=1, flexion=1, rotation=1, status="ok"):
    row = {"timestamp_s": second, "status": status, "arm_height": arm,
           "waist_flexion": flexion, "waist_rotation": rotation}
    for side in ("left", "right"):
        for joint in ("shoulder", "elbow", "wrist", "hip"):
            row.update({f"{side}_{joint}_x_px": 100, f"{side}_{joint}_y_px": 200, f"{side}_{joint}_confidence": .9})
    return row


class VideoExposureTests(unittest.TestCase):
    def test_complete_cycles_hold_high_and_count_on_return(self):
        data = [pose(i, arm=score) for i, score in enumerate([2, 1, 2, 3, 2, 1, 1, 3, 1, 2])]
        rows, summary = screen(data, [], [], len(data))
        self.assertEqual([r["arm_posture_cycles_so_far"] for r in rows], [0, 0, 0, 0, 0, 1, 1, 1, 2, 2])
        self.assertEqual([r["timestamp_s"] for r in rows if r["arm_posture_cycle_completed"]], [5, 8])
        self.assertEqual(summary["regions"]["arm"]["posture_cycles"], 2)
        self.assertEqual(summary["regions"]["back"]["posture_cycles"], 0)

    def test_missing_samples_break_cycles_independently(self):
        data = [pose(i, arm=a, rotation=a) for i, a in enumerate([1, 2, 2, 1])]
        data[2]["left_wrist_confidence"] = data[2]["right_wrist_confidence"] = .1
        rows = posture_cycles(data)
        self.assertEqual(rows[-1]["arm_posture_cycles_so_far"], 0)
        self.assertEqual(rows[-1]["back_posture_cycles_so_far"], 1)
        data[2]["status"] = "pose_unavailable"
        self.assertEqual(posture_cycles(data)[-1]["back_posture_cycles_so_far"], 0)
        self.assertEqual(posture_cycles([pose(0), pose(1, arm=2), pose(3)])[-1]["arm_posture_cycles_so_far"], 0)

    def test_predictions_change_the_exposure_without_presets(self):
        rows, summary = screen([pose(0), pose(1, arm=3, rotation=2), pose(2, arm=2, flexion=3)], [], [], 3)
        self.assertEqual([r["arm_level"] for r in rows], ["low", "high", "moderate"])
        self.assertEqual([r["back_level"] for r in rows], ["low", "moderate", "high"])
        self.assertEqual(summary["data_origin"], "recorded_video")
        self.assertIsNone(summary["clinical_cts_risk"])

    def test_occlusion_is_unknown_and_breaks_duration_runs(self):
        data = [pose(0, arm=2), pose(1, status="pose_unavailable"), pose(2, arm=2)]
        rows, summary = screen(data, [], [], 3)
        self.assertIsNone(rows[1]["arm_level"])
        self.assertIsNone(rows[1]["back_score"])
        self.assertEqual(rows[1]["arm_elevated_run_estimate_s"], 0)
        self.assertEqual(summary["regions"]["arm"]["elevated_duration_estimate_s"], 2)
        self.assertEqual(summary["regions"]["arm"]["longest_elevated_run_estimate_s"], 1)
        self.assertAlmostEqual(summary["regions"]["arm"]["coverage"], 2 / 3)

    def test_joint_visibility_is_checked_per_region(self):
        row = pose(0, arm=3, rotation=2)
        row["left_wrist_confidence"] = row["right_wrist_confidence"] = .1
        scores = component_scores(row)
        self.assertIsNone(scores["arm"]["score"])
        self.assertEqual(scores["back"]["score"], 2)
        row["left_hip_x_px"] = ""
        self.assertIsNone(component_scores(row)["back"]["score"])

    def test_partial_final_second_is_not_rounded_to_a_full_second(self):
        rows, summary = screen([pose(i, arm=2) for i in range(4)], [], [], 3.5)
        self.assertEqual(summary["regions"]["arm"]["elevated_duration_estimate_s"], 3.5)
        self.assertEqual(rows[-1]["sample_interval_s"], .5)

    def test_current_output_does_not_read_future_postures_or_events(self):
        data = [pose(i) for i in range(5)]
        events = [{"side": "right", "start_s": 2.1, "end_s": 3.5}]
        a, _ = screen(data, [], events, 5)
        changed = copy.deepcopy(data)
        changed[4]["arm_height"] = 3
        b, _ = screen(changed, [], [], 5)
        self.assertEqual(a[:4], b[:4])
        self.assertEqual(a[4]["right_candidate_cycles_so_far"], 1)
        self.assertEqual(a[4]["arm_level"], "low")

    def test_missing_motion_does_not_mean_observed_zero_activity(self):
        rows, _ = screen([pose(0), pose(1)], [], [], 2)
        self.assertIsNone(rows[1]["right_motion_coverage_30"])
        self.assertEqual(rows[1]["right_candidate_cycles_30"], 0)

    def test_rolling_denominator_and_finite_input_validation(self):
        rows, _ = screen([pose(i, arm=3 if i == 0 else 1) for i in range(31)], [], [], 31)
        self.assertEqual(rows[29]["arm_elevated_samples_30"], 1)
        self.assertEqual(rows[30]["arm_elevated_samples_30"], 0)
        self.assertEqual(rows[30]["arm_valid_samples_30"], 30)
        for field, value in (("arm_height", 4), ("left_hip_confidence", float("nan"))):
            bad = pose(0)
            bad[field] = value
            with self.assertRaises(ValueError):
                screen([bad], [], [], 1)
        with self.assertRaises(ValueError):
            screen([pose(1)], [], [], 1)


if __name__ == "__main__":
    unittest.main()
