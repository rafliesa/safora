"""Audit foreground selection on canonical samples; retain rejected samples in an audit cache."""

import argparse
import json
import shutil
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

from sustage import worker_pose, write_json


def run(source, output):
    if output.exists():
        raise ValueError("Use a new output directory to keep the audit reproducible")
    (output / "keypoints").mkdir(parents=True)
    (output / "canonical").mkdir()
    manifest = json.loads((source / "manifest.json").read_text())
    model, fallback = YOLO("yolo11x-pose.pt"), YOLO("yolo11s-pose.pt")
    report = []
    # shortcut: this fixed camera sees target feet in the lower 35%; recalibrate for other cameras.
    min_foot_y = .65
    for number, item in enumerate(manifest):
        with np.load(source / "keypoints" / f"{number:02d}.npz") as data:
            array = {k: data[k].copy() for k in data.files}
        X = np.full_like(array["X"], np.nan)
        boxes = np.full((len(X), 4), np.nan, dtype=np.float32)
        legacy_boxes = boxes.copy()
        fallback_used = np.zeros(len(X), dtype=bool)
        cap = cv2.VideoCapture(item["video"])
        frames, indices = [], []

        def flush():
            if not frames:
                return
            results = model.predict(frames, imgsz=960, device=0, verbose=False)
            for frame, result, index in zip(frames, results, indices):
                _, old_index = worker_pose(result, item["roi"])
                if old_index is not None:
                    legacy_boxes[index] = result.boxes.xyxy[old_index].cpu().numpy()
                feature, selected = worker_pose(result, item["roi"], min_foot_y)
                if feature is None:
                    result = fallback.predict(frame, imgsz=640, device=0, verbose=False)[0]
                    feature, selected = worker_pose(result, item["roi"], min_foot_y)
                    fallback_used[index] = feature is not None
                if feature is not None:
                    X[index] = feature
                    boxes[index] = result.boxes.xyxy[selected].cpu().numpy()
            frames.clear()
            indices.clear()

        position = 0
        for i, stamp in enumerate(array["timestamp"]):
            target = round(stamp * item["fps"])
            if target - position > item["fps"] * 2:
                if not cap.set(cv2.CAP_PROP_POS_FRAMES, target):
                    raise RuntimeError("Cannot seek video")
                position = target
            while position < target:
                if not cap.grab():
                    raise RuntimeError("Premature video EOF")
                position += 1
            ok, frame = cap.read()
            position += 1
            if not ok:
                raise RuntimeError("Cannot decode canonical frame")
            frames.append(frame)
            indices.append(i)
            if len(frames) == 8:
                flush()
        flush()
        cap.release()
        valid = np.isfinite(boxes).all(axis=1)
        array["X"] = X
        np.savez_compressed(output / "canonical" / f"{number:02d}.npz", **array, available=valid,
                            boxes=boxes, legacy_boxes=legacy_boxes, fallback_used=fallback_used)
        np.savez_compressed(output / "keypoints" / f"{number:02d}.npz", **{k: v[valid] for k, v in array.items()})
        entry = {"video": number, "worker": item["worker"], "canonical": len(X),
                 "available": int(valid.sum()), "unavailable": int((~valid).sum()),
                 "fallback": int(fallback_used.sum())}
        report.append(entry)
        print(entry, flush=True)
    for name in ("manifest.json", "annotation_audit.json"):
        shutil.copy2(source / name, output / name)
    shutil.copy2(source / "metrics.json", output / "source_metrics.json")
    write_json(output / "extraction_config.json", {"pose_model": "yolo11x-pose.pt", "imgsz": 960,
        "fallback_pose_model": "yolo11s-pose.pt", "fallback_imgsz": 640, "min_foot_y": min_foot_y,
        "sample_fps": 2, "source": str(source), "audit": "canonical cache retains every original sample; keypoints includes available foreground only"})
    write_json(output / "foreground_audit.json", report)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    run(args.source, args.output)
