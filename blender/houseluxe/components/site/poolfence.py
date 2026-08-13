"""Pool safety barrier.

A separate component from the boundary fence because it is a separate
requirement: the pool needs its own enclosure, since the boundary fence has
the house and the whole yard inside it.

Built as frameless glass panels between slim posts -- the usual modern
detail, and it keeps the pool visible from the house rather than walling it
off behind timber.

Posts and panels are joined into one object each, so the barrier is two
meshes (metal, glass) rather than sixty.
"""

from __future__ import annotations

import bpy

from ...config.site import PoolFence
from ...core import mesh as meshutil
from ...core.component import BuildContext, Component

#: Barrier sits on the terrace paving, whose top is the house floor level.
PAVING_LEVEL = 0.0

#: Gap under a compliant barrier is limited; 100mm is the usual maximum.
GROUND_GAP = 100.0


class PoolFenceComponent(Component):
    """Glass pool barrier with one gate opening."""

    category = "pool_fence"
    label = "Pool barrier"

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        site = ctx.site
        if site is None or site.pool_fence is None:
            ctx.warn("no pool barrier defined; skipped")
            return []

        fence = site.pool_fence
        posts: list[bpy.types.Object] = []
        panels: list[bpy.types.Object] = []

        for side in ("south", "north", "east", "west"):
            if side in fence.open_sides:
                continue
            for span in self._spans(fence, side):
                self._build_span(fence, side, span, posts, panels)

        if not posts:
            ctx.warn(f"pool barrier {fence.name!r} produced no geometry")
            return []

        objects: list[bpy.types.Object] = []

        post_mesh = meshutil.join(posts, f"{fence.name}.posts")
        ctx.materials.assign(post_mesh, fence.post_finish)
        objects.append(post_mesh)

        if panels:
            panel_mesh = meshutil.join(panels, f"{fence.name}.panels")
            ctx.materials.assign(panel_mesh, fence.panel_finish)
            objects.append(panel_mesh)

        return objects

    # -- geometry ----------------------------------------------------------

    def _side_line(self, fence: PoolFence, side: str):
        """Return (fixed_axis_value, low, high, is_horizontal) for a side."""
        if side == "south":
            return fence.y0, fence.x0, fence.x1, True
        if side == "north":
            return fence.y1, fence.x0, fence.x1, True
        if side == "west":
            return fence.x0, fence.y0, fence.y1, False
        return fence.x1, fence.y0, fence.y1, False   # east

    def _spans(self, fence: PoolFence, side: str) -> list[tuple[float, float]]:
        """Split a side into runs, leaving a hole where the gate goes."""
        _, low, high, _ = self._side_line(fence, side)

        if side != fence.gate_side:
            return [(low, high)]

        gate_start = low + fence.gate_position
        gate_end = gate_start + fence.gate_width

        spans = []
        if gate_start - low > 200.0:
            spans.append((low, gate_start))
        if high - gate_end > 200.0:
            spans.append((gate_end, high))
        return spans

    def _build_span(
        self,
        fence: PoolFence,
        side: str,
        span: tuple[float, float],
        posts: list[bpy.types.Object],
        panels: list[bpy.types.Object],
    ) -> None:
        fixed, _, _, horizontal = self._side_line(fence, side)
        s0, s1 = span
        length = s1 - s0

        bays = max(1, round(length / fence.post_spacing))
        step = length / bays

        half_post = fence.post_size / 2.0
        top = PAVING_LEVEL + fence.height
        panel_bottom = PAVING_LEVEL + GROUND_GAP
        half_glass = 6.0   # 12mm toughened

        def bounds(pos: float, half_a: float, half_b: float):
            """Rect around a point on the run, given half-sizes along/across."""
            if horizontal:
                return (pos - half_a, fixed - half_b, pos + half_a, fixed + half_b)
            return (fixed - half_b, pos - half_a, fixed + half_b, pos + half_a)

        # Posts, including both ends of the span.
        for i in range(bays + 1):
            pos = s0 + i * step
            bx0, by0, bx1, by1 = bounds(pos, half_post, half_post)
            posts.append(
                meshutil.box(
                    f"{fence.name}.{side}.post{i}",
                    bx0, by0, PAVING_LEVEL - 200.0,
                    bx1, by1, top + 20.0,
                )
            )

        # Glass between consecutive posts, stopping short of each post face.
        for i in range(bays):
            a = s0 + i * step + half_post + fence.panel_inset
            b = s0 + (i + 1) * step - half_post - fence.panel_inset
            if b - a < 50.0:
                continue
            centre = (a + b) / 2.0
            bx0, by0, bx1, by1 = bounds(centre, (b - a) / 2.0, half_glass)
            panels.append(
                meshutil.box(
                    f"{fence.name}.{side}.panel{i}",
                    bx0, by0, panel_bottom,
                    bx1, by1, top,
                )
            )
