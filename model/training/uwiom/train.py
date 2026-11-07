"""Train on Kinect 2D skeletons in cloud, keeping participants disjoint."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import re
import time

import h5py
import numpy as np
import torch
from sklearn.metrics import classification_report, confusion_matrix, f1_score, accuracy_score
from model import CLASSES, KINECT_JOINTS, RISK, network, pose_features

SEED = 20261107
# Fixed before fitting; test subjects never select epochs or hyperparameters.
SPLITS = {'train': [1, 2, 4, 5, 7, 8, 10, 11, 13, 14, 16, 17], 'validation': [3, 9, 15, 19], 'test': [6, 12, 18, 20]}


def load_data(root):
    readme = (root/'UW IOM Dataset/ReadMe_UW_IOM.txt').read_text()
    intervals = {int(s): (int(a), int(b)) for s, a, b in re.findall(r'^\s*(\d+)\s+(\d+)\s+(\d+)\s*$', readme, re.M)}
    if set(intervals) != set(range(1, 21)):
        raise ValueError('Missing participant timing documentation')
    features, labels, subjects, metadata, audit = [], [], [], [], []
    for subject in range(1, 21):
        actions = (root/'VideoLabels'/f'{subject:02d}.txt').read_text().splitlines()
        start, end = intervals[subject]
        if set(actions) - RISK.keys():
            raise ValueError(f'Unknown activity label for participant {subject}')
        if len(actions) != end-start+1:
            audit.append({'subject': subject, 'labeled_frames': len(actions), 'usable_frames': 0,
                          'excluded_frames': len(actions), 'reason': 'label_count_disagrees_with_documented_frame_range',
                          'documented_frames': end-start+1})
            continue
        with h5py.File(root/'JointPositions'/f'{subject}.mat') as file:
            vt, bt = file['videotimelogger'][...].ravel(), file['bodytimelogger'][...].ravel()
            points = file['pos2Dcolor'][...]
        if np.any(np.diff(vt) <= 0) or np.any(np.diff(bt) <= 0) or points.shape != (len(bt), 25, 2):
            raise ValueError('Unexpected skeleton timing or shape')
        # MATLAB source frame numbers are interpreted as 1-based inclusive, per README.
        frames = np.arange(start-1, end)
        if frames[-1] >= len(vt):
            raise ValueError('Annotation outside source video timeline')
        kept = 0
        for frame, action in zip(frames, actions):
            index = int(np.searchsorted(bt, vt[frame]))
            candidates = [j for j in (index-1, index) if 0 <= j < len(bt)]
            index = min(candidates, key=lambda j: abs(bt[j]-vt[frame]))
            # Exclude frames without synchronous skeleton; do not impute missing poses.
            if abs(bt[index]-vt[frame]) > 1e-6:
                continue
            x = pose_features(points[index, KINECT_JOINTS])
            if x is None:
                continue
            features.append(x); labels.append(RISK[action]); subjects.append(subject)
            metadata.append({'subject': subject, 'source_frame_1based': int(frame+1), 'timestamp_s': float(vt[frame]), 'action': action})
            kept += 1
        audit.append({'subject': subject, 'labeled_frames': len(actions), 'usable_frames': kept,
                      'excluded_frames': len(actions)-kept})
    return np.array(features), np.array(labels), np.array(subjects), metadata, audit


def metrics(y, pred):
    return {'accuracy': float(accuracy_score(y, pred)),
            'macro_f1': float(f1_score(y, pred, labels=[0, 1, 2], average='macro', zero_division=0)),
            'confusion_matrix': confusion_matrix(y, pred, labels=[0, 1, 2]).tolist(),
            'classes': classification_report(y, pred, labels=[0, 1, 2], target_names=CLASSES, output_dict=True, zero_division=0)}


def train(data, output):
    started = time.time()
    output.mkdir(parents=True, exist_ok=False)
    if not torch.cuda.is_available():
        raise RuntimeError('This experiment must run on cloud CUDA')
    torch.manual_seed(SEED); np.random.seed(SEED); torch.set_num_threads(4)
    x, y, subjects, metadata, audit = load_data(data)
    mask = {name: np.isin(subjects, ids) for name, ids in SPLITS.items()}
    assert sum(m.sum() for m in mask.values()) == len(y)
    mean, scale = x[mask['train']].mean(0), x[mask['train']].std(0).clip(.01)
    model = network().cuda()
    inputs = torch.tensor((x-mean)/scale, device='cuda')
    targets = torch.tensor(y, device='cuda', dtype=torch.long)
    indices = {name: torch.tensor(np.flatnonzero(m), device='cuda') for name, m in mask.items()}
    frequencies = np.bincount(y[mask['train']], minlength=3)
    if (frequencies == 0).any():
        raise ValueError('Training split missing a class')
    loss_fn = torch.nn.CrossEntropyLoss(weight=torch.tensor(len(indices['train'])/(3*frequencies), device='cuda', dtype=torch.float32))
    optimizer = torch.optim.AdamW(model.parameters(), lr=.001, weight_decay=.01)
    best, best_epoch, history = -1, 0, []
    for epoch in range(1, 151):
        model.train(); total_loss = 0
        shuffled = indices['train'][torch.randperm(len(indices['train']), device='cuda')]
        for batch in shuffled.split(512):
            optimizer.zero_grad(set_to_none=True)
            loss = loss_fn(model(inputs[batch]), targets[batch]); loss.backward(); optimizer.step()
            total_loss += float(loss.detach())*len(batch)
        model.eval()
        with torch.inference_mode():
            val_pred = model(inputs[indices['validation']]).argmax(1).cpu().numpy()
        score = metrics(y[mask['validation']], val_pred)['macro_f1']
        history.append({'epoch': epoch, 'train_loss': total_loss/len(shuffled), 'validation_macro_f1': score})
        if score > best:
            best, best_epoch = score, epoch
            torch.save({'state_dict': {k: v.cpu() for k, v in model.state_dict().items()},
                        'mean': torch.tensor(mean), 'scale': torch.tensor(scale), 'feature_version': 'common12_2d_v1',
                        'classes': CLASSES, 'splits': SPLITS, 'label_source': 'UW-IOM_activity_proxy',
                        'seed': SEED, 'epoch': epoch, 'clinical_model': False}, output/'exposure_model.pt')
        if epoch == 1 or epoch % 10 == 0:
            print(json.dumps(history[-1]), flush=True)
        if epoch-best_epoch >= 25:
            break
    artifact = torch.load(output/'exposure_model.pt', map_location='cpu', weights_only=True)
    model.load_state_dict(artifact['state_dict']); model.eval()
    with torch.inference_mode():
        predictions = model(inputs).argmax(1).cpu().numpy()
    report = {'dataset': 'https://data.mendeley.com/datasets/xwzzkxtf9s/3', 'license': 'CC BY 4.0',
              'risk_mapping_source': 'https://arxiv.org/html/1902.05176#S5.SS2.SSS1',
              'target': 'activity-derived ergonomic exposure class, not clinical MSD likelihood',
              'input': '12 common Kinect 2D joints; YOLO domain transfer not validated',
              'frame_alignment': 'README 1-based inclusive frames; exact RGB/body timestamp matches only',
              'splits': SPLITS, 'effective_splits': {name: sorted(set(subjects[m].tolist())) for name, m in mask.items()}, 'seed': SEED, 'audit': audit, 'best_epoch': best_epoch,
              'history': history, 'risk_mapping': RISK, 'gpu': torch.cuda.get_device_name(),
              'torch': str(torch.__version__), 'elapsed_s': time.time()-started, 'results': {},
              'model_sha256': hashlib.sha256((output/'exposure_model.pt').read_bytes()).hexdigest(),
              'limitations': ['Action-level derived labels, not expert frame scores or disease outcomes',
                             'Single lab camera; 20 young participants; no external-site validation',
                             'Pose cannot always distinguish objects/actions that have different labels',
                             'No Kinect tracking confidence provided; coordinate-only filtering',
                             '1-based frame offset interpreted from MATLAB documentation; not visually audited']}
    majority = int(frequencies.argmax())
    for name, m in mask.items():
        report['results'][name] = metrics(y[m], predictions[m])
        report['results'][name]['majority_baseline'] = metrics(y[m], np.full(m.sum(), majority))
        report['results'][name]['per_subject'] = {str(s): metrics(y[subjects == s], predictions[subjects == s]) for s in SPLITS[name] if np.any(subjects == s)}
    (output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    with (output/'test_predictions.csv').open('w', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=[*metadata[0], 'true_exposure', 'predicted_exposure'])
        writer.writeheader()
        for i in np.flatnonzero(mask['test']):
            writer.writerow({**metadata[i], 'true_exposure': CLASSES[y[i]], 'predicted_exposure': CLASSES[predictions[i]]})
    print(json.dumps({'best_epoch': best_epoch, 'test': report['results']['test'], 'elapsed_s': report['elapsed_s']}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('data', type=Path); parser.add_argument('output', type=Path)
    args = parser.parse_args()
    train(args.data, args.output)
