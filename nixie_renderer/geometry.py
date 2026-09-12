"""Wire paths shared by the Blender renderer and browser editor."""
import json
from importlib.resources import files

GEOMETRY = json.loads(files('nixie_renderer').joinpath('data/geometry.json').read_text())
