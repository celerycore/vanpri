"""Regression for the exact assets error under preview-like restrictions."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/preview'
OUT.mkdir(parents=True,exist_ok=True)
URL=os.environ.get('GAME_URL','http://127.0.0.1:3000').rstrip('/')
errors=[]

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1280,'height':1000},accept_downloads=True)
    page=context.new_page()
    page.on('pageerror',lambda error:errors.append(str(error)))
    def restrict(route):
        response=route.fetch()
        headers=dict(response.headers)
        headers['Content-Security-Policy']="connect-src 'none'; img-src data: blob:; media-src data: blob:"
        headers['Permissions-Policy']='gamepad=()'
        route.fulfill(response=response,headers=headers)
    context.route(URL+'/',restrict)
    context.route(URL+'/dist/index.html',restrict)
    page.add_init_script('globalThis.fetchCalls=0;globalThis.fetch=()=>{globalThis.fetchCalls++;return Promise.reject(new Error("Preview blocks fetch"))}')
    for location in ['/', '/dist/index.html']:
        page.goto(URL+location,wait_until='networkidle')
        expect(page.locator('.fighter-card')).to_have_count(10)
        expect(page.locator('#menu-loading')).to_be_hidden()
        page.locator('#mode').select_option('training')
        page.locator('#start-button').click()
        page.wait_for_function('vanguard.battle?.frame>5')
        page.keyboard.down('d')
        page.wait_for_function('Math.abs(vanguard.battle.players[1].x-vanguard.battle.players[0].x)<90')
        page.keyboard.up('d');page.keyboard.press('j')
        page.wait_for_function('vanguard.battle.players[1].hp<1000')
        assert page.evaluate('fetchCalls')==0
        page.locator('.download-nav').click()
        with page.expect_download() as item:page.locator('#download-game').click()
        item.value.save_as(OUT/('root-game.html' if location=='/' else 'release-game.html'))
        assert page.evaluate('fetchCalls')==0
        print('PASS:',location,'loads 10 fighters, renders combat, deals damage and saves the game with all fetch requests blocked.',flush=True)
    page.screenshot(path=str(OUT/'preview-ready.png'),full_page=True)
    # Opaque-origin iframe with scripts and downloads enabled. Storage access,
    # fetch requests and optional controller access must not block play.
    page.goto(URL+'/dist/index.html',wait_until='networkidle')
    page.set_content('<iframe id="preview" sandbox="allow-scripts allow-downloads" src="'+URL+'/" style="width:1200px;height:900px"></iframe>')
    frame=page.frame_locator('#preview')
    expect(frame.locator('.fighter-card')).to_have_count(10)
    frame.locator('#mode').select_option('training');frame.locator('#start-button').click()
    expect(frame.locator('#battle-loading')).to_be_hidden()
    frame.locator('#arena').focus()
    page.keyboard.press('j')
    actual=page.frames[1]
    actual.wait_for_function('vanguard.battle?.frame>5')
    frame.locator('.download-nav').click()
    with page.expect_download() as item:frame.locator('#download-zip').click()
    item.value.save_as(OUT/'preview-game.zip')
    assert (OUT/'preview-game.zip').stat().st_size>10_000_000
    assert not errors,errors
    print('PASS: sandboxed iframe preview renders the game and its ZIP download works.',flush=True)
    browser.close()
