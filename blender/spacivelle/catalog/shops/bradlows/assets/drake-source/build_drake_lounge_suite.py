import bpy
import math
import os
from mathutils import Vector

# ============================================================
# Drake 3-piece Beige Lounge Suite procedural Blender builder
# Creates:
#   Drake_3Seater.glb
#   Drake_2Seater_Console.glb
#   Drake_Recliner.glb
#   Drake_Lounge_Suite.glb
#   Drake_Lounge_Suite.blend
# Designed for Blender 4.x and Three.js glTF/GLB workflows.
# ============================================================

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(ROOT, "output")
TEX_DIR = os.path.join(ROOT, "textures")
os.makedirs(OUT_DIR, exist_ok=True)

# ---------- Scene ----------
def reset_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        pass


def set_collection(name):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def move_to_collection(obj, col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)


# ---------- Materials ----------
def load_image(name):
    p = os.path.join(TEX_DIR, name)
    return bpy.data.images.load(p, check_existing=True) if os.path.exists(p) else None


def leather_material():
    mat = bpy.data.materials.new("Drake_Beige_Leather")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.62, 0.47, 0.34, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.40
    bsdf.inputs["IOR"].default_value = 1.46
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.12
        bsdf.inputs["Coat Roughness"].default_value = 0.32
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    base = load_image("leather_basecolor.png")
    rough = load_image("leather_roughness.png")
    normal = load_image("leather_normal.png")

    if base:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = base
        tex.interpolation = 'Linear'
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if rough:
        texr = nt.nodes.new("ShaderNodeTexImage")
        texr.image = rough
        texr.image.colorspace_settings.name = 'Non-Color'
        nt.links.new(texr.outputs["Color"], bsdf.inputs["Roughness"])
    if normal:
        texn = nt.nodes.new("ShaderNodeTexImage")
        texn.image = normal
        texn.image.colorspace_settings.name = 'Non-Color'
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 0.28
        nt.links.new(texn.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def simple_material(name, color, metallic=0.0, roughness=0.45):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


# ---------- Geometry helpers ----------
def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for m in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except RuntimeError:
            pass
    obj.select_set(False)


def smart_uv(obj):
    if obj.type != 'MESH':
        return
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.025)
        bpy.ops.object.mode_set(mode='OBJECT')
    except Exception:
        try:
            bpy.ops.object.mode_set(mode='OBJECT')
        except Exception:
            pass
    obj.select_set(False)


def rounded_box(name, dims, loc, bevel=0.06, mat=None, col=None, rot=(0,0,0), subdiv=2):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bev = obj.modifiers.new("Soft_Bevel", 'BEVEL')
    bev.width = min(bevel, min(dims) * 0.22)
    bev.segments = 5
    bev.limit_method = 'ANGLE'
    if subdiv:
        sub = obj.modifiers.new("Subdivision", 'SUBSURF')
        sub.subdivision_type = 'CATMULL_CLARK'
        sub.levels = 1 if subdiv == 1 else 2
        sub.render_levels = 2
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    obj.select_set(False)
    apply_all(obj)
    smart_uv(obj)
    if mat:
        obj.data.materials.append(mat)
    if col:
        move_to_collection(obj, col)
    return obj


