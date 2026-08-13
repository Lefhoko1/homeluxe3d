"""Unit conversion.

The plans are dimensioned in millimetres; Blender works in metres. Every
number in `houseluxe.config` is therefore an integer in millimetres, and this
module is the single place where that becomes a Blender float.

Keeping the conversion in one place means a plan revision is a straight
transcription from the drawing -- no mental arithmetic, no unit drift.
"""

from __future__ import annotations

MM_PER_M = 1000.0


def m(value_mm: float) -> float:
    """Millimetres -> metres (Blender units)."""
    return value_mm / MM_PER_M


def mm(value_m: float) -> float:
    """Metres -> millimetres. Inverse of :func:`m`, for reporting."""
    return value_m * MM_PER_M


def m_all(*values_mm: float) -> tuple[float, ...]:
    """Convert several millimetre values at once."""
    return tuple(v / MM_PER_M for v in values_mm)
