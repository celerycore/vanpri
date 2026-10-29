import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Battle, MAX_HP } from '../src/engine.js';
import { COMBAT_DATA } from '../src/combat-data.js';
import { attackBox, fighterFrame, hurtboxes, meleeContact, projectileContact, projectileShape } from '../src/combat-geometry.js';
import { ImpactEffects } from '../src/impact-effects.js';

const { characters } = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url)));
function arena(character = characters[0]) {
  const battle = new Battle({ characters: [character, character], mode: 'versus' });
  battle.phase = 'fight';
  battle.players[0].x = 300; battle.players[1].x = 380;
  return battle;
}
const inside = (point, box) => point.x >= box.left && point.x <= box.right && point.y >= box.bottom && point.y <= box.top;

test('all standing, crouching and aerial normals share their visible active frame and collision window', () => {
  for (const character of characters) for (const name of ['light', 'medium', 'heavy']) for (const variant of ['', 'low', 'air']) {
    const battle = arena(character), player = battle.players[0];
    player.y = variant === 'air' ? 90 : 0;
    battle.startMove(player, name, { down: variant === 'low' });
    const attack = player.attack;
    attack.elapsed = attack.startup - 1;
    assert.equal(attackBox(player), null, `${character.name} ${variant}${name} startup`);
    attack.elapsed++;
    const animation = variant ? variant + name[0].toUpperCase() + name.slice(1) : name;
    const peak = character.animations[animation][COMBAT_DATA[character.id].peaks[animation]];
    assert.equal(fighterFrame(player).id, peak.id);
    const box = attackBox(player);
    assert.ok(box.right > box.left && box.top > box.bottom);
    attack.elapsed += attack.active - 1;
    assert.equal(fighterFrame(player).id, peak.id);
    assert.deepEqual(attackBox(player), box);
    attack.elapsed++;
    assert.equal(attackBox(player), null, `${character.name} ${animation} recovery`);
  }
});

test('body boxes lower with the actual crouching sprite for every fighter', () => {
  for (const character of characters) {
    const player = arena(character).players[0];
    const standing = Math.max(...hurtboxes(player).map(box => box.top));
    player.crouch = true; player.pose = 'crouch';
    const crouching = Math.max(...hurtboxes(player).map(box => box.top));
    assert.ok(crouching < standing * .85, `${character.name}: ${crouching} vs ${standing}`);
  }
});

test('melee contact mirrors with facing and cannot hit behind, above, or beyond the strike', () => {
  const battle = arena(), [attacker, defender] = battle.players;
  battle.startMove(attacker, 'light', {}); attacker.attack.elapsed = attacker.attack.startup;
  const box = attackBox(attacker), point = meleeContact(attacker, defender);
  assert.ok(point && inside(point, box));
  assert.ok(hurtboxes(defender).some(body => inside(point, body)));
  for (const player of battle.players) { player.x = 960 - player.x; player.facing *= -1; }
  attacker.attack.facing *= -1;
  const mirrored = meleeContact(attacker, defender);
  assert.deepEqual(mirrored, { x: 960 - point.x, y: point.y });
  attacker.x = 300; attacker.facing = attacker.attack.facing = 1;
  defender.x = 290;
  assert.equal(meleeContact(attacker, defender), null, 'opponent body partly overlaps from behind');
  defender.x = 700;
  assert.equal(meleeContact(attacker, defender), null, 'outside visible reach');
  defender.x = 380; defender.y = box.top + 10;
  assert.equal(meleeContact(attacker, defender), null, 'airborne above attack');
});

test('a throw cannot grab an airborne opponent', () => {
  const battle = arena(), [attacker, defender] = battle.players;
  defender.x = 355;
  battle.startMove(attacker, 'throw', {}); attacker.attack.elapsed = attacker.attack.startup;
  assert.ok(meleeContact(attacker, defender));
  defender.y = 1;
  assert.equal(meleeContact(attacker, defender), null);
});

test('equal simultaneous strikes trade without a player-one ordering advantage', () => {
  const battle = arena();
  for (let frame = 0; frame < 12; frame++) battle.step([{ light: true }, { light: true }]);
  assert.deepEqual(battle.players.map(player => player.hp), [MAX_HP - 44, MAX_HP - 44]);
  assert.equal(battle.drainEvents().filter(event => event.type === 'hit').length, 2);
});