def cylinder(name, radius, depth, loc, mat=None, col=None, verts=64, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    if mat:
        obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    if col:
        move_to_collection(obj, col)
    return obj


def torus(name, major, minor, loc, mat=None, col=None, rot=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=64, minor_segments=16, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    bpy.ops.object.shade_smooth()
    if mat:
        obj.data.materials.append(mat)
    if col:
        move_to_collection(obj, col)
    return obj


def seam_rect(name, center, sx, sy, z, mat, col, radius=0.0024):
    curve = bpy.data.curves.new(name + "Curve", type='CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spl = curve.splines.new('POLY')
    spl.points.add(4)
    x, y = sx/2, sy/2
    pts = [(-x,-y,z,1),(x,-y,z,1),(x,y,z,1),(-x,y,z,1),(-x,-y,z,1)]
    for p, co in zip(spl.points, pts):
        p.co = co
    obj = bpy.data.objects.new(name, curve)
    col.objects.link(obj)
    obj.location = center
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    return obj


def add_seat_cushion(name, x, y, z, w, d, leather, seam, col):
    obj = rounded_box(name, (w,d,0.16), (x,y,z), bevel=0.055, mat=leather, col=col, subdiv=2)
    # subtle front bulge strip
    rounded_box(name+"_FrontRoll", (w*0.97,0.08,0.09), (x,y-d/2+0.025,z-0.015), bevel=0.03, mat=leather, col=col, subdiv=1)
    seam_rect(name+"_TopSeam", (x,y,0), w*0.92, d*0.86, z+0.083, seam, col, 0.002)
    return obj


def add_back_cushion(name, x, y, z, w, h, leather, seam, col, tilt=math.radians(-7)):
    obj = rounded_box(name, (w,0.18,h), (x,y,z), bevel=0.06, mat=leather, col=col, rot=(tilt,0,0), subdiv=2)
    # headrest cap
    rounded_box(name+"_Headrest", (w*0.98,0.20,0.20), (x,y-0.015,z+h*0.38), bevel=0.05, mat=leather, col=col, rot=(tilt,0,0), subdiv=2)
    # vertical seam visual on front face
    rounded_box(name+"_CenterSeam", (0.005,0.006,h*0.66), (x,y-0.097,z-0.03), bevel=0.001, mat=seam, col=col, rot=(tilt,0,0), subdiv=0)
    return obj


def add_arm(name, x, y, z, w, d, leather, seam, col):
    arm = rounded_box(name, (w,d,0.48), (x,y,z), bevel=0.07, mat=leather, col=col, subdiv=2)
    rounded_box(name+"_TopPad", (w*1.05,d*0.94,0.12), (x,y-0.01,z+0.255), bevel=0.05, mat=leather, col=col, subdiv=2)
    return arm


def add_base(name, width, depth, x, y, z, leather, col):
    rounded_box(name+"_Frame", (width,depth,0.24), (x,y,z), bevel=0.055, mat=leather, col=col, subdiv=1)
    rounded_box(name+"_FrontApron", (width*0.98,0.08,0.26), (x,y-depth/2+0.035,z+0.01), bevel=0.035, mat=leather, col=col, subdiv=1)


def add_button(x,y,z, metal, black, col):
    # compact recliner control on outside arm
    rounded_box("Recline_Control", (0.065,0.012,0.032), (x,y,z), bevel=0.008, mat=black, col=col, subdiv=1)
    cylinder("Control_Button", 0.008, 0.008, (x-0.016,y-0.010,z), mat=metal, col=col, verts=32, rot=(math.radians(90),0,0))


def add_cupholder(name, x, y, z, metal, black, col):
    # recessed black cavity + stainless rim
    cylinder(name+"_Cavity", 0.052, 0.045, (x,y,z-0.016), mat=black, col=col, verts=64)
    torus(name+"_Rim", 0.052, 0.007, (x,y,z+0.004), mat=metal, col=col)


# ---------- Models ----------
def build_three_seater(leather, seam, metal, black):
    col = set_collection("Drake_3Seater")
    W, D = 2.22, 0.94
    add_base("3S", W, 0.78, 0, 0, 0.25, leather, col)
    arm_w = 0.19
    add_arm("3S_Arm_L", -W/2+arm_w/2, -0.02, 0.52, arm_w, D*0.84, leather, seam, col)
    add_arm("3S_Arm_R", W/2-arm_w/2, -0.02, 0.52, arm_w, D*0.84, leather, seam, col)
    seat_w = (W - 2*arm_w - 0.06)/3
    xs = [-seat_w-0.01, 0, seat_w+0.01]
    for i,x in enumerate(xs):
        add_seat_cushion(f"3S_Seat_{i+1}", x, -0.13, 0.52, seat_w, 0.57, leather, seam, col)
        add_back_cushion(f"3S_Back_{i+1}", x, 0.25, 0.84, seat_w*0.98, 0.54, leather, seam, col)
    # small gaps emphasize individual recliner sections
    return col


def build_loveseat_console(leather, seam, metal, black):
    col = set_collection("Drake_2Seater_Console")
    W, D = 1.83, 0.96
    add_base("2S", W, 0.80, 0, 0, 0.25, leather, col)
    arm_w = 0.19
    console_w = 0.33
    seat_w = (W - 2*arm_w - console_w - 0.05)/2
    left_x = -(console_w/2 + 0.025 + seat_w/2)
    right_x = -left_x
    add_arm("2S_Arm_L", -W/2+arm_w/2, -0.02, 0.52, arm_w, D*0.84, leather, seam, col)
    add_arm("2S_Arm_R", W/2-arm_w/2, -0.02, 0.52, arm_w, D*0.84, leather, seam, col)
    for i,x in enumerate((left_x,right_x)):
        add_seat_cushion(f"2S_Seat_{i+1}", x, -0.13, 0.52, seat_w, 0.58, leather, seam, col)
        add_back_cushion(f"2S_Back_{i+1}", x, 0.26, 0.84, seat_w*0.98, 0.54, leather, seam, col)
    # console body
    rounded_box("Console_Body", (console_w,0.76,0.44), (0,-0.02,0.52), bevel=0.055, mat=leather, col=col, subdiv=2)
    # cupholder deck/front section
    rounded_box("Console_Deck", (console_w*0.92,0.33,0.09), (0,-0.19,0.76), bevel=0.035, mat=leather, col=col, subdiv=2)
    add_cupholder("Cupholder_L", -0.082,-0.22,0.805, metal, black, col)
    add_cupholder("Cupholder_R",  0.082,-0.22,0.805, metal, black, col)
    # storage bin under lid
    rounded_box("Storage_Bin", (console_w*0.78,0.34,0.08), (0,0.10,0.74), bevel=0.018, mat=black, col=col, subdiv=1)
    lid = rounded_box("Console_Lid_ANIMATABLE", (console_w*0.94,0.38,0.10), (0,0.11,0.80), bevel=0.04, mat=leather, col=col, subdiv=2)
    lid["animation_hint"] = "Rotate around local X near rear edge to open storage console."
    # hinge hardware
    for x in (-0.085,0.085):
        cylinder("Console_Hinge", 0.012, 0.07, (x,0.29,0.77), mat=metal, col=col, verts=32, rot=(0,math.radians(90),0))
    return col


def build_recliner(leather, seam, metal, black):
    col = set_collection("Drake_Recliner")
    W, D = 0.94, 0.96
    add_base("1S", W, 0.80, 0, 0, 0.25, leather, col)
    arm_w = 0.19
    seat_w = W - 2*arm_w - 0.04
    add_arm("1S_Arm_L", -W/2+arm_w/2, -0.02, 0.52, arm_w, D*0.84, leather, seam, col)
    add_arm("1S_Arm_R", W/2-arm_w/2, -0.02, 0.52, arm_w, D*0.84, leather, seam, col)
    add_seat_cushion("1S_Seat", 0, -0.13, 0.52, seat_w, 0.58, leather, seam, col)
    back = add_back_cushion("1S_Back_ANIMATABLE", 0, 0.26, 0.85, seat_w*1.01, 0.58, leather, seam, col, tilt=math.radians(-10))
    back["animation_hint"] = "Rotate backward for recline animation."
    # footrest is modeled tucked under seat but separate
    foot = rounded_box("1S_Footrest_ANIMATABLE", (seat_w*0.92,0.17,0.25), (0,-0.40,0.34), bevel=0.045, mat=leather, col=col, rot=(math.radians(12),0,0), subdiv=2)
    foot["animation_hint"] = "Translate forward/down and rotate for recline animation."
    add_button(-W/2-0.006,-0.22,0.56, metal, black, col)
    return col


# ---------- Export ----------
def select_collection(col):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in col.all_objects:
        obj.select_set(True)
    if col.all_objects:
        bpy.context.view_layer.objects.active = col.all_objects[0]


def export_collection(col, filename):
    select_collection(col)
    path = os.path.join(OUT_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False
    )
    print("Exported", path)


def add_preview_scene():
    # Floor
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0,0,0))
    floor = bpy.context.object
    floor.name = "Preview_Floor"
    floor_mat = simple_material("Preview_Wood", (0.18,0.09,0.045), 0.0, 0.38)
    floor.data.materials.append(floor_mat)
    # position suite like reference image
    c3 = bpy.data.collections.get("Drake_3Seater")
    c2 = bpy.data.collections.get("Drake_2Seater_Console")
    c1 = bpy.data.collections.get("Drake_Recliner")
    if c3:
        for o in c3.all_objects: o.location.x -= 0.25; o.location.y += 1.00
    if c2:
        for o in c2.all_objects: o.location.x += 1.65; o.location.y -= 0.15; o.rotation_euler.z += math.radians(-10)
    if c1:
        for o in c1.all_objects: o.location.x -= 1.65; o.location.y -= 0.15; o.rotation_euler.z += math.radians(10)
    # area lights
    bpy.ops.object.light_add(type='AREA', location=(0,-3.5,4.5))
    key = bpy.context.object; key.data.energy=1200; key.data.shape='RECTANGLE'; key.data.size=5.5; key.rotation_euler=(math.radians(35),0,0)
    bpy.ops.object.light_add(type='AREA', location=(-4,1.5,2.8))
    fill = bpy.context.object; fill.data.energy=700; fill.data.size=4.0; fill.rotation_euler=(math.radians(75),0,math.radians(-65))
    bpy.ops.object.light_add(type='AREA', location=(4,2.5,3.0))
    rim = bpy.context.object; rim.data.energy=900; rim.data.size=3.0; rim.rotation_euler=(math.radians(70),0,math.radians(65))
    # camera
    bpy.ops.object.camera_add(location=(4.6,-6.3,2.8), rotation=(math.radians(68),0,math.radians(36)))
    cam = bpy.context.object
    bpy.context.scene.camera = cam
    # track camera to origin
    def look_at(obj, target):
        direction = Vector(target) - obj.location
        obj.rotation_euler = direction.to_track_quat('-Z','Y').to_euler()
    look_at(cam,(0,0.45,0.65))
    cam.data.lens=48


def main():
    reset_scene()
    leather = leather_material()
    seam = simple_material("Stitching", (0.22,0.14,0.09), 0.0, 0.55)
    metal = simple_material("Brushed_Stainless", (0.50,0.52,0.54), 0.92, 0.23)
    black = simple_material("Storage_Black", (0.012,0.012,0.014), 0.0, 0.34)

    c3 = build_three_seater(leather,seam,metal,black)
    c2 = build_loveseat_console(leather,seam,metal,black)
    c1 = build_recliner(leather,seam,metal,black)

    # Export individual models before preview positioning changes anything.
    export_collection(c3, "Drake_3Seater.glb")
    export_collection(c2, "Drake_2Seater_Console.glb")
    export_collection(c1, "Drake_Recliner.glb")

    # Export combined suite as-is, centered around common origin.
    bpy.ops.object.select_all(action='DESELECT')
    for c in (c3,c2,c1):
        for o in c.all_objects: o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT_DIR,"Drake_Lounge_Suite.glb"),
        export_format='GLB', use_selection=True, export_apply=True,
        export_cameras=False, export_lights=False
    )

    # Save master .blend before creating preview-only lights/floor.
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DIR,"Drake_Lounge_Suite.blend"))

    print("\nDONE. Files written to:", OUT_DIR)
    print("Use the three individual GLBs for best Three.js scene management.")


if __name__ == "__main__":
    main()
