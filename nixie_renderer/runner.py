"""Run Blender in an isolated background process without requiring bpy in Python."""
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
from .config import RenderConfig

def find_blender(executable=None):
    candidate = executable or os.environ.get("BLENDER_PATH") or shutil.which("blender")
    if candidate:
        path = Path(candidate).expanduser()
        found = str(path.resolve()) if path.is_file() else shutil.which(str(candidate))
        if found:
            return found
    raise FileNotFoundError("Blender not found. Set BLENDER_PATH, add blender to PATH, or pass blender='/path/to/blender'.")

def render(config=None, output="nixie", *, blender=None, overwrite=False, scene_only=False):
    """Return paths to PNG, .blend, and JSON. Output is a file prefix, not a directory.

    Blender logs stream to the terminal. Exceptions propagate on failed rendering.
    Artifacts are rendered into a temporary directory before being copied out.
    """
    config = RenderConfig() if config is None else RenderConfig.from_dict(config.to_dict() if isinstance(config, RenderConfig) else config)
    executable = find_blender(blender)
    prefix = Path(output).expanduser().resolve()
    if prefix.suffix.lower() in (".png", ".blend", ".json"):
        prefix = prefix.with_suffix("")
    paths = {ext: Path(str(prefix) + "." + ext) for ext in (("blend", "json") if scene_only else ("png", "blend", "json"))}
    for path in paths.values():
        if path.exists() and not overwrite:
            raise FileExistsError(f"Already exists: {path}. Use overwrite=True or --overwrite.")
    prefix.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="nixie-render-") as temp:
        temp = Path(temp)
        config_path = temp / "config.json"
        config.save(config_path)
        command = [executable, "--background", "--factory-startup", "--python-exit-code", "1", "--python", str(Path(__file__).with_name("blender_entry.py")), "--", str(config_path), str(temp / "result"), str(prefix)]
        if scene_only:
            command.append("--scene-only")
        subprocess.run(command, check=True)
        if not scene_only:
            with (temp / "result.png").open("rb") as stream:
                header = stream.read(24)
            if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", header[16:24]) != (config.width, config.height):
                raise RuntimeError("Blender output is missing or has unexpected PNG dimensions")
        for ext, destination in paths.items():
            source = config_path if ext == "json" else temp / ("result." + ext)
            if not source.is_file() or source.stat().st_size == 0:
                raise RuntimeError(f"Blender did not produce {ext}")
        for ext, destination in paths.items():
            source = config_path if ext == "json" else temp / ("result." + ext)
            shutil.copy2(source, destination)
    return paths
