import json
from pathlib import Path
import tempfile
import unittest
from nixie_renderer import RenderConfig, render

class ConfigTests(unittest.TestCase):
    def test_round_trip_preserves_leading_zeros_and_camera(self):
        settings = RenderConfig(reading="00.102", camera_position=[1, -10, 3])
        self.assertEqual(RenderConfig.from_dict(json.loads(json.dumps(settings.to_dict()))), settings)

    def test_reject_invalid_inputs(self):
        for kwargs in ({"reading": ""}, {"reading": 1.23}, {"reading": "12x"}, {"brightness": float("nan")}, {"reflection": 1.5}, {"samples": True}, {"studio_position": [0,0,1]}, {"width": 0}, {"camera_position": [0,0,1.13]}, {"camera_scale": -1}, {"glow_color": [1,2,3]}, {"bloom": "false"}, {"camera_type": "INVALID"}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                RenderConfig.from_dict(kwargs)
        with self.assertRaisesRegex(ValueError, "Unknown"):
            RenderConfig.from_dict({"brighness": 10})

    def test_output_protection_before_launch(self):
        import sys
        with tempfile.TemporaryDirectory() as directory:
            prefix = Path(directory) / "existing"
            Path(str(prefix) + ".png").write_bytes(b"keep")
            with self.assertRaises(FileExistsError):
                render(output=prefix, blender=sys.executable)
            self.assertEqual(Path(str(prefix) + ".png").read_bytes(), b"keep")

if __name__ == "__main__":
    unittest.main()
