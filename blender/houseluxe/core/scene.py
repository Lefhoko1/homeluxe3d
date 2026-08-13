"""Scene assembly.

The builder is the only object that touches Blender's scene graph. Components
make geometry; the builder decides where it lives. That split is what keeps a
component from accidentally depending on the existence of another one.
"""

from __future__ import annotations

from dataclasses import dataclass

import bpy

from .component import BuildContext, Component
from ..config.plan import HousePlan
from ..config.site import SiteSpec
from ..materials.library import MaterialLibrary
from . import mesh as meshutil


@dataclass
class BuildResult:
    category: str
    label: str
    collection: bpy.types.Collection
    objects: list[bpy.types.Object]
    exportable: bool


ROOT_COLLECTION = "HouseLuxe"


def purge_scene() -> None:
    """Reset the file to an empty scene.

    The build is generative and idempotent: every run starts from nothing so
    a rebuild can never accumulate duplicate geometry.
    """
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)

    # Orphaned datablocks would otherwise survive and bloat the .blend.
    for datablock in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(datablock):
            if item.users == 0:
                datablock.remove(item)


def _get_root() -> bpy.types.Collection:
    root = bpy.data.collections.get(ROOT_COLLECTION)
    if root is None:
        root = bpy.data.collections.new(ROOT_COLLECTION)
        bpy.context.scene.collection.children.link(root)
    return root


class SceneBuilder:
    """Runs a list of Components into a clean, organised scene."""

    def __init__(
        self,
        plan: HousePlan,
        materials: MaterialLibrary,
        site: SiteSpec | None = None,
    ):
        self.plan = plan
        self.materials = materials
        self.site = site
        self.results: list[BuildResult] = []
        self.warnings: list[str] = []

    def build(self, components: list[Component]) -> list[BuildResult]:
        """Build these components and return ONLY their results.

        `self.results` accumulates across calls so `report()` can cover the
        whole scene, but the return value is scoped to this call -- callers
        batch by it (house to one directory, site to another), and handing
        back the accumulated list would put every part in every batch.
        """
        root = _get_root()
        produced: list[BuildResult] = []

        for component in components:
            collection = bpy.data.collections.new(component.category)
            root.children.link(collection)

            ctx = BuildContext(
                plan=self.plan,
                materials=self.materials,
                collection=collection,
                site=self.site,
            )

            objects = component.build(ctx)

            for obj in objects:
                # Finishing passes every component wants and none should
                # have to remember: sane normals, faceted shading, UVs.
                meshutil.recalc_normals(obj)
                meshutil.shade_flat(obj)
                meshutil.uv_project_box(obj)
                collection.objects.link(obj)

            self.warnings.extend(ctx.warnings)
            produced.append(
                BuildResult(
                    category=component.category,
                    label=component.label,
                    collection=collection,
                    objects=objects,
                    exportable=component.exportable,
                )
            )

        self.results.extend(produced)
        return produced

    def report(self) -> str:
        lines = ["", "Build report", "=" * 60]
        total_objects = 0
        total_tris = 0

        for result in self.results:
            tris = 0
            for obj in result.objects:
                obj.data.calc_loop_triangles()
                tris += len(obj.data.loop_triangles)
            total_objects += len(result.objects)
            total_tris += tris
            flag = "" if result.exportable else "  (not exported)"
            lines.append(
                f"  {result.label:<24} {len(result.objects):>3} objects"
                f"  {tris:>6} tris{flag}"
            )

        lines.append("-" * 60)
        lines.append(f"  {'TOTAL':<24} {total_objects:>3} objects  {total_tris:>6} tris")

        if self.warnings:
            lines.append("")
            lines.append("Warnings")
            lines.append("-" * 60)
            for warning in self.warnings:
                lines.append(f"  ! {warning}")

        return "\n".join(lines)