test('damage events carry the real overlap point for hits and guarded hits', () => {
  for (const guarding of [false, true]) {
    const battle = arena();
    let contact;
    const hit = battle.hit.bind(battle);
    battle.hit = (attacker, defender, attack, unguardable, point) => {
      assert.ok(inside(point, attackBox(attacker)));
      assert.ok(hurtboxes(defender).some(box => inside(point, box)));
      contact = point;
      return hit(attacker, defender, attack, unguardable, point);
    };
    for (let frame = 0; frame < 12; frame++) battle.step([{ light: true }, { guard: guarding }]);
    const event = battle.drainEvents().find(event => event.type === (guarding ? 'block' : 'hit'));
    assert.ok(event);
    assert.deepEqual({ x: event.x, y: event.y }, contact);
  }
});

test('fast projectiles sweep through the body and report the first surface contact', () => {
  const defender = arena().players[1];
  const projectile = { kind: 'shot', radius: 10, y: 115 };
  const contact = projectileContact(projectile, 200, 550, defender);
  assert.ok(contact && contact.time > 0 && contact.time < 1);
  assert.ok(hurtboxes(defender).some(box => inside(contact, box)));
  assert.ok(contact.centerX < defender.x);
  const battle = arena();
  battle.projectiles.push({ ...projectile, owner: 0, x: 200, vx: 350, life: 10, damage: 44 });
  battle.advanceProjectiles();
  assert.equal(battle.players[1].hp, MAX_HP - 44);
  assert.equal(battle.projectiles.length, 0);
});

test('elliptical projectile corners and high shots above crouching heads whiff', () => {
  const defender = arena().players[1], head = hurtboxes(defender)[2];
  const projectile = { kind: 'shot', radius: 10, y: head.top + 4.05 };
  const { rx } = projectileShape(projectile);
  const x = head.right + rx * .9;
  assert.equal(projectileContact(projectile, x, x, defender), null);
  const standingTop = head.top;
  defender.crouch = true; defender.pose = 'crouch';
  const crouchTop = Math.max(...hurtboxes(defender).map(box => box.top));
  projectile.y = (crouchTop + standingTop) / 2;
  assert.equal(projectileContact(projectile, 200, 550, defender), null);
  defender.crouch = false; defender.pose = 'idle';
  assert.ok(projectileContact(projectile, 200, 550, defender));
});

test('projectile guard and knockback follow the incoming direction after the owner crosses sides', () => {
  const battle = arena(), [owner, defender] = battle.players;
  owner.x = 650; defender.x = 380; defender.facing = -1; defender.block = true;
  battle.projectiles.push({ owner: 0, kind: 'shot', radius: 10, x: 200, y: 115, vx: 350, life: 10, damage: 44 });
  battle.advanceProjectiles();
  assert.equal(defender.hp, MAX_HP);
  assert.ok(defender.vx > 0);
  const event = battle.drainEvents().find(event => event.type === 'block');
  assert.equal(event.direction, 1);
});

test('impact models preserve contact position, distinguish guards and expire on fixed ticks', () => {
  const effects = new ImpactEffects({ random: () => .5 });
  effects.add({ type: 'hit', x: 321, y: 123, heavy: true, color: '#ff6a94' });
  effects.add({ type: 'block', x: 456, y: 80, color: '#ff6a94' });
  assert.deepEqual(effects.impacts.map(({ x, y, age }) => ({ x, y, age })), [{ x: 321, y: 123, age: 0 }, { x: 456, y: 80, age: 0 }]);
  assert.ok(effects.impacts[0].size > effects.impacts[1].size);
  assert.equal(effects.particles.at(-1).color, '#9be7ff');
  for (let tick = 0; tick < 12; tick++) effects.update();
  assert.equal(effects.impacts.length, 1);
  for (let tick = 0; tick < 10; tick++) effects.update();
  assert.equal(effects.impacts.length, 0);
  assert.equal(effects.particles.length, 0);
});

test('repeated hits have bounded effects and reduced motion uses fewer particles', () => {
  const normal = new ImpactEffects(), reduced = new ImpactEffects({ reducedMotion: true });
  const event = { type: 'hit', x: 100, y: 70, heavy: true, color: '#ff6a94' };
  normal.add(event); reduced.add(event);
  assert.ok(reduced.particles.length < normal.particles.length);
  for (let count = 0; count < 100; count++) normal.add(event);
  assert.ok(normal.impacts.length <= 16 && normal.particles.length <= 256);
  normal.clear();
  assert.equal(normal.impacts.length + normal.particles.length, 0);
});
