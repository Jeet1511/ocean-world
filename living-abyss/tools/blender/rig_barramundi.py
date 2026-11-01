"""Rig the CC0 Khronos/Microsoft Barramundi sample for the Living Abyss.
Requires Blender 4.x and an input original GLB; see asset manifest.
Output remains an approximation, not a hand-weighted anatomical production rig.
Usage: blender -b -t 1 --python rig_barramundi.py -- INPUT_GLB SOURCE_BLEND OUTPUT_GLB
"""
import bpy, math, sys
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]
source,blend_out,glb_out=args
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=source)
fish=next(o for o in bpy.context.scene.objects if o.type=='MESH');fish.name='BarramundiBody'
# Reduce the original 2K PBR maps to 1K to honour the workspace budget.
for im in bpy.data.images:
 if im.size[0]>1024:
  im.scale(1024,1024)
  im.file_format='PNG'
  im.pack()
# Original Blender axis: length Y, head at +Y and tail at -Y.
arm=bpy.data.armatures.new('BarramundiSkeleton');rig=bpy.data.objects.new('BarramundiRig',arm)
bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
centers=[.17,.06,-.06,-.16,-.25,-.32]
names=['head','front_body','mid_body','rear_body','caudal_peduncle','tail']
previous=None
for i,name in enumerate(names):
 bone=arm.edit_bones.new(name);bone.head=(0,centers[i],.13);bone.tail=(0,centers[i]-.075,.13)
 if previous:bone.parent=previous
 previous=bone
bpy.ops.object.mode_set(mode='OBJECT')
for name in names:fish.vertex_groups.new(name=name)
for vertex in fish.data.vertices:
 y=vertex.co.y
 if y>=centers[0]:fish.vertex_groups[0].add([vertex.index],1,'REPLACE');continue
 if y<=centers[-1]:fish.vertex_groups[-1].add([vertex.index],1,'REPLACE');continue
 for i in range(len(centers)-1):
  if centers[i]>=y>=centers[i+1]:
   t=(centers[i]-y)/(centers[i]-centers[i+1]);fish.vertex_groups[i].add([vertex.index],1-t,'REPLACE');fish.vertex_groups[i+1].add([vertex.index],t,'REPLACE');break
mod=fish.modifiers.new('Swimming deformation','ARMATURE');mod.object=rig;fish.parent=rig
# Five-bone travelling wave; loops over 48 frames. Fin-specific articulation
# is not yet implemented because this source is a single unified mesh.
for j,name in enumerate(names):
 pose=rig.pose.bones[name];pose.rotation_mode='XYZ'
 amplitude=[.012,.035,.065,.11,.16,.19][j]
 for frame in range(1,50,4):
  pose.rotation_euler[2]=amplitude*math.sin(2*math.pi*(frame-1)/48-j*.58)
  pose.keyframe_insert(data_path='rotation_euler',frame=frame,group=name)
if rig.animation_data and rig.animation_data.action:rig.animation_data.action.name='Swim_Cruise'
bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=49;bpy.context.scene.render.fps=24;bpy.context.scene.frame_set(1)
# Store editable source with its textures packed.
bpy.ops.wm.save_as_mainfile(filepath=blend_out)
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);fish.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=glb_out,export_format='GLB',use_selection=True,export_animations=True,export_frame_range=True,export_apply=False)
print('RIGGED',len(fish.data.vertices),'vertices',len(fish.data.polygons),'polygons',len(arm.bones),'bones',rig.animation_data.action.name)
