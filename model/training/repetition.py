"""Visible 2-D elbow movement candidates; not grip counts or HAL scores."""

import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
from statistics import median
import time


SIDES = ("left", "right")
ARMS = {"left": (5, 7, 9), "right": (6, 8, 10)}
SAMPLE_HZ = 10
MIN_CONFIDENCE = .6


def elbow_angle(points):
    if any(not all(math.isfinite(float(x)) for x in p) or p[2] < MIN_CONFIDENCE for p in points):
        return None
    shoulder, elbow, wrist = points
    u = (shoulder[0] - elbow[0], shoulder[1] - elbow[1])
    v = (wrist[0] - elbow[0], wrist[1] - elbow[1])
    if min(math.hypot(*u), math.hypot(*v)) < 15:
        return None
    cosine = sum(a * b for a, b in zip(u, v)) / (math.hypot(*u) * math.hypot(*v))
    return math.degrees(math.acos(max(-1, min(1, cosine))))


def overlap(a, b):
    area = lambda r: max(0, r[2] - r[0]) * max(0, r[3] - r[1])
    intersection = area((max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])))
    return intersection / max(1, area(a) + area(b) - intersection)


def write_csv(path, fields, rows):
    with Path(path).open("x", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def extract(args):
    import cv2
    from ultralytics import YOLO
    from sustage import worker_pose

    if args.output.exists():
        raise FileExistsError(args.output)
    if not args.video.is_file() or not args.pose_model.is_file():
        raise ValueError("Use an existing video and local pretrained pose weights")
    cap = cv2.VideoCapture(str(args.video))
    try:
        fps, count = cap.get(cv2.CAP_PROP_FPS), int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if not math.isfinite(fps) or fps < SAMPLE_HZ or count <= 0:
            raise ValueError("Readable source at 10 FPS or higher required")
        model = YOLO(str(args.pose_model))
        args.output.mkdir(parents=True, exist_ok=False)
        rows, previous_box, track, position = [], None, 0, 0
        started = time.monotonic()
        for sample in range(math.ceil(count / fps * SAMPLE_HZ)):
            target = math.floor(sample * fps / SAMPLE_HZ + .5)
            if target >= count:
                break
            while position < target:
                if not cap.grab():
                    raise RuntimeError(f"Unexpected EOF before frame {target}")
                position += 1
            ok, frame = cap.read()
            position += 1
            if not ok:
                raise RuntimeError(f"Cannot decode frame {target}")
            result = model.predict(frame, device=args.device, imgsz=960, verbose=False)[0]
            _, person = worker_pose(result, args.roi, min_foot_y=.65)
            row = {"timestamp_s": round(target / fps, 6), "frame_index": target, "track_segment": -1}
            for side in SIDES:
                row[side + "_angle_deg"] = None
                for joint in ("shoulder", "elbow", "wrist"):
                    for field in ("x_px", "y_px", "confidence"):
                        row[f"{side}_{joint}_{field}"] = None
            if person is None:
                previous_box = None
            else:
                box = result.boxes.xyxy[person].cpu().numpy().tolist()
                # shortcut: continuity guard, not identity tracking; replace for multiple workers in the ROI.
                if previous_box is None or overlap(previous_box, box) < .3:
                    track += 1
                previous_box, row["track_segment"] = box, track
                points = result.keypoints.data[person].cpu().numpy().tolist()
                for side, indices in ARMS.items():
                    row[side + "_angle_deg"] = elbow_angle([points[i] for i in indices])
                    for joint, index in zip(("shoulder", "elbow", "wrist"), indices):
                        for field, value in zip(("x_px", "y_px", "confidence"), points[index]):
                            row[f"{side}_{joint}_{field}"] = value if field == "confidence" or points[index][2] >= MIN_CONFIDENCE else None
            rows.append(row)
            if len(rows) % 250 == 0:
                print(f"Extracted {len(rows)} samples through {row['timestamp_s']:.1f} seconds", flush=True)
        write_csv(args.output / "arms_10fps.csv", list(rows[0]), rows)
        metadata = {"source_video": str(args.video), "source_sha256": hashlib.sha256(args.video.read_bytes()).hexdigest(),
                    "pose_model": str(args.pose_model), "pose_sha256": hashlib.sha256(args.pose_model.read_bytes()).hexdigest(),
                    "source_fps": fps, "source_frames": count, "duration_s": count / fps, "sample_hz": SAMPLE_HZ,
                    "samples": len(rows), "roi": args.roi, "minimum_joint_confidence": MIN_CONFIDENCE,
                    "minimum_projected_bone_px": 15, "elapsed_seconds": time.monotonic() - started}
        (args.output / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
        print(json.dumps(metadata), flush=True)
    finally:
        cap.release()


def count_cycles(rows, side, amplitude=30):
    """Count a bend of >= amplitude degrees followed by return within 10 degrees."""
    blocks, block = [], []
    for row in rows:
        angle = row[side + "_angle_deg"]
        if angle is None:
            if block:
                blocks.append(block)
                block = []
            continue
        if block and (row["timestamp_s"] - block[-1]["timestamp_s"] > .151
                      or row["track_segment"] != block[-1]["track_segment"]
                      or abs(angle - block[-1][side + "_angle_deg"]) > 60):
            blocks.append(block)
            block = []
        block.append(row)
    if block:
        blocks.append(block)
    events, visible_seconds = [], 0.0
    for block in blocks:
        visible_seconds += block[-1]["timestamp_s"] - block[0]["timestamp_s"]
        values = [median(r[side + "_angle_deg"] for r in block[max(0, i - 1):i + 2]) for i in range(len(block))]
        peak, low = 0, None
        for i in range(1, len(block)):
            duration = block[i]["timestamp_s"] - block[peak]["timestamp_s"]
            if duration > 10:
                peak, low = i, None
            elif low is None:
                if values[i] >= values[peak]:
                    peak = i
                elif values[peak] - values[i] >= amplitude:
                    low = i
            elif values[i] < values[low]:
                low = i
            elif values[i] >= values[peak] - 10:
                if duration >= .4:
                    events.append({"side": side, "start_s": block[peak]["timestamp_s"],
                                   "bend_s": block[low]["timestamp_s"], "end_s": block[i]["timestamp_s"],
                                   "duration_s": round(duration, 6), "excursion_deg": round(values[peak] - values[low], 2),
                                   "start_angle_deg": values[peak], "bend_angle_deg": values[low], "return_angle_deg": values[i],
                                   "status": "candidate_not_validated"})
                peak, low = i, None
    return events, visible_seconds


def analyze(args):
    if args.output.exists():
        raise FileExistsError(args.output)
    with args.input.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if not reader.fieldnames or len(reader.fieldnames) != len(set(reader.fieldnames)):
            raise ValueError("Missing or duplicate CSV headers")
        rows = list(reader)
    if not rows:
        raise ValueError("Empty observations")
    previous = -1
    for row in rows:
        row["timestamp_s"] = float(row["timestamp_s"])
        row["track_segment"] = int(row["track_segment"])
        if not math.isfinite(row["timestamp_s"]) or row["timestamp_s"] < 0 or row["timestamp_s"] <= previous:
            raise ValueError("Finite, nonnegative, increasing timestamps required")
        previous = row["timestamp_s"]
        for side in SIDES:
            value = row[side + "_angle_deg"]
            row[side + "_angle_deg"] = float(value) if value else None
            if value and not 0 <= float(value) <= 180:
                raise ValueError("Angle must be finite and within 0..180 degrees")
    if len(rows) < 2 or median(b["timestamp_s"] - a["timestamp_s"] for a, b in zip(rows, rows[1:])) > .151:
        raise ValueError("Re-extract at 10 FPS; one observation per second is too sparse for this counter")
    events, stats = [], {}
    for side in SIDES:
        found, seconds = count_cycles(rows, side)
        events.extend(found)
        stats[side] = {"candidate_cycles": len(found), "continuous_visible_seconds": round(seconds, 3),
                       "visible_samples": sum(r[side + "_angle_deg"] is not None for r in rows),
                       "visible_sample_fraction": sum(r[side + "_angle_deg"] is not None for r in rows) / len(rows)}
    events.sort(key=lambda e: (e["end_s"], e["side"]))
    per_second = []
    for second in range(math.floor(rows[0]["timestamp_s"]), math.floor(rows[-1]["timestamp_s"]) + 1):
        samples = [r for r in rows if second <= r["timestamp_s"] < second + 1]
        row = {"timestamp_s": second}
        for side in SIDES:
            visible = sum(r[side + "_angle_deg"] is not None for r in samples)
            row[side + "_visible_fraction"] = visible / len(samples) if samples else None
            row[side + "_candidate_cycles_detected"] = sum(e["side"] == side and second <= e["end_s"] < second + 1 for e in events) if visible else None
            row[side + "_candidate_cycles_so_far"] = sum(e["side"] == side and e["end_s"] < second + 1 for e in events)
        per_second.append(row)
    summary = {"prototype": True, "manual_validation": "not_completed", "arms": stats,
               "definition": "2-D elbow bend >=30 degrees, returning within 10 degrees of start in 0.4..10 seconds; 3-sample median smoothing.",
               "limitations": ["Projected angle, not a measured anatomical angle; turning the body can mimic bending.",
                               "Missing joints, tracking changes and abrupt angle jumps split cycles; no interpolation across gaps.",
                               "Counts include visible elbow movement outside assembly; they are not grip, tool-action, or lifting counts.",
                               "Do not convert these counts directly to HAL, an RNLE lifting frequency, or a disease risk."]}
    args.output.mkdir(parents=True, exist_ok=False)
    fields = ["side", "start_s", "bend_s", "end_s", "duration_s", "excursion_deg", "start_angle_deg", "bend_angle_deg", "return_angle_deg", "status"]
    write_csv(args.output / "candidate_cycles.csv", fields, events)
    write_csv(args.output / "repetition_per_second.csv", list(per_second[0]), per_second)
    (args.output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    extract_parser = sub.add_parser("extract")
    extract_parser.add_argument("video", type=Path)
    extract_parser.add_argument("output", type=Path)
    extract_parser.add_argument("--pose-model", type=Path, required=True)
    extract_parser.add_argument("--device", default="cpu")
    extract_parser.add_argument("--roi", type=float, nargs=4, default=[0, 0, .88, 1])
    count_parser = sub.add_parser("count")
    count_parser.add_argument("input", type=Path)
    count_parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.command == "extract":
        x0, y0, x1, y1 = args.roi
        if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
            parser.error("ROI must be normalized x0 y0 x1 y1")
        extract(args)
    else:
        analyze(args)


if __name__ == "__main__":
    main()
