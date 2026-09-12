import argparse
import subprocess
from .config import RenderConfig
from .runner import render

def main():
    p = argparse.ArgumentParser(description="Render procedural Nixie tubes using Blender 5.2+. CLI flags override JSON settings.")
    p.add_argument("--config", help="JSON settings file")
    p.add_argument("--output", default="nixie", help="Output file prefix (default: nixie)")
    p.add_argument("--blender", help="Blender executable; otherwise BLENDER_PATH or PATH")
    p.add_argument("--overwrite", action="store_true")
    p.add_argument("--scene-only", action="store_true", help="Save .blend and JSON without rendering")
    p.add_argument("--write-config", metavar="PATH", help="Save resolved settings without launching Blender")
    p.add_argument("--reading", help="Digits and dots; each character occupies one complete tube")
    p.add_argument("--atlas", action="store_true", help="Use reading 0123456789.")
    for key in ("width", "height", "samples", "seed"):
        p.add_argument("--" + key, type=int)
    for key in ("brightness", "exposure", "bloom_threshold", "camera_scale", "focal_length", "reflection", "floor_roughness", "glass_roughness", "glass_reflection", "glass_ior", "base_roughness", "studio_brightness", "studio_size", "studio_size_y", "ambient_brightness"):
        p.add_argument("--" + key.replace("_", "-"), type=float)
    for key in ("camera_position", "camera_target", "glow_color", "studio_position", "studio_target", "studio_color"):
        p.add_argument("--" + key.replace("_", "-"), nargs=3, type=float, metavar=("X", "Y", "Z"))
    p.add_argument("--camera-type", choices=("ORTHO", "PERSP"))
    p.add_argument("--bloom", action=argparse.BooleanOptionalAction, default=None)
    args = p.parse_args()
    try:
        data = RenderConfig.load(args.config).to_dict() if args.config else {}
        names = RenderConfig.__dataclass_fields__
        data.update({k: v for k, v in vars(args).items() if k in names and v is not None})
        if args.atlas:
            data["reading"] = "0123456789."
        config = RenderConfig.from_dict(data)
        if args.write_config:
            config.save(args.write_config)
            print(args.write_config)
            return
        for kind, path in render(config, args.output, blender=args.blender, overwrite=args.overwrite, scene_only=args.scene_only).items():
            print(f"{kind}: {path}")
    except (ValueError, OSError, RuntimeError, subprocess.CalledProcessError) as error:
        p.exit(1, f"Error: {error}\n")
