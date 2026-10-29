"""Verify real downloads, preview permissions, nested hosting and downloaded play."""
from pathlib import Path
from contextlib import contextmanager
import json
import os
import subprocess
import zipfile
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/downloads'
OUT.mkdir(parents=True,exist_ok=True)
URL=os.environ.get('GAME_URL','http://127.0.0.1:3000').rstrip('/')+'/'
errors=[]

def watch(page):
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('response',lambda response:errors.append(f'{response.status}: {response.url[:140]}') if response.status>=400 else None)

@contextmanager
def serve(root,prefix):
    # Serve the real files from a nested address, with preview-like permissions.
    code=f'''import {{createGameServer}} from {json.dumps((ROOT/'server.mjs').as_uri())};
const server=createGameServer({{root:process.argv[1],basePath:process.argv[2]}});
server.prependListener('request',(req,res)=>res.setHeader('Permissions-Policy','gamepad=()'));
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({{port:server.address().port}})));'''
    process=subprocess.Popen(['node','--input-type=module','-e',code,str(root),prefix],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    try:
        line=process.stdout.readline()
        if not line:raise RuntimeError(process.stderr.read())
        port=json.loads(line)['port']
        yield f'http://127.0.0.1:{port}{prefix}'
    finally:
        process.terminate()
        try:process.wait(timeout=5)
        except subprocess.TimeoutExpired:process.kill();process.wait()

def fight(page):
    page.locator('#mode').select_option('training')
    page.locator('#start-button').click()
    page.wait_for_function('vanguard.playing && vanguard.battle.frame > 3')
    page.keyboard.down('d')
    page.wait_for_function('Math.abs(vanguard.battle.players[1].x-vanguard.battle.players[0].x)<90')
    page.keyboard.up('d');page.keyboard.press('j')
    page.wait_for_function('vanguard.battle.players[1].hp<1000')

def download(page,selector,filename):
    with page.expect_download(timeout=20000) as download_info:page.locator(selector).click()
    item=download_info.value
    assert item.suggested_filename==filename,(item.suggested_filename,filename)
    destination=OUT/filename
    item.save_as(destination)
    assert destination.stat().st_size>10_000_000
    expect(page.locator('#download-status')).to_contain_text('Download started')
    return destination

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1280,'height':1000},accept_downloads=True)
    page=context.new_page();watch(page)
    page.goto(URL,wait_until='networkidle')
    html_file=download(page,'#download-game','Vanguard-Princess.html')
    html=html_file.read_text()
    assert 'data-standalone' in html and 'globalThis.__VANGUARD_BUNDLE__=' in html
    assert '<script type="module" src=' not in html
    zip_file=download(page,'#download-zip','Vanguard-Princess-Playable.zip')
    with zipfile.ZipFile(zip_file) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist())=={'Vanguard-Princess.html','PLAY.txt','NOTICE.txt'}
        assert archive.read('Vanguard-Princess.html').decode()==html
    page.screenshot(path=str(OUT/'download-buttons.png'),full_page=True)
    print('PASS: actual browser HTML and ZIP downloads save complete, valid game files',flush=True)
    context.close()

    with serve(ROOT,'/games/vanpri/') as nested:
        context=browser.new_context(viewport={'width':1280,'height':900})
        page=context.new_page();watch(page)
        page.add_init_script('window.AudioContext=class {constructor(){throw new DOMException("Audio blocked by preview", "NotAllowedError")}}')
        page.goto(nested,wait_until='networkidle')
        assert not page.evaluate('document.featurePolicy.allowsFeature("gamepad")')
        fight(page)
        page.screenshot(path=str(OUT/'restricted-preview-gameplay.png'),full_page=True)
        print('PASS: subfolder website renders and fights when gamepad and Web Audio access are blocked',flush=True)
        context.close()

    # Open the file saved by the browser, then remove all networking before play.
    with serve(OUT,'/saved/game/') as saved:
        context=browser.new_context(viewport={'width':1280,'height':900},accept_downloads=True)
        page=context.new_page();watch(page);requests=[]
        page.on('request',lambda request:requests.append(request.url) if request.url.startswith(('http:','https:')) else None)
        page.goto(saved+'Vanguard-Princess.html',wait_until='networkidle')
        assert len(requests)==1,requests
        requests.clear();context.set_offline(True)
        fight(page)
        page.locator('.download-nav').click()
        expect(page.locator('#menu')).to_be_visible()
        with page.expect_download() as next_download:page.locator('#download-game').click()
        next_download.value.save_as(OUT/'Saved-Again.html')
        assert (OUT/'Saved-Again.html').stat().st_size>10_000_000
        assert not requests,requests
        print('PASS: downloaded game fights and can save another copy while completely offline',flush=True)
        context.close()

    website=OUT/'website'
    website.mkdir(exist_ok=True)
    with zipfile.ZipFile(ROOT/'dist/downloads/Vanguard-Princess-Website.zip') as archive:
        assert archive.testzip() is None
        archive.extractall(website)
    with serve(website,'/public/vanguard/') as hosted:
        context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,accept_downloads=True)
        page=context.new_page();watch(page)
        page.goto(hosted,wait_until='networkidle')
        expect(page.locator('.fighter-card')).to_have_count(10)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        download(page,'#download-zip','Vanguard-Princess-Playable.zip')
        page.locator('#mode').select_option('training');page.locator('#start-button').click()
        page.wait_for_function('vanguard.battle?.frame>3')
        page.locator('[data-action="light"]').tap()
        page.wait_for_function('vanguard.battle.players[0].attack?.name==="light"')
        page.screenshot(path=str(OUT/'mobile-website-gameplay.png'),full_page=True)
        print('PASS: website ZIP works alone at a nested address, including mobile downloads and touch gameplay',flush=True)
        context.close()
    assert not errors,json.dumps(errors)
    (OUT/'results.json').write_text(json.dumps({'passed':True,'errors':errors,'checks':['real HTML download','valid browser ZIP download','nested source hosting','blocked gamepad','blocked Web Audio','downloaded game offline combat','offline resave','standalone website hosting','mobile download and touch']},indent=2))
    browser.close()
    print('All website and download checks passed.',flush=True)
