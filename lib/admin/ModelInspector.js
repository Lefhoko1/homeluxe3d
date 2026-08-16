/**
 * Read a .glb before it is uploaded, and say whether it will behave.
 *
 * THE PROBLEM THIS SOLVES
 *
 * Every product built by blender/houseluxe obeys the placement contract --
 * origin at the footprint centre, sitting on the floor, facing +Y -- because
 * the builder makes it obey. A file dragged in from anywhere obeys nothing.
 * Exported from SketchUp it may be centred on its middle; from a scan it may
 * sit two hundred metres from the origin; from a CAD tool it may be in
 * centimetres. Placed as-is it floats, sinks, or rotates about a point
 * outside itself, and the admin drags it around wondering what is wrong.
 *
 * There are two ways to fix that: rewrite the file, or record the correction.
 *
 * Rewriting means re-exporting through GLTFExporter in the browser, which
 * decompresses any Draco geometry on the way -- so the file the visitor
 * downloads gets BIGGER as a result of us tidying it. Recording costs one
 * jsonb column and a wrapper Group at load time, and the original file is
 * served untouched. So: record.
 *
 * Everything measured here is measured once, at upload, and stored on the
 * variant. Nothing re-measures at runtime.
 */

import * as THREE from "three";
import { DRACOLoader, GLTFLoader } from "three-stdlib";

/** Same decoder the house uses, so there is one copy in public/draco/. */
const DRACO_DECODER_PATH = "/draco/";

/** Above this, warn. A visitor on a mid-range phone has a budget. */
export const TRIANGLE_WARNING = 150_000;

/** Beyond this a model is almost certainly in the wrong units. */
const IMPLAUSIBLE_METRES = 40;

export class ModelInspection {
  constructor(fields) {
    Object.assign(this, fields);
  }

  /** Problems that must be fixed. Upload is blocked while any remain. */
  get errors() {
    return this.problems.filter((p) => p.fatal);
  }

  /** Things worth knowing that do not block the upload. */
  get warnings() {
    return this.problems.filter((p) => !p.fatal);
  }

  get isUsable() {
    return this.errors.length === 0;
  }
}

/**
 * Parse a .glb File and measure it.
 *
 * @param {File} file
 * @returns {Promise<ModelInspection>}
 */
export async function inspectModel(file) {
  const url = URL.createObjectURL(file);
  const draco = new DRACOLoader().setDecoderPath(DRACO_DECODER_PATH);
  const loader = new GLTFLoader().setDRACOLoader(draco);

  try {
    const gltf = await new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, (error) =>
        reject(
          new Error(
            // The raw three.js message here is usually a JSON parse error,
            // which tells the admin nothing about what to do.
            `This file could not be read as a glTF binary. If it was exported ` +
            `as .gltf and renamed, re-export it as glTF Binary (.glb). ` +
            `(${error?.message ?? error})`
          )
        )
      );
    });

    const scene = gltf.scene;
    scene.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());

    let triangles = 0;
    let meshes = 0;
    const materials = new Set();
    scene.traverse((child) => {
      if (!child.isMesh) return;
      meshes += 1;
      const geometry = child.geometry;
      const count = geometry?.index
        ? geometry.index.count / 3
        : (geometry?.attributes?.position?.count ?? 0) / 3;
      triangles += Math.round(count);
      if (child.material?.name) materials.add(child.material.name);
    });

    // THE ANCHOR. Move the model so its footprint centre lands on the origin
    // and its lowest point on the floor. Applied by the loader as a wrapper
    // offset; a model already built to spec measures {0,0,0}.
    const anchor = {
      dx: -round4(centre.x),
      dy: -round4(box.min.y),
      dz: -round4(centre.z),
    };

    const problems = [];

    if (meshes === 0) {
      problems.push({
        fatal: true,
        message: "This file contains no meshes -- there is nothing to place.",
      });
    }

    if (!isFinite(size.x) || size.x === 0) {
      problems.push({
        fatal: true,
        message: "The model has no measurable size.",
      });
    } else if (Math.max(size.x, size.y, size.z) > IMPLAUSIBLE_METRES) {
      // Not fatal: a genuine 50m object is possible. But 1000x too big is the
      // single most common export mistake and it is worth naming.
      problems.push({
        fatal: false,
        message:
          `This model is ${size.x.toFixed(1)} x ${size.z.toFixed(1)} x ` +
          `${size.y.toFixed(1)} metres. glTF is always in METRES -- if this ` +
          `was exported in millimetres it will be a thousand times too big.`,
      });
    } else if (Math.max(size.x, size.y, size.z) < 0.05) {
      problems.push({
        fatal: false,
        message:
          `This model is only ${(size.x * 1000).toFixed(0)}mm across. ` +
          `Check the export units -- glTF is in metres.`,
      });
    }

    if (triangles > TRIANGLE_WARNING) {
      problems.push({
        fatal: false,
        message:
          `${triangles.toLocaleString("en-GB")} triangles. Anything much ` +
          `over ${TRIANGLE_WARNING.toLocaleString("en-GB")} makes the tour ` +
          `heavy on a phone -- consider decimating it.`,
      });
    }

    if (anchor.dx || anchor.dy || anchor.dz) {
      problems.push({
        fatal: false,
        message:
          `The model is not built at the origin. An offset of ` +
          `${(anchor.dx * 1000).toFixed(0)}, ${(anchor.dy * 1000).toFixed(0)}, ` +
          `${(anchor.dz * 1000).toFixed(0)} mm will be applied so it sits on ` +
          `the floor and turns about its own centre.`,
      });
    }

    // The catalogue quotes millimetres, as a shop would. glTF is in metres.
    const dimensions = {
      width: Math.round(size.x * 1000),
      height: Math.round(size.y * 1000),
      depth: Math.round(size.z * 1000),
    };

    // Free the parsed copy: this is a measurement, not a preview.
    scene.traverse((child) => {
      if (child.isMesh) child.geometry?.dispose();
    });

    return new ModelInspection({
      file,
      bytes: file.size,
      dimensions,
      anchor,
      triangles,
      meshes,
      materials: [...materials],
      problems,
    });
  } finally {
    URL.revokeObjectURL(url);
    draco.dispose();
  }
}

const round4 = (n) => Math.round(n * 10000) / 10000;

export default inspectModel;
