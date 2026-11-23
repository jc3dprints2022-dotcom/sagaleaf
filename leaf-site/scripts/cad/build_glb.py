# parts.npz (mm, CAD origin == site contract origin) -> leaf-rev4.glb with named groups + manifest.
import json, numpy as np, trimesh
from trimesh.visual.material import PBRMaterial
d = np.load('parts.npz'); names = sorted({k.split('__')[0] for k in d})
MAT = {  # material name == LeafMaterials key in leaf-site/src/three/leafModel.ts
 'shell': ([0x28,0x29,0x2E], .82, .02), 'bezel': ([0x2a,0x2b,0x30], .78, .02), 'paper': ([0xcf,0xcf,0xc4], .95, 0),
 'screen': ([0xDB,0xDB,0xD1], .92, 0), 'pcb': ([0x17,0x3a,0x2a], .55, .05), 'metal': ([0xb8,0xbb,0xbf], .35, .9),
 'chip': ([0x14,0x14,0x16], .5, .1), 'pouch': ([0xb9,0xbc,0xc1], .42, .7), 'steel': ([0x3a,0x3c,0x40], .45, .85),
 'skin': ([0xB8,0x66,0x3A], .55, .15), 'button': ([0x34,0x35,0x3b], .7, .05), 'flex': ([0xb5,0x76,0x2c], .5, .1),
}
def mat(k):
    c, r, m = MAT[k]; return PBRMaterial(name=k, baseColorFactor=c + [255], roughnessFactor=r, metallicFactor=m)
def tm(V, F, k, uv=None):
    vis = trimesh.visual.TextureVisuals(uv=uv, material=mat(k)) if uv is not None else trimesh.visual.TextureVisuals(material=mat(k))
    m = trimesh.Trimesh(V, F, visual=vis, process=False); _ = m.vertex_normals; return m
# group -> list of (mesh node name, [cad parts], material)
G = {
 'bezel':   [('bezel-frame', ['bezel'], 'bezel')],
 'panel':   [('panel-glass', ['panel'], 'paper')],
 'pcb':     [('board', ['pcb'], 'pcb'), ('usb-c', ['usb'], 'metal'), ('esp32-module', ['module'], 'metal'),
             ('microsd', ['sd'], 'metal'), ('panel-fpc-connector', ['fpc'], 'chip'), ('battery-connector', ['batc'], 'chip'),
             ('switches', [n for n in names if n.startswith('sw_')], 'chip'),
             ('components', [n for n in names if n.startswith('e_')], 'chip')],
 'battery': [('cell', ['battery'], 'pouch')],
 'ring':    [('magnet-ring', ['ring'], 'steel')],
 'tray':    [('rear-shell', ['tray'], 'shell')],
 'skin':    [('rear-skin', ['skin'], 'skin')],
 'buttons': [(f'btn-{b.lower()}', [f'cap_{b}'], 'button') for b in ['BACK', 'PREV', 'SELECT', 'NEXT']],
}
sc = trimesh.Scene(base_frame='leaf')
man = {'units': 'mm', 'source': 'saga_leaf_v2_rev4_assembly_unlit_c504040y.step (rev4 CAD, YDL 504040 cell, unlit)',
       'origin': 'bottom-left-rear corner of core body; x=width, y=height (0=bottom), z=thickness (0=rear face of core, +z=screen side). Matches leaf-site/src/data/geometry.ts contract.',
       'scene_scale_hint': 'site uses SCENE_SCALE 0.01 (1 mm -> 0.01 units)', 'status': 'CAD estimate, not physically measured',
       'groups': {}}
