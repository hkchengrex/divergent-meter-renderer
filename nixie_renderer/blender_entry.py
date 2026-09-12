"""Private entry point executed by Blender, not ordinary Python."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from nixie_renderer.config import RenderConfig
from nixie_renderer.scene import build_scene
import bpy

args = sys.argv[sys.argv.index("--") + 1:]
config = RenderConfig.load(args[0])
temp_prefix, final_prefix = args[1:3]
scene = build_scene(config)
scene.render.filepath = final_prefix + ".png"
bpy.ops.wm.save_as_mainfile(filepath=temp_prefix + ".blend")
if "--scene-only" not in args:
    scene.render.filepath = temp_prefix + ".png"
    bpy.ops.render.render(write_still=True)
