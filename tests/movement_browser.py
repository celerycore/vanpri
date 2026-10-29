"""Real keyboard, controller and touch checks for the faster movement system.

Run npm start, then python3 tests/movement_browser.py.
"""
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/movement'
OUT.mkdir(parents=True,exist_ok=True)
URL=os.environ.get('GAME_URL','http://127.0.0.1:3000').rstrip('/')
errors=[]

def start(page,mode='training'):
    page.locator('#mode').select_option(mode);page.locator('#start-button').click()
    page.wait_for_function('vanguard.battle?.phase==="fight" && vanguard.battle.frame>1')

def ticks(page,count=1):
    target=page.evaluate('vanguard.battle.frame')+count
    page.wait_for_function('(target)=>vanguard.battle.frame>=target',arg=target)

def tap(page,key):
    page.keyboard.down(key);ticks(page);page.keyboard.up(key);ticks(page)

def record_events(page):
    page.evaluate('''() => {
      window.motionEvents=[];const battle=vanguard.battle,emit=battle.emit.bind(battle);
      battle.emit=(type,data={})=>{
        const player=battle.players[data.player||0];
        motionEvents.push({type,...data,airJumps:player.airJumps,airDashes:player.airDashes});emit(type,data);
      };
    }''')

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1100})
    page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(URL,wait_until='networkidle');start(page);record_events(page)
    page.evaluate('''() => {
      window.motionFrames=[];const paint=CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage=function(...args){
        if(args.length===9 && args[0].src===__VANGUARD_BUNDLE__['fighter-1.webp']) {
          const matrix=this.getTransform(),player=vanguard.battle?.players[0];
          if(player) motionFrames.push({top:matrix.f+args[6]*matrix.d,y:player.y,scale:matrix.d,pose:player.pose});
          if(motionFrames.length>600) motionFrames.shift();
        }
        return paint.apply(this,args);
      };
    }''')
    tap(page,'d');page.keyboard.down('d')
    page.wait_for_function('vanguard.battle.players[0].runDirection===1 && vanguard.battle.players[0].moveVx>7')
    page.evaluate('vanguard.battle.paused=true')
    page.locator('#arena').screenshot(path=str(OUT/'run.png'))
    page.keyboard.up('d');page.evaluate('vanguard.battle.paused=false');page.keyboard.press('r');ticks(page)
    tap(page,'w');ticks(page,5);tap(page,'w')
    page.wait_for_function('vanguard.battle.players[0].airJumps===0')
    page.wait_for_function('vanguard.battle.players[0].y>220')
    page.keyboard.down('d');tap(page,'ShiftLeft')
    page.wait_for_function('vanguard.battle.players[0].dashKind==="air"')
    page.evaluate('vanguard.battle.paused=true')
    page.locator('#arena').screenshot(path=str(OUT/'air-dash.png'))
    assert page.evaluate('vanguard.battle.players[0].airDashes')==0
    assert page.evaluate('vanguard.battle.players[0].airJumps')==0
    page.keyboard.up('d');page.evaluate('vanguard.battle.paused=false')
    page.wait_for_function('vanguard.battle.players[0].dashKind===null')
    tap(page,'ShiftLeft')
    assert page.evaluate('motionEvents.filter(e=>e.type==="dash"&&e.kind==="air").length')==1
    page.wait_for_function('vanguard.battle.players[0].y===0')
    assert page.evaluate('vanguard.battle.players[0].airJumps===1&&vanguard.battle.players[0].airDashes===1')
    samples=page.evaluate('motionFrames')
    assert max(frame['y'] for frame in samples)>200
    assert min(frame['top'] for frame in samples)>0,'The higher jump clipped outside the canvas'
    assert min(frame['scale'] for frame in samples)<.9
    print('PASS: double-tap run, double jump, one air dash per flight and camera framing.',flush=True)

    page.keyboard.press('r');ticks(page);tap(page,'s');tap(page,'w')
    assert page.evaluate('vanguard.battle.players[0].jumpLaunchSpeed')>20
    page.wait_for_function('vanguard.battle.players[0].y===0')
    page.keyboard.press('r');ticks(page)
    page.keyboard.down('a');tap(page,'ShiftLeft');page.keyboard.up('a')
    assert page.evaluate('motionEvents.some(e=>e.type==="dash"&&e.kind==="back")')
    page.wait_for_function('vanguard.battle.players[0].dashKind===null')
    page.keyboard.press('r');ticks(page)
    page.evaluate('vanguard.battle.players[0].x=315;vanguard.battle.players[1].x=395')
    page.keyboard.press('j');page.wait_for_function('vanguard.battle.players[0].attack?.hitConfirmed')
    page.keyboard.press('w');page.wait_for_function('motionEvents.some(e=>e.type==="jumpcancel")')
    assert page.evaluate('vanguard.battle.players[0].y')>0
    print('PASS: down-up high jump, Shift backdash and a hit-confirmed jump cancel.',flush=True)
    page.locator('#exit-button').click();start(page,'versus')
    page.keyboard.down('ArrowLeft');tap(page,'ShiftRight')
    page.wait_for_function('vanguard.battle.players[1].runDirection===-1')
    assert page.evaluate('vanguard.battle.players[0].runDirection')==0
    page.keyboard.up('ArrowLeft');page.locator('#exit-button').click()

    # A standard controller's left trigger maps to the same dash action.
    page.evaluate('''() => {
      window.testPad={connected:true,axes:[1,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};
      testPad.buttons[6]={pressed:true,value:1};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[testPad]});
    }''')
    start(page)
    page.wait_for_function('vanguard.battle.players[0].runDirection===1')
    page.evaluate('testPad.axes[0]=0;testPad.buttons[6]={pressed:false,value:0}')
    print('PASS: player-two right Shift and simulated gamepad left-trigger dashing.',flush=True)
    page.locator('#exit-button').click();page.locator('#sprite-checker-button').click()
    page.wait_for_function('document.getElementById("sprite-canvas").dataset.ready==="true"')
    page.locator('#sprite-animation').select_option('run')
    page.wait_for_function('document.getElementById("sprite-canvas").dataset.ready==="true"')
    expect(page.locator('#sprite-walk-speed')).to_have_text('5.25')
    expect(page.locator('#sprite-run-speed')).to_have_text('11.2')
    page.locator('#sprite-dialog').screenshot(path=str(OUT/'movement-sprites.png'))
    context.close()

    mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    phone=mobile.new_page();phone.on('pageerror',lambda error:errors.append(str(error)))
    phone.goto(URL,wait_until='networkidle');mobile.set_offline(True);start(phone);record_events(phone)
    expect(phone.locator('[data-action="dash"]')).to_be_visible()
    phone.locator('[data-action="dash"]').tap()
    phone.wait_for_function('motionEvents.some(e=>e.type==="dash"&&e.kind==="run")')
    phone.locator('[data-action="up"]').tap();phone.wait_for_function('vanguard.battle.players[0].y>0')
    phone.locator('[data-action="dash"]').tap()
    phone.wait_for_function('motionEvents.some(e=>e.type==="dash"&&e.kind==="air"&&e.airDashes===0)')
    assert phone.evaluate('document.documentElement.scrollWidth<=innerWidth')
    phone.screenshot(path=str(OUT/'mobile-controls.png'),full_page=True)
    print('PASS: mobile ground/air dash buttons work offline without horizontal overflow.',flush=True)
    mobile.close()
    assert not errors,errors
    (OUT/'results.json').write_text(json.dumps({'passed':True,'errors':errors,'cameraSamples':samples,'checks':['double-tap run','double jump','air dash limit','camera framing','high jump','backdash','jump cancel','P2 dash','simulated gamepad dash','movement sprite data','mobile offline dash']},indent=2))
    browser.close()
