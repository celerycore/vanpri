"""Derive body bounds, visible attack reach and peak frames from converted atlases.

These are browser-adaptation collision shapes, not original FM2K hitbox data.
Requires Pillow and numpy only when regenerating the committed metadata.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image

SCALE=.83

def bounds(image,anchor,standing=None):
    alpha=np.asarray(image.getchannel('A'))>127
    height,width=alpha.shape
    # Isolate the torso/head column, excluding flags, long weapons and hair tails.
    left=max(0,int(anchor)-55);right=min(width,int(anchor)+56)
    # Measure torso width independently of the narrower head column. A raised
    # gun or pole must not make Haruka's vulnerable head extend into her weapon.
    ys,xs=np.nonzero(alpha[int(height*.28):int(height*.72),left:right])
    center=float(np.median(xs)+left) if len(xs) else anchor
    spread=float(np.quantile(abs(xs+left-center),.8)) if len(xs) else 28
    head_left=max(0,int(center)-30);head_right=min(width,int(center)+31)
    masses=alpha[:,head_left:head_right].sum(axis=1)
    torso=int(height*.52)
    dense=np.flatnonzero(masses>=12)
    if len(dense):
        near=int(dense[np.argmin(abs(dense-torso))])
        top=near;gap=0
        for y in range(near,-1,-1):
            gap=0 if masses[y]>=12 else gap+1
            if gap>9:break
            if masses[y]>=12:top=y
    else:top=0
    half=round(min(34,max(18,(spread+6)*SCALE)),2)
    body_height=(height-top-5)*SCALE
    if standing:body_height=min(standing*1.08,body_height)
    return [round((center-anchor)*SCALE,2),half,round(max(40,body_height),2)]

def calibrate(assets=Path(__file__).resolve().parents[1]/'assets'):
    manifest=json.loads((assets/'manifest.json').read_text())
    result={}
    for character in manifest['characters']:
        atlas=Image.open(assets/character['atlas']).convert('RGBA')
        images={key:atlas.crop((x,y,x+w,y+h)) for key,(x,y,w,h) in character['rects'].items()}
        idle=str(character['animations']['idle'][0]['id'])
        standing=bounds(images[idle],character['anchors'][idle])[2]
        frames={}
        for key,image in images.items():
            anchor=character['anchors'][key]
            body=bounds(image,anchor,standing)
            alpha=np.asarray(image.getchannel('A'))>127
            h,w=alpha.shape
            strikes={}
            for level,(low,high) in {'normal':(35,standing*.87),'low':(8,min(95,standing*.47)),'air':(12,standing*.8)}.items():
                y0=max(0,int(h-high/SCALE));y1=min(h,int(h-low/SCALE))
                ys,xs=np.nonzero(alpha[y0:y1,:])
                eligible=xs>anchor+body[0]/SCALE+body[1]*.6/SCALE
                xs=xs[eligible];ys=ys[eligible]+y0
                if len(xs)>8:
                    edge=float(np.quantile(xs,.97))
                    near=xs>=edge-20
                    heights=(h-ys[near])*SCALE
                    extent=min(260,max(24,(edge-anchor)*SCALE))
                    bottom=max(low,float(np.quantile(heights,.10))-6)
                    top=min(high,float(np.quantile(heights,.90))+6)
                    if top-bottom<16:
                        middle=(top+bottom)/2;bottom=middle-8;top=middle+8
                    strikes[level]=[round(extent,2),round(bottom,2),round(top,2)]
                else:strikes[level]=[round(max(24,body[1]),2),low,min(high,low+24)]
            frames[key]={'body':body,'strike':strikes}
        peaks={}
        for pose,sequence in character['animations'].items():
            if pose not in ['light','medium','heavy','special','super','lowLight','lowMedium','lowHeavy','airLight','airMedium','airHeavy']:continue
            band='low' if pose.startswith('low') else 'air' if pose.startswith('air') else 'normal'
            last=max(1,int(len(sequence)*.8))
            candidates=range(1,last) if last>1 else range(len(sequence))
            # Prefer the earliest fully extended pose to avoid recovery/idle branches.
            peak=max(candidates,key=lambda i:frames[str(sequence[i]['id'])]['strike'][band][0]-.35*i)
            peaks[pose]=peak
        result[str(character['id'])]={'standing':standing,'frames':frames,'peaks':peaks}
        print(character['name'],'body height',standing,'peak frames',peaks)
    target=assets.parent/'src/combat-data.js'
    target.write_text('// Generated from visible atlas geometry by tools/calibrate_hitboxes.py.\nexport const COMBAT_DATA = '+json.dumps(result,separators=(',',':'))+';\n')
    return result

if __name__=='__main__':calibrate()
