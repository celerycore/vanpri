import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Battle, MAX_HP } from '../src/engine.js';
import { MOVEMENT, movementProfile } from '../src/movement.js';

const { characters } = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url)));
function arena(character = characters[0]) {
  const battle = new Battle({ characters: [character, characters[1]], mode: 'versus' });
  battle.phase = 'fight'; battle.players[0].x = 150; battle.players[1].x = 800;
  return battle;
}
function advance(battle, frames, input = {}, rival = {}) { for (let i = 0; i < frames; i++) battle.step([input, rival]); }
function apex(battle) {
  let peak = battle.players[0].y;
  for (let tick = 0; tick < 180 && (battle.players[0].y || tick < 2); tick++) { battle.step(); peak = Math.max(peak, battle.players[0].y); }
  return peak;
}

test('walking is faster, running accelerates further, and character speed/weight differences remain', () => {
  const battle = arena(), player = battle.players[0], profile = movementProfile(player.character);
  battle.step([{ right: true }, {}]);
  assert.equal(player.x, 150 + profile.walkSpeed);
  assert.equal(profile.walkSpeed, player.character.speed * 1.5);
  battle.step(); battle.step([{ right: true }, {}]);
  assert.equal(player.runDirection, 1);
  advance(battle, 12, { right: true });
  assert.equal(player.moveVx, profile.runMax);
  battle.step([{ down: true }, {}]);
  assert.equal(player.runDirection, 0); assert.equal(player.moveVx, 0);
  assert.ok(movementProfile(characters[8]).walkSpeed > movementProfile(characters[7]).walkSpeed);
  assert.ok(movementProfile(characters[7]).gravity > profile.gravity);
});

test('double taps require a release and the timing window, and dash buttons mirror for both players', () => {
  const held = arena(); advance(held, 15, { right: true });
  assert.equal(held.players[0].runDirection, 0);
  const slow = arena(); slow.step([{ right: true }, {}]); advance(slow, MOVEMENT.doubleTapWindow + 1); slow.step([{ right: true }, {}]);
  assert.equal(slow.players[0].runDirection, 0);
  const mirror = arena(); mirror.step([{ right: true, dash: true }, { left: true, dash: true }]);
  assert.equal(mirror.players[0].runDirection, 1); assert.equal(mirror.players[1].runDirection, -1);
  assert.ok(mirror.players[0].moveVx > 0 && mirror.players[1].moveVx < 0);
});

test('backdash has a short invulnerable hop and becomes vulnerable again', () => {
  const battle = arena(), [player, rival] = battle.players;
  battle.step([{ left: true, dash: true }, {}]);
  assert.equal(player.dashKind, 'back'); assert.ok(player.x < 150 && player.y > 0);
  assert.equal(player.invuln, MOVEMENT.backdashInvulnerability);
  assert.equal(battle.hit(rival, player, { damage: 44, push: 4, stun: 15 }), false);
  assert.equal(player.hp, MAX_HP);
  advance(battle, MOVEMENT.backdashInvulnerability);
  assert.equal(player.invuln, 0);
  assert.equal(battle.hit(rival, player, { damage: 44, push: 4, stun: 15 }), true);
  assert.equal(player.hp, MAX_HP - 44); assert.equal(player.dashKind, null);
});

test('normal and down-up high jumps launch immediately, rise higher and land cleanly', () => {
  const normal = arena(); normal.step([{ up: true }, {}]);
  assert.equal(normal.players[0].y, MOVEMENT.jumpSpeed);
  const normalPeak = apex(normal);
  const high = arena(); high.step([{ down: true }, {}]); high.step([{ up: true }, {}]);
  assert.equal(high.players[0].jumpLaunchSpeed, MOVEMENT.highJumpSpeed);
  const highPeak = apex(high);
  assert.ok(normalPeak > 160 && normalPeak < 200, normalPeak);
  assert.ok(highPeak > normalPeak + 70, `${highPeak} vs ${normalPeak}`);
  assert.equal(high.players[0].y, 0); assert.equal(high.players[0].vy, 0);
});

test('jumping preserves run momentum and an air normal keeps moving', () => {
  const battle = arena(), player = battle.players[0];
  advance(battle, 6, { right: true, dash: true });
  const speed = player.moveVx;
  battle.step([{ right: true, up: true }, {}]);
  assert.ok(player.moveVx > speed * .95);
  const x = player.x;
  battle.step([{ light: true }, {}]);
  assert.ok(player.attack.aerial); assert.ok(player.x - x > 5);
  assert.ok(player.moveVx > 5);
});

test('one double jump is available per airborne sequence, and holding jump does not repeat it', () => {
  const battle = arena(), player = battle.players[0];
  advance(battle, 8, { up: true });
  assert.equal(player.airJumps, 1);
  battle.step(); battle.step([{ up: true, left: true }, {}]);
  assert.equal(player.airJumps, 0); assert.ok(player.vy > 0 && player.moveVx < 0);
  battle.step(); battle.step([{ up: true }, {}]);
  assert.equal(battle.drainEvents().filter(event => event.type === 'doublejump').length, 1);
  advance(battle, 150);
  assert.equal(player.y, 0); assert.equal(player.airJumps, 1); assert.equal(player.airDashes, 1);
});

test('air dash suspends gravity, has startup and permits only one use before landing', () => {
  const battle = arena(), player = battle.players[0];
  battle.step([{ up: true }, {}]); advance(battle, 8);
  const y = player.y, x = player.x;
  battle.step([{ right: true, dash: true }, {}]);
  assert.equal(player.dashKind, 'air'); assert.equal(player.airDashes, 0);
  assert.equal(player.y, y); assert.equal(player.x, x);
  advance(battle, 3, { right: true });
  assert.equal(player.y, y); assert.ok(player.x > x + 20);
  advance(battle, 9);
  battle.step([{ dash: true }, {}]);
  assert.equal(player.airDashes, 0);
  assert.equal(battle.drainEvents().filter(event => event.type === 'dash' && event.kind === 'air').length, 1);
});

