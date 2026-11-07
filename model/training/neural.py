"""Fine-tune a small multi-task image-and-pose scorer on worker-held-out folds."""

import argparse
import json
import time
import warnings
from pathlib import Path

import cv2
import numpy as np
import torch
from torch import nn
from torchvision.models import mobilenet_v3_small
from torchvision.transforms import v2
from ultralytics import YOLO

from improve import balanced_segment_weights
from sustage import POSTURES, evaluate, worker_pose, write_json
from visual import crop_worker


class PostureModel(nn.Module):
    def __init__(self, pretrained=False):
        super().__init__()
        self.body = mobilenet_v3_small(weights="DEFAULT" if pretrained else None)
        self.body.classifier[-1] = nn.Identity()
        self.head = nn.Sequential(nn.Dropout(.4), nn.Linear(1024 + 44, 12))

    def forward(self, image, pose):
        return self.head(torch.cat([self.body(image), pose], dim=1)).reshape(-1, 4, 3)


def load_arrays(source):
    arrays = []
    for path in sorted((source / "keypoints").glob("*.npz")):
        with np.load(path) as data:arrays.append({key: data[key].copy() for key in data.files})
    merged = {key: np.concatenate([a[key] for a in arrays]) for key in arrays[0]}
    merged["video"] = np.concatenate([np.repeat(i, len(a["X"])) for i, a in enumerate(arrays)])
    return arrays, merged


def prepare(source, directory):
    directory.mkdir(parents=True, exist_ok=True)
    if (directory / "complete.json").exists():
        if json.loads((directory / "complete.json").read_text())["canonical_source"] != str(source.resolve()):
            raise ValueError("Crop cache belongs to another source dataset")
        return
    arrays, merged = load_arrays(source)
    images = np.lib.format.open_memmap(directory / "crops.npy", mode="w+", dtype=np.uint8,
                                      shape=(len(merged["X"]), 224, 224, 3))
    manifest = json.loads((source / "manifest.json").read_text())
    config = json.loads((source / "extraction_config.json").read_text())
    settings = {k: config[k] for k in ("pose_model", "imgsz", "fallback_pose_model", "fallback_imgsz", "min_foot_y") if k in config}
    settings["pose_model"] = Path(settings["pose_model"]).name
    audited = (source / "canonical").exists()
    pose = None if audited else YOLO(settings["pose_model"])
    offset = 0
    for number, (item, array) in enumerate(zip(manifest, arrays)):
        boxes = None
        if audited:
            with np.load(source / "canonical" / f"{number:02d}.npz") as audit:
                if not np.array_equal(audit["timestamp"][audit["available"]], array["timestamp"]):
                    raise ValueError("Audited crop timestamps do not match features")
                boxes = audit["boxes"][audit["available"]].copy()
        cap = cv2.VideoCapture(item["video"])
        frames, indices = [], []

        def flush():
            if not frames:
                return
            if boxes is not None:
                for frame, index in zip(frames, indices):
                    images[offset + index] = crop_worker(frame, boxes[index])
                frames.clear()
                indices.clear()
                return
            results = pose.predict(frames, device=0, imgsz=settings.get("imgsz", 640), verbose=False)
            for frame, result, index in zip(frames, results, indices):
                _, person = worker_pose(result, item["roi"], settings.get("min_foot_y", .55))
                if person is None:
                    raise ValueError(f"Canonical worker detection missing in video {number}")
                images[offset + index] = crop_worker(frame, result.boxes.xyxy[person].cpu().numpy())
            frames.clear()
            indices.clear()

        position = 0
        for i, stamp in enumerate(array["timestamp"]):
            index = round(stamp * item["fps"])
            if index - position > item["fps"] * 2:
                if not cap.set(cv2.CAP_PROP_POS_FRAMES, index):
                    raise RuntimeError("Cannot seek canonical frame")
                position = index
            while position < index:
                if not cap.grab():
                    raise RuntimeError("Premature EOF while building crops")
                position += 1
            ok, frame = cap.read()
            position += 1
            if not ok:
                raise RuntimeError("Cannot decode canonical frame")
            frames.append(frame)
            indices.append(i)
            if len(frames) == 32:
                flush()
        flush()
        cap.release()
        offset += len(array["X"])
        print("Prepared crops", number, offset, flush=True)
    images.flush()
    np.savez_compressed(directory / "metadata.npz", **merged)
    write_json(directory / "complete.json", {"samples": len(images), "canonical_source": str(source.resolve()),
                                            "pose_settings": settings})


def normalization(values):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        median = np.nanmedian(values, axis=0)
    median = np.nan_to_num(median)
    filled = np.where(np.isfinite(values), values, median)
    return median, filled.mean(axis=0), np.maximum(filled.std(axis=0), 1e-3)


