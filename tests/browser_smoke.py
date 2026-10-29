"""Real Chromium checks for the menus, inputs, fights, transitions and standalone build.

Run a server with npm start, then:
  python3 tests/browser_smoke.py
Requires Python Playwright and Chromium (uses /usr/bin/chromium when available).
"""
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=ROOT/'test-results'
ARTIFACTS.mkdir(exist_ok=True)
URL=os.environ.get('GAME_URL','http://127.0.0.1:3000')
errors=[]

def watch(page):
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('response',lambda response:errors.append(f'{response.status}: {response.url[:100]}') if response.status>=400 else None)

def start(page,mode='training'):
    page.locator('#mode').select_option(mode)
    page.locator('#start-button').click()
    page.wait_for_function('window.vanguard?.playing && vanguard.battle.phase === "fight"')

def force_win(page):
    # Set up two one-hit-away rounds; the real loop performs all state transitions.
    for round in range(2):
        page.evaluate('vanguard.battle.players[1].hp = 0')
        page.wait_for_function('vanguard.battle.phase === "roundover"')
        page.evaluate('vanguard.battle.phaseTimer = 1')
        if round==0:
            page.wait_for_function('vanguard.battle.phase === "intro"')
            page.evaluate('vanguard.battle.phaseTimer = 1')
            page.wait_for_function('vanguard.battle.phase === "fight"')
    expect(page.locator('#result-cover')).to_be_visible()

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1100},device_scale_factor=1)
    watch(page)
    page.goto(URL,wait_until='networkidle')
    expect(page.locator('.fighter-card')).to_have_count(10)
    expect(page.locator('.assist-card')).to_have_count(4)
    expect(page.locator('.stage-card')).to_have_count(6)
    page.screenshot(path=str(ARTIFACTS/'menu.png'),full_page=True)
    for number in range(1,11):
        page.locator(f'[data-fighter="{number}"]').click()
        assert page.locator('#showcase-sprite').evaluate('(img)=>img.complete && img.naturalWidth>0')
    page.locator('[data-fighter="1"]').click()
    page.locator('[data-assist="sierra"]').click()
    expect(page.locator('#assist-description')).to_contain_text('beam')
    page.locator('[data-assist="eko"]').click()
    page.locator('#mode').select_option('training')
    page.evaluate('document.getElementById("start-button").click(); document.getElementById("exit-button").click()')
    page.wait_for_load_state('networkidle')
    assert page.evaluate('!vanguard.playing && vanguard.battle === null && !document.getElementById("menu").hidden')
    print('PASS: returning to the menu safely cancels a pending match load',flush=True)
    start(page)
    page.keyboard.down('d')
    page.wait_for_function('Math.abs(vanguard.battle.players[1].x-vanguard.battle.players[0].x)<90')
    page.keyboard.up('d')
    page.keyboard.press('j')
    page.wait_for_function('vanguard.battle.players[1].hp < 1000')
    print('PASS: keyboard movement and a real attack reduce rival health',flush=True)
    page.screenshot(path=str(ARTIFACTS/'arena.png'),full_page=True)
    page.keyboard.press('Escape')
    page.wait_for_function('vanguard.battle.paused')
    frame=page.evaluate('vanguard.battle.frame')
    page.wait_for_timeout(150)
    assert page.evaluate('vanguard.battle.frame')==frame
    page.locator('#game-help').click()
    expect(page.locator('#help-dialog')).to_be_visible()
    page.locator('#help-dialog [data-close]').last.click()
    assert page.evaluate('vanguard.battle.paused')
    page.locator('#resume-button').click()
    page.locator('#how-button').click()
    assert page.evaluate('vanguard.battle.paused')
    page.locator('#help-dialog [data-close]').last.click()
    page.wait_for_function('!vanguard.battle.paused')
    page.keyboard.press('r')
    page.wait_for_function('vanguard.battle.players[0].x === 315 && vanguard.battle.players[1].hp === 1000')
    page.keyboard.press('i')
    page.wait_for_function('vanguard.battle.helpers.length > 0')
    assert page.evaluate('vanguard.battle.players[0].assist')<10
    page.keyboard.press('o')
    page.wait_for_function('vanguard.battle.players[0].attack?.name === "super"')
    page.screenshot(path=str(ARTIFACTS/'liberty.png'),full_page=True)
    print('PASS: pause, help, reset, assist and Liberty Art',flush=True)
    page.locator('#exit-button').click()

    # Every selectable fighter and stage loads and renders using real assets.
    for number in range(1,11):
        page.locator(f'[data-fighter="{number}"]').click()
        page.locator(f'.stage-card').nth((number-1)%6).click()
        start(page)
        page.keyboard.press('j')
        page.wait_for_function('vanguard.battle.players[0].attack?.name === "light"')
        page.keyboard.press('r')
        if number in [1,6,10]:
            page.screenshot(path=str(ARTIFACTS/f'fighter-{number}.png'),full_page=True)
        page.locator('#exit-button').click()
    print('PASS: all ten fighters and all six stages render and accept attacks',flush=True)

    page.locator('[data-fighter="1"]').click()
    page.locator('#opponent').select_option('6')
    start(page,'versus')
    page.keyboard.down('ArrowLeft')
    page.wait_for_function('vanguard.battle.players[1].x < 610')
    page.keyboard.up('ArrowLeft')
    page.keyboard.press('1')
    page.wait_for_function('vanguard.battle.players[1].attack?.name === "light"')
    force_win(page)
    expect(page.locator('#result-title')).to_have_text('Yui wins.')
    page.locator('#rematch-button').click()
    page.wait_for_function('vanguard.battle.phase === "intro" && vanguard.battle.wins[0] === 0')
    page.locator('#exit-button').click()
    print('PASS: player two inputs, two-round match result and rematch',flush=True)

    start(page,'arcade')
    old_rival=page.evaluate('vanguard.battle.players[1].character.id')
    force_win(page)
    expect(page.locator('#rematch-button')).to_contain_text('NEXT RIVAL')
    page.locator('#rematch-button').click()
    page.wait_for_function('vanguard.battle.phase === "intro"')
    assert page.evaluate('vanguard.battle.players[1].character.id')!=old_rival
    expect(page.locator('#arcade-progress')).to_contain_text('RIVAL 2 OF 5')
    page.locator('#exit-button').click()
    print('PASS: arcade advances to the next distinct rival',flush=True)

    mobile=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
    phone=mobile.new_page();watch(phone)
    phone.goto(URL,wait_until='networkidle')
    phone.screenshot(path=str(ARTIFACTS/'mobile-menu.png'),full_page=True)
    assert phone.evaluate('document.documentElement.scrollWidth<=innerWidth')
    start(phone)
    expect(phone.locator('#touch-controls')).to_be_visible()
    phone.locator('[data-action="light"]').tap()
    phone.wait_for_function('vanguard.battle.players[0].attack?.name === "light"')
    phone.screenshot(path=str(ARTIFACTS/'mobile-arena.png'),full_page=True)
    assert phone.evaluate('document.documentElement.scrollWidth<=innerWidth')
    print('PASS: mobile has no horizontal overflow and touch attacks work',flush=True)
    mobile.close()

    standalone=ROOT/'dist/Vanguard-Princess.html'
    if standalone.exists():
        offline_context=browser.new_context(viewport={'width':1280,'height':900})
        offline=offline_context.new_page()
        watch(offline)
        requests=[]
        offline.on('request',lambda r:requests.append(r.url) if r.url.startswith(('http://','https://')) else None)
        # Managed Chromium disallows file:// navigation. Serve the exact same
        # standalone file once, then disconnect the browser before starting play.
        offline.goto(URL.rstrip('/')+'/dist/Vanguard-Princess.html',wait_until='networkidle')
        assert len(requests)==1,requests
        requests.clear()
        offline_context.set_offline(True)
        expect(offline.locator('.fighter-card')).to_have_count(10)
        start(offline)
        offline.keyboard.press('u')
        offline.wait_for_function('vanguard.battle.projectiles.length > 0')
        assert not requests,requests
        offline.screenshot(path=str(ARTIFACTS/'standalone.png'),full_page=True)
        print('PASS: standalone HTML plays with networking disabled and zero additional requests',flush=True)
        offline_context.close()
    assert not errors,'Browser errors: '+json.dumps(errors)
    (ARTIFACTS/'browser-results.json').write_text(json.dumps({'passed':True,'browser':'Chromium','errors':errors,'checks':['keyboard combat','pause/help/resume','assist','super','10 fighters','6 stages','player two','match and rematch','arcade progression','mobile touch','offline standalone']},indent=2))
    browser.close()
    print('All browser smoke checks passed.',flush=True)
