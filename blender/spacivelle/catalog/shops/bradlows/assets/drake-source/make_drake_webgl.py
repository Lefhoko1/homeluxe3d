import os, math, io, zipfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import trimesh
from trimesh.visual.texture import TextureVisuals
from trimesh.visual.material import PBRMaterial

OUT = '/mnt/data/drake_webgl_models'
os.makedirs(OUT, exist_ok=True)

# ---------------- Textures ----------------
def make_leather_maps(size=512):
    rng = np.random.default_rng(714280)
    # Base colour: warm beige with subtle leather grain
    base = np.zeros((size,size,3), dtype=np.float32)
    base[:] = np.array([0.71, 0.58, 0.44]) * 255
    noise = rng.normal(0, 4.0, (size,size,1))
    # fine pores using sparse dots + blur
    pores = np.zeros((size,size), dtype=np.uint8)
    ys = rng.integers(0,size, size*7)
    xs = rng.integers(0,size, size*7)
    pores[ys,xs] = rng.integers(8,28, len(xs))
    pimg = Image.fromarray(pores).filter(ImageFilter.GaussianBlur(0.45))
    pores_arr = np.asarray(pimg, dtype=np.float32)[...,None]
    base = np.clip(base + noise - pores_arr*0.32, 0,255).astype(np.uint8)
    base_img = Image.fromarray(base, 'RGB')

    # glTF metallic-roughness texture: roughness in G, metallic in B.
    rough = np.zeros((size,size,3), dtype=np.uint8)
    rnoise = rng.normal(0, 8, (size,size))
    rv = np.clip(188 + rnoise + np.asarray(pimg,dtype=np.float32)*0.10, 145, 225).astype(np.uint8)
    rough[...,0] = 255
    rough[...,1] = rv
    rough[...,2] = 0
    rough_img = Image.fromarray(rough, 'RGB')

    base_path = os.path.join(OUT, 'drake_leather_basecolor.jpg')
    rough_path = os.path.join(OUT, 'drake_leather_roughness.jpg')
    base_img.save(base_path, quality=82, optimize=True, progressive=True)
    rough_img.save(rough_path, quality=80, optimize=True, progressive=True)
    return base_img, rough_img, base_path, rough_path

BASE_IMG, ROUGH_IMG, BASE_PATH, ROUGH_PATH = make_leather_maps()

LEATHER = PBRMaterial(
    name='Drake_Beige_Leather',
    baseColorFactor=[1,1,1,1],
    baseColorTexture=BASE_IMG,
    metallicFactor=0.0,
    roughnessFactor=0.72,
    metallicRoughnessTexture=ROUGH_IMG
)
METAL = PBRMaterial(name='Brushed_Steel', baseColorFactor=[0.55,0.57,0.58,1], metallicFactor=0.92, roughnessFactor=0.30)
BLACK = PBRMaterial(name='Black_Plastic', baseColorFactor=[0.025,0.025,0.028,1], metallicFactor=0.0, roughnessFactor=0.45)
DARK = PBRMaterial(name='Shadow_Black', baseColorFactor=[0.015,0.015,0.017,1], metallicFactor=0.0, roughnessFactor=0.8)

