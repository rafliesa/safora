import tempfile
import hashlib
import json
from unittest.mock import patch
from download import download
import unittest
from pathlib import Path
import h5py
import numpy as np
import torch
from model import KINECT_JOINTS, RISK, network, pose_features, predict_rows
from train import SPLITS, load_data


def pose():
    return np.array([[80, 80], [120, 80], [75, 110], [125, 110], [70, 140], [130, 140],
                     [85, 150], [115, 150], [85, 210], [115, 210], [85, 270], [115, 270]], dtype=np.float32)


class ModelTests(unittest.TestCase):
    def test_download_checks_hash_before_replacing_and_skips_verified(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            entry = {'folder_name': 'VideoLabels', 'filename': '01.txt', 'content_details': {
                'download_url': 'https://data.mendeley.com/public-files/example',
                'sha256_hash': hashlib.sha256(b'correct').hexdigest()}}
            manifest = root/'manifest.json'; manifest.write_text(json.dumps([entry]))
            target = root/'data/VideoLabels/01.txt'; target.parent.mkdir(parents=True)
            target.write_bytes(b'existing')
            def fake_curl(command, **kwargs):
                Path(command[-1]).write_bytes(b'wrong')
            with patch('download.subprocess.run', side_effect=fake_curl):
                with self.assertRaises(ValueError):
                    download(manifest, root/'data')
            self.assertEqual(target.read_bytes(), b'existing')
            target.write_bytes(b'correct')
            with patch('download.subprocess.run') as run:
                download(manifest, root/'data')
                run.assert_not_called()

    def test_features_ignore_camera_translation_and_uniform_scale(self):
        f = pose_features(pose())
        self.assertEqual(f.shape, (90,))
        np.testing.assert_allclose(f, pose_features(pose()*2+40), atol=1e-6)
        bad = pose(); bad[0, 0] = np.nan
        self.assertIsNone(pose_features(bad))
        self.assertIsNone(pose_features(np.zeros((12, 2))))

    def test_mapping_and_participant_isolation(self):
        self.assertEqual([list(RISK.values()).count(i) for i in range(3)], [3, 11, 3])
        self.assertEqual(sorted(sum(SPLITS.values(), [])), list(range(1, 21)))
        self.assertFalse(set(SPLITS['train']) & set(SPLITS['test']))

    def test_parser_aligns_one_based_frames_and_excludes_unsynced_pose(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ('JointPositions', 'VideoLabels', 'UW IOM Dataset'):
                (root/name).mkdir()
            (root/'UW IOM Dataset/ReadMe_UW_IOM.txt').write_text('\n'.join(f'{s} 2 4' for s in range(1, 21)))
            for subject in range(1, 21):
                (root/'VideoLabels'/f'{subject:02d}.txt').write_text('none_walk_none_none\nnone_stand_none_none\nbox_stand_place_top\n')
                with h5py.File(root/'JointPositions'/f'{subject}.mat', 'w') as f:
                    f['videotimelogger'] = np.array([0, 1, 2, 3, 4])
                    f['bodytimelogger'] = np.array([0, 1, 2.2, 3, 4])
                    points = np.ones((5, 25, 2))
                    points[:, KINECT_JOINTS] = pose()
                    f['pos2Dcolor'] = points
            (root/'VideoLabels/15.txt').write_text('none_walk_none_none\n')
            x, y, subjects, meta, audit = load_data(root)
            self.assertEqual(x.shape, (38, 90))
            self.assertNotIn(15, subjects)
            self.assertEqual(audit[14]['reason'], 'label_count_disagrees_with_documented_frame_range')
            self.assertEqual(y[:2].tolist(), [0, 2])
            self.assertEqual([r['source_frame_1based'] for r in meta[:2]], [2, 4])
            self.assertTrue(all(a['excluded_frames'] == 1 for a in audit))

    def test_missing_input_is_unknown_and_checkpoint_roundtrip(self):
        from model import JOINTS
        row = {'timestamp_s': 0, 'status': 'ok'}
        for joint, point in zip(JOINTS, pose()):
            row.update({joint+'_x_px': point[0], joint+'_y_px': point[1], joint+'_confidence': .9})
        missing = dict(row); missing['left_wrist_confidence'] = .1
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'model.pt'
            torch.save({'state_dict': network().state_dict(), 'mean': torch.zeros(90), 'scale': torch.ones(90),
                        'feature_version': 'common12_2d_v1'}, path)
            a, b = predict_rows([row, missing], path)
            self.assertIn(a['exposure_level'], ['low', 'moderate', 'high'])
            self.assertIsNone(a['clinical_msd_probability'])
            self.assertIsNone(b['exposure_level'])


if __name__ == '__main__':
    unittest.main()
