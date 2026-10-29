import { Battle } from './engine.js';
import { Assets, ArenaRenderer } from './renderer.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { assetUrl } from './asset-url.js';
import { setupDownloads } from './downloads.js';
import { GAME_MANIFEST } from './game-manifest.js';
import { SpriteInspector } from './sprite-inspector.js';

const $ = id => document.getElementById(id);
const sound = new Sound();
const assets = new Assets();
let manifest, battle = null, renderer = null, stage = null;
let selectedFighter = 1, selectedAssist = 'eko', selectedStage = 'school';
let playing = false, launching = false, resultShown = false;
let arcade = [], arcadeIndex = 0;
let animationId = 0;
let launchToken = 0;
let previousTime = 0, accumulator = 0;
let resumeAfterDialog = false;
let spriteInspector = null;
let statusUntil = 0;
const descriptions = [
  'A steady sword, a fearless heart. A versatile choice at any distance.',
  'Keep your cool. Keep your distance. Let precision do the talking.',
  'Close the distance and turn a small opening into a big problem.',
  'Two guns. No hesitation. Keep your rival under constant pressure.',
  'Quick on her feet, quicker with her fists. Get in and keep moving.',
  'Patient footwork meets a lightning-fast blade. Make your opening count.',
  'Control the space with magic, then punish the approach.',
  'Heavy armor. Heavier hits. Advance through attacks with Iron Advance.',
  'Stay mobile, close the gap, and let your kicks do the talking.',
  'A bow at range, a blade up close. Ready for whatever comes next.',
];

function updateAudioButton() {
  document.querySelectorAll('.audio-button').forEach(button => {
    button.classList.toggle('muted', sound.muted);
    button.setAttribute('aria-label', sound.muted ? 'Unmute audio' : 'Mute audio');
    button.title = sound.muted ? 'Unmute audio' : 'Mute audio';
    button.textContent = sound.muted ? '♩' : '♫';
  });
}
document.querySelectorAll('.audio-button').forEach(button => button.addEventListener('click', () => { sound.unlock(); sound.toggle(); updateAudioButton(); }));
updateAudioButton();
setupDownloads();

function selectFighter(id, quiet = false) {
  selectedFighter = id;
  const character = manifest.characters.find(c => c.id === id);
  document.querySelectorAll('.fighter-card').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.fighter) === id)));
  $('showcase-sprite').src = assetUrl(character.portrait);
  $('showcase-sprite').alt = `${character.name} in their fighting stance`;
  $('fighter-style').textContent = character.style;
  $('fighter-name').innerHTML = `${character.name}<small>${character.surname || 'THE CRIMSON BRAWLER'}</small>`;
  $('fighter-description').textContent = descriptions[id - 1];
  $('showcase').style.setProperty('--fighter', character.color);
  document.querySelector('.showcase-ghost').textContent = character.name.toUpperCase();
  document.querySelector('.showcase-number').textContent = `${String(id).padStart(2, '0')} / 10`;
  $('fighter-stats').innerHTML = [
    ['SPEED', Math.round((character.speed - 1) / 3.3 * 100)],
    ['REACH', Math.round(character.reach / 160 * 100)],
    ['POWER', id === 3 ? 96 : id === 8 ? 93 : id === 5 ? 64 : 77],
  ].map(([label, value]) => `<div class="fighter-stat">${label}<div class="stat-bar"><i style="width:${value}%"></i></div></div>`).join('');
  if (!quiet) { sound.unlock(); sound.clip('select'); }
}

function selectAssist(id, quiet = false) {
  selectedAssist = id;
  document.querySelectorAll('.assist-card').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.assist === id)));
  $('assist-description').textContent = manifest.assists.find(a => a.id === id).description;
  if (!quiet) sound.clip('select');
}
function selectStage(id, quiet = false) {
  selectedStage = id;
  document.querySelectorAll('.stage-card').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.stage === id)));
  const selected = manifest.stages.find(s => s.id === id);
  $('stage-name').textContent = selected.name.toUpperCase();
  if (!quiet) sound.clip('select');
}

function updateMode() {
  const mode = $('mode').value;
  $('difficulty-label').hidden = mode === 'versus' || mode === 'training';
  $('opponent-label').hidden = mode === 'arcade';
  $('opponent-label').firstChild.textContent = mode === 'versus' ? 'PLAYER TWO' : mode === 'training' ? 'TRAINING PARTNER' : 'YOUR RIVAL';
  $('start-button').innerHTML = `${mode === 'training' ? 'STEP INTO TRAINING' : mode === 'arcade' ? 'START YOUR ARCADE RUN' : 'ENTER THE ARENA'} <span><svg class="arrow-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 16 16 4M4 4h12v12" stroke="currentColor" stroke-width="1.4"/></svg></span>`;
}
$('mode').addEventListener('change', updateMode);