# ---------------- Geometry helpers ----------------
def superellipsoid(extents, center=(0,0,0), exp=0.32, nu=10, nv=16, material=LEATHER, name='part'):
    """Rounded-box style superellipsoid. exp<1 gives squarer profile."""
    a,b,c = np.array(extents, dtype=float)/2.0
    u = np.linspace(-math.pi/2, math.pi/2, nu)
    v = np.linspace(-math.pi, math.pi, nv, endpoint=False)
    verts=[]
    def spow(x,e):
        return np.sign(x) * (abs(x) ** e)
    for uu in u:
        cu, su = math.cos(uu), math.sin(uu)
        for vv in v:
            cv, sv = math.cos(vv), math.sin(vv)
            x = a * spow(cu, exp) * spow(cv, exp)
            y = b * spow(su, exp)
            z = c * spow(cu, exp) * spow(sv, exp)
            verts.append((x+center[0], y+center[1], z+center[2]))
    faces=[]
    for i in range(nu-1):
        for j in range(nv):
            nj=(j+1)%nv
            a0=i*nv+j; a1=i*nv+nj; b0=(i+1)*nv+j; b1=(i+1)*nv+nj
            faces.append((a0,b0,b1)); faces.append((a0,b1,a1))
    m=trimesh.Trimesh(vertices=np.asarray(verts), faces=np.asarray(faces), process=False)
    # UVs from parametric grid
    uv=[]
    for i in range(nu):
        for j in range(nv):
            uv.append((j/nv, i/(nu-1)))
    m.visual = TextureVisuals(uv=np.asarray(uv), material=material)
    m.metadata['name']=name
    return m

def box(extents, center=(0,0,0), material=LEATHER, name='box'):
    m=trimesh.creation.box(extents=extents)
    m.apply_translation(center)
    # basic UV projection per-vertex, enough for subtle texture
    v=m.vertices
    x=(v[:,0]-v[:,0].min())/(np.ptp(v[:,0])+1e-9)
    z=(v[:,2]-v[:,2].min())/(np.ptp(v[:,2])+1e-9)
    m.visual=TextureVisuals(uv=np.c_[x,z], material=material)
    m.metadata['name']=name
    return m

def cylinder(radius, height, center, material=METAL, name='cyl', sections=18, axis='y'):
    m=trimesh.creation.cylinder(radius=radius, height=height, sections=sections)
    # cylinder default along Z; orient along Y
    if axis=='y':
        m.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2, [1,0,0]))
    m.apply_translation(center)
    m.visual.material=material
    m.metadata['name']=name
    return m

def ring(outer_r, inner_r, height, center, name='ring', sections=20):
    # Build ring by concatenating top/bottom annulus surfaces and outer/inner walls
    verts=[]; faces=[]
    for yi in (-height/2, height/2):
        for r in (outer_r, inner_r):
            for i in range(sections):
                a=2*math.pi*i/sections
                verts.append((r*math.cos(a)+center[0], yi+center[1], r*math.sin(a)+center[2]))
    # index layers: bottom outer 0, bottom inner s, top outer 2s, top inner 3s
    s=sections
    for i in range(s):
        j=(i+1)%s
        # top annulus
        faces += [(2*s+i,2*s+j,3*s+j),(2*s+i,3*s+j,3*s+i)]
        # outer wall
        faces += [(i,j,2*s+j),(i,2*s+j,2*s+i)]
        # inner wall
        faces += [(s+i,3*s+j,s+j),(s+i,3*s+i,3*s+j)]
    m=trimesh.Trimesh(vertices=np.asarray(verts), faces=np.asarray(faces), process=False)
    m.visual.material=METAL; m.metadata['name']=name
    return m

def add(scene, mesh, name):
    scene.add_geometry(mesh, node_name=name, geom_name=name)

def seam_strip(length, axis='x', center=(0,0,0), thickness=0.006, material=None, name='seam'):
    mat = material or PBRMaterial(name='Seam', baseColorFactor=[0.40,0.31,0.23,1], metallicFactor=0, roughnessFactor=0.85)
    if axis=='x': ext=(length, thickness, thickness)
    elif axis=='z': ext=(thickness, thickness, length)
    else: ext=(thickness, length, thickness)
    return box(ext, center, mat, name)

