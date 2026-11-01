import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python_ai"))

from train_model import select_high_precision_threshold


class ThresholdSelectionTests(unittest.TestCase):
    def test_threshold_is_selected_from_validation_probabilities(self):
        labels = [0, 0, 0, 1, 1, 1]
        probabilities = [0.10, 0.20, 0.65, 0.70, 0.80, 0.90]
        threshold = select_high_precision_threshold(labels, probabilities, minimum_precision=0.90)
        self.assertGreaterEqual(threshold, 0.70)
        self.assertLessEqual(threshold, 0.90)


if __name__ == "__main__":
    unittest.main()
