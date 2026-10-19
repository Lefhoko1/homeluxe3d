DRAKE 3-PIECE BEIGE LOUNGE SUITE — Blender / Three.js Asset Builder
SKU 714280

WHAT IS INCLUDED
- build_drake_lounge_suite.py
- textures/leather_basecolor.png
- textures/leather_roughness.png
- textures/leather_normal.png

WHAT THE SCRIPT CREATES (inside output/)
- Drake_3Seater.glb
- Drake_2Seater_Console.glb
- Drake_Recliner.glb
- Drake_Lounge_Suite.glb
- Drake_Lounge_Suite.blend

MODEL FEATURES
- 3-seater reclining-style sofa silhouette
- 2-seater loveseat with center storage console and 2 stainless cup holders
- single recliner chair
- beige leather PBR material with base-color, roughness and normal maps
- rounded/subdivided cushion geometry
- separate leather headrests and visible seam details
- separate animatable console lid, recliner back and footrest objects
- glTF/GLB-friendly materials for Three.js

HOW CLAUDE CODE OR VS CODE CAN BUILD IT
1. Keep this Python file and the textures folder together.
2. Install Blender 4.x.
3. Run from a terminal:

   blender --background --python build_drake_lounge_suite.py

4. The finished files appear in ./output/.

WINDOWS EXAMPLE
"C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe" --background --python build_drake_lounge_suite.py

RUN INSIDE BLENDER
- Open Blender.
- Scripting workspace > Open > build_drake_lounge_suite.py.
- Run Script.

THREE.JS EXAMPLE
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
loader.load('/models/Drake_3Seater.glb', (gltf) => {
  const sofa = gltf.scene;
  sofa.position.set(0, 0, 0);
  sofa.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(sofa);
});

RECOMMENDED THREE.JS RENDERING
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

For best visual quality, use an HDRI/environment map and realistic area/spot lighting.

NOTES
- The script builds the sofa procedurally from the supplied reference photos. Exact manufacturer CAD dimensions were not available, so proportions are visually matched rather than factory-measured.
- To animate the console or recliner, use objects named *_ANIMATABLE. They are intentionally separate meshes.
