"""HouseLuxe -- procedural house generation for Blender.

Layout
    config/      Plan data. Pure values, no Blender imports.
    core/        Mesh primitives, wall maths, the Component contract, the
                 scene builder. Knows Blender, knows nothing about this house.
    components/  One class per real-world part of the building.
    materials/   The finishes schedule.
    export/      Per-component glTF output.

The dependency direction is strictly downward: components depend on core and
config, core depends on config, config depends on nothing. Nothing imports
upward, so any layer can be exercised without the ones above it.
"""

__version__ = "0.1.0"
