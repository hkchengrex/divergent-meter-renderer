"""Small real renders plus saved-scene checks. Requires a Blender executable."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from nixie_renderer import RenderConfig, render

p=argparse.ArgumentParser()
p.add_argument('--blender', required=True)
p.add_argument('--output', required=True)
a=p.parse_args()
out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
config=RenderConfig(reading='9.21',width=640,height=360,samples=12,
    camera_position=(2,-12,4),camera_target=(0,0,1.13),camera_type='PERSP',
    reflection=.65,floor_roughness=.08,glass_reflection=.15,glass_roughness=.12,
    studio_brightness=40,studio_position=(-3,-2,5),studio_target=(0,0,.8))
config.save(out/'input.json')
# Exercise actual CLI JSON overrides, including a leading zero and every numeral.
subprocess.run([sys.executable,'-m','nixie_renderer','--blender',a.blender,
    '--config',str(out/'input.json'),'--reading','0.123456789','--output',str(out/'studio'),
    '--camera-type','ORTHO','--overwrite'],cwd=ROOT,check=True)
# Exercise Python API, portrait framing, and light-free defaults without another render.
render(RenderConfig(reading='.',width=360,height=640,samples=8),out/'dark',
    blender=a.blender,scene_only=True,overwrite=True)
check_script=out/'inspect.py'
check_script.write_text('''import bpy, json, math
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
s=bpy.context.scene
c=json.loads(s['nixie_config'])
assert (s.render.resolution_x,s.render.resolution_y)==(c['width'],c['height'])
assert s.camera.data.type==c['camera_type']
assert (s.camera.location-Vector(c['camera_position'])).length < .0001
view=s.camera.rotation_euler.to_quaternion() @ Vector((0,0,-1))
assert view.dot((Vector(c['camera_target'])-s.camera.location).normalized()) > .9999
for i,character in enumerate(c['reading']):
    prefix='Tube %02d ' % (i+1)
    cathodes=[o for o in bpy.data.objects if o.name.startswith(prefix) and 'digit' in o]
    assert {o['digit'] for o in cathodes}==set('0123456789.')
    assert {o['digit'] for o in cathodes if o['active']}=={character}
    dot=bpy.data.objects[prefix+'cathode dot']
    assert abs(dot.location.x-((i-(len(c['reading'])-1)/2)*.94+.25)) < .0001
lights=[o for o in bpy.data.objects if o.type=='LIGHT']
if c['studio_brightness']:
    assert len(lights)==1
    light=lights[0]
    assert abs(light.data.energy-c['studio_brightness'])<.001
    direction=light.rotation_euler.to_quaternion() @ Vector((0,0,-1))
    assert direction.dot((Vector(c['studio_target'])-light.location).normalized()) > .9999
else:
    assert not lights
assert s.world.node_tree.nodes['Background'].inputs[1].default_value==c['ambient_brightness']
glass=bpy.data.materials['Clear glass envelope'].node_tree.nodes['Principled BSDF']
assert abs(glass.inputs['Roughness'].default_value-c['glass_roughness'])<.0001
assert abs(glass.inputs['Specular IOR Level'].default_value-c['glass_reflection'])<.0001
floor=bpy.data.materials['Matte black stage'].node_tree.nodes['Principled BSDF']
assert abs(floor.inputs['Specular IOR Level'].default_value-c['reflection']*.5)<.0001
gas=bpy.data.materials['Orange neon discharge'].node_tree.nodes['Principled BSDF']
assert gas.inputs['Emission Strength'].default_value==c['brightness']
if c['reading']=='.':
    points=[world_to_camera_view(s,s.camera,o.matrix_world@Vector(v)) for o in s.objects if o.type in {'MESH','CURVE'} and o.name!='Stage' for v in o.bound_box]
    assert all(0<p.x<1 and 0<p.y<1 for p in points)
print('PASS scene inspection:',c['reading'])
''')
for name in ('studio','dark'):
    subprocess.run([a.blender,'--background','--factory-startup',str(out/(name+'.blend')),
        '--python-exit-code','1','--python',str(check_script)],check=True)
print('PASS CLI render, Python API scene-only, configuration overrides, scene geometry and controls')
