"""Boundary fence.

Posts at centres with horizontal rails between them. Each run is joined into
a single object: a fence is one thing you replace, not ninety things, and the
GLB is far smaller for it.
"""

from __future__ import annotations

import bpy

from ...config.site import FenceRun
from ...core import mesh as meshutil
from ...core.component import BuildContext, Component


class FenceComponent(Component):
    """Perimeter fencing."""

    category = "yard_fence"
    label = "Fence"

    def build(self, ctx: BuildContext) -> list[bpy.types.Object]:
        site = ctx.site
        if site is None:
            ctx.warn("no site defined; fence skipped")
            return []

        objects: list[bpy.types.Object] = []
        for run in site.fences:
            fence = self._run(ctx, run)
            if fence is not None:
                objects.append(fence)
        return objects

    def _run(self, ctx: BuildContext, run: FenceRun
             ) -> bpy.types.Object | None:
        site = ctx.site
        (x0, y0), (x1, y1) = run.start, run.end

        horizontal = abs(y1 - y0) < 1e-6
        vertical = abs(x1 - x0) < 1e-6
        if not (horizontal or vertical):
            ctx.warn(f"fence {run.name!r} is not axis-aligned; skipped")
            return None

        length = abs(x1 - x0) if horizontal else abs(y1 - y0)
        if length < run.post_spacing:
            ctx.warn(f"fence {run.name!r} is shorter than one bay; skipped")
            return None

        half_post = run.post_size / 2.0
        half_rail = run.rail_thickness / 2.0
        rail_depth = 140.0
        parts: list[bpy.types.Object] = []

        # Always include both ends, so a run never finishes mid-air.
        bays = max(1, round(length / run.post_spacing))
        step = length / bays
        start = min(x0, x1) if horizontal else min(y0, y1)

        def at(pos: float) -> tuple[float, float]:
            return (pos, y0) if horizontal else (x0, pos)

        # Ground under each post, sampled once and reused by the rails.
        levels: list[float] = []
        for i in range(bays + 1):
            px, py = at(start + i * step)
            levels.append(site.elevation(px, py))

        # -- Posts ---------------------------------------------------------
        for i in range(bays + 1):
            px, py = at(start + i * step)
            parts.append(
                meshutil.box(
                    f"{run.name}.post{i}",
                    px - half_post, py - half_post, levels[i] - 700.0,
                    px + half_post, py + half_post, levels[i] + run.height,
                )
            )

        # -- Rails ---------------------------------------------------------
        # One rail per bay rather than one per run, so the fence steps down
        # the contour with the posts instead of floating over the dips.
        for i in range(bays):
            a, b = start + i * step, start + (i + 1) * step
            base = (levels[i] + levels[i + 1]) / 2.0

            for j in range(run.rail_count):
                frac = 0.15 + (0.85 * j / max(1, run.rail_count - 1))
                z = base + run.height * frac
                if horizontal:
                    bounds = (a, y0 - half_rail, b, y0 + half_rail)
                else:
                    bounds = (x0 - half_rail, a, x0 + half_rail, b)

                parts.append(
                    meshutil.box(
                        f"{run.name}.rail{i}_{j}",
                        bounds[0], bounds[1], z - rail_depth / 2.0,
                        bounds[2], bounds[3], z + rail_depth / 2.0,
                    )
                )

        fence = meshutil.join(parts, run.name)
        ctx.materials.assign(fence, run.finish)
        return fence