def normalize_images(images):
    mean = images.new_tensor([.485, .456, .406])[None, :, None, None]
    std = images.new_tensor([.229, .224, .225])[None, :, None, None]
    return (images - mean) / std


def fit(images, data, train, epochs, output, pose_settings=None):
    torch.manual_seed(42)
    rng = np.random.default_rng(42)
    model = PostureModel(pretrained=True).cuda()
    for layer in list(model.body.features)[:8]:
        for parameter in layer.parameters():parameter.requires_grad_(False)
    median, mean, scale = normalization(data["X"][train])
    pose = np.where(np.isfinite(data["X"]), data["X"], median)
    pose = torch.as_tensor((pose - mean) / scale, dtype=torch.float32, device="cuda")
    targets = torch.as_tensor(data["y"] - 1, dtype=torch.long, device="cuda")
    weights = np.zeros_like(data["y"], dtype=np.float32)
    for i in range(4):
        mask = train & (data["y"][:, i] > 0)
        weights[mask, i] = balanced_segment_weights(data["y"][mask, i], data["segment"][mask])
    weights = torch.as_tensor(weights, device="cuda")
    optimizer = torch.optim.AdamW([{"params": [p for p in model.body.parameters() if p.requires_grad], "lr": 1e-4},
                                  {"params": model.head.parameters(), "lr": 1e-3}], weight_decay=.001)
    schedule = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, epochs)
    scaler = torch.amp.GradScaler("cuda")
    # Keep image and pose coordinates aligned; photometric augmentation changes neither geometry.
    augment = v2.Compose([v2.ColorJitter(.4, .4, .3, .05), v2.RandomGrayscale(.3)])
    indices = np.flatnonzero(train)
    for epoch in range(epochs):
        model.train()
        for layer in model.modules():
            if isinstance(layer, nn.BatchNorm2d):layer.eval()
        order = rng.permutation(indices)
        losses = []
        for start in range(0, len(order), 64):
            batch = order[start:start + 64]
            image = torch.as_tensor(np.asarray(images[batch]), device="cuda").permute(0, 3, 1, 2).float() / 255
            image = normalize_images(augment(image))
            optimizer.zero_grad(set_to_none=True)
            with torch.autocast("cuda", dtype=torch.float16):
                logits = model(image, pose[batch])
                loss = nn.functional.cross_entropy(logits.reshape(-1, 3), targets[batch].reshape(-1),
                                                   reduction="none", ignore_index=-2).reshape(-1, 4)
                loss = (loss * weights[batch]).mean()
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
            losses.append(float(loss.detach()))
        schedule.step()
        print(output.name, "epoch", epoch + 1, "train_loss", round(float(np.mean(losses)), 4), flush=True)
    artifact = {"state_dict": {k: v.detach().cpu() for k, v in model.state_dict().items()},
                "median": torch.tensor(median), "mean": torch.tensor(mean), "scale": torch.tensor(scale),
                "epochs": epochs, "pose_model": "yolo11s-pose.pt", "postures": list(POSTURES),
                "known_classes": {p: np.unique(data["y"][train, i]).tolist() for i, p in enumerate(POSTURES)}}
    artifact.update(pose_settings or {})
    torch.save(artifact, output)
    model.eval()
    predicted = []
    with torch.inference_mode():
        for start in range(0, len(images), 64):
            image = torch.as_tensor(np.asarray(images[start:start + 64]), device="cuda").permute(0, 3, 1, 2).float() / 255
            with torch.autocast("cuda", dtype=torch.float16):
                logits = model(normalize_images(image), pose[start:start + 64])
            predicted.append((logits.argmax(dim=-1) + 1).cpu().numpy())
    del model
    torch.cuda.empty_cache()
    return np.concatenate(predicted)


def train(directory, output, epochs):
    started = time.monotonic()
    output.mkdir(parents=True, exist_ok=True)
    images = np.load(directory / "crops.npy", mmap_mode="r")
    settings = json.loads((directory / "complete.json").read_text()).get("pose_settings", {})
    with np.load(directory / "metadata.npz") as archive:data = {key: archive[key].copy() for key in archive.files}
    predictions = np.zeros_like(data["y"])
    folds = {}
    for worker in np.unique(data["worker"]):
        test = data["worker"] == worker
        all_pred = fit(images, data, ~test, epochs, output / f"heldout_{worker}.pt", settings)
        predictions[test] = all_pred[test]
        folds[worker] = {p: evaluate(data["y"][test, i], all_pred[test, i]) for i, p in enumerate(POSTURES)}
        print("HELDOUT", worker, {p: round(m["macro_f1"], 4) for p, m in folds[worker].items()}, flush=True)
    metrics = {p: evaluate(data["y"][:, i], predictions[:, i]) for i, p in enumerate(POSTURES)}
    print("NEURAL", {p: round(m["macro_f1"], 4) for p, m in metrics.items()}, flush=True)
    fit(images, data, np.ones(len(images), dtype=bool), epochs, output / "muri_model.pt", settings)
    write_json(output / "metrics.json", {"evaluation": "Fixed-epoch leave-one-worker-out; no test-based epoch selection",
                "epochs": epochs, "sample_count": len(images), "folds": folds, "pooled": metrics,
                "seconds": time.monotonic() - started})
    np.savez_compressed(output / "heldout_predictions.npz", prediction=predictions, **data)


