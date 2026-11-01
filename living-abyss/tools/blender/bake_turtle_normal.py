"""Bake a tangent-space normal map from der_On's original CC BY turtle.

Run Blender 4.3 from the project root:
  blender --background --factory-startup --disable-autoexec --python-exit-code 1 \
    --python tools/blender/bake_turtle_normal.py

This uses the original archive's mesh and object-space normal image, not any
separately distributed derivative normal map. It requires Blender with Cycles.
Afterward run rig_ocean_turtle.py to pack the new map into the .blend and GLB.
"""
import hashlib
import tempfile
import zipfile
from pathlib import Path
import bpy

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'assets/source/ocean-turtle'
archive=SOURCE/'Ocean_Turtle.zip'
expected='0aad8ad0dd9cfd232588e81b3ab3d36db0a533268cac139de2be5b69d256f1e3'
assert hashlib.sha256(archive.read_bytes()).hexdigest()==expected, 'Unexpected turtle source archive'

with tempfile.TemporaryDirectory(prefix='turtle-original-') as tmp:
    with zipfile.ZipFile(archive) as z:
        z.extract('turtle.blend',tmp)
        z.extract('tex/turtle_normal.png',tmp)
    bpy.ops.wm.open_mainfile(filepath=str(Path(tmp)/'turtle.blend'),load_ui=False,use_scripts=False)
    body=bpy.data.objects['body']
    assert body.type=='MESH' and body.data.uv_layers.active
    for obj in bpy.context.scene.objects:obj.select_set(False)
    body.select_set(True);bpy.context.view_layer.objects.active=body
    for poly in body.data.polygons:poly.use_smooth=True

    material=bpy.data.materials.new('Object normal to tangent normal');material.use_nodes=True
    tree=material.node_tree
    shader=tree.nodes.get('Principled BSDF')
    source=tree.nodes.new('ShaderNodeTexImage')
    source.image=bpy.data.images.load(str(Path(tmp)/'tex/turtle_normal.png'),check_existing=False)
    source.image.colorspace_settings.name='Non-Color'
    mapping=tree.nodes.new('ShaderNodeNormalMap');mapping.space='OBJECT';mapping.inputs['Strength'].default_value=1
    tree.links.new(source.outputs['Color'],mapping.inputs['Color'])
    tree.links.new(mapping.outputs['Normal'],shader.inputs['Normal'])

    result=bpy.data.images.new('Independent turtle tangent normal',width=1024,height=1024,alpha=False,float_buffer=False)
    result.colorspace_settings.name='Non-Color'
    destination=tree.nodes.new('ShaderNodeTexImage');destination.image=result
    tree.nodes.active=destination
    body.data.materials.clear();body.data.materials.append(material)
    for poly in body.data.polygons:poly.material_index=0

    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=1
    scene.render.bake.normal_space='TANGENT';scene.render.bake.margin=12
    bpy.ops.object.bake(type='NORMAL',normal_space='TANGENT',use_clear=True,margin=12)
    result.filepath_raw=str(SOURCE/'normal.png');result.file_format='PNG';result.save()
    print('Independently baked from original asset:',result.filepath_raw)
