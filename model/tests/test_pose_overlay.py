import unittest
from model.pose_overlay import visible_points


class PoseOverlayTests(unittest.TestCase):
    def test_missing_low_confidence_and_out_of_frame_joints_stay_missing(self):
        points = [[10.123, 20.456, .9]] * 17
        points[1] = [10, 20, .49]
        points[2] = [float('nan'), 20, .9]
        points[3] = [101, 20, .9]
        points[4] = [10, 20, 1.2]
        result = visible_points(points, 100, 100)
        self.assertEqual(result[0], [10.12, 20.46, .9])
        self.assertEqual(result[1:5], [None] * 4)
        with self.assertRaises(ValueError): visible_points(points[:3], 100, 100)
