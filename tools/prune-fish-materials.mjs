// Remove maps unused by the runtime fish shader from already optimized GLBs.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune} from '@gltf-transform/functions';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
for(const path of process.argv.slice(2)){
 const doc=await io.read(path);
 for(const m of doc.getRoot().listMaterials())m.setMetallicRoughnessTexture(null).setNormalTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
 await doc.transform(prune());await io.write(path,doc);
}