function populateMenu() {
  $('roster').innerHTML = manifest.characters.map(c => `<button class="fighter-card" data-fighter="${c.id}" aria-label="Choose ${c.name} ${c.surname}" aria-pressed="false" style="--accent:${c.color}"><span class="card-number">${String(c.id).padStart(2, '0')}</span><span class="selected-mark">P1</span><img src="${assetUrl(c.portrait)}" alt="" draggable="false"><span class="card-name">${c.name.toUpperCase()}</span></button>`).join('');
  $('opponent').innerHTML = manifest.characters.map(c => `<option value="${c.id}" ${c.id === 2 ? 'selected' : ''}>${c.name} ${c.surname}</option>`).join('');
  $('assists').innerHTML = manifest.assists.map(a => `<button class="assist-card" data-assist="${a.id}" aria-label="Choose ${a.name} assist" aria-pressed="false"><img src="${assetUrl(`assist-${a.id}-portrait.webp`)}" alt="" draggable="false"><span>${a.name}</span></button>`).join('');
  $('stages').innerHTML = manifest.stages.map(s => `<button class="stage-card" data-stage="${s.id}" aria-label="Choose ${s.name} stage" title="${s.name}" aria-pressed="false"><img src="${assetUrl(`thumb-${s.id}.webp`)}" alt="" draggable="false"></button>`).join('');
  $('roster').addEventListener('click', event => { const button = event.target.closest('[data-fighter]'); if (button) selectFighter(Number(button.dataset.fighter)); });
  $('assists').addEventListener('click', event => { const button = event.target.closest('[data-assist]'); if (button) selectAssist(button.dataset.assist); });
  $('stages').addEventListener('click', event => { const button = event.target.closest('[data-stage]'); if (button) selectStage(button.dataset.stage); });
  selectFighter(1, true); selectAssist('eko', true); selectStage('school', true); updateMode();
  $('menu-loading').hidden = true;
  $('selection').hidden = false;
}

function announce(text, duration = 3500) {
  $('battle-status').textContent = text;
  statusUntil = performance.now() + duration;
}

function pause(force) {
  if (!battle || !playing || battle.phase === 'matchover' || launching) return;
  const value = typeof force === 'boolean' ? force : !battle.paused;
  battle.paused = value;
  $('pause-cover').hidden = !value;
  $('pause-button').innerHTML = value ? 'Resume <kbd>Esc</kbd>' : 'Pause <kbd>Esc</kbd>';
  input.clear(); sound.pause(value);
  if (!value) { $('arena').focus({ preventScroll: true }); previousTime = performance.now(); accumulator = 0; }
}

const input = new Input({ active: () => playing, pause, reset: () => {
  if (battle?.mode !== 'training') return;
  battle.resetRound();
  renderer.health = [1000, 1000];
  renderer.resetEffects();
  input.clear(); announce('Fresh start. Make your next move.');
} });

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}

