"""Convert the user's 2D Fighter Maker 2002 files to browser assets.

Usage: python3 tools/extract_assets.py /path/to/extracted/vanguard-princess
Requires Pillow and ffmpeg. The Windows executables are never run.
"""
import argparse
import json
import struct
import subprocess
import tempfile
from pathlib import Path
from PIL import Image
import game_data

DEST = Path(__file__).resolve().parents[1] / 'assets'

def frames(game, script, limit=18):
    begin = game.scripts[script]['command']
    end = game.scripts[script+1]['command']
    result = []
    for cmd in game.commands[begin:end]:
        if cmd[0] != 12:
            continue
        duration, image, x, y = struct.unpack_from('<HHhh',cmd,1)
        image &= 8191
        meta = game.images.get(image)
        if not meta or not (50 <= meta['height'] <= 510 and 40 <= meta['width'] <= 700) or abs(y)>190:
            continue
        if duration > 120 or not duration:
            continue
        if result and (result[-1]['id'],result[-1]['x'],result[-1]['y']) == (image,x,y):
            result[-1]['t'] = min(12,result[-1]['t']+duration)
            continue
        result.append(dict(id=image,t=min(duration,12),x=x,y=y))
        if len(result) >= limit:
            break
    return result

def palette(game):
    pos = game.image_end
    while not game.data[pos]:
        pos += 1
    pal = game.data[pos-3:pos-3+1024]
    assert set(pal[3::4]) == {1}, 'Unsupported character palette'
    return pal

def pack(game, ids, pal, stem, anchors=None):
    width = 2048
    x=y=row=0
    placements={};images={}
    for index in sorted(ids):
        image=game.image(index,pal)
        if anchors is not None:
            alpha=image.getchannel('A')
            pixels=[x for y in range(max(0,image.height-22),image.height) for x in range(image.width) if alpha.getpixel((x,y))]
            anchors[str(index)]=round(sum(pixels)/len(pixels),2) if pixels else image.width/2
        if x+image.width+2>width:
            x=0;y+=row+2;row=0
        placements[str(index)]=[x,y,image.width,image.height]
        images[index]=image
        x+=image.width+2;row=max(row,image.height)
    atlas=Image.new('RGBA',(width,y+row))
    for index,im in images.items():
        rect=placements[str(index)]
        atlas.paste(im,(rect[0],rect[1]))
    atlas.save(DEST/f'{stem}.webp',lossless=True,method=5)
    return placements

