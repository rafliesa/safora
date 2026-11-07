import math
import csv
import contextlib
import io
import json
from argparse import Namespace
from pathlib import Path
import tempfile
import unittest

from repetition import analyze, count_cycles, elbow_angle, overlap


def observations(values):
    return [{"timestamp_s": i / 10, "track_segment": 1, "left_angle_deg": v} for i, v in enumerate(values)]


class RepetitionTests(unittest.TestCase):
    cycle = [160] * 3 + [145, 125, 105, 90, 90, 105, 125, 145, 160] + [160] * 3

    def test_known_cycles_and_no_double_count_on_plateaus(self):
        events, seconds = count_cycles(observations(self.cycle * 3), "left")
        self.assertEqual(len(events), 3)
        self.assertAlmostEqual(seconds, 4.4)
        self.assertTrue(all(e["start_s"] < e["bend_s"] < e["end_s"] for e in events))

    def test_jitter_and_incomplete_bend_are_not_cycles(self):
        self.assertEqual(count_cycles(observations([150, 148, 152, 149] * 20), "left")[0], [])
        self.assertEqual(count_cycles(observations([160] * 3 + [140, 120, 100, 90] * 2), "left")[0], [])

    def test_occlusion_track_change_and_timing_gap_do_not_bridge_a_cycle(self):
        for kind in ("missing", "track", "time"):
            rows = observations(self.cycle)
            if kind == "missing":
                rows[7]["left_angle_deg"] = None
            else:
                for row in rows[7:]:
                    if kind == "track":
                        row["track_segment"] = 2
                    else:
                        row["timestamp_s"] += 2
            self.assertEqual(count_cycles(rows, "left")[0], [])

    def test_long_static_hold_is_not_a_repetition(self):
        values = [160] * 3 + [130, 100, 90] + [90] * 110 + [110, 140, 160, 160]
        self.assertEqual(count_cycles(observations(values), "left")[0], [])

    def test_angles_and_visibility(self):
        points = [[0, 50, 1], [0, 0, 1], [50, 0, 1]]
        self.assertAlmostEqual(elbow_angle(points), 90)
        points[2][2] = .5
        self.assertIsNone(elbow_angle(points))
        points[2] = [1, 0, 1]
        self.assertIsNone(elbow_angle(points))
        points[2] = [math.nan, 0, 1]
        self.assertIsNone(elbow_angle(points))

    def test_box_continuity(self):
        self.assertEqual(overlap([0, 0, 10, 10], [0, 0, 10, 10]), 1)
        self.assertEqual(overlap([0, 0, 10, 10], [20, 0, 30, 10]), 0)

    def test_report_keeps_unobserved_arm_empty_and_protects_outputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rows = [{**row, "right_angle_deg": None} for row in observations(self.cycle * 3)]
            with (root / "input.csv").open("w", newline="") as file:
                writer = csv.DictWriter(file, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
            args = Namespace(input=root / "input.csv", output=root / "report")
            with contextlib.redirect_stdout(io.StringIO()):
                analyze(args)
            summary = json.loads((args.output / "summary.json").read_text())
            self.assertEqual(summary["arms"]["left"]["candidate_cycles"], 3)
            self.assertEqual(summary["arms"]["right"]["visible_samples"], 0)
            with (args.output / "repetition_per_second.csv").open(encoding="utf-8-sig") as file:
                self.assertTrue(all(row["right_candidate_cycles_detected"] == "" for row in csv.DictReader(file)))
            with self.assertRaises(FileExistsError):
                analyze(args)

    def test_rejects_negative_timestamps_and_sparse_input(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for timestamps in ((-.1, 0, .1), (0, 1, 2)):
                with (root / "input.csv").open("w", newline="") as file:
                    writer = csv.writer(file)
                    writer.writerow(["timestamp_s", "track_segment", "left_angle_deg", "right_angle_deg"])
                    writer.writerows((t, 1, 90, 90) for t in timestamps)
                with self.assertRaises(ValueError):
                    analyze(Namespace(input=root / "input.csv", output=root / "report"))


if __name__ == "__main__":
    unittest.main()