test('air jump and air dash can be used in either order without granting extra actions', () => {
  for (const dashFirst of [false, true]) {
    const battle = arena(), player = battle.players[0];
    battle.step([{ up: true }, {}]); advance(battle, 8);
    battle.step([dashFirst ? { dash: true, right: true } : { up: true }, {}]);
    battle.step();
    battle.step([dashFirst ? { up: true } : { dash: true, right: true }, {}]);
    assert.equal(player.airJumps, 0); assert.equal(player.airDashes, 0);
    assert.ok(player.y > 0);
  }
});

test('dash plus jump buffers an instant air dash instead of spending a ground dash', () => {
  const battle = arena(), player = battle.players[0];
  battle.step([{ up: true, right: true, dash: true }, {}]);
  assert.ok(player.y > 0); assert.equal(player.airDashes, 1);
  battle.step([{ right: true }, {}]);
  assert.equal(player.dashKind, 'air'); assert.equal(player.airDashes, 0);
  assert.equal(player.runDirection, 0);
});

test('a normal buffered during air-dash startup comes out with air momentum', () => {
  const battle = arena(), player = battle.players[0];
  battle.step([{ up: true }, {}]); advance(battle, 8);
  battle.step([{ dash: true, right: true }, {}]);
  battle.step([{ light: true }, {}]);
  assert.equal(player.attack, null);
  const x = player.x;
  battle.step([{}, {}]);
  assert.equal(player.attack.name, 'light'); assert.ok(player.attack.aerial);
  assert.ok(player.x - x > 8); assert.equal(player.airDashes, 0);
});

test('normal attacks jump-cancel on a confirmed hit, with no jump cancel on guard or whiff', () => {
  for (const outcome of ['hit', 'guard', 'whiff']) {
    const battle = arena(), player = battle.players[0]; player.x = 300;
    battle.players[1].x = outcome === 'whiff' ? 700 : 380;
    advance(battle, 6, { light: true }, { guard: outcome === 'guard' });
    assert.equal(player.attack.hitConfirmed, outcome === 'hit');
    battle.step([{ up: true }, {}]);
    assert.equal(player.y > 0, outcome === 'hit');
    if (outcome === 'hit') { assert.equal(player.attack, null); assert.equal(player.airJumps, 1); }
  }
});

test('late jump inputs survive recovery, while early buffered inputs expire', () => {
  const late = arena(); advance(late, 43, { heavy: true });
  late.step([{ up: true }, {}]); advance(late, 5);
  assert.ok(late.players[0].y > 0);
  const early = arena(); advance(early, 20, { heavy: true });
  early.step([{ up: true }, {}]); advance(early, 30);
  assert.equal(early.players[0].y, 0);
});

test('attack buffering survives short stun without repeating a held attack', () => {
  const battle = arena(), player = battle.players[0]; player.stun = 3;
  advance(battle, 3, { light: true });
  assert.equal(player.attack.name, 'light');
  advance(battle, 40, { light: true });
  assert.equal(player.attack, null);
  assert.equal(battle.drainEvents().filter(event => event.type === 'swing').length, 1);
});

test('landing cancels air attacks, applies recovery and refreshes each air action once', () => {
  const battle = arena(), player = battle.players[0];
  player.y = 1; player.vy = -3; player.airJumps = player.airDashes = 0;
  battle.startMove(player, 'heavy', {}); battle.step();
  assert.equal(player.attack, null); assert.equal(player.landingLag, MOVEMENT.landingRecovery);
  assert.equal(player.airJumps, 1); assert.equal(player.airDashes, 1);
  advance(battle, MOVEMENT.landingRecovery);
  assert.equal(player.attack.name, 'heavy'); assert.equal(player.attack.aerial, false);
});

test('pause freezes movement and clearing inputs never restores spent air actions', () => {
  const battle = arena(), player = battle.players[0];
  battle.step([{ up: true }, {}]); advance(battle, 6);
  battle.step([{ dash: true }, {}]); player.airJumps = 0;
  const state = [player.x, player.y, player.dashFrames, player.airJumps, player.airDashes];
  battle.paused = true; advance(battle, 30, { up: true, dash: true });
  assert.deepEqual([player.x, player.y, player.dashFrames, player.airJumps, player.airDashes], state);
  battle.clearInputBuffers();
  assert.equal(player.airJumps, 0); assert.equal(player.airDashes, 0); assert.equal(player.dashFrames, state[2]);
});

test('all fighters keep finite, bounded motion under repeated jumps, dashes, guards and attacks', () => {
  for (const character of characters) {
    const battle = arena(character);
    for (let tick = 0; tick < 1200; tick++) {
      const input = { left: tick % 180 > 90, right: tick % 180 < 90, up: tick % 17 === 0, down: tick % 41 === 0,
        dash: tick % 23 === 0, light: tick % 47 === 0, heavy: tick % 137 === 0, guard: tick % 79 < 3 };
      battle.step([input, {}]);
      for (const player of battle.players) {
        for (const key of ['x', 'y', 'vy', 'vx', 'moveVx']) assert.ok(Number.isFinite(player[key]), `${character.name} ${key}`);
        assert.ok(player.x >= 75 && player.x <= 885 && player.y >= 0);
        assert.ok([0, 1].includes(player.airJumps) && [0, 1].includes(player.airDashes));
        assert.ok(player.dashFrames >= 0);
      }
    }
  }
});
