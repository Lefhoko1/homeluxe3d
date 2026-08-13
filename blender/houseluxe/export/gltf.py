"""Per-component glTF export.

One collection in, one .glb out. This is the payoff for the component split:
because nothing crosses a category boundary, re-exporting `roof.glb` cannot
disturb `walls_exterior.glb`, and the three.js side can reload a single file.

The exporter's argument list changes between Blender releases, so options are
filtered against the operator's actual RNA rather than passed blind. That
keeps this working across upgrades instead of failing on an unknown keyword.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import bpy


@dataclass
class ExportResult:
    category: str
    path: str
    ok: bool
    size_bytes: int = 0
    error: str = ""

    @property
    def size_kb(self) -> float:
        return self.size_bytes / 1024.0


#: Options we would like. Anything the running Blender does not know about is
#: dropped rather than raising.
DESIRED_OPTIONS: dict[str, object] = {
    "export_format": "GLB",
    "use_selection": True,
    "export_apply": True,          # bake modifiers
    "export_yup": True,            # three.js is Y-up
    "export_materials": "EXPORT",
    "export_normals": True,
    "export_texcoords": True,
    "export_cameras": False,
    "export_lights": False,
    "export_animations": False,
    "export_extras": True,         # keeps custom properties
    "export_skins": False,
    "export_morph": False,

    # -- Draco mesh compression --------------------------------------------
    # Quantises and entropy-codes the vertex buffers. The decoder is served
    # from /draco/ and wired up in the three.js loader; a GLB written with
    # this on CANNOT be read by a loader without it.
    #
    # Quantisation is in bits per component. 14-bit position over this
    # scene's ~45m extent lands under 3mm of error -- far below anything
    # visible, and well inside the tolerance of a 90mm cornice.
    "export_draco_mesh_compression_enable": True,
    "export_draco_mesh_compression_level": 6,      # 0 fastest .. 10 smallest
    "export_draco_position_quantization": 14,
    "export_draco_normal_quantization": 10,
    "export_draco_texcoord_quantization": 12,
    "export_draco_generic_quantization": 12,
}


def _supported_options() -> dict[str, object]:
    """Drop any option this Blender's glTF exporter does not declare."""
    rna = bpy.ops.export_scene.gltf.get_rna_type()
    known = set(rna.properties.keys())
    return {k: v for k, v in DESIRED_OPTIONS.items() if k in known}


def _select_only(objects: list[bpy.types.Object]) -> bool:
    """Select exactly these objects. False if none could be selected."""
    bpy.ops.object.select_all(action="DESELECT")

    selected = 0
    for obj in objects:
        try:
            obj.select_set(True)
            selected += 1
        except RuntimeError:
            # Object is not in the active view layer.
            continue

    if selected:
        bpy.context.view_layer.objects.active = objects[0]
    return selected > 0


class GLBExporter:
    """Writes one GLB per component category."""

    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    def export_collection(
        self, category: str, objects: list[bpy.types.Object]
    ) -> ExportResult:
        path = os.path.join(self.output_dir, f"{category}.glb")

        if not objects:
            return ExportResult(category, path, False, error="no objects")

        if not _select_only(objects):
            return ExportResult(category, path, False, error="nothing selectable")

        options = _supported_options()
        try:
            bpy.ops.export_scene.gltf(filepath=path, **options)
        except Exception as exc:  # noqa: BLE001 - report, don't abort the batch
            return ExportResult(category, path, False, error=str(exc))

        if not os.path.exists(path):
            return ExportResult(category, path, False, error="exporter wrote no file")

        return ExportResult(category, path, True, size_bytes=os.path.getsize(path))

    def export_all(self, results) -> list[ExportResult]:
        exported: list[ExportResult] = []
        for result in results:
            if not result.exportable:
                continue
            exported.append(self.export_collection(result.category, result.objects))
        return exported


def report(exports: list[ExportResult]) -> str:
    lines = ["", "Exported models", "=" * 60]
    total = 0.0
    for item in exports:
        if item.ok:
            total += item.size_kb
            lines.append(f"  OK    {item.category + '.glb':<26} {item.size_kb:>8.1f} KB")
        else:
            lines.append(f"  FAIL  {item.category + '.glb':<26} {item.error}")
    lines.append("-" * 60)
    lines.append(f"  {'TOTAL':<32} {total:>8.1f} KB")
    return "\n".join(lines)
