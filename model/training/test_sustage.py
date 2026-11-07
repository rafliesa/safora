import unittest
import tempfile
from argparse import Namespace
from pathlib import Path

import numpy as np

from sustage import muri_seconds, pose_features, read_annotations, segment_votes, worker_pose, predict


class SustageTests(unittest.TestCase):
    def test_timestamp_is_minutes_seconds(self):
        self.assertEqual(muri_seconds(4.06) - muri_seconds(3.59), 7)
        self.assertEqual(muri_seconds(3.6) - muri_seconds(3.51), 9)
        self.assertEqual(muri_seconds(5) - muri_seconds(4.54), 6)
        self.assertEqual(muri_seconds(5.0599999999999996), 306)
        self.assertEqual(muri_seconds("8:08"), 488)
        self.assertEqual(muri_seconds("6.35"), 395)
        for invalid in (float("nan"), -1, 3.75):
            with self.assertRaises(ValueError):
                muri_seconds(invalid)

    def test_features_ignore_translation_and_uniform_scale(self):
        points = np.column_stack((np.arange(17), np.arange(17) ** 2, np.ones(17)))
        box = np.array([0, 0, 20, 300])
        expected = pose_features(points, box)
        moved = points.copy()
        moved[:, :2] = moved[:, :2] * 2 + [50, 20]
        actual = pose_features(moved, box * 2 + [50, 20, 50, 20])
        np.testing.assert_allclose(actual, expected, atol=1e-5)

    def test_hidden_joints_are_not_treated_as_real_coordinates(self):
        points = np.ones((17, 3))
        points[9, 2] = 0
        features = pose_features(points, [0, 0, 100, 200])
        self.assertTrue(np.isnan(features[8:10]).all())
        self.assertTrue(np.isnan(features[36]))
        points[:, 2] = 0
        self.assertIsNone(pose_features(points, [0, 0, 100, 200]))

    def test_shifted_spreadsheet_columns_and_missing_labels(self):
        import openpyxl

        workbook = openpyxl.Workbook()
        sheet = workbook.active
        sheet.cell(5, 8, "score")
        for index, score in enumerate([3, 2, 1] * 4, 9):
            sheet.cell(5, index, score)
        for column, value in ((3, "video"), (5, "ACTIVITY"), (6, "start ts"),
                              (7, "end te"), (8, "total Tt")):
            sheet.cell(8, column, value)
        for number, (start, end) in enumerate(((3, 11), (11, 15), (15, 17)), 9):
            sheet.cell(number, 5, "Assembly action")
            sheet.cell(number, 6, start)
            sheet.cell(number, 7, end)
            sheet.cell(number, 8, end - start)
            sheet.cell(number, 11, 1)
        sheet.cell(9, 3, 2)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "labels.xlsx"
            workbook.save(path)
            segments, audit = read_annotations(path)
        self.assertEqual(audit["time_mode"], "seconds")
        self.assertEqual(segments[0]["start"], 3)
        self.assertEqual(segments[0]["labels"], [1, -1, -1, -1])
        self.assertTrue(all(segment["video_number"] == 2 for segment in segments))

    def test_bad_annotation_duration_is_quarantined(self):
        import openpyxl

        workbook = openpyxl.Workbook()
        sheet = workbook.active
        sheet.cell(5, 7, "score")
        for index, score in enumerate([3, 2, 1] * 4, 8):
            sheet.cell(5, index, score)
        for column, value in ((4, "ACTIVITY"), (5, "start ts"), (6, "end te"), (7, "total Tt")):
            sheet.cell(8, column, value)
        for number, (start, end, total) in enumerate(
                ((3.51, 3.6, 9), (4, 4.06, 6), (4.06, 4.09, 3), (4.09, 4.16, 1)), 9):
            for column, value in ((4, "Action"), (5, start), (6, end), (7, total), (10, 1)):
                sheet.cell(number, column, value)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "labels.xlsx"
            workbook.save(path)
            segments, audit = read_annotations(path)
        self.assertEqual(len(segments), 3)
        self.assertEqual(audit["quarantined_rows"][0]["row"], 12)

    def test_segment_evaluation_does_not_give_long_actions_more_votes(self):
        result = segment_votes(np.array([1, 1, 1, 3]), np.array([1, 1, 1, 1]),
                               np.array([1, 1, 1, 1]), np.array(["long"] * 3 + ["short"]))
        self.assertEqual(result["segments"], 2)
        self.assertEqual(result["model"]["accuracy"], 0.5)

    def test_worker_roi_rejects_larger_background_person(self):
        import torch
        from ultralytics.engine.results import Results

        result = Results(np.zeros((720, 1280, 3), dtype=np.uint8), path="test.jpg", names={0: "person"},
                         boxes=torch.tensor([[100, 100, 600, 650, .9, 0], [900, 200, 1100, 650, .9, 0]]),
                         keypoints=torch.ones((2, 17, 3)))
        features, index = worker_pose(result, [.55, 0, 1, 1])
        self.assertEqual(index, 1)
        self.assertIsNotNone(features)

    def test_prediction_cannot_overwrite_source_video(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "original.avi"
            path.write_bytes(b"original video")
            with self.assertRaisesRegex(ValueError, "differ"):
                predict(Namespace(video=path, video_output=path))
            self.assertEqual(path.read_bytes(), b"original video")

    def test_class_balance_preserves_equal_activity_weight(self):
        from improve import balanced_segment_weights

        y = np.array([1, 1, 1, 1, 1, 2, 2])
        segments = np.array(["a", "a", "a", "b", "b", "c", "c"])
        weights = balanced_segment_weights(y, segments)
        self.assertAlmostEqual(weights[y == 1].sum(), weights[y == 2].sum())
        self.assertAlmostEqual(weights[segments == "a"].sum(), weights[segments == "b"].sum())
        with self.assertRaises(ValueError):
            balanced_segment_weights(np.array([1, 2]), np.array(["a", "a"]))

    def test_temporal_features_use_only_past_frames_from_same_video(self):
        from improve import temporal_features

        raw = np.ones((4, 44))
        raw[:, :24] = np.tile(np.arange(24), (4, 1))
        raw[1, 0] += 2
        stamps = np.array([0, 1, 2, 0])
        videos = np.array([0, 0, 0, 1])
        expected = temporal_features(raw, stamps, videos)
        changed = raw.copy()
        changed[2, 0] += 100
        actual = temporal_features(changed, stamps, videos)
        np.testing.assert_allclose(expected[:2], actual[:2], equal_nan=True)
        np.testing.assert_allclose(expected[3], actual[3], equal_nan=True)
        isolated = temporal_features(raw[3:], stamps[3:], videos[3:])
        np.testing.assert_allclose(expected[3], isolated[0], equal_nan=True)

    def test_worker_crop_preserves_aspect_ratio_and_rgb(self):
        from visual import crop_worker

        frame = np.full((20, 100, 3), [0, 0, 255], dtype=np.uint8)
        crop = crop_worker(frame, [0, 0, 100, 20])
        self.assertEqual(crop.shape, (224, 224, 3))
        np.testing.assert_array_equal(crop[112, 112], [255, 0, 0])
        np.testing.assert_array_equal(crop[0, 0], [123, 116, 103])
        with self.assertRaises(ValueError):
            crop_worker(frame, [500, 0, 600, 20])

    def test_activity_features_include_variation_without_label_inputs(self):
        from improve import activity_features

        raw = np.ones((3, 44))
        raw[:, :24] = np.tile(np.arange(24), (3, 1))
        raw[1, 0] += 5
        result = activity_features(raw, np.ones((3, 384)))
        self.assertEqual(result["baseline"].shape, (44,))
        self.assertEqual(len(result["temporal_forest"]), len(result["geometry"]) * 4)
        self.assertTrue((result["temporal_forest"][-len(result["geometry"]):] > 0).any())
        self.assertEqual(len(result["visual_svm"]), len(result["temporal_forest"]) + 384)

    def test_physical_features_keep_knee_angles_and_arm_heights(self):
        from physical import physical_features

        raw = np.ones((1, 44))
        points = np.zeros((12, 2))
        points[0:2] = [[-1, 0], [1, 0]]
        points[6:8] = [[-1, 2], [1, 2]]
        points[2:4] = [[-1, -1], [1, -1]]
        points[4:6] = [[-1, -2], [1, -2]]
        raw[:, :24] = points.ravel()
        raw[:, 38:40] = [np.pi, np.pi / 2]
        features = physical_features(raw)
        np.testing.assert_allclose(features["knee_flexion"][0, :2], [0, np.pi / 2], atol=1e-6)
        np.testing.assert_allclose(features["arm_height"][0, :4], [.5, .5, 1, 1])

    def test_neural_scorer_has_four_three_level_outputs(self):
        import torch
        from neural import PostureModel, normalization

        model = PostureModel().eval()
        with torch.inference_mode():
            scores = model(torch.zeros(2, 3, 224, 224), torch.zeros(2, 44))
        self.assertEqual(tuple(scores.shape), (2, 4, 3))
        self.assertTrue(torch.isfinite(scores).all())
        median, mean, scale = normalization(np.array([[1., np.nan], [3., np.nan]]))
        np.testing.assert_allclose(median, [2, 0])
        np.testing.assert_allclose(mean, [2, 0])
        self.assertTrue((scale > 0).all())

    def test_neural_preview_cannot_overwrite_original(self):
        from neural import predict as neural_predict

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "original.avi"
            path.write_bytes(b"original video")
            with self.assertRaisesRegex(ValueError, "differ"):
                neural_predict(Namespace(video=path, video_output=path))
            self.assertEqual(path.read_bytes(), b"original video")

    def test_invariant_posture_features_ignore_side_and_camera_mirror(self):
        from deep import invariant_features

        raw = np.random.default_rng(42).normal(size=(3, 44))
        mirrored = raw.copy()
        points = mirrored[:, :24].reshape(-1, 12, 2)
        points[:, :, 0] *= -1
        points[:] = points[:, np.arange(12).reshape(-1, 2)[:, ::-1].ravel()]
        mirrored[:, 36:] = mirrored[:, 36:].reshape(-1, 4, 2)[:, :, ::-1].reshape(-1, 8)
        before, after = invariant_features(raw), invariant_features(mirrored)
        for posture in before:
            np.testing.assert_allclose(before[posture], after[posture], atol=1e-6)
        raw[:, :24] = np.nan
        for values in invariant_features(raw).values():
            self.assertFalse(np.isinf(values).any())

    def test_worker_weights_balance_people_within_each_class(self):
        from deep import weights_for

        y = np.array([1, 1, 1, 1, 1, 2, 2])
        segments = np.array(["a", "a", "b", "c", "d", "e", "e"])
        workers = np.array(["A", "A", "A", "B", "B", "B", "B"])
        weights = weights_for(y, segments, workers, "worker")
        self.assertAlmostEqual(weights[y == 1].sum(), weights[y == 2].sum())
        self.assertAlmostEqual(weights[(y == 1) & (workers == "A")].sum(),
                               weights[(y == 1) & (workers == "B")].sum())
        with self.assertRaises(ValueError):
            weights_for(np.array([1, 1]), np.array(["same", "same"]), np.array(["A", "B"]), "worker")

    def test_foreground_gate_rejects_background_walker_when_target_is_hidden(self):
        import torch
        from ultralytics.engine.results import Results

        result = Results(np.zeros((720, 1280, 3), dtype=np.uint8), path="occluded.jpg", names={0: "person"},
                         boxes=torch.tensor([[812, 207, 894, 398, .9, 0]]), keypoints=torch.ones((1, 17, 3)))
        self.assertIsNotNone(worker_pose(result)[0])
        self.assertEqual(worker_pose(result, min_foot_y=.65), (None, None))

    def test_per_second_schedule_does_not_drift_at_fractional_fps(self):
        from tabular import sample_frames

        schedule = list(sample_frames(12.25, 600, 29.97, 20000))
        self.assertEqual(len(schedule), 600)
        for second, timestamp, frame in schedule:
            self.assertEqual(timestamp, 12.25 + second)
            self.assertLessEqual(abs(frame / 29.97 - timestamp), .5 / 29.97 + 1e-6)
        self.assertEqual(list(sample_frames(0, 30, 30, 900))[-1], (29, 29, 870))
        self.assertEqual([r[2] for r in sample_frames(.5, 3, 1, 10)], [1, 2, 3])
        with self.assertRaises(ValueError):
            list(sample_frames(0, 2, .5, 10))

    def test_tabular_coordinates_are_pixels_and_hidden_joints_stay_blank(self):
        from tabular import FIELDS, observation
        from sustage import POSTURES

        points = np.tile([123.5, 246.25, .9], (17, 1))
        points[9] = [999, 999, .1]
        row = observation(0, 360, 10800, 30, (720, 1280), dict.fromkeys(POSTURES, 2),
                          points, .95, "yolo11x-pose.pt")
        self.assertEqual(set(row), set(FIELDS))
        self.assertEqual(row["nose_x_px"], 123.5)
        self.assertEqual(row["frame_width_px"], 1280)
        self.assertEqual(row["left_wrist_x_px"], "")
        self.assertEqual(row["left_wrist_y_px"], "")
        self.assertEqual(row["left_wrist_confidence"], .1)
        self.assertEqual(row["waist_flexion"], 2)
        missing = observation(1, 361, 10830, 30, (720, 1280))
        self.assertEqual(missing["status"], "pose_unavailable")
        self.assertTrue(all(missing[p] == "" for p in POSTURES))
        self.assertEqual(missing["nose_x_px"], "")

    def test_tabular_export_cannot_overwrite_video_model_or_existing_csv(self):
        from tabular import export

        with tempfile.TemporaryDirectory() as directory:
            video, model, csv_path = (Path(directory) / name for name in ("v.avi", "model.joblib", "out.csv"))
            for path in (video, model, csv_path):
                path.write_bytes(b"keep me")
            for path in (video, model):
                with self.assertRaisesRegex(ValueError, "differ"):
                    export(Namespace(video=video, model=model, csv_output=path))
            with self.assertRaises(FileExistsError):
                export(Namespace(video=video, model=model, csv_output=csv_path))
            for path in (video, model, csv_path):
                self.assertEqual(path.read_bytes(), b"keep me")

    def test_shared_frame_transforms_match_training(self):
        from sustage import frame_features
        from deep import invariant_features
        from improve import geometry
        from physical import physical_features

        raw = np.random.default_rng(42).normal(size=44)
        result = frame_features(raw, ["baseline", "geometry", "physical_arm_height", "invariant_knee_flexion"])
        np.testing.assert_allclose(result["baseline"], raw[None])
        np.testing.assert_allclose(result["geometry"], geometry(raw))
        np.testing.assert_allclose(result["physical_arm_height"], physical_features(raw)["arm_height"])
        np.testing.assert_allclose(result["invariant_knee_flexion"], invariant_features(raw)["knee_flexion"])


if __name__ == "__main__":
    unittest.main()
