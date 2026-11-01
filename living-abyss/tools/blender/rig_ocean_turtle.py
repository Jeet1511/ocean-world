"""Build a rigged game GLB from der_On's CC BY 3.0 Ocean Turtle.

Run Blender 4.3 with:
 blender --background --factory-startup --disable-autoexec --python tools/blender/rig_ocean_turtle.py
Uses the original source ZIP, resized original color/eyelid images, and the
independently baked map from bake_turtle_normal.py. Produces an editable,
packed .blend and a browser GLB with an authored flipper swim cycle. The simple
position-derived weights and stroke are a game approximation, not motion capture.
"""
import math, tempfile, zipfile
from pathlib import Path
import bpy
from mathutils import Vector, Quaternion

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'assets/source/ocean-turtle'
OUTPUT=ROOT/'assets/models/sea_turtle'
OUTPUT.mkdir(parents=True,exist_ok=True)

with tempfile.TemporaryDirectory(prefix='reef-turtle-') as tmp:
    with zipfile.ZipFile(SOURCE/'Ocean_Turtle.zip') as z:
        z.extract('turtle.blend',tmp)
    bpy.ops.wm.open_mainfile(filepath=str(Path(tmp)/'turtle.blend'),load_ui=False,use_scripts=False)
    bpy.context.view_layer.update()
    deps=bpy.context.evaluated_depsgraph_get()
    originals=[o for o in bpy.data.objects if o.type=='MESH']
    created=[]
    for obj in originals:
        evaluated=obj.evaluated_get(deps)
        mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=deps)
        mesh.transform(obj.matrix_world)
        new=bpy.data.objects.new('game_'+obj.name,mesh)
        bpy.context.scene.collection.objects.link(new);created.append(new)
    # Remove old rig-free meshes, lights and cameras, leaving the evaluated UV geometry.
    for obj in list(bpy.data.objects):
        if obj not in created:bpy.data.objects.remove(obj,do_unlink=True)

    def image_mat(name,image_path=None,normal_path=None,base=(1,1,1,1),rough=.75):
        mat=bpy.data.materials.new(name);mat.use_nodes=True
        bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=base
        bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=0
        if image_path:
            tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(image_path),check_existing=True)
            mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
        if normal_path:
            normal_tex=mat.node_tree.nodes.new('ShaderNodeTexImage');normal_tex.image=bpy.data.images.load(str(normal_path),check_existing=True)
            normal_tex.image.colorspace_settings.name='Non-Color'
            normal=mat.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.65
            mat.node_tree.links.new(normal_tex.outputs['Color'],normal.inputs['Color'])
            mat.node_tree.links.new(normal.outputs['Normal'],bs.inputs['Normal'])
        return mat
    skin=image_mat('Turtle skin and shell',SOURCE/'color.jpg',SOURCE/'normal.png')
    lids=image_mat('Turtle eyelids',SOURCE/'eyelid.jpg',rough=.76)
    eyes=image_mat('Turtle eyes',base=(.008,.013,.01,1),rough=.22)
    for obj in created:
        obj.data.materials.clear();obj.data.materials.append(skin if obj.name=='game_body' else eyes if 'eyeball' in obj.name else lids)
        for poly in obj.data.polygons:poly.use_smooth=True
    def join_group(which,new_name):
        subset=[o for o in created if which(o)]
        bpy.ops.object.select_all(action='DESELECT')
        for obj in subset:obj.select_set(True)
        bpy.context.view_layer.objects.active=subset[0]
        bpy.ops.object.join();subset[0].name=new_name
        return subset[0]
    body=next(o for o in created if o.name=='game_body')
    eye_obj=join_group(lambda o:'eyeball' in o.name,'Turtle_eyes')
    # References to joined objects are invalid in bpy; discover remaining lids anew.
    lids_list=[o for o in bpy.context.scene.objects if o.name.startswith('game_') and 'eyelid' in o.name]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in lids_list:obj.select_set(True)
    bpy.context.view_layer.objects.active=lids_list[0];bpy.ops.object.join();lids_obj=lids_list[0];lids_obj.name='Turtle_eyelids'
    meshes=[body,eye_obj,lids_obj]

    bpy.ops.object.select_all(action='DESELECT')
    armdata=bpy.data.armatures.new('Turtle swim rig');arm=bpy.data.objects.new('Turtle swim rig',armdata)
    bpy.context.scene.collection.objects.link(arm);bpy.context.view_layer.objects.active=arm;arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    root=armdata.edit_bones.new('body');root.head=(0,-.32,0);root.tail=(0,.32,0)
    definitions=[('front_L',1,(.40,.29,.015)),('front_R',-1,(-.40,.29,.015)),
                 ('rear_L',1,(.31,-.48,-.025)),('rear_R',-1,(-.31,-.48,-.025))]
    for name,side,pivot in definitions:
        bone=armdata.edit_bones.new(name);bone.head=pivot;bone.tail=(pivot[0]+side*.32,pivot[1],pivot[2]);bone.parent=root
    bpy.ops.object.mode_set(mode='OBJECT')
    def smooth(a,b,x):
        t=min(1,max(0,(x-a)/(b-a)));return t*t*(3-2*t)
    total_by_bone={name:0 for name,_,_ in definitions}
    for obj in meshes:
        groups={name:obj.vertex_groups.new(name=name) for name in ['body']+[x[0] for x in definitions]}
        for vertex in obj.data.vertices:
            v=vertex.co
            front=smooth(.36,.60,abs(v.x))*smooth(-.02,.16,v.y) if obj==body else 0
            rear=smooth(.24,.48,abs(v.x))*(1-smooth(-.48,-.32,v.y)) if obj==body else 0
            index=(0 if front>=rear else 2)+(0 if v.x>=0 else 1);weight=max(front,rear)
            groups['body'].add([vertex.index],max(0,1-weight),'REPLACE')
            if weight>.00001:
                name=definitions[index][0];groups[name].add([vertex.index],weight,'REPLACE');total_by_bone[name]+=1
        modifier=obj.modifiers.new('Turtle flippers','ARMATURE');modifier.object=arm;obj.parent=arm
    assert all(count>10 for count in total_by_bone.values()),total_by_bone

    # Both front paddles power down together, then recover more slowly; small
    # rear strokes act like rudders. Rotate about Blender's forward (+Y) axis.
    scene=bpy.context.scene;scene.render.fps=24;scene.frame_start=1;scene.frame_end=49
    for name,side,_ in definitions:
        pose=arm.pose.bones[name];pose.rotation_mode='QUATERNION'
        rest=pose.bone.matrix_local.to_quaternion()
        amounts=[(1,-.26),(10,.42),(21,.28),(35,-.12),(49,-.26)]
        if name.startswith('rear_'):amounts=[(f,a*.30) for f,a in amounts]
        for frame,amount in amounts:
            q=Quaternion(Vector((0,1,0)),side*amount)
            pose.rotation_quaternion=rest.inverted()@q@rest
            pose.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=name)
    arm.animation_data.action.name='Gentle flipper swim'
    scene.frame_set(1)
    # Discard unused legacy image datablocks whose old //tex paths are absent;
    # the current materials use the explicitly preserved, resized maps above.
    for image in list(bpy.data.images):
        if image.filepath.startswith('//tex/'):
            bpy.data.images.remove(image,do_unlink=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'ocean_turtle_swim.blend'))
    bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
    for obj in meshes:obj.select_set(True)
    bpy.context.view_layer.objects.active=arm
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT/'ocean-turtle.glb'),export_format='GLB',use_selection=True,
                              export_animations=True,export_animation_mode='ACTIONS',export_yup=True)
    print('Saved turtle. Weighted vertices by flipper:',total_by_bone)