# ---------------- Models ----------------
def build_3():
    s=trimesh.Scene()
    # base shadow plinth
    add(s, box((2.08,0.09,0.65),(0,0.045,0.04),DARK,'base_plinth'),'base_plinth')
    # three seats
    xs=[-0.67,0,0.67]
    for i,x in enumerate(xs,1):
        add(s, superellipsoid((0.67,0.22,0.62),(x,0.35,-0.10),0.38,9,14,name=f'seat_{i}'), f'seat_{i}')
        add(s, superellipsoid((0.65,0.56,0.20),(x,0.73,0.28),0.38,9,14,name=f'back_{i}'), f'back_{i}')
        add(s, superellipsoid((0.65,0.20,0.17),(x,1.02,0.32),0.42,8,14,name=f'headrest_{i}'), f'headrest_{i}')
        # front seam cue
        add(s, seam_strip(0.56,'x',(x,0.245,-0.415),0.004,name=f'seat_front_seam_{i}'),f'seat_front_seam_{i}')
    # arms
    add(s, superellipsoid((0.20,0.62,0.73),(-1.08,0.48,-0.03),0.33,9,14,name='left_arm'),'left_arm')
    add(s, superellipsoid((0.20,0.62,0.73),(1.08,0.48,-0.03),0.33,9,14,name='right_arm'),'right_arm')
    # outer side pads/back shell hints
    add(s, box((2.05,0.47,0.12),(0,0.69,0.40),LEATHER,'rear_shell'),'rear_shell')
    return s

def build_2_console():
    s=trimesh.Scene()
    add(s, box((1.72,0.09,0.66),(0,0.045,0.03),DARK,'base_plinth'),'base_plinth')
    xs=[-0.55,0.55]
    for i,x in enumerate(xs,1):
        add(s, superellipsoid((0.58,0.22,0.62),(x,0.35,-0.11),0.38,9,14,name=f'seat_{i}'), f'seat_{i}')
        add(s, superellipsoid((0.58,0.58,0.20),(x,0.74,0.28),0.38,9,14,name=f'back_{i}'), f'back_{i}')
        add(s, superellipsoid((0.57,0.20,0.17),(x,1.03,0.32),0.42,8,14,name=f'headrest_{i}'), f'headrest_{i}')
    add(s, superellipsoid((0.19,0.62,0.73),(-0.91,0.48,-0.03),0.33,9,14,name='left_arm'),'left_arm')
    add(s, superellipsoid((0.19,0.62,0.73),(0.91,0.48,-0.03),0.33,9,14,name='right_arm'),'right_arm')
    # console body and separate lid
    add(s, superellipsoid((0.34,0.40,0.67),(0,0.42,-0.02),0.28,9,14,name='console_body'),'console_body')
    add(s, superellipsoid((0.32,0.10,0.34),(0,0.67,0.14),0.36,8,14,name='console_lid'),'console_lid')
    # cupholder recesses as black cylinders + metal rings
    for j,x in enumerate((-0.085,0.085),1):
        add(s, cylinder(0.047,0.035,(x,0.665,-0.20),BLACK,f'cup_well_{j}',16),'cup_well_'+str(j))
        add(s, ring(0.058,0.046,0.020,(x,0.685,-0.20),f'cup_ring_{j}',18),'cup_ring_'+str(j))
    # storage seam line
    add(s, seam_strip(0.28,'x',(0,0.714,-0.015),0.004,name='console_lid_front_seam'),'console_lid_front_seam')
    return s

def build_recliner():
    s=trimesh.Scene()
    add(s, box((0.87,0.09,0.68),(0,0.045,0.01),DARK,'base_plinth'),'base_plinth')
    add(s, superellipsoid((0.60,0.23,0.63),(0,0.35,-0.10),0.38,9,14,name='seat'),'seat')
    # Separate animatable recliner back
    add(s, superellipsoid((0.60,0.60,0.20),(0,0.76,0.29),0.38,9,14,name='recliner_back'),'recliner_back')
    add(s, superellipsoid((0.58,0.20,0.18),(0,1.06,0.33),0.42,8,14,name='headrest'),'headrest')
    add(s, superellipsoid((0.20,0.64,0.74),(-0.40,0.49,-0.02),0.33,9,14,name='left_arm'),'left_arm')
    add(s, superellipsoid((0.20,0.64,0.74),(0.40,0.49,-0.02),0.33,9,14,name='right_arm'),'right_arm')
    # Separate animatable footrest, flush under front of seat in closed position
    add(s, superellipsoid((0.56,0.12,0.25),(0,0.20,-0.39),0.32,8,14,name='footrest'),'footrest')
    # power control panel and two buttons
    add(s, box((0.105,0.065,0.025),(-0.505,0.54,-0.13),BLACK,'control_panel'),'control_panel')
    add(s, cylinder(0.012,0.014,(-0.525,0.54,-0.145),METAL,'button_1',12),'button_1')
    add(s, cylinder(0.012,0.014,(-0.485,0.54,-0.145),METAL,'button_2',12),'button_2')
    return s


