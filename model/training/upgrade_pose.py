"""Re-estimate pose on the exact baseline samples, preserving labels and coverage."""

import argparse
import json
import shutil
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

from sustage import worker_pose, write_json


def run(source, output):
    output.mkdir(parents=True, exist_ok=True)
    (output / "keypoints").mkdir(exist_ok=True)
    for name in ("manifest.json", "annotation_audit.json", "metrics.json"):
        shutil.copy2(source / name, output / name)
    manifest = json.loads((source / "manifest.json").read_text())
    model = YOLO("yolo11x-pose.pt")
    reports = []
    for number, item in enumerate(manifest):
        destination = output / "keypoints" / f"{number:02d}.npz"
        if destination.exists():
            continue
        with np.load(source / "keypoints" / f"{number:02d}.npz") as data:
            array = {k: data[k].copy() for k in data.files}
        features = array["X"].copy()
        cap = cv2.VideoCapture(item["video"])
        frames, indices = [], []
        fallback = 0

        def flush():
            nonlocal fallback
            if not frames:
                return
            results = model.predict(frames, device=0, imgsz=960, verbose=False)
            for result, index in zip(results, indices):
                feature, _ = worker_pose(result, item["roi"])
                if feature is None:
                    fallback += 1
                else:
                    features[index] = feature
            frames.clear()
            indices.clear()

        position = 0
        for i, stamp in enumerate(array["timestamp"]):
            index = round(stamp * item["fps"])
            if index - position > item["fps"] * 2:
                if not cap.set(cv2.CAP_PROP_POS_FRAMES, index):
                    raise RuntimeError("Cannot seek video")
                position = index
            while position < index:
                if not cap.grab():
                    raise RuntimeError("Premature video EOF")
                position += 1
            ok, frame = cap.read()
            position += 1
            if not ok:
                raise RuntimeError("Cannot decode sampled frame")
            frames.append(frame)
            indices.append(i)
            if len(frames) == 8:
                flush()
        flush()
        cap.release()
        array["X"] = features
        np.savez_compressed(destination, **array)
        report = {"video": number, "samples": len(features), "fallback_to_original_pose": fallback}
        reports.append(report)
        print(report, flush=True)
    write_json(output / "extraction_config.json", {"pose_model": "yolo11x-pose.pt", "imgsz": 960,
               "sample_fps": 2, "fallback_pose_model": "yolo11s-pose.pt", "fallback_imgsz": 640,
               "canonical_source": str(source), "same_labels_and_timestamps": True})
    write_json(output / "pose_upgrade_audit.json", reports)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    run(args.source, args.output)
