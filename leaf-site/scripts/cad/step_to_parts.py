# Reads the rev4 assembly STEP (named products), tessellates each solid, dumps per-part meshes (mm) to npz.
import sys, numpy as np
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TDocStd import TDocStd_Document
from OCP.TCollection import TCollection_ExtendedString
from OCP.XCAFDoc import XCAFDoc_DocumentTool
from OCP.collections import Sequence_TDF_Label as TDF_LabelSequence
from OCP.TDF import TDF_Label
from OCP.TDataStd import TDataStd_Name
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
from OCP.BRep import BRep_Tool
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS
src, out = sys.argv[1], sys.argv[2]
doc = TDocStd_Document(TCollection_ExtendedString("doc"))
r = STEPCAFControl_Reader(); r.SetNameMode(True)
assert r.ReadFile(src) == 1; r.Transfer(doc)
st = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
def name(l):
    a = TDataStd_Name()
    return a.Get().ToExtString() if l.FindAttribute(TDataStd_Name.GetID_s(), a) else '?'
roots = TDF_LabelSequence(); st.GetFreeShapes(roots)
parts = {}
def tess(shape):
    BRepMesh_IncrementalMesh(shape, 0.02, False, 0.2, True)
    V, F = [], []; off = 0
    ex = TopExp_Explorer(shape, TopAbs_FACE)
    while ex.More():
        f = TopoDS.Face(ex.Current()); loc = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(f, loc)
        if tri is not None:
            tr = loc.Transformation()
            for i in range(1, tri.NbNodes()+1):
                p = tri.Node(i).Transformed(tr); V.append((p.X(), p.Y(), p.Z()))
            rev = f.Orientation() == TopAbs_REVERSED
            for i in range(1, tri.NbTriangles()+1):
                a, b, c = tri.Triangle(i).Get()
                F.append((a-1+off, c-1+off, b-1+off) if rev else (a-1+off, b-1+off, c-1+off))
            off += tri.NbNodes()
        ex.Next()
    return np.array(V, float), np.array(F, np.int64)
def walk(l, depth=0):
    comps = TDF_LabelSequence(); st.GetComponents_s(l, comps)
    if comps.Length() == 0:
        return
    for i in range(1, comps.Length()+1):
        c = comps.Value(i); ref = TDF_Label()
        nm = name(c)
        if st.GetReferredShape_s(c, ref): nm = name(ref) if name(ref) != '?' else nm
        sub = TDF_LabelSequence(); st.GetComponents_s(ref, sub)
        if sub.Length():
            walk(ref, depth+1)  # nested assembly (locations of nested: handled via GetShape on comp)
        shape = st.GetShape_s(c)  # located
        if not sub.Length():
            V, F = tess(shape); parts[nm] = (V, F); print(nm, len(V), len(F))
for i in range(1, roots.Length()+1): walk(roots.Value(i))
np.savez_compressed(out, **{f'{k}__V': v[0] for k, v in parts.items()}, **{f'{k}__F': v[1] for k, v in parts.items()})