def fit_scene(scene, target_xyz):
    # target_xyz: width X, height Y, depth Z
    bounds=scene.bounds.copy()
    ext=bounds[1]-bounds[0]
    scale=np.array(target_xyz)/ext
    # Apply scale to every geometry and translation implicitly via transform
    T=np.eye(4); T[0,0]=scale[0]; T[1,1]=scale[1]; T[2,2]=scale[2]
    scene.apply_transform(T)
    b=scene.bounds
    # center X/Z, put underside at Y=0
    tx=-(b[0,0]+b[1,0])/2
    tz=-(b[0,2]+b[1,2])/2
    ty=-b[0,1]
    scene.apply_translation([tx,ty,tz])
    return scene


def export(scene, filename, dims_m):
    fit_scene(scene, dims_m)
    path=os.path.join(OUT, filename)
    data=scene.export(file_type='glb')
    with open(path,'wb') as f: f.write(data)
    return path

files=[]
files.append(export(build_3(), 'drake-3-seater.glb', (2.229,1.026,0.816)))
files.append(export(build_2_console(), 'drake-2-seater-console.glb', (1.840,1.025,0.830)))
files.append(export(build_recliner(), 'drake-recliner.glb', (0.983,1.055,0.908)))

# Validation report
report=[]
for p in files:
    sc=trimesh.load(p, force='scene')
    tris=sum(len(g.faces) for g in sc.geometry.values())
    b=sc.bounds; ext=b[1]-b[0]
    size=os.path.getsize(p)
    report.append((os.path.basename(p), size, tris, ext, b[0], b[1], list(sc.graph.nodes_geometry)))

readme=os.path.join(OUT,'README.txt')
with open(readme,'w',encoding='utf-8') as f:
    f.write('Drake beige leather lounge suite - browser-ready GLB pack\n\n')
    f.write('Conventions: metres, Y-up, centered X/Z, underside Y=0, back +Z, front -Z, no cameras/lights.\n')
    f.write('Shared 512px JPEG leather maps are embedded in every GLB and also included as source files.\n\n')
    for name,size,tris,ext,bmin,bmax,nodes in report:
        f.write(f'{name}\n  bytes: {size}\n  triangles: {tris}\n  extents X/Y/Z m: {ext.tolist()}\n  min: {bmin.tolist()}\n  max: {bmax.tolist()}\n  nodes: {nodes}\n\n')

zip_path='/mnt/data/Drake_ThreeJS_Final_GLBS.zip'
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED) as z:
    for p in files+[BASE_PATH,ROUGH_PATH,readme]:
        z.write(p, arcname=os.path.basename(p))

print('CREATED')
for r in report:
    print(r[0], 'bytes=',r[1], 'KB=',round(r[1]/1024,1),'tris=',r[2], 'ext=',np.round(r[3],6), 'min=',np.round(r[4],6), 'max=',np.round(r[5],6))
print('zip',zip_path, os.path.getsize(zip_path))

