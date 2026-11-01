import json, numpy as np
from PIL import Image, ImageDraw
m = json.load(open('/tmp/meta.json'))
vx, vz, cell = m['vx'], m['vz'], m['cell']
H = np.fromfile('/tmp/heights.bin', dtype='<f4').reshape(vz, vx)
# hillshade
gy, gx = np.gradient(H, cell)
nz = 1.0/np.sqrt(gx*gx+gy*gy+1)
nx, ny = -gx*nz, -gy*nz
L = np.array([-0.5, 0.6, 0.62]); L = L/np.linalg.norm(L)
shade = np.clip(nx*L[0]+ny*L[1]+nz*L[2], 0, 1)**1.2
# depth ramp
d = np.clip(-H/1150, 0, 1)
stops = [(0.0,(255,240,190)),(0.08,(200,230,150)),(0.16,(90,210,190)),(0.30,(40,150,190)),
         (0.45,(24,86,150)),(0.62,(14,44,104)),(0.80,(8,22,64)),(1.0,(4,8,26))]
img = np.zeros((vz,vx,3))
for k in range(len(stops)-1):
    a,ca = stops[k]; b,cb = stops[k+1]
    msk = (d>=a)&(d<b)
    t = ((d-a)/max(b-a,1e-6))[msk][:,None]
    img[msk] = (np.array(ca)*(1-t)+np.array(cb)*t)
img = np.clip(img*(0.45+0.8*shade[...,None]), 0, 255).astype(np.uint8)
out = Image.fromarray(img).resize((vx*2, vz*2), Image.LANCZOS)
dr = ImageDraw.Draw(out)
sx = 2.0; sy = 2.0
def W2P(x,z):
    return ((x-m['minX'])/cell*sx, (z-m['minZ'])/cell*sy)
# contours each 50m
for lvl in range(-1100, 0, 50):
    pass
regions = json.load(open('/tmp/regions.json')) if False else None
out.save('/tmp/depthmap.png')
print('saved', out.size)
# cross section along the route (x = -600..-350 varying, use z line at x=-600 then x=-350)
import math
fig = Image.new('RGB',(1200,300),(8,10,16)); fd=ImageDraw.Draw(fig)
for row, xconst in enumerate([-600]):
    pts=[]
    for k in range(1200):
        z = 1800 - (k/1199)*3600
        pts.append(f.heightAt if False else (k, H[int((z-m['minZ'])/cell), int((xconst-m['minX'])/cell)]))
    for i in range(len(pts)-1):
        y0 = 150 - pts[i][1]*0.11; y1 = 150 - pts[i+1][1]*0.11
        if abs(y0)>900: y0=max(-900,min(900,y0)); 
        if abs(y1)>900: y1=max(-900,min(900,y1))
        fd.line([(pts[i][0], y0), (pts[i+1][0], y1)], fill=(120,220,255))
    fd.line([(0,150),(1200,150)], fill=(80,255,220))
fig.save('/tmp/xsection.png')
