"""Create a static textured school LOD from the packed, editable barramundi rig.
Blender 4.3: blender -b -t 1 --python tools/blender/build_barramundi_school_lod.py -- SOURCE_BLEND OUTPUT_GLB
Runtime animation is a shader-driven tail wave; this is not the hero bone rig.
"""
import bpy,sys
from mathutils import Vector,Matrix
source,out=sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.open_mainfile(filepath=source)
ob=bpy.data.objects['BarramundiBody'];bpy.context.scene.frame_set(1)
# Use original undeformed mesh as a compact school LOD, keep original UVs.
for mod in list(ob.modifiers):ob.modifiers.remove(mod)
ob.parent=None;ob.matrix_world=Matrix.Identity(4)
ys=[v.co.y for v in ob.data.vertices];zs=[v.co.z for v in ob.data.vertices]
y0=(min(ys)+max(ys))/2;z0=(min(zs)+max(zs))/2;scale=2/(max(ys)-min(ys))
for v in ob.data.vertices:
 p=v.co.copy();v.co=Vector(((p.y-y0)*scale,p.x*scale,(p.z-z0)*scale))
for poly in ob.data.polygons:poly.flip();poly.use_smooth=True
bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
mod=ob.modifiers.new('school LOD',type='DECIMATE');mod.ratio=.45
bpy.ops.object.modifier_apply(modifier=mod.name)
# School shader uses only the source base-color map, so avoid exporting unused PBR maps.
source_mat=ob.data.materials[0]
color=None
for node in source_mat.node_tree.nodes:
 if node.type=='TEX_IMAGE' and node.image and node.image.colorspace_settings.name=='sRGB':color=node.image;break
if color is None:raise RuntimeError('Missing source color image')
mat=bpy.data.materials.new('School fish photo texture');mat.use_nodes=True
nodes=mat.node_tree.nodes;tex=nodes.new('ShaderNodeTexImage');tex.image=color
mat.node_tree.links.new(tex.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
ob.data.materials.clear();ob.data.materials.append(mat)
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',use_selection=True,export_animations=False)
print('School LOD',len(ob.data.vertices),'vertices',len(ob.data.polygons),'triangles')
