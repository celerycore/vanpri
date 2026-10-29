import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Battle, MAX_HP } from '../src/engine.js';

const manifest = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url)));
const characters = manifest.characters;
function game(options = {}) {
  const battle = new Battle({ characters: [characters[0], characters[1]], mode: 'versus', ...options });
  battle.phase = 'fight';
  battle.players[0].x = 300;
  battle.players[1].x = 380;
  return battle;
}
function advance(battle, count, a = {}, b = {}) { for (let i = 0; i < count; i++) battle.step([a, b]); }

test('an attack respects startup, hits only once, and requires a fresh press', () => {
  const battle = game();
  advance(battle, 5, { light: true });
  assert.equal(battle.players[1].hp, MAX_HP);
  advance(battle, 40, { light: true });
  assert.equal(battle.players[1].hp, MAX_HP - 44);
  assert.equal(battle.players[0].attack, null);
  assert.ok(battle.players[0].meter > 0);
});

test('out-of-range attacks whiff', () => {
  const battle = game();
  battle.players[1].x = 700;
  advance(battle, 40, { heavy: true });
  assert.equal(battle.players[1].hp, MAX_HP);
});

test('standing guard blocks normal attacks and consumes Calcium', () => {
  const battle = game();
  advance(battle, 15, { light: true }, { guard: true });
  assert.equal(battle.players[1].hp, MAX_HP);
  assert.ok(battle.players[1].guard < 100);
  assert.ok(battle.drainEvents().some(e => e.type === 'block'));
});

test('low attacks beat standing guard but crouch guard blocks them', () => {
  const standing = game();
  advance(standing, 15, { light: true, down: true }, { guard: true });
  assert.equal(standing.players[1].hp, MAX_HP - 44);
  const crouching = game();
  advance(crouching, 15, { light: true, down: true }, { guard: true, down: true });
  assert.equal(crouching.players[1].hp, MAX_HP);
});

test('a close throw defeats guard, but throws cannot reach distant rivals', () => {
  const close = game(); close.players[1].x = 362;
  advance(close, 15, { medium: true, heavy: true }, { guard: true });
  assert.equal(close.players[1].hp, MAX_HP - 145);
  const far = game(); far.players[1].x = 550;
  advance(far, 40, { medium: true, heavy: true }, { guard: true });
  assert.equal(far.players[1].hp, MAX_HP);
});

test('light can cancel into medium on hit, but cannot cancel on whiff', () => {
  const battle = game();
  advance(battle, 7, { light: true });
  assert.equal(battle.players[0].attack.hasHit, true);
  battle.step([{ medium: true }, {}]);
  assert.equal(battle.players[0].attack.name, 'medium');
  const whiff = game(); whiff.players[1].x = 700;
  advance(whiff, 7, { light: true });
  whiff.step([{ medium: true }, {}]);
  assert.equal(whiff.players[0].attack.name, 'light');
});

test('Liberty Art requires and consumes a full meter', () => {
  const battle = game();
  battle.players[0].meter = 99;
  battle.step([{ super: true }, {}]);
  assert.equal(battle.players[0].attack, null);
  battle.step([{}, {}]); battle.players[0].meter = 100;
  battle.step([{ super: true }, {}]);
  assert.equal(battle.players[0].meter, 0);
  assert.equal(battle.players[0].attack.name, 'super');
  assert.ok(battle.players[0].invuln > 0);
});

test('ranged special spawns a projectile and deals damage at range', () => {
  const battle = game(); battle.players[1].x = 580;
  advance(battle, 16, { special: true });
  assert.equal(battle.projectiles.length, 1);
  advance(battle, 35);
  assert.equal(battle.players[1].hp, MAX_HP - 93);
  assert.equal(battle.projectiles.length, 0);
});

test('assists expend their meter, attack, then recharge without duplicate calls', () => {
  const battle = game(); battle.players[1].x = 500;
  battle.step([{ assist: true }, {}]);
  assert.equal(battle.helpers.length, 1);
  assert.equal(battle.players[0].assist, 0);
  battle.step([{}, {}]); battle.step([{ assist: true }, {}]);
  assert.equal(battle.helpers.length, 1);
  advance(battle, 90);
  assert.ok(battle.players[1].hp < MAX_HP);
  assert.equal(battle.helpers.length, 0);
  assert.ok(battle.players[0].assist > 0 && battle.players[0].assist < 100);
  advance(battle, 900);
  assert.equal(battle.players[0].assist, 100);
});