async function startMatch({ nextArcade = false, rematch = false } = {}) {
  if (launching || !manifest) return;
  launching = true;
  const token = ++launchToken;
  sound.unlock(); sound.pause(false);
  const mode = $('mode').value;
  if (mode === 'arcade') {
    if (nextArcade) arcadeIndex++;
    else if (!rematch) { arcadeIndex = 0; arcade = shuffle(manifest.characters.filter(c => c.id !== selectedFighter)).slice(0, 5).map(c => c.id); }
  }
  const opponentId = mode === 'arcade' ? arcade[arcadeIndex] : Number($('opponent').value);
  const characters = [selectedFighter, opponentId].map(id => manifest.characters.find(c => c.id === id));
  const opponentAssist = manifest.assists[(opponentId + 1) % manifest.assists.length].id;
  stage = manifest.stages.find(s => s.id === selectedStage);
  if (nextArcade) stage = manifest.stages[(manifest.stages.findIndex(s => s.id === selectedStage) + arcadeIndex) % manifest.stages.length];
  $('start-button').disabled = true;
  $('menu').hidden = true; $('game-screen').hidden = false;
  document.body.classList.add('in-game');
  $('battle-loading').hidden = false;
  $('pause-cover').hidden = true; $('result-cover').hidden = true;
  $('pause-button').innerHTML = 'Pause <kbd>Esc</kbd>';
  input.clear(); playing = false;
  cancelAnimationFrame(animationId);
  try {
    await assets.load([
      ...characters.map(c => c.atlas),
      ...[selectedAssist, opponentAssist].map(id => manifest.assists.find(a => a.id === id).atlas),
      `stage-${stage.id}.webp`, 'impact.webp', 'ko.webp', 'fight.webp',
    ]);
    if (token !== launchToken) return;
    battle = new Battle({ characters, assists: [selectedAssist, opponentAssist], mode, difficulty: $('difficulty').value, trainingDummy: $('dummy').value });
    renderer = new ArenaRenderer($('arena'), assets, manifest);
    renderer.showHitboxes = $('show-hitboxes').checked;
    resultShown = false;
    $('match-label').textContent = { quick: 'QUICK MATCH / VS CPU', arcade: 'ARCADE / THE ROAD AHEAD', versus: 'LOCAL VERSUS / TWO PLAYERS', training: 'TRAINING / MAKE IT YOUR OWN' }[mode];
    $('match-title').textContent = `${characters[0].name}  ×  ${characters[1].name}`;
    $('arena-stage').textContent = stage.name.toUpperCase();
    $('arcade-progress').textContent = mode === 'arcade' ? `RIVAL ${arcadeIndex + 1} OF 5  ·  FIRST TO TWO ROUNDS` : mode === 'training' ? 'NO TIMER · NO PRESSURE' : 'FIRST TO TWO ROUNDS · 90 SECONDS';
    $('training-toolbar').hidden = mode !== 'training';
    const touchUI = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches || innerWidth <= 760;
    $('touch-controls').hidden = !touchUI;
    document.body.classList.toggle('touch-ui', touchUI);
    $('battle-loading').hidden = true;
    playing = true;
    sound.playMusic(stage.id);
    announce(mode === 'versus' ? 'Player 2: arrow keys to move, 1 / 2 / 3 to attack. See All controls for the rest.' : mode === 'training' ? 'Practice freely. Try J → K → L on hit, then I to bring in your partner.' : 'W A S D to move. J / K / L to attack. I calls your assist.');
    previousTime = performance.now(); accumulator = 0;
    animationId = requestAnimationFrame(loop);
    window.scrollTo({ top: 0, behavior: 'instant' });
    $('arena').focus({ preventScroll: true });
  } catch (error) {
    if (token !== launchToken) return;
    console.error(error);
    $('battle-loading').hidden = true;
    returnToMenu();
    $('menu-loading').hidden = false;
    $('menu-loading').textContent = `The match could not load: ${error.message}. Refresh the page to try again.`;
  } finally { if (token === launchToken) { launching = false; $('start-button').disabled = false; } }
}

function handleEvents(events) {
  for (const event of events) {
    renderer.event(event);
    if (['hit', 'block', 'swing'].includes(event.type)) sound.tone(event.type, event.heavy);
    if (event.type === 'fight') sound.clip('start');
    if (event.type === 'roundover') {
      sound.clip('ko');
      announce(event.winner < 0 ? 'Draw. Neither fighter takes a round.' : `${battle.players[event.winner].character.name} takes round ${battle.round}.`, 4000);
    }
    if (event.type === 'super') announce(`${battle.players[event.player].character.name} unleashes a Liberty Art!`);
    if (event.type === 'assist') announce(`${battle.players[event.player].character.name} calls ${event.text.replace(' ASSIST', '')}!`);
    if (event.type === 'hint') announce(event.text);
    if (event.type === 'guardbreak') announce(`${battle.players[event.player].character.name}'s Calcium guard has broken!`);
    if (event.type === 'matchover') showResult();
  }
}

function loop(time) {
  if (!playing || !battle) return;
  accumulator += Math.min(100, time - previousTime);
  previousTime = time;
  let ticks = 0;
  while (accumulator >= 1000 / 60 && ticks++ < 6) {
    if (!battle.paused) renderer.updateEffects();
    if (renderer.hitStop > 0 && !battle.paused) renderer.hitStop--;
    else battle.step(input.read());
    handleEvents(battle.drainEvents());
    accumulator -= 1000 / 60;
  }
  renderer.draw(battle, stage, time);
  if (statusUntil && time > statusUntil) {
    $('battle-status').textContent = battle.mode === 'training' ? 'Build a combo. Test a setup. Find your rhythm.' : 'Hold away or Space to guard. Use K + L up close to throw.';
    statusUntil = 0;
  }
  animationId = requestAnimationFrame(loop);
}