def audio(game, target, minimum=1_000_000, index=None):
    pos=0;clips=[]
    while (i:=game.data.find(b'RIFF',pos))>=0:
        pos=i+4
        if game.data[i+8:i+12]!=b'WAVE':continue
        size=struct.unpack_from('<I',game.data,i+4)[0]+8
        if i+size<=len(game.data):clips.append((i,size))
    eligible=[clip for clip in clips if clip[1]>=minimum]
    if index is None:
        if not eligible:return
        i,size=max(eligible,key=lambda c:c[1])
    else:i,size=clips[index]
    with tempfile.TemporaryDirectory() as temp:
        wav=Path(temp)/'source.wav';wav.write_bytes(game.data[i:i+size])
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-c:a','libvorbis','-q:a','3',str(DEST/f'{target}.ogg')],check=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    args=parser.parse_args()
    game_data.ROOT=args.source
    DEST.mkdir(exist_ok=True)
    manifest={'characters':[], 'stages':[], 'assists':[]}
    roster=[
        ('Yui','Kutuna','SWORD / BALANCED','#ff6a94',3.5,130,'wave','Sakuya wave'),
        ('Haruka','Kutuna','GUNNER / PRECISION','#78d5fa',3.1,100,'shot','Astral shot'),
        ('Lilith','','GRAPPLER / POWER','#e9a2f4',3.0,82,'rush','Crimson rush'),
        ('Luna','Himeki','GUNNER / PRESSURE','#ff876a',3.3,95,'burst','Twin fire'),
        ('Kurumi','Mirumati','BRAWLER / SPEED','#d9ea82',4.1,85,'rush','Meteor rush'),
        ('Saki','Mitonoya','SWORD / REACH','#ac9fff',3.8,154,'dash','Phantom slash'),
        ('Kaede','Hiiragi','MAGIC / CONTROL','#f2a6cf',3.4,120,'wave','Violet wave'),
        ('Natalia','Glinka','HEAVY / ARMOR','#a1c7f3',2.6,105,'armor','Iron advance'),
        ('Eri','Hasumi','KICKS / MOBILITY','#81ebd4',4.2,115,'dash','Comet kick'),
        ('Ayane','Ikuse','BOW / VERSATILE','#ffc98b',3.5,128,'wave','Wind arrow'),
    ]
    special_scripts=[269,233,261,233,267,261,269,267,261,269]
    for number,(name,surname,style,color,speed,reach,kind,move) in enumerate(roster,1):
        game=game_data.GameFile(f'c{number}.player');pal=palette(game)
        anim={
            'idle':frames(game,1,16),'walk':frames(game,2,12),'back':frames(game,3,12),
            'jump':frames(game,4,13),'crouch':frames(game,11,5),'hit':frames(game,47,6),
            'guard':frames(game,182,5),'ko':frames(game,164,10),'win':frames(game,22,12),
            'light':frames(game,222 if number in (2,4) else 213,8),
            'medium':frames(game,223 if number in (2,4) else 228,12),
            'heavy':frames(game,224 if number in (2,4) else (232 if number==9 else 234),16),
            'special':frames(game,special_scripts[number-1],14),
            'super':frames(game,279 if number!=5 else 280,20),
        }
        for key in anim:
            if not anim[key]:anim[key]=anim['medium'] or anim['idle']
        ids={f['id'] for sequence in anim.values() for f in sequence}
        anchors={}
        placements=pack(game,ids,pal,f'fighter-{number}',anchors)
        portrait=game.image(anim['idle'][0]['id'],pal)
        alpha = portrait.getchannel('A')
        foot_points = [(x, alpha.getpixel((x,y))) for y in range(max(0,portrait.height-22),portrait.height) for x in range(portrait.width) if alpha.getpixel((x,y))]
        foot_center = sum(x*a for x,a in foot_points)/sum(a for _,a in foot_points)
        correction = round(foot_center - portrait.width - anim['idle'][0]['x'],2)
        portrait.save(DEST/f'portrait-{number}.webp',lossless=True)
        manifest['characters'].append(dict(id=number,name=name,surname=surname,style=style,color=color,
            speed=speed,reach=reach,kind=kind,move=move,atlas=f'fighter-{number}.webp',
            portrait=f'portrait-{number}.webp',rects=placements,anchors=anchors,animations=anim,baseY=anim['idle'][0]['y'],anchorCorrection=correction))
        print(name,len(ids),'sprites')

    for stem,title,tag in [('school','Angel courtyard','BLUE HOUR'),('shrine','Torii shrine','GOLDEN HOUR'),
            ('roof','City rooftop','OPEN SKY'),('mansion','Rose mansion','AFTERNOON'),
            ('night','Midnight garden','MOONLIGHT'),('ruins','Forgotten ruins','ANCIENT GROUND')]:
        game=game_data.GameFile(stem+'.stage')
        background=game.image(0).convert('RGB')
        background.save(DEST/f'stage-{stem}.webp',quality=93)
        thumb=background.copy();thumb.thumbnail((320,240));thumb.save(DEST/f'thumb-{stem}.webp',quality=85)
        audio(game,f'music-{stem}')
        manifest['stages'].append(dict(id=stem,name=title,tag=tag,width=background.width,height=background.height))
        print(title)

    game=game_data.GameFile('c1.player');pal=palette(game)
    for key,name,index,start,cost,description in [('eko','Eko',780,788,1,'A quick strike to extend your combo.'),
            ('kanae','Kanae',1152,1164,1,'Sets a delayed trap near your opponent.'),
            ('sierra','Sierra',912,924,1,'Covers the arena with a long-range beam.'),
            ('juliet','Juliet',1016,1042,1,'A heavy strike to stop an approaching rival.')]:
        ids=list(range(index,index+8))+list(range(start,start+7))
        ids=[i for i in ids if i in game.images]
        rects=pack(game,ids,pal,f'assist-{key}')
        game.image(index,pal).save(DEST/f'assist-{key}-portrait.webp',lossless=True)
        manifest['assists'].append(dict(id=key,name=name,description=description,atlas=f'assist-{key}.webp',
            rects=rects,idle=ids[:8],attack=[i for i in range(start,start+7) if i in game.images]))

    game=game_data.GameFile('vanpri.KGT')
    for name,idx in [('ko',51),('fight',60),('impact',92)]:
        game.image(idx).save(DEST/f'{name}.webp',lossless=True)
    for name,idx in [('start',3),('select',7),('ko',9),('win',12)]:
        audio(game,f'sfx-{name}',index=idx)
    (DEST/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
    (DEST/'NOTICE.txt').write_text('Vanguard Princess artwork, sprites, stages and audio were extracted from the files supplied by the user.\nOriginal game: Tomoaki Sugeno. Licensed by eigoMANGA. All rights reserved.\nBrowser combat and UI are a new adaptation, not the original 2D Fighter Maker engine.\n')

if __name__=='__main__':main()