test('jumping and movement settle on the ground within arena boundaries', () => {
  const battle = game();
  battle.step([{ up: true }, {}]);
  assert.ok(battle.players[0].y > 0);
  advance(battle, 150, { left: true });
  assert.equal(battle.players[0].y, 0);
  assert.equal(battle.players[0].vy, 0);
  assert.equal(battle.players[0].x, 75);
});

test('round scores persist, two wins finish the match, and pause freezes time', () => {
  const battle = game();
  battle.paused = true; const frame = battle.frame; const timer = battle.timer;
  advance(battle, 20, { right: true });
  assert.equal(battle.frame, frame); assert.equal(battle.timer, timer);
  battle.paused = false;
  battle.players[1].hp = 0; battle.step();
  assert.equal(battle.phase, 'roundover'); assert.equal(battle.wins[0], 1);
  advance(battle, 155);
  assert.equal(battle.round, 2); assert.equal(battle.phase, 'intro'); assert.equal(battle.wins[0], 1);
  advance(battle, 110);
  battle.players[1].hp = 0; battle.step(); advance(battle, 155);
  assert.equal(battle.phase, 'matchover'); assert.equal(battle.winner, 0);
  assert.deepEqual(battle.wins, [2, 0]);
});

test('a timeout draw awards no round', () => {
  const battle = game(); battle.timer = 1;
  battle.step();
  assert.equal(battle.winner, -1); assert.deepEqual(battle.wins, [0, 0]);
});

test('training has no timeout, refills Liberty, and heals the dummy after a combo', () => {
  const battle = game({ mode: 'training' });
  const timer = battle.timer;
  advance(battle, 10, { light: true });
  assert.ok(battle.players[1].hp < MAX_HP);
  assert.equal(battle.players[0].meter, 100);
  assert.equal(battle.timer, timer);
  advance(battle, 180);
  assert.equal(battle.players[1].hp, MAX_HP);
  assert.equal(battle.phase, 'fight');
});

test('CPU approaches and attacks without player input', () => {
  const battle = game({ mode: 'quick', random: () => .6 });
  battle.players[1].x = 650;
  advance(battle, 500);
  assert.ok(battle.players[1].x < 650);
  assert.ok(battle.players[0].hp < MAX_HP);
});

test('all ten fighters have usable animation data and finite combat state', () => {
  for (const character of characters) {
    for (const name of ['idle', 'walk', 'jump', 'light', 'medium', 'heavy', 'special', 'super', 'hit', 'guard', 'ko']) {
      assert.ok(character.animations[name].length, `${character.name} ${name}`);
      for (const frame of character.animations[name]) assert.ok(character.rects[frame.id], `${character.name} frame ${frame.id}`);
    }
    const battle = game({ characters: [character, characters[0]] });
    for (let t = 0; t < 900; t++) battle.step([{ [t % 180 < 90 ? 'special' : 'heavy']: t % 70 === 0 }, { light: t % 51 === 0 }]);
    for (const p of battle.players) for (const key of ['x', 'y', 'hp', 'meter', 'guard', 'assist']) assert.ok(Number.isFinite(p[key]), `${character.name} ${key}`);
  }
});

test('all manifest assets needed at runtime exist', () => {
  const names = [...characters.flatMap(c => [c.atlas, c.portrait]), ...manifest.assists.flatMap(a => [a.atlas, `assist-${a.id}-portrait.webp`]), ...manifest.stages.flatMap(s => [`stage-${s.id}.webp`, `thumb-${s.id}.webp`, `music-${s.id}.ogg`]), ...['start', 'select', 'ko', 'win'].map(s => `sfx-${s}.ogg`)];
  for (const name of names) assert.ok(existsSync(new URL(`../assets/${name}`, import.meta.url)), name);
});
