// Does the tour character rig and walk? Run: node scratch/rig-check.mjs
//
// The skinned model is loaded exactly as the app loads it; node has no image
// decoder, so texture decoding is stubbed out - geometry, skeleton and weights
// are what matter here. The jointed model is draco-compressed and needs a
// browser worker, so the rigid path is exercised on a stand-in built to the
// same naming convention, which is what `rigCharacter` actually keys on.
import { readFileSync } from "node:fs";

// Enough of a DOM for the texture path to resolve and be ignored.
class FakeImage {
  constructor() { this.width = 1; this.height = 1; }
  set src(_value) { queueMicrotask(() => this.onload?.()); }
  addEventListener(type, fn) { if (type === "load") queueMicrotask(fn); }
  removeEventListener() {}
}
globalThis.self = globalThis;   // the meshopt decoder expects a worker global
globalThis.Image = FakeImage;
globalThis.document = { createElementNS: () => new FakeImage(), createElement: () => new FakeImage() };
globalThis.URL.createObjectURL = () => "blob:stub";
globalThis.URL.revokeObjectURL = () => {};

const THREE = await import("three");
const { MeshoptDecoder } = await import("three/examples/jsm/libs/meshopt_decoder.module.js");
const { GLTFLoader } = await import("three-stdlib");
const { createGait, rigCharacter } = await import("../components/homeluxe/tour/gait.js");

const walk = (label, scene) => {
  let skinned = 0;
  let meshes = 0;
  const bones = [];
  scene.traverse((child) => {
    if (child.isSkinnedMesh) skinned += 1;
    else if (child.isMesh) meshes += 1;
    if (child.isBone) bones.push(child.name);
  });
  const height = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3()).y;

  const rig = rigCharacter(scene);
  if (!rig) {
    console.log(`${label}: NO RIG (skinned ${skinned}, meshes ${meshes})`);
    return false;
  }
  const gait = createGait(rig);
  for (let i = 0; i < 60; i += 1) {
    gait.update(1 / 60, { speed: 1.2, turnRate: 0.2, lookYaw: 0.4, lookPitch: -0.1 });
  }
  const angle = (joint) => (joint
    ? [joint.rotation.x, joint.rotation.y, joint.rotation.z].map((v) => +v.toFixed(3)).join(", ")
    : "absent");
  console.log(`${label}`);
  console.log(`  kind      : ${rig.skinned ? "skinned skeleton" : "rigid parts"}   height ${height.toFixed(3)}m`);
  console.log(`  contents  : ${skinned} skinned mesh, ${meshes} plain meshes, bones [${bones.join(", ") || "none"}]`);
  console.log(`  joints    : ${Object.keys(rig.joints).join(", ")}`);
  console.log(`  legs      : L(${angle(rig.joints.legLeft)})  R(${angle(rig.joints.legRight)})`);
  console.log(`  arms      : L(${angle(rig.joints.armLeft)})  R(${angle(rig.joints.armRight)})`);
  console.log(`  head      : ${angle(rig.joints.head)}`);
  console.log(`  body      : dip ${rig.body.position.y.toFixed(4)}m, lean ${rig.body.rotation.x.toFixed(4)}`);

  const legs = rig.joints.legLeft.rotation.x * rig.joints.legRight.rotation.x < 0
    && Math.abs(rig.joints.legLeft.rotation.x) > 0.01;
  const dips = rig.body.position.y < 0;
  const looks = !rig.joints.head || Math.abs(rig.joints.head.rotation.y) > 0.01;
  console.log(`  -> legs stride in opposition: ${legs}, body dips: ${dips}, head turns: ${looks}`);
  return legs && dips && looks;
};

const loadGlb = async (path) => {
  const file = readFileSync(path);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await new Promise((resolve, reject) =>
    loader.parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), "", resolve, reject));
  return gltf.scene;
};

/** A stand-in for the jointed model: the rig is found by these names alone. */
const jointedStandIn = () => {
  const root = new THREE.Group();
  const box = new THREE.BoxGeometry(0.1, 0.4, 0.1);
  ["leg_left", "shoe_left", "leg_right", "shoe_right", "arm_left", "hand_left",
    "arm_right", "hand_right", "head", "nose", "torso", "hips", "neck"].forEach((name) => {
    const mesh = new THREE.Mesh(box, new THREE.MeshStandardMaterial());
    mesh.name = `character${name}`;   // the loader strips the dot from "character.leg_left"
    root.add(mesh);
  });
  return root;
};

const results = [];
try {
  results.push(walk("public/models/tour/woman.glb (skinned)", await loadGlb("public/models/tour/woman.glb")));
} catch (error) {
  console.log(`woman.glb FAILED: ${error}`);
  results.push(false);
}
results.push(walk("jointed stand-in (regression)", jointedStandIn()));
console.log(results.every(Boolean) ? "\nALL GOOD" : "\nSOMETHING IS WRONG");
process.exitCode = results.every(Boolean) ? 0 : 1;
