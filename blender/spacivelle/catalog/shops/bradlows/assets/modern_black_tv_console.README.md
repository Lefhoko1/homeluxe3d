# Modern Black TV Console - Blender / Three.js Asset

This model was built from the supplied reference images.

Approximate dimensions used:
- Width: 1.82 m
- Depth: 0.48 m
- Height: 0.78 m

The dimensions are inferred from the photographs because no measured drawing was supplied.

## Files
- `models/modern_black_tv_console.glb` - recommended for Three.js and Blender
- `models/modern_black_tv_console.obj` - alternate geometry
- `scripts/build_modern_black_tv_console.py` - creates an editable native Blender version with bevel modifiers
- `scripts/import_into_house.py` - imports and parents the asset under `TV_CONSOLE_ROOT`
- `textures/` - black laminate and brushed-metal PBR maps
- `references/` - the source images supplied for this build

## Blender
To create the native .blend from the generator:

```bash
blender --background --python scripts/build_modern_black_tv_console.py
```

To place the GLB inside an existing house:

```bash
blender your_house.blend --python scripts/import_into_house.py
```

Edit `LOCATION`, `ROTATION_DEGREES`, and `SCALE` inside `import_into_house.py` first.

## Three.js
Load:

`models/modern_black_tv_console.glb`

with `GLTFLoader`.

The model is split into named meshes, including doors, handles, shelf panels,
upper supports, cable-management hole details, the top crown, and the lower plinth.
