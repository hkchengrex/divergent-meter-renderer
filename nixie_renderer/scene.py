"""Procedural geometry and materials. Import this module only inside Blender.

build_scene replaces the current scene; the public runner uses a fresh process.
"""
import json
import math
import bpy
from mathutils import Vector
from .config import RenderConfig
from .geometry import GEOMETRY

def build_scene(config):
    if bpy.app.version < (5, 2, 0):
        raise RuntimeError("This package requires Blender 5.2 or newer; tested with Blender 5.2")
    c=RenderConfig.from_dict(config.to_dict())
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    def mat(name,color,metal=0,rough=.3,emission=0):
     m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
     s=m.node_tree.nodes.get('Principled BSDF'); s.inputs['Base Color'].default_value=(*color,1)
     s.inputs['Metallic'].default_value=metal; s.inputs['Roughness'].default_value=rough
     s.inputs['Emission Color'].default_value=(*color,1); s.inputs['Emission Strength'].default_value=emission
     return m
    wire=mat('Unpowered nickel cathode',(.19,.22,.24),.85,.28)
    gas=mat('Orange neon discharge', c.glow_color,.1,.26,c.brightness)
    base=mat('Gloss black ceramic sockets',(.012,.015,.019),.4,.16)
    metal=mat('Polished black enclosure',(.018,.022,.028),.7,c.base_roughness)
    metal.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=.65
    metal.node_tree.nodes.get('Principled BSDF').inputs['Coat Roughness'].default_value=.09
    brass=mat('Champagne brass accents',(.48,.32,.14),.88,.2)
    pins=mat('Contact pins',(.3,.23,.13),.8,.26)
    floor=mat('Matte black stage',(.0001,.0001,.0001),0,c.floor_roughness)
    floor.node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value=c.reflection * .5
    glass=mat('Clear glass envelope',(.94,.98,1),0,c.glass_roughness)
    bs=glass.node_tree.nodes.get('Principled BSDF'); bs.inputs['Transmission Weight'].default_value=1; bs.inputs['IOR'].default_value=c.glass_ior
    bs.inputs['Specular IOR Level'].default_value=c.glass_reflection

    def curve(name,pts,r,material):
     cu=bpy.data.curves.new(name,'CURVE'); cu.dimensions='3D'; cu.resolution_u=12
     cu.bevel_depth=r; cu.bevel_resolution=3
     sp=cu.splines.new('POLY'); sp.points.add(len(pts)-1)
     for v,co in zip(sp.points,pts): v.co=(*co,1)
     ob=bpy.data.objects.new(name,cu); bpy.context.collection.objects.link(ob); ob.data.materials.append(material); return ob
    pi=math.pi
    glyphs=GEOMETRY['glyphs']

    def cylinder(name,loc,r,depth,material):
     bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=r,depth=depth,location=loc)
     ob=bpy.context.object; ob.name=name; ob.data.materials.append(material)
     be=ob.modifiers.new('Soft machined edges','BEVEL'); be.width=.018; be.segments=3
     ob.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
     for f in ob.data.polygons:f.use_smooth=True
     return ob
    def cube(name,loc,scale,material,bevel=.05):
     bpy.ops.mesh.primitive_cube_add(size=1,location=loc); ob=bpy.context.object; ob.name=name
     ob.dimensions=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
     ob.data.materials.append(material); mod=ob.modifiers.new('Rounded edges','BEVEL');mod.width=bevel;mod.segments=4
     ob.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return ob
    def envelope(x,name):
     # Surface of revolution with a domed top and small evacuation tip.
     profile=GEOMETRY['profile']
     verts=[]; faces=[]; n=80
     for r,z in profile:
      for j in range(n):
       t=2*pi*j/n;verts.append((x+r*math.cos(t),r*math.sin(t),z))
     for k in range(len(profile)-1):
      for j in range(n):faces.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j))
     me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
     ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);ob.data.materials.append(glass)
     sol=ob.modifiers.new('Glass wall 1.2 mm','SOLIDIFY');sol.thickness=.0012
     for f in me.polygons:f.use_smooth=True

    reading=c.reading
    pitch=GEOMETRY['pitch']
    for i,selected in enumerate(reading):
     x=(i-(len(reading)-1)/2)*pitch; tag=f'Tube {i+1:02d}'
     cylinder(tag+' socket',(x,0,.29),.415,.24,base)
     cylinder(tag+' retaining rim',(x,0,.425),.392,.028,brass)
     cylinder(tag+' lower brass band',(x,0,.193),.419,.018,brass)
     for z in [.245,.27,.295]:
      curve(tag+' machined groove',[(x+.416*math.cos(t*2*pi/96),.416*math.sin(t*2*pi/96),z) for t in range(97)],.003,metal)
     envelope(x,tag+' glass')
     for dx in [-.29,.29]:curve(tag+' support',[(x+dx,.20,.46),(x+dx,.20,1.98)],.010,pins)
     for z in [.64,1.94]:curve(tag+' mica frame',[(x-.29,.20,z),(x+.29,.20,z)],.009,wire)
     dx,dy,dz=GEOMETRY['dot']
     # All eleven cathodes are present in EVERY tube, even when displaying the dot.
     curve(tag+' dot lead',[(x+dx,dy,.45),(x+dx,dy,dz)],.008,wire)
     bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=GEOMETRY['dot_radius'],location=(x+dx,dy,dz))
     dot=bpy.context.object;dot.name=tag+' cathode dot';dot.data.materials.append(wire)
     dot['digit']='.';dot['active']=selected=='.';dot['depth_layer']=-1
     if selected=='.':
      bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=GEOMETRY['dot_glow_radius'],location=(x+dx,dy,dz))
      bpy.context.object.name=tag+' discharge dot';bpy.context.object.data.materials.append(gas)
     # Fixed front-to-back order shared by every tube. Planes remain unchanged across readings.
     for layer,d in enumerate('0123456789'):
      y=GEOMETRY['layer_start']+layer*GEOMETRY['layer_step']
      for stroke,points in enumerate(glyphs[d]):
       points3=[(x+u,y,GEOMETRY['digit_center']+v) for u,v in points]
       ob=curve(f'{tag} cathode {d} stroke {stroke}',points3,GEOMETRY['wire_radius'],wire)
       ob['digit']=d;ob['active']=d==selected;ob['depth_layer']=layer
       if d==selected:curve(f'{tag} discharge {d} stroke {stroke}',points3,GEOMETRY['glow_radius'],gas)
      u,v=glyphs[d][0][0]
      curve(f'{tag} cathode {d} lead',[(x+u,y,GEOMETRY['digit_center']+v),(x+u,y,.48)],.0035,wire)
     # sparse side and rear anode cage; it does not cover the face of the digits
     for theta in [pi*.1,pi*.25,pi*.5,pi*.75,pi*.9]:
      xx=x+.32*math.cos(theta);yy=.32*math.sin(theta)
      curve(tag+' anode cage',[(xx,yy,.62),(xx,yy,1.99)],.0035,wire)

    width=len(reading)*pitch+.3
    cube('Meter enclosure',(0,0,.045),(width,1.05,.27),metal)
    cube('Thin brass perimeter inlay',(0,0,-.055),(width+.008,1.058,.018),brass,.009)
    cube('Recessed polished top plate',(0,0,.184),(width-.16,.93,.028),base,.013)
    for x in [-width/2+.16,width/2-.16]:
     for y in [-.37,.37]:cylinder('Enclosure screw',(x,y,.192),.038,.018,pins)
    cube('Stage',(0,0,-.18),(200,200,.1),floor)

    world=bpy.data.worlds.new('Dark studio');bpy.context.scene.world=world;world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.08,.12,.2,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=c.ambient_brightness
    def area(name,loc,power,color,size,target=(0,0,1)):
     bpy.ops.object.light_add(type='AREA',location=loc);ob=bpy.context.object;ob.name=name
     ob.data.energy=power;ob.data.color=color;ob.data.shape='RECTANGLE';ob.data.size=size;ob.data.size_y=3
     ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
    if c.studio_brightness > 0:
     area('Studio light',c.studio_position,c.studio_brightness,c.studio_color,c.studio_size,c.studio_target)
     bpy.context.object.data.size_y=c.studio_size_y
    bpy.ops.object.camera_add(location=c.camera_position);cam=bpy.context.object
    cam.rotation_euler=(Vector(c.camera_target)-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type=c.camera_type
    aspect=c.width/c.height
    cam.data.ortho_scale=c.camera_scale or (max(width+1.6,3.2*aspect) if aspect>=1 else max((width+1.6)/aspect,3.2))
    cam.data.lens=c.focal_length
    sc=bpy.context.scene;sc.camera=cam;sc.render.engine='CYCLES';sc.cycles.samples=c.samples;sc.cycles.seed=c.seed;sc.cycles.use_denoising=True
    sc.cycles.max_bounces=12;sc.cycles.transmission_bounces=8
    sc.render.resolution_x=c.width;sc.render.resolution_y=c.height;sc.render.resolution_percentage=100
    sc.render.image_settings.file_format='PNG';sc.view_settings.view_transform='AgX';sc.view_settings.exposure=c.exposure
    sc['reading']=reading;sc['nixie_config']=json.dumps(c.to_dict());sc['instructions']='Use nixie-render or the nixie_renderer Python API to regenerate; see embedded nixie-config.json.'
    settings=bpy.data.texts.new('nixie-config.json');settings.write(json.dumps(c.to_dict(),indent=2))
    sc.use_nodes=True
    tree=bpy.data.node_groups.new('Subtle neon bloom','CompositorNodeTree');sc.compositing_node_group=tree
    tree.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
    rl=tree.nodes.new('CompositorNodeRLayers');gl=tree.nodes.new('CompositorNodeGlare');gl.inputs['Type'].default_value='Fog Glow';gl.inputs['Quality'].default_value='High';gl.inputs['Threshold'].default_value=c.bloom_threshold
    out=tree.nodes.new('NodeGroupOutput');tree.links.new(rl.outputs['Image'],gl.inputs['Image']);tree.links.new(gl.outputs['Image'] if c.bloom else rl.outputs['Image'],out.inputs['Image'])
    return sc