def predict(args):
    if args.video.resolve() == args.video_output.resolve():
        raise ValueError("Output video must differ from the input video")
    artifact = torch.load(args.model, map_location="cpu", weights_only=True)
    model = PostureModel().cuda().eval()
    model.load_state_dict(artifact["state_dict"])
    median, mean, scale = (artifact[key].numpy() for key in ("median", "mean", "scale"))
    pose = YOLO(artifact["pose_model"])
    fallback = YOLO(artifact["fallback_pose_model"]) if artifact.get("fallback_pose_model") else None
    cap = cv2.VideoCapture(str(args.video))
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        raise ValueError("Unreadable source video")
    width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    stride = max(1, round(fps / 10))
    writer = cv2.VideoWriter(str(args.video_output), cv2.VideoWriter_fourcc(*"mp4v"), fps / stride, (width, height))
    if not writer.isOpened():
        raise RuntimeError("Cannot write preview video")
    cap.set(cv2.CAP_PROP_POS_FRAMES, round(args.start * fps))
    started = time.monotonic()
    written = 0
    for i in range(round(args.seconds * fps)):
        ok, frame = cap.read()
        if not ok:
            break
        if i % stride:
            continue
        result = pose.predict(frame, device=0, imgsz=artifact.get("imgsz", 640), verbose=False)[0]
        feature, person = worker_pose(result, args.roi, artifact.get("min_foot_y", .55))
        if feature is None and fallback is not None:
            result = fallback.predict(frame, device=0, imgsz=artifact.get("fallback_imgsz", 640), verbose=False)[0]
            feature, person = worker_pose(result, args.roi, artifact.get("min_foot_y", .55))
        lines = ["MURI frame estimate: 1 low, 2 medium, 3 high"]
        if feature is None:
            lines.append("Pose unavailable - no score")
        else:
            crop = crop_worker(frame, result.boxes.xyxy[person].cpu().numpy())
            image = torch.as_tensor(crop, device="cuda").permute(2, 0, 1)[None].float() / 255
            feature = np.where(np.isfinite(feature), feature, median)
            features = torch.as_tensor((feature - mean) / scale, device="cuda", dtype=torch.float32)[None]
            with torch.inference_mode(), torch.autocast("cuda", dtype=torch.float16):
                scores = (model(normalize_images(image), features)[0].argmax(dim=-1) + 1).cpu().numpy()
            frame = result[person].plot(boxes=False, labels=False)
            lines.extend(f"{p}: {int(score)}" for p, score in zip(POSTURES, scores))
        cv2.rectangle(frame, (0, 0), (width, 32 * len(lines) + 12), (20, 20, 20), -1)
        for row, line in enumerate(lines):
            cv2.putText(frame, line, (12, 28 + 32 * row), cv2.FONT_HERSHEY_SIMPLEX, .6, (255, 255, 255), 1, cv2.LINE_AA)
        writer.write(frame)
        written += 1
    cap.release()
    writer.release()
    elapsed = time.monotonic() - started
    if not written:
        raise ValueError("No video frames rendered")
    report = {"frames": written, "seconds": elapsed, "processing_fps": written / elapsed,
              "source_start_seconds": args.start, "requested_duration_seconds": args.seconds,
              "model": str(args.model)}
    write_json(args.video_output.with_suffix(".json"), report)
    print(report, flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    prep = sub.add_parser("prepare")
    prep.add_argument("source", type=Path)
    prep.add_argument("directory", type=Path)
    tr = sub.add_parser("train")
    tr.add_argument("directory", type=Path)
    tr.add_argument("output", type=Path)
    tr.add_argument("--epochs", type=int, default=15)
    pred = sub.add_parser("predict")
    pred.add_argument("video", type=Path)
    pred.add_argument("model", type=Path)
    pred.add_argument("video_output", type=Path)
    pred.add_argument("--start", type=float, default=0)
    pred.add_argument("--seconds", type=float, default=30)
    pred.add_argument("--roi", type=float, nargs=4)
    args = parser.parse_args()
    if args.command == "prepare":prepare(args.source, args.directory)
    elif args.command == "train":
        if args.epochs < 1:parser.error("Epochs must be positive")
        train(args.directory, args.output, args.epochs)
    else:
        if not np.isfinite(args.start + args.seconds) or args.start < 0 or args.seconds <= 0:
            parser.error("Start and duration must be finite and nonnegative, with positive duration")
        predict(args)
