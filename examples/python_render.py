from nixie_renderer import RenderConfig, render

# Set BLENDER_PATH or supply blender="/path/to/blender" to render().
settings = RenderConfig(reading="0.123456", width=960, height=540, samples=24)
print(render(settings, "renders/python-example"))
