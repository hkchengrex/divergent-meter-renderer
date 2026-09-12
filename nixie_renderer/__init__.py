"""The public API works in ordinary Python; Blender is launched separately."""
from .config import RenderConfig
from .runner import render

__all__ = ["RenderConfig", "render"]
__version__ = "0.2.0"
