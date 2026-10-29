"""Chromium regression for visible contact sparks and frame-independent effects.

Run with npm start, then python3 tests/combat_browser.py.
"""
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/combat'
OUT.mkdir(parents=True,exist_ok=True)
URL=os.environ.get('GAME_URL','http://127.0.0.1:3000').rstrip('/')
errors=[]

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1100})
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(URL,wait_until='networkidle')
    page.locator('#mode').select_option('training')
    page.locator('#opponent').select_option('1')
    page.locator('#start-button').click()
    page.wait_for_function('vanguard.battle?.frame>5')
    page.locator('#show-hitboxes').check()
    expect(page.locator('#show-hitboxes')).to_be_checked()
    page.locator('#show-hitboxes').focus()
    page.keyboard.press('Space')
    expect(page.locator('#show-hitboxes')).not_to_be_checked()
    page.keyboard.press('Space')
    expect(page.locator('#show-hitboxes')).to_be_checked()
    page.evaluate('''() => {
      const paint=CanvasRenderingContext2D.prototype.drawImage;
      window.sparkDraws=[];
      CanvasRenderingContext2D.prototype.drawImage=function(...args) {
        if(args[0].src===__VANGUARD_BUNDLE__['impact.webp']) {
          const matrix=this.getTransform();
          sparkDraws.push({x:matrix.e,y:matrix.f,width:args[3],alpha:this.globalAlpha});
          if(sparkDraws.length>256) sparkDraws.shift();
        }
        return paint.apply(this,args);
      };
      const battle=vanguard.battle, emit=battle.emit.bind(battle);
      battle.emit=(type,event)=>{
        emit(type,event);
        if(type==='hit'||type==='block') { window.lastContact={type,...event}; battle.paused=true; }
      };
      battle.players[0].x=340; battle.players[1].x=420;
    }''')
    page.locator('#arena').focus()
    page.keyboard.press('j')
    page.wait_for_function('window.lastContact?.type==="hit" && sparkDraws.length>0')
    contact=page.evaluate('lastContact')
    assert 360<contact['x']<440 and 20<contact['y']<230,contact
    first=page.evaluate('sparkDraws.at(-1)')
    frame=page.evaluate('vanguard.battle.frame')
    page.wait_for_timeout(350)
    assert page.evaluate('vanguard.battle.frame')==frame
    assert page.evaluate('sparkDraws.at(-1)')==first,'Paused sparks or shake changed with paint count'
    page.locator('#arena').screenshot(path=str(OUT/'hit-contact.png'))
    assert page.evaluate('vanguard.battle.players[1].hp')==956
    print('PASS: a real keyboard hit produces a contact spark; pause freezes its size, fade and shake.',flush=True)

    page.evaluate('vanguard.battle.paused=false')
    page.wait_for_function('!vanguard.battle.players[0].attack && !vanguard.battle.players[1].stun')
    page.keyboard.press('r')
    page.evaluate('vanguard.battle.players[0].x=340;vanguard.battle.players[1].x=420;window.lastContact=null')
    page.keyboard.down('s');page.keyboard.press('j')
    page.wait_for_function('window.lastContact?.type==="hit"')
    page.keyboard.up('s')
    assert page.evaluate('vanguard.battle.players[0].attack.low')
    assert page.evaluate('lastContact.y')<100
    page.locator('#arena').screenshot(path=str(OUT/'low-contact.png'))
    print('PASS: crouching attacks use a crouching sprite and produce a low contact spark.',flush=True)

    # Exercise the real Canvas renderer separately so hundreds of paints cannot
    # hide effect aging bugs behind the normal requestAnimationFrame cadence.
    result=page.evaluate('''async () => {
      const {ArenaRenderer,Assets}=await import('./src/renderer.js');
      const {Battle}=await import('./src/engine.js');
      const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
      const assets=new Assets();
      await assets.load(['impact.webp','fighter-1.webp','stage-school.webp']);
      const renderer=new ArenaRenderer(canvas,assets,vanguard.manifest);
      const battle=new Battle({characters:[vanguard.manifest.characters[0],vanguard.manifest.characters[0]],mode:'training'});
      const hit={type:'hit',x:450,y:150,heavy:true,color:'#ff6a94'};
      renderer.event(hit);
      const before=JSON.stringify(renderer.effects);
      for(let paint=0;paint<100;paint++) renderer.draw(battle,{id:'school'},0);
      const after=JSON.stringify(renderer.effects);
      renderer.resetEffects();
      renderer.event(hit);
      renderer.event({type:'block',x:650,y:150,color:'#ff6a94'});
      const ctx=canvas.getContext('2d');ctx.fillStyle='#100a18';ctx.fillRect(0,0,960,540);
      for(let tick=0;tick<3;tick++) renderer.updateEffects();
      renderer.drawImpacts();renderer.drawParticles();
      const pixels=ctx.getImageData(400,260,300,120).data;
      let cyan=0,gold=0;
      for(let i=0;i<pixels.length;i+=4) {
        if(pixels[i+2]>pixels[i]+25 && pixels[i+1]>pixels[i]+20) cyan++;
        if(pixels[i]>pixels[i+2]+25 && pixels[i+1]>pixels[i+2]+15) gold++;
      }
      for(let tick=0;tick<25;tick++) renderer.updateEffects();
      return {sameAfter100Paints:before===after,cyan,gold,expired:renderer.effects.impacts.length===0&&renderer.effects.particles.length===0};
    }''')
    assert result['sameAfter100Paints'],result
    assert result['cyan']>10 and result['gold']>10,result
    assert result['expired'],result
    print('PASS: guards render cyan, hits render gold, and 100 extra paints do not age effects.',flush=True)
    assert not errors,errors
    (OUT/'results.json').write_text(json.dumps({'passed':True,'errors':errors,'renderChecks':result},indent=2))
    browser.close()
