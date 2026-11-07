"""Extract frozen DINOv2 features from worker crops at the baseline timestamps."""

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
import torch
from ultralytics import YOLO

from sustage import worker_pose


def load_encoder(device):
    encoder = torch.hub.load("facebookresearch/dinov2", "dinov2_vits14", trust_repo=True)
    return encoder.eval().to(device)


def crop_worker(frame, box):
    height, width = frame.shape[:2]
    x1, y1, x2, y2 = np.asarray(box, dtype=float)
    margin_x, margin_y = (x2 - x1) * .1, (y2 - y1) * .05
    x1, x2 = max(0, int(x1 - margin_x)), min(width, int(x2 + margin_x))
    y1, y2 = max(0, int(y1 - margin_y)), min(height, int(y2 + margin_y))
    if x1 >= x2 or y1 >= y2:
        raise ValueError("Empty worker crop")
    crop = cv2.cvtColor(frame[y1:y2, x1:x2], cv2.COLOR_BGR2RGB)
    h, w = crop.shape[:2]
    scale = 224 / max(h, w)
    resized = cv2.resize(crop, (max(1, round(w * scale)), max(1, round(h * scale))))
    canvas = np.empty((224, 224, 3), dtype=np.uint8)
    canvas[:] = [123, 116, 103]
    h, w = resized.shape[:2]
    top, left = (224 - h) // 2, (224 - w) // 2
    canvas[top:top + h, left:left + w] = resized
    return canvas


def encode(encoder, crops, device):
    tensor = torch.as_tensor(np.stack(crops), device=device).permute(0, 3, 1, 2).float() / 255
    mean = torch.tensor([.485, .456, .406], device=device)[None, :, None, None]
    std = torch.tensor([.229, .224, .225], device=device)[None, :, None, None]
    with torch.inference_mode(), torch.autocast(device_type="cuda", dtype=torch.bfloat16, enabled=str(device) != "cpu"):
        vectors = encoder((tensor - mean) / std)
    return vectors.float().cpu().numpy()


def extract(source, output):
    output.mkdir(parents=True, exist_ok=True)
    extraction = json.loads((source / "extraction_config.json").read_text())
    encoder, pose = load_encoder("cuda:0"), YOLO(Path(extraction["pose_model"]).name)
    fallback_pose = YOLO(extraction["fallback_pose_model"]) if extraction.get("fallback_pose_model") else None
    manifest = json.loads((source / "manifest.json").read_text())
    for number, item in enumerate(manifest):
        destination = output / f"{number:02d}.npz"
        if destination.exists():
            continue
        with np.load(source / "keypoints" / f"{number:02d}.npz") as cache:
            stamps = cache["timestamp"].copy()
        cap = cv2.VideoCapture(item["video"])
        vectors, frames = [], []
        missing = 0

        def flush():
            nonlocal missing
            if not frames:
                return
            results = pose.predict(frames, device=0, imgsz=extraction.get("imgsz", 640), verbose=False)
            crops, valid_indices = [], []
            batch = np.zeros((len(frames), 384), dtype=np.float32)
            for i, (frame, result) in enumerate(zip(frames, results)):
                _, index = worker_pose(result, item["roi"])
                if index is None and fallback_pose is not None:
                    result = fallback_pose.predict(frame, device=0, imgsz=extraction["fallback_imgsz"], verbose=False)[0]
                    _, index = worker_pose(result, item["roi"])
                if index is None:
                    missing += 1
                    continue
                crops.append(crop_worker(frame, result.boxes.xyxy[index].cpu().numpy()))
                valid_indices.append(i)
            if crops:
                batch[valid_indices] = encode(encoder, crops, "cuda:0")
            vectors.extend(batch)
            frames.clear()

        position = 0
        for stamp in stamps:
            index = round(stamp * item["fps"])
            if index - position > item["fps"] * 2:
                cap.set(cv2.CAP_PROP_POS_FRAMES, index)
                position = index
            while position < index:
                if not cap.grab():
                    raise RuntimeError(f"Premature EOF in {item['video']}")
                position += 1
            ok, frame = cap.read()
            position += 1
            if not ok:
                raise RuntimeError(f"Cannot read frame {index}")
            frames.append(frame)
            if len(frames) == 32:
                flush()
        flush()
        cap.release()
        np.savez_compressed(destination, vectors=np.asarray(vectors).reshape(-1, 384), timestamp=stamps)
        print(number, len(stamps), "visual samples", missing, "missing worker crops", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    extract(args.source, args.output)