def bbox(V): return {'min': np.round(V.min(0), 3).tolist(), 'max': np.round(V.max(0), 3).tolist()}
for g, items in G.items():
    sc.graph.update(frame_from='leaf', frame_to=g, matrix=np.eye(4))
    allV = []; meshes = []
    for node, parts, k in items:
        Vs, Fs, off = [], [], 0
        for p in parts:
            V, F = d[p + '__V'], d[p + '__F']; Vs.append(V); Fs.append(F + off); off += len(V)
        V, F = np.vstack(Vs), np.vstack(Fs); allV.append(V)
        sc.graph.update(frame_from=g, frame_to=node, matrix=np.eye(4))
        sc.add_geometry(tm(V, F, k), node_name=node + '-mesh', geom_name=node, parent_node_name=node)
        meshes.append({'node': node, 'cad_parts': parts if len(parts) < 6 else f'{len(parts)} parts ({parts[0]}..)', 'material': k, 'triangles': int(len(F)), 'bbox_mm': bbox(V)})
    A = np.vstack(allV); b = bbox(A)
    man['groups'][g] = {'bbox_mm': b, 'z0_mm': b['min'][2], 'z1_mm': b['max'][2], 'meshes': meshes}
# screen quad: active area per GDEY0397T81P datasheet placed on CAD panel (same rule as site LAYOUT)
P = d['panel__V']; px0, py0, pz1 = P[:,0].min(), P[:,1].min(), P[:,2].max()
ax0, ay0, aw, ah = px0 + (56.24 - 51.84) / 2, py0 + 8.02, 51.84, 86.4
z = pz1 + 0.02
V = np.array([[ax0, ay0, z], [ax0+aw, ay0, z], [ax0+aw, ay0+ah, z], [ax0, ay0+ah, z]]); F = np.array([[0,1,2],[0,2,3]])
uv = np.array([[0,0],[1,0],[1,1],[0,1]], float)
sc.graph.update(frame_from='panel', frame_to='screen', matrix=np.eye(4))
sc.add_geometry(tm(V, F, 'screen', uv), node_name='screen-mesh', geom_name='screen', parent_node_name='screen')
man['groups']['panel']['meshes'].append({'node': 'screen', 'material': 'screen', 'note': 'UV quad over the 51.84x86.4 mm active area (datasheet), activeFromBottom 8.02 mm assumed at the y=0 end as in the site LAYOUT; map the screen texture here', 'bbox_mm': bbox(V)})
man['explode_order_front_to_back'] = ['bezel', 'panel', 'pcb', 'battery', 'ring', 'tray', 'skin', 'buttons']
man['cad_z_levels_mm'] = {'floor': 0.6, 'ring': [0.6, 2.6], 'battery_bay': [0.6, 6.1], 'pcb_bottom': 5.3, 'pcb_top': 6.1, 'panel': [6.35, 7.27], 'bezel': [5.2, 7.87], 'top': 7.87, 'skin': [-0.6, 2.9]}
man['notes'] = ['Node transforms are identity; vertices are in absolute CAD mm, so exploding = translating a group node.',
  'USB-C sits on the RIGHT side wall (x~55-62.3, y~46-55) in rev4 CAD, not the bottom end as the procedural model assumed.',
  'Board components hang below the PCB (z 2.9-5.3): the board is mounted component-side down.',
  'Battery/module/sd/fpc/usb/switches/passives are simple boxes in the CAD (envelopes), not detailed models.',
  'Skin overall with skin: 64.19 x 102.02 x 8.47 mm (CAD estimate).']
sc.export('leaf-rev4.raw.glb')
import struct
b = open('leaf-rev4.raw.glb', 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20+n]); rest = b[20+n:]
j['nodes'].append({'name': 'leaf', 'children': list(j['scenes'][0]['nodes'])}); j['scenes'][0]['nodes'] = [len(j['nodes'])-1]
for nd in j['nodes']:
    for k in ('matrix',):
        nd.pop(k, None)
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + len(rest)) + struct.pack('<II', len(js), 0x4E4F534A) + js + rest
open('leaf-rev4.glb', 'wb').write(out)
json.dump(man, open('leaf-rev4.parts.json', 'w'), indent=1)
print(sum(len(m) for m in []), 'ok')
