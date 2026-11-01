import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune} from '@gltf-transform/functions';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);let doc=await io.read('/tmp/tropical-school.glb');
for(const m of doc.getRoot().listMaterials()){m.setNormalTexture(null).setOcclusionTexture(null).setEmissiveTexture(null).setMetallicRoughnessTexture(null)}
for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives())for(const semantic of primitive.listSemantics())if(semantic.startsWith('TEXCOORD_')&&semantic!=='TEXCOORD_0'||semantic==='TANGENT')primitive.setAttribute(semantic,null);
await doc.transform(prune());await io.write('/tmp/tropical-pruned.glb',doc);
