"""Real-browser checks for the frame-data inspector, exports and game isolation.

Run npm start, then python3 tests/sprite_browser.py.
"""
from pathlib import Path
import json
import os
from PIL import Image
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/sprites'
OUT.mkdir(parents=True,exist_ok=True)
URL=os.environ.get('GAME_URL','http://127.0.0.1:3000').rstrip('/')
errors=[]

def ready(page):
    page.wait_for_function('document.getElementById("sprite-canvas").dataset.ready==="true"')

def choose(page,selector,value):
    page.locator(selector).select_option(value)
    ready(page)

def export(page,selector,destination):
    with page.expect_download() as item:page.locator(selector).click()
    path=OUT/destination;item.value.save_as(path)
    return path

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1100},accept_downloads=True)
    page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(URL,wait_until='networkidle')
    page.locator('[data-fighter="3"]').click()
    page.locator('#sprite-checker-button').click();ready(page)
    expect(page.locator('#sprite-fighter')).to_have_value('3')
    choose(page,'#sprite-animation','heavy')
    expect(page.locator('#sprite-damage')).to_have_text('135')
    choose(page,'#sprite-fighter','1');choose(page,'#sprite-animation','light')
    expect(page.locator('#sprite-startup')).to_have_text('6f')
    expect(page.locator('#sprite-active')).to_have_text('4f')
    expect(page.locator('#sprite-recovery')).to_have_text('13f')
    sequence=page.evaluate('vanguard.manifest.characters[0].animations.light')
    expect(page.locator('#sprite-id')).to_have_text('#'+str(sequence[0]['id']))
    page.locator('#sprite-next').click()
    expect(page.locator('#sprite-id')).to_have_text('#'+str(sequence[1]['id']))
    page.locator('#sprite-previous').click();page.locator('#sprite-previous').click()
    expect(page.locator('#sprite-position')).to_have_text('08 / 08')
    page.locator('#sprite-canvas').focus();page.keyboard.press('Home')
    expect(page.locator('#sprite-position')).to_have_text('01 / 08')
    page.keyboard.press('ArrowRight')
    expect(page.locator('#sprite-position')).to_have_text('02 / 08')
    page.locator('#sprite-speed').select_option('0.25')
    page.locator('#sprite-play').click()
    page.wait_for_function('document.getElementById("sprite-scrub").value!=="1"')
    page.locator('#sprite-play').click()
    paused=page.locator('#sprite-scrub').input_value();page.wait_for_timeout(250)
    assert page.locator('#sprite-scrub').input_value()==paused
    print('PASS: selected fighter, actual damage, frame stepping, keyboard and variable-speed playback.',flush=True)

    choose(page,'#sprite-mode','combat')
    expect(page.locator('#sprite-position')).to_have_text('01 / 23')
    expect(page.locator('#sprite-phase')).to_have_text('startup')
    page.locator('[data-sprite-frame="5"]').click()
    expect(page.locator('#sprite-phase')).to_have_text('active')
    right=json.loads(export(page,'#sprite-json','active-right.json').read_text())
    assert right['gameFrame']==6 and right['attackBox'] is not None
    assert right['spriteId']==int(page.locator('#sprite-canvas').get_attribute('data-sprite-id'))
    image_file=export(page,'#sprite-png','active.png')
    with Image.open(image_file) as image:
        assert image.size==(right['atlas']['width'],right['atlas']['height'])
        assert image.mode=='RGBA' and image.getchannel('A').getextrema()==(0,255)
    page.locator('#sprite-flip').check()
    left=json.loads(export(page,'#sprite-json','active-left.json').read_text())
    assert left['attackBox']['left']==-right['attackBox']['right']
    page.locator('#sprite-onion').check();page.locator('#sprite-boxes').uncheck();page.locator('#sprite-boxes').check()
    page.locator('#sprite-flip').uncheck()
    page.locator('#sprite-zoom').select_option('1.5');page.locator('#sprite-zoom').select_option('1')
    page.locator('#sprite-dialog').screenshot(path=str(OUT/'checker-desktop.png'))
    page.locator('[data-sprite-frame="9"]').click()
    expect(page.locator('#sprite-phase')).to_have_text('recovery')
    recovery=json.loads(export(page,'#sprite-json','recovery.json').read_text())
    assert recovery['attackBox'] is None
    choose(page,'#sprite-animation','idle')
    expect(page.locator('#sprite-mode')).to_have_value('animation')
    expect(page.locator('#sprite-mode option[value="combat"]')).to_have_attribute('disabled','')
    print('PASS: active/recovery data agrees with the game, mirrored boxes, transparent PNG and JSON exports.',flush=True)

    # Closing during an asynchronous image load must not restart playback.
    page.evaluate('''() => {
      const fighter=document.getElementById('sprite-fighter');fighter.value='10';
      fighter.dispatchEvent(new Event('change'));document.getElementById('sprite-dialog').close();
    }''')
    expect(page.locator('#sprite-dialog')).not_to_be_visible()
    expect(page.locator('#sprite-play')).to_have_attribute('aria-pressed','false')
    page.locator('#sprite-checker-button').click();ready(page)
    expect(page.locator('#sprite-fighter')).to_have_value('3')
    page.locator('#sprite-dialog [data-close]').click()
    page.locator('#mode').select_option('training');page.locator('#start-button').click()
    page.wait_for_function('vanguard.battle?.frame>5')
    page.locator('#sprite-checker-button').click();ready(page)
    assert page.evaluate('vanguard.battle.paused')
    frame=page.evaluate('vanguard.battle.frame')
    page.locator('#sprite-canvas').focus();page.keyboard.press('ArrowRight');page.keyboard.press('Space');page.keyboard.press('j')
    page.wait_for_timeout(150)
    assert page.evaluate('vanguard.battle.frame')==frame
    assert page.evaluate('vanguard.battle.players[0].attack') is None
    page.keyboard.press('Escape')
    page.wait_for_function('!vanguard.battle.paused && vanguard.battle.frame>'+str(frame))
    page.keyboard.press('Escape');page.wait_for_function('vanguard.battle.paused')
    page.locator('#sprite-checker-button').click();ready(page)
    page.locator('#sprite-dialog [data-close]').click()
    assert page.evaluate('vanguard.battle.paused')
    page.locator('#resume-button').click();page.locator('#exit-button').click()
    print('PASS: closing cancels sprite playback; live matches pause/resume and existing pauses are preserved.',flush=True)
    context.close()

    # Standalone assets must remain inspectable under preview restrictions and
    # with all network access disabled after the initial page has loaded.
    mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,accept_downloads=True)
    phone=mobile.new_page();phone.on('pageerror',lambda error:errors.append(str(error)))
    phone.add_init_script('globalThis.fetch=()=>Promise.reject(new Error("Preview blocks fetch"))')
    phone.goto(URL,wait_until='networkidle');mobile.set_offline(True)
    assert phone.evaluate('document.documentElement.scrollWidth<=innerWidth')
    phone.locator('#sprite-checker-button').tap();ready(phone)
    choose(phone,'#sprite-fighter','10');choose(phone,'#sprite-animation','airHeavy')
    choose(phone,'#sprite-mode','combat')
    phone.locator('#sprite-next').tap()
    assert phone.evaluate('document.getElementById("sprite-dialog").scrollWidth<=document.getElementById("sprite-dialog").clientWidth')
    phone.locator('#sprite-dialog').evaluate('(dialog)=>dialog.scrollTop=0')
    phone.screenshot(path=str(OUT/'checker-mobile.png'))
    offline=json.loads(export(phone,'#sprite-json','offline-mobile.json').read_text())
    assert offline['fighterId']==10 and offline['animation']=='airHeavy'
    print('PASS: mobile checker fits the viewport, loads another fighter and exports data completely offline.',flush=True)
    mobile.close()

    # The modular development page also supports retries after a failed atlas.
    dev=browser.new_context();page=dev.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
    dev.route('**/assets/fighter-10.webp',lambda route:route.abort())
    page.goto(URL+'/dev/',wait_until='networkidle')
    page.locator('#sprite-checker-button').click();ready(page)
    page.locator('#sprite-fighter').select_option('10')
    expect(page.locator('#sprite-status')).to_contain_text('Could not load')
    expect(page.locator('#sprite-play')).to_be_disabled()
    choose(page,'#sprite-fighter','2')
    expect(page.locator('#sprite-status')).to_contain_text('Haruka')
    print('PASS: modular development works and a failed atlas can be recovered by choosing another fighter.',flush=True)
    dev.close()
    assert not errors,errors
    (OUT/'results.json').write_text(json.dumps({'passed':True,'errors':errors,'checks':['frame metadata','combat phases','PNG/JSON export','mirrored hitboxes','playback and keyboard','async close','game pause isolation','mobile offline','modular load recovery']},indent=2))
    browser.close()