# Post-process GLBs: keep glTF binary but store the two embedded texture images as JPEG
# instead of trimesh's PNG encoding. This keeps each file comfortably under 500 KB.
def compact_glb_images(path, jpeg_sources):
    import struct, json
    raw=open(path,'rb').read()
    magic,ver,total=struct.unpack_from('<4sII',raw,0)
    assert magic==b'glTF' and ver==2
    jlen,jtype=struct.unpack_from('<I4s',raw,12)
    jstart=20; jend=jstart+jlen
    doc=json.loads(raw[jstart:jend].decode('utf-8').rstrip(' \x00'))
    boff=jend
    blen,btype=struct.unpack_from('<I4s',raw,boff)
    bstart=boff+8
    binchunk=raw[bstart:bstart+blen]

    image_views={im['bufferView']: idx for idx,im in enumerate(doc.get('images',[]))}
    replacements={}
    for view_idx,img_idx in image_views.items():
        if img_idx < len(jpeg_sources):
            replacements[view_idx]=open(jpeg_sources[img_idx],'rb').read()
            doc['images'][img_idx]['mimeType']='image/jpeg'

    # patch leather factor to true white multiplier
    for mat in doc.get('materials',[]):
        if mat.get('name')=='Drake_Beige_Leather':
            mat.setdefault('pbrMetallicRoughness',{})['baseColorFactor']=[1.0,1.0,1.0,1.0]

    # Rebuild all bufferViews into one tightly packed buffer.
    newbin=bytearray()
    for i,bv in enumerate(doc.get('bufferViews',[])):
        oldoff=bv.get('byteOffset',0); oldlen=bv['byteLength']
        payload=replacements.get(i, binchunk[oldoff:oldoff+oldlen])
        while len(newbin)%4: newbin.append(0)
        bv['byteOffset']=len(newbin)
        bv['byteLength']=len(payload)
        newbin.extend(payload)
    while len(newbin)%4: newbin.append(0)
    doc['buffers'][0]['byteLength']=len(newbin)
    jbytes=json.dumps(doc,separators=(',',':')).encode('utf-8')
    while len(jbytes)%4: jbytes+=b' '
    out=bytearray()
    out.extend(struct.pack('<4sII',b'glTF',2,12+8+len(jbytes)+8+len(newbin)))
    out.extend(struct.pack('<I4s',len(jbytes),b'JSON')); out.extend(jbytes)
    out.extend(struct.pack('<I4s',len(newbin),b'BIN\x00')); out.extend(newbin)
    open(path,'wb').write(out)

for p in files:
    compact_glb_images(p,[BASE_PATH,ROUGH_PATH])

# refresh report and zip after compaction
report=[]
for p in files:
    sc=trimesh.load(p, force='scene')
    tris=sum(len(g.faces) for g in sc.geometry.values())
    b=sc.bounds; ext=b[1]-b[0]
    size=os.path.getsize(p)
    report.append((os.path.basename(p), size, tris, ext, b[0], b[1], list(sc.graph.nodes_geometry)))
with open(readme,'w',encoding='utf-8') as f:
    f.write('Drake beige leather lounge suite - browser-ready GLB pack\n\n')
    f.write('glTF 2.0 binary. Units: metres. Y-up. X/Z centered. Underside Y=0. Back +Z, front -Z. No cameras/lights.\n')
    f.write('Shared 512x512 JPEG leather base-colour + metallic/roughness maps are embedded in each GLB and supplied separately.\n')
    f.write('Animation nodes: console_lid; recliner_back; footrest.\n\n')
    for name,size,tris,ext,bmin,bmax,nodes in report:
        f.write(f'{name}\n  bytes: {size}\n  triangles: {tris}\n  extents X/Y/Z m: {ext.tolist()}\n  min: {bmin.tolist()}\n  max: {bmax.tolist()}\n  nodes: {nodes}\n\n')
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED) as z:
    for p in files+[BASE_PATH,ROUGH_PATH,readme, '/mnt/data/make_drake_webgl.py']:
        z.write(p, arcname=os.path.basename(p))
print('COMPACTED')
for r in report:
    print(r[0], 'bytes=',r[1], 'KB=',round(r[1]/1024,1),'tris=',r[2], 'ext=',np.round(r[3],6))
print('zip', os.path.getsize(zip_path))
