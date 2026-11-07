"""Experimental UW-IOM activity-derived exposure classifier, not an MSD probability model."""
import numpy as np
import torch
from torch import nn

CLASSES = ['low', 'moderate', 'high']
JOINTS = [f'{side}_{joint}' for joint in ('shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle') for side in ('left', 'right')]
KINECT_JOINTS = [4, 8, 5, 9, 6, 10, 12, 16, 13, 17, 14, 18]
ACTIONS = [
    'none_walk_none_none', 'none_stand_reach_top', 'box_stand_pick-up_top',
    'box_stand_place_mid', 'none_stand_none_none', 'rod_stand_pick-up_top',
    'rod_stand_place_mid', 'box_stand_pick-up_mid', 'rod_stand_pick-up_mid',
    'none_bend_none_none', 'rod_bend_pick-up_low', 'box_bend_place_low',
    'rod_bend_place_low', 'box_stand_place_top', 'rod_stand_place_top',
    'box_bend_pick-up_low', 'box_walk_hold_none',
]
# Parsa et al. 2019, section V-B1; labels are action-level proxies, not frame-level expert REBA.
RISK = {action: 1 for action in ACTIONS}
RISK.update({action: 0 for action in ('none_walk_none_none', 'box_walk_hold_none', 'rod_stand_pick-up_mid')})
RISK.update({action: 2 for action in ('box_stand_pick-up_top', 'box_stand_place_top', 'rod_stand_place_top')})


def pose_features(points):
    points = np.asarray(points, dtype=np.float32)
    if points.shape != (12, 2) or not np.isfinite(points).all() or (points <= 0).any():
        return None
    center = points[6:8].mean(0)
    scale = np.linalg.norm(points[:2].mean(0) - center)
    if scale < 5:
        return None
    relative = (points - center) / scale
    if np.abs(relative).max() > 8:
        return None
    i, j = np.triu_indices(12, 1)
    distances = np.linalg.norm(relative[i] - relative[j], axis=1)
    return np.concatenate([relative.ravel(), distances]).astype(np.float32)


def network():
    return nn.Sequential(nn.Linear(90, 128), nn.ReLU(), nn.Dropout(.2),
                         nn.Linear(128, 64), nn.ReLU(), nn.Dropout(.2), nn.Linear(64, 3))


def predict_rows(rows, checkpoint):
    artifact = torch.load(checkpoint, map_location='cpu', weights_only=True)
    if artifact['feature_version'] != 'common12_2d_v1':
        raise ValueError('Unsupported feature version')
    model = network()
    model.load_state_dict(artifact['state_dict'])
    model.eval()
    output = []
    for raw in rows:
        points = []
        for joint in JOINTS:
            values = [raw.get(joint + suffix) for suffix in ('_x_px', '_y_px', '_confidence')]
            try:
                x, y, confidence = map(float, values)
            except (ValueError, TypeError):
                break
            if not np.isfinite([x, y, confidence]).all() or not .5 <= confidence <= 1:
                break
            points.append([x, y])
        features = pose_features(points) if raw.get('status') == 'ok' else None
        result = {'timestamp_s': raw['timestamp_s'], 'exposure_level': None,
                  'status': 'pose_unavailable', 'label_source': 'UW-IOM_activity_proxy',
                  'clinical_msd_probability': None, 'domain_validated': False}
        if features is not None:
            with torch.inference_mode():
                x = (torch.from_numpy(features) - artifact['mean']) / artifact['scale']
                result.update(exposure_level=CLASSES[model(x).argmax().item()], status='experimental_prediction')
        output.append(result)
    return output
