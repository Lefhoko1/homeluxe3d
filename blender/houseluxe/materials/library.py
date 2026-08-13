"""Material library.

Materials are declared as data and built on demand. Nothing else in the
codebase constructs a material, so "repaint the house" is an edit to the
`FINISHES` table and a re-export -- no geometry is touched.

Only Principled BSDF inputs that survive the glTF round-trip are used
(base colour, metallic, roughness, alpha, emission), so what you see in
Blender is what three.js renders.
"""

from __future__ import annotations

from dataclasses import dataclass

import bpy


@dataclass(frozen=True)
class Finish:
    """A physically-based surface, in terms glTF understands."""

    name: str
    base_color: tuple[float, float, float]
    roughness: float = 0.8
    metallic: float = 0.0
    alpha: float = 1.0
    ior: float = 1.45

    @property
    def is_transparent(self) -> bool:
        return self.alpha < 1.0


# The finishes schedule, straight off the MATERIALS / FINISHES table on the
# elevation sheet. sRGB values are eyeballed from the renders.
FINISHES: dict[str, Finish] = {
    # -- Structure ---------------------------------------------------------
    "brick_face":     Finish("brick_face",     (0.729, 0.671, 0.573), roughness=0.90),
    "concrete_slab":  Finish("concrete_slab",  (0.545, 0.541, 0.525), roughness=0.85),
    "plaster_white":  Finish("plaster_white",  (0.902, 0.894, 0.874), roughness=0.75),
    # Kept separate from the walls so the ceiling can be repainted on its own.
    "ceiling_white":  Finish("ceiling_white",  (0.945, 0.945, 0.941), roughness=0.85),

    # -- Roof --------------------------------------------------------------
    "roof_metal":     Finish("roof_metal",     (0.153, 0.161, 0.173), roughness=0.45, metallic=0.65),
    "fascia_gutter":  Finish("fascia_gutter",  (0.125, 0.133, 0.145), roughness=0.40, metallic=0.55),

    # -- Openings ----------------------------------------------------------
    "alu_dark":       Finish("alu_dark",       (0.098, 0.102, 0.110), roughness=0.35, metallic=0.85),
    "glass":          Finish("glass",          (0.780, 0.850, 0.870), roughness=0.05, alpha=0.22),
    "timber_door":    Finish("timber_door",    (0.286, 0.161, 0.086), roughness=0.45),
    "door_painted":   Finish("door_painted",   (0.925, 0.918, 0.902), roughness=0.55),
    "garage_panel":   Finish("garage_panel",   (0.180, 0.188, 0.200), roughness=0.50, metallic=0.40),

    # -- Floor finishes ----------------------------------------------------
    "tile":           Finish("tile",           (0.812, 0.804, 0.788), roughness=0.25),
    # Tubod Enterprises PYC61001 Carrara polished porcelain. The real texture
    # is applied in three.js; this is the flat fallback colour, kept close to
    # the photograph so an untextured render still reads correctly.
    "tile_pyc61001":  Finish("tile_pyc61001",  (0.878, 0.882, 0.894), roughness=0.14),
    "carpet":         Finish("carpet",         (0.451, 0.427, 0.396), roughness=0.95),
    "timber":         Finish("timber",         (0.478, 0.318, 0.180), roughness=0.40),

    # -- Trim --------------------------------------------------------------
    "porch_column":   Finish("porch_column",   (0.937, 0.925, 0.898), roughness=0.60),

    # -- Site / landscaping ------------------------------------------------
    "lawn":            Finish("lawn",            (0.196, 0.353, 0.129), roughness=0.98),
    "soil":            Finish("soil",            (0.235, 0.176, 0.125), roughness=1.00),
    "paving":          Finish("paving",          (0.706, 0.686, 0.647), roughness=0.80),
    "paving_concrete": Finish("paving_concrete", (0.612, 0.604, 0.588), roughness=0.85),
    "mulch":           Finish("mulch",           (0.196, 0.126, 0.082), roughness=1.00),
    "coping":          Finish("coping",          (0.871, 0.851, 0.804), roughness=0.50),
    "pool_tile":       Finish("pool_tile",       (0.125, 0.443, 0.616), roughness=0.15),
    # Alpha rather than full transmission: the water is a surface, and glTF
    # transmission is expensive for something this large.
    "pool_water":      Finish("pool_water",      (0.086, 0.404, 0.545),
                              roughness=0.05, alpha=0.62),
    "foliage":         Finish("foliage",         (0.157, 0.333, 0.118), roughness=0.92),
    "foliage_light":   Finish("foliage_light",   (0.243, 0.443, 0.153), roughness=0.90),
    "hedge":           Finish("hedge",           (0.129, 0.278, 0.106), roughness=0.95),
    "trunk":           Finish("trunk",           (0.243, 0.169, 0.106), roughness=0.90),
    "fence_timber":    Finish("fence_timber",    (0.400, 0.286, 0.180), roughness=0.85),

    # -- Retail products ---------------------------------------------------
    "leather_taupe":   Finish("leather_taupe",   (0.529, 0.478, 0.420), roughness=0.55),
    "furniture_foot":  Finish("furniture_foot",  (0.106, 0.078, 0.055), roughness=0.45),
    "timber_dark":     Finish("timber_dark",     (0.204, 0.114, 0.063), roughness=0.40),
    "cushion_teal":    Finish("cushion_teal",    (0.102, 0.267, 0.259), roughness=0.85),
    "cushion_sage":    Finish("cushion_sage",    (0.353, 0.412, 0.310), roughness=0.85),
    "jute":            Finish("jute",            (0.706, 0.588, 0.404), roughness=0.95),

    # -- Tour character ----------------------------------------------------
    "character_skin":     Finish("character_skin",     (0.769, 0.573, 0.435), roughness=0.70),
    "character_shirt":    Finish("character_shirt",    (0.153, 0.353, 0.514), roughness=0.80),
    "character_trousers": Finish("character_trousers", (0.196, 0.212, 0.259), roughness=0.85),
    "character_shoes":    Finish("character_shoes",    (0.098, 0.090, 0.086), roughness=0.60),
}


class MaterialLibrary:
    """Creates each material once and hands out the same datablock after."""

    def __init__(self, finishes: dict[str, Finish] | None = None):
        self._finishes = finishes if finishes is not None else FINISHES
        self._cache: dict[str, bpy.types.Material] = {}

    def get(self, name: str) -> bpy.types.Material:
        if name in self._cache:
            return self._cache[name]

        finish = self._finishes.get(name)
        if finish is None:
            raise KeyError(
                f"unknown finish {name!r}; known finishes: "
                f"{', '.join(sorted(self._finishes))}"
            )

        material = self._build(finish)
        self._cache[name] = material
        return material

    def _build(self, finish: Finish) -> bpy.types.Material:
        material = bpy.data.materials.new(finish.name)
        material.use_nodes = True

        bsdf = material.node_tree.nodes.get("Principled BSDF")
        r, g, b = finish.base_color
        bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
        bsdf.inputs["Roughness"].default_value = finish.roughness
        bsdf.inputs["Metallic"].default_value = finish.metallic
        bsdf.inputs["IOR"].default_value = finish.ior
        bsdf.inputs["Alpha"].default_value = finish.alpha

        if finish.is_transparent:
            material.blend_method = "BLEND"
            material.use_backface_culling = False

        return material

    def assign(self, obj: bpy.types.Object, name: str) -> None:
        """Give an object a single material slot."""
        obj.data.materials.clear()
        obj.data.materials.append(self.get(name))