function showResult() {
  if (resultShown) return;
  resultShown = true;
  const winner = battle.winner;
  const arcadeNext = battle.mode === 'arcade' && winner === 0 && arcadeIndex < 4;
  const arcadeClear = battle.mode === 'arcade' && winner === 0 && arcadeIndex === 4;
  $('result-kicker').textContent = arcadeClear ? 'FIVE RIVALS. ONE PRINCESS.' : battle.mode === 'arcade' ? `ARCADE / RIVAL ${arcadeIndex + 1} OF 5` : 'MATCH COMPLETE';
  $('result-title').textContent = arcadeClear ? 'Arcade cleared.' : battle.mode === 'versus' ? `${battle.players[winner].character.name} wins.` : winner === 0 ? 'You win.' : 'A worthy rival.';
  $('result-score').textContent = `${battle.players[0].character.name} ${battle.wins[0]} — ${battle.wins[1]} ${battle.players[1].character.name}${arcadeNext ? ' · Your next rival awaits.' : ''}`;
  $('rematch-button').innerHTML = `${arcadeNext ? 'MEET YOUR NEXT RIVAL' : arcadeClear ? 'ANOTHER ARCADE RUN' : 'RUN IT BACK'} <span><svg class="arrow-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 16 16 4M4 4h12v12" stroke="currentColor" stroke-width="1.4"/></svg></span>`;
  $('rematch-button').dataset.next = arcadeNext ? 'yes' : 'no';
  $('rematch-button').dataset.clear = arcadeClear ? 'yes' : 'no';
  $('result-cover').hidden = false;
  sound.clip('win'); input.clear();
  $('rematch-button').focus({ preventScroll: true });
}

function returnToMenu() {
  launchToken++;
  playing = false; launching = false;
  cancelAnimationFrame(animationId);
  input.clear(); sound.stop(); sound.suspended = false;
  $('game-screen').hidden = true; $('menu').hidden = false;
  document.body.classList.remove('in-game');
  battle = null;
  $('start-button').disabled = false;
  $('start-button').focus({ preventScroll: true });
}

$('start-button').addEventListener('click', () => startMatch());
$('pause-button').addEventListener('click', () => pause());
$('resume-button').addEventListener('click', () => pause(false));
for (const id of ['exit-button', 'pause-exit', 'result-exit']) $(id).addEventListener('click', returnToMenu);
$('rematch-button').addEventListener('click', () => startMatch({ nextArcade: $('rematch-button').dataset.next === 'yes', rematch: $('rematch-button').dataset.clear !== 'yes' }));
$('touch-toggle').addEventListener('click', () => {
  const controls = $('touch-controls'); controls.hidden = !controls.hidden;
  document.body.classList.toggle('touch-ui', !controls.hidden);
});
$('dummy').addEventListener('change', () => { if (battle) battle.trainingDummy = $('dummy').value; });
$('show-hitboxes').addEventListener('change', () => { if (renderer) renderer.showHitboxes = $('show-hitboxes').checked; });
$('reset-training').addEventListener('click', () => {
  if (!battle || battle.mode !== 'training') return;
  battle.resetRound(); renderer.health = [1000, 1000]; renderer.resetEffects();
  input.clear(); $('arena').focus({ preventScroll: true }); announce('Training reset. A fresh start.');
});

function openDialog(id) {
  resumeAfterDialog = !!battle && !battle.paused && battle.phase !== 'matchover';
  if (resumeAfterDialog) pause(true);
  $(id).showModal();
}
for (const id of ['how-button', 'game-help']) $(id).addEventListener('click', () => openDialog('help-dialog'));
$('about-button').addEventListener('click', () => openDialog('about-dialog'));
$('sprite-checker-button').addEventListener('click', () => {
  if (!spriteInspector || launching) return;
  openDialog('sprite-dialog');
  spriteInspector.open(battle?.players[0].character.id || selectedFighter);
});
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => { if (resumeAfterDialog) { resumeAfterDialog = false; pause(false); } });
}
document.querySelector('.brand').addEventListener('click', event => { if (playing) { event.preventDefault(); returnToMenu(); } });
document.querySelector('.download-nav').addEventListener('click', event => {
  if (!playing && !launching) return;
  event.preventDefault();
  returnToMenu();
  requestAnimationFrame(() => $('downloads').scrollIntoView({ behavior: 'smooth' }));
});

// Read-only access to the current simulation is useful for debugging and smoke tests.
Object.defineProperty(window, 'vanguard', { value: Object.freeze({ get battle() { return battle; }, get manifest() { return manifest; }, get playing() { return playing; } }) });

try {
  manifest = GAME_MANIFEST;
  populateMenu();
  spriteInspector = new SpriteInspector({ dialog: $('sprite-dialog'), manifest, assets });
} catch (error) {
  console.error(error);
  $('menu-loading').textContent = `The game could not start: ${error.message}`;
}
