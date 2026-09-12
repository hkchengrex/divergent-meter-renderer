"""Serializable rendering settings. Positions use Blender world coordinates."""
from dataclasses import asdict, dataclass, fields
import math
import json
from pathlib import Path

@dataclass
class RenderConfig:
    reading: str = "1.097302"
    width: int = 3840
    height: int = 2160
    samples: int = 96
    brightness: float = 18.0
    glow_color: tuple = (1.0, 0.115, 0.008)
    exposure: float = 0.0
    bloom: bool = True
    bloom_threshold: float = 1.4
    camera_position: tuple = (0.0, -15.0, 4.65)
    camera_target: tuple = (0.0, 0.0, 1.13)
    camera_type: str = "ORTHO"
    camera_scale: float | None = None
    focal_length: float = 50.0
    reflection: float = 0.0
    floor_roughness: float = 1.0
    glass_roughness: float = 0.085
    glass_reflection: float = 0.22
    glass_ior: float = 1.46
    base_roughness: float = 0.17
    studio_brightness: float = 0.0
    studio_position: tuple = (-4.0, -3.0, 6.0)
    studio_target: tuple = (0.0, 0.0, 1.0)
    studio_color: tuple = (1.0, 0.85, 0.65)
    studio_size: float = 5.0
    studio_size_y: float = 2.0
    ambient_brightness: float = 0.0
    seed: int = 0

    def __post_init__(self):
        if not isinstance(self.reading, str) or not self.reading or len(self.reading) > 64 or any(c not in "0123456789." for c in self.reading):
            raise ValueError("reading must be a string of 1–64 digits/decimal points")
        for name in ("width", "height", "samples", "seed"):
            value = getattr(self, name)
            if type(value) is not int or value < (0 if name == "seed" else 1):
                raise ValueError(f"{name} must be an integer >= {0 if name == 'seed' else 1}")
        if type(self.bloom) is not bool:
            raise ValueError("bloom must be true or false")
        for name in ("camera_position", "camera_target", "studio_position", "studio_target", "studio_color", "glow_color"):
            value = getattr(self, name)
            if not isinstance(value, (tuple, list)) or len(value) != 3 or any(type(v) not in (int, float) or not math.isfinite(v) for v in value):
                raise ValueError(f"{name} must contain three finite numbers")
            if name.endswith("color") and any(v < 0 or v > 1 for v in value):
                raise ValueError(f"{name} components must be between 0 and 1")
            setattr(self, name, tuple(value))
        for prefix in ("camera", "studio"):
            if getattr(self, prefix + "_position") == getattr(self, prefix + "_target"):
                raise ValueError(f"{prefix} position and target must differ")
        for name in ("brightness", "exposure", "bloom_threshold", "focal_length", "reflection", "floor_roughness", "glass_roughness", "glass_reflection", "glass_ior", "base_roughness", "studio_brightness", "studio_size", "studio_size_y", "ambient_brightness"):
            value = getattr(self, name)
            if type(value) not in (int, float) or not math.isfinite(value):
                raise ValueError(f"{name} must be a finite number")
            if name != "exposure" and value < 0:
                raise ValueError(f"{name} must be nonnegative")
        for name in ("reflection", "floor_roughness", "glass_roughness", "glass_reflection", "base_roughness"):
            if getattr(self, name) > 1:
                raise ValueError(f"{name} must be between 0 and 1")
        for name in ("focal_length", "studio_size", "studio_size_y"):
            if getattr(self, name) <= 0:
                raise ValueError(f"{name} must be positive")
        if self.glass_ior < 1:
            raise ValueError("glass_ior must be >= 1")
        if self.camera_scale is not None and (type(self.camera_scale) not in (int, float) or not math.isfinite(self.camera_scale) or self.camera_scale <= 0):
            raise ValueError("camera_scale must be null or a positive finite number")
        if self.camera_type not in ("ORTHO", "PERSP"):
            raise ValueError("camera_type must be ORTHO or PERSP")

    def to_dict(self):
        return asdict(self)

    @classmethod
    def from_dict(cls, data):
        if not isinstance(data, dict):
            raise ValueError("Configuration must be a JSON object")
        unknown = set(data) - {f.name for f in fields(cls)}
        if unknown:
            raise ValueError(f"Unknown configuration keys: {', '.join(sorted(unknown))}")
        return cls(**data)

    @classmethod
    def load(cls, path):
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8-sig")))

    def save(self, path):
        Path(path).write_text(json.dumps(self.to_dict(), indent=2) + "\n", encoding="utf-8")
