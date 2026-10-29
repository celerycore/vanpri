// A new, fixed-step combat simulation. Original FM2K scripts supply visual frames,
// not executable logic. All distances, damage and move rules below are adaptation values.
import { meleeContact, projectileContact } from './combat-geometry.js';
export const WIDTH = 960;
export const HEIGHT = 540;
export const FLOOR = 470;
export const MAX_HP = 1000;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const EMPTY = Object.freeze({});
const moves = {
  light: { startup: 6, active: 4, recovery: 13, damage: 44, reach: 87, push: 4, stun: 15, level: 1 },
  medium: { startup: 10, active: 5, recovery: 19, damage: 73, reach: 112, push: 6, stun: 21, level: 2 },
  heavy: { startup: 16, active: 6, recovery: 25, damage: 108, reach: 140, push: 10, stun: 29, level: 3 },
  special: { startup: 15, active: 10, recovery: 25, damage: 93, reach: 145, push: 9, stun: 25, level: 4 },
  super: { startup: 17, active: 16, recovery: 33, damage: 245, reach: 200, push: 17, stun: 43, level: 5 },
  throw: { startup: 6, active: 3, recovery: 29, damage: 145, reach: 70, push: 13, stun: 36, level: 4 },
};
const projectileKinds = new Set(['wave', 'shot', 'burst']);

export class Battle {
  constructor({ characters, assists = ['eko', 'sierra'], mode = 'quick', difficulty = 'normal', random = Math.random, trainingDummy = 'idle' }) {
    this.characters = characters;
    this.assistChoices = assists;
    this.mode = mode;
    this.difficulty = difficulty;
    this.random = random;
    this.trainingDummy = trainingDummy;
    this.frame = 0;
    this.round = 1;
    this.wins = [0, 0];
    this.players = [];
    this.events = [];
    this.serial = 0;
    this.paused = false;
    this.resetRound();
  }

  resetRound() {
    this.players = this.characters.map((character, i) => ({
      index: i, character, x: i ? 645 : 315, y: 0, vy: 0, vx: 0,
      facing: i ? -1 : 1, hp: MAX_HP, guard: 100, meter: this.mode === 'training' ? 100 : 0,
      assist: 100, assistId: this.assistChoices[i], attack: null, stun: 0, invuln: 0,
      block: false, blockStun: false, crouch: false, pose: 'idle', poseTime: 0, lastPose: 'idle',
      combo: 0, comboDamage: 0, comboTimer: 0, lastHit: -999, previous: {},
      ai: {}, aiTimer: 0, flash: 0,
    }));
    this.projectiles = [];
    this.helpers = [];
    this.phase = this.mode === 'training' ? 'fight' : 'intro';
    this.phaseTimer = this.mode === 'training' ? 0 : 110;
    this.timer = 90 * 60;
    this.winner = null;
  }

  emit(type, data = {}) { this.events.push({ type, frame: this.frame, ...data }); }
  drainEvents() { const events = this.events; this.events = []; return events; }

  startMove(player, name, input) {
    const current = player.attack;
    const next = moves[name];
    if (!next || player.stun > 0) return false;
    if (current && !(current.hasHit && next.level > current.level && current.elapsed >= current.startup)) return false;
    if (name === 'super' && player.meter < 100) {
      if (!player.index) this.emit('hint', { text: 'Build your Liberty meter to 100% first.' });
      return false;
    }
    if (name === 'throw' && player.y > 0) return false;
    if (name === 'super') {
      player.meter = 0;
      player.invuln = 25;
      this.emit('super', { player: player.index, text: 'LIBERTY ART', x: player.x });
    }
    let reach = next.reach + (player.character.reach - 115) * 0.65;
    let damage = next.damage;
    if (player.character.id === 3 && ['heavy', 'throw'].includes(name)) damage *= 1.25;
    if (player.character.id === 8 && name === 'heavy') damage *= 1.18;
    if (name === 'throw') reach = next.reach;
    player.attack = { ...next, name, id: ++this.serial, elapsed: 0, hasHit: false, spawned: false, reach, damage: Math.round(damage), facing: player.facing, low: !!input.down && !player.y && ['light', 'medium', 'heavy'].includes(name), aerial: player.y > 0 };
    player.block = false;
    player.poseTime = 0;
    this.emit('swing', { player: player.index, move: name });
    return true;
  }

  callAssist(player) {
    if (player.assist < 100 || player.stun || this.helpers.some(h => h.owner === player.index)) return false;
    player.assist = 0;
    const enemy = this.players[1 - player.index];
    this.helpers.push({ owner: player.index, id: player.assistId, x: player.x - player.facing * 60, target: enemy.x, facing: player.facing, age: 0, fired: false, life: 85 });
    this.emit('assist', { player: player.index, text: player.assistId.toUpperCase() + ' ASSIST' });
    return true;
  }

  cpu(player, enemy) {
    if (this.mode === 'training' && this.trainingDummy !== 'cpu') return this.trainingDummy === 'guard' ? { guard: true } : {};
    const distance = Math.abs(enemy.x - player.x);
    const hard = this.difficulty === 'hard', easy = this.difficulty === 'easy';
    if (player.aiTimer-- <= 0) {
      player.aiTimer = hard ? 9 : easy ? 25 : 17;
      const input = {};
      const roll = this.random();
      const towards = enemy.x > player.x ? 'right' : 'left';
      const away = enemy.x > player.x ? 'left' : 'right';
      if (distance > 105) input[towards] = true;
      else if (roll < .12) input[away] = true;
      if (distance < 155 && roll > (easy ? .58 : .18)) {
        input[roll < .48 ? 'light' : roll < .72 ? 'medium' : 'heavy'] = true;
      }
      if (distance > 155 && roll > .57) input.special = true;
      if (distance < 250 && roll > .94) input.up = true;
      if (player.meter >= 100 && distance < 380 && roll > .65) input.super = true;
      if (player.assist >= 100 && distance < 390 && roll < (easy ? .025 : .09)) input.assist = true;
      if (distance < 75 && roll > .9) { input.medium = true; input.heavy = true; }
      player.ai = input;
    }
    const input = { ...player.ai };
    const incoming = enemy.attack && distance < enemy.attack.reach + 40;
    const shot = this.projectiles.some(p => p.owner !== player.index && Math.abs(p.x - player.x) < 180);
    if ((incoming || shot) && this.random() < (hard ? .86 : easy ? .04 : .32)) {
      input.guard = true;
      input.left = input.right = input.light = input.medium = input.heavy = input.special = input.super = false;
    }
    return input;
  }

  step(inputs = [EMPTY, EMPTY]) {
    if (this.paused || this.phase === 'matchover') return;
    this.frame++;
    if (this.phase === 'intro') {
      this.phaseTimer--;
      if (this.phaseTimer === 28) this.emit('fight');
      if (this.phaseTimer <= 0) this.phase = 'fight';
      return;
    }
    if (this.phase === 'roundover') {
      if (--this.phaseTimer <= 0) {
        if (this.wins.some(n => n >= 2)) { this.phase = 'matchover'; this.emit('matchover', { winner: this.winner }); }
        else { this.round++; this.resetRound(); }
      }
      return;
    }
    if (this.mode !== 'training') this.timer--;
    const controls = inputs.map(i => ({ ...(i || {}) }));
    if (this.mode !== 'versus') controls[1] = this.cpu(this.players[1], this.players[0]);

    for (const player of this.players) {
      const enemy = this.players[1 - player.index];
      const input = controls[player.index];
      const pressed = key => input[key] && !player.previous[key];
      player.invuln = Math.max(0, player.invuln - 1);
      player.stun = Math.max(0, player.stun - 1);
      if (!player.stun) player.blockStun = false;
      player.flash = Math.max(0, player.flash - 1);
      player.comboTimer = Math.max(0, player.comboTimer - 1);
      if (!player.comboTimer) { player.combo = 0; player.comboDamage = 0; }
      player.assist = Math.min(100, player.assist + .115);
      if (!player.block) player.guard = Math.min(100, player.guard + .17);
      if (!player.attack && !player.stun) player.facing = enemy.x >= player.x ? 1 : -1;
      const movingAway = player.facing > 0 ? input.left : input.right;
      player.block = (!player.stun || player.blockStun) && !player.attack && (input.guard || movingAway || player.blockStun);
      player.crouch = (!!input.down || player.attack?.low) && player.y === 0;

      if (!player.stun) {
        if (pressed('assist')) this.callAssist(player);
        const move = pressed('super') ? 'super' : input.medium && input.heavy && (pressed('medium') || pressed('heavy')) ? 'throw' : pressed('special') ? 'special' : pressed('heavy') ? 'heavy' : pressed('medium') ? 'medium' : pressed('light') ? 'light' : null;
        if (move) this.startMove(player, move, input);
        if (!player.attack) {
          if (pressed('up') && player.y === 0) { player.vy = 11.4; player.block = false; this.emit('jump', { player: player.index }); }
          if (!input.guard && !player.crouch) {
            const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
            player.x += direction * player.character.speed * (movingAway ? .73 : 1) * (player.y > 0 ? .8 : 1);
          }
        }
      }
      player.x += player.vx;
      player.vx *= .80;
      if (player.y > 0 || player.vy > 0) {
        player.y += player.vy; player.vy -= .56;
        if (player.y <= 0) { player.y = 0; player.vy = 0; }
      }
      player.x = clamp(player.x, 75, WIDTH - 75);
      player.previous = { ...input };
    }
    // Update both players before testing contact. This removes player-one's
    // movement/guard advantage and lets simultaneous active strikes trade.
    for (const player of this.players) if (player.attack) this.advanceAttack(player);
    const [a, b] = this.players;
    const distance = b.x - a.x;
    if (Math.abs(distance) < 58 && Math.abs(a.y - b.y) < 90) {
      const correction = (58 - Math.abs(distance)) / 2;
      const sign = distance >= 0 ? 1 : -1;
      a.x = clamp(a.x - correction * sign, 75, WIDTH - 75);
      b.x = clamp(b.x + correction * sign, 75, WIDTH - 75);
    }
    for (const player of this.players) {
      const input = controls[player.index];
      const away = player.facing > 0 ? input.left : input.right;
      const pose = player.stun ? (player.block ? 'guard' : 'hit') : player.attack ? (player.attack.name === 'throw' ? 'heavy' : player.attack.name) : player.y > 0 ? 'jump' : player.crouch ? 'crouch' : player.block && input.guard ? 'guard' : (input.left || input.right) ? (away ? 'back' : 'walk') : 'idle';
      player.poseTime = pose === player.pose ? player.poseTime + 1 : 0;
      player.pose = pose;
    }
    const contacts = [];
    for (const player of this.players) {
      const enemy = this.players[1 - player.index], attack = player.attack;
      if (!attack || attack.hasHit || enemy.invuln || enemy.hp <= 0) continue;
      const point = meleeContact(player, enemy);
      if (point) contacts.push({ player, enemy, attack, point });
    }
    for (const { player, enemy, attack, point } of contacts) {
      attack.hasHit = this.hit(player, enemy, attack, attack.name === 'throw', point);
    }
    this.advanceHelpers();
    this.advanceProjectiles();
    if (this.mode === 'training') {
      a.meter = 100;
      if (this.frame - b.lastHit > 150 && b.hp < MAX_HP) { b.hp = MAX_HP; b.guard = 100; }
      if (this.frame - a.lastHit > 150) a.hp = MAX_HP;
    } else if (a.hp <= 0 || b.hp <= 0 || this.timer <= 0) {
      const winner = a.hp === b.hp ? -1 : a.hp > b.hp ? 0 : 1;
      this.winner = winner;
      if (winner >= 0) this.wins[winner]++;
      this.phase = 'roundover';
      this.phaseTimer = 155;
      for (const p of this.players) { p.pose = p.index === winner ? 'win' : 'ko'; p.poseTime = 0; p.attack = null; }
      this.emit('roundover', { winner, timeout: this.timer <= 0 });
    }
  }

  advanceAttack(player) {
    const attack = player.attack;
    attack.elapsed++;
    const ranged = (attack.name === 'special' || attack.name === 'super') && projectileKinds.has(player.character.kind);
    const rush = ['special', 'super'].includes(attack.name) && !ranged;
    if (rush && attack.elapsed >= attack.startup - 5 && attack.elapsed < attack.startup + attack.active) {
      player.x = clamp(player.x + attack.facing * (attack.name === 'super' ? 7.8 : player.character.kind === 'armor' ? 4.5 : 7), 75, WIDTH - 75);
      if (player.character.kind === 'armor') player.invuln = Math.max(player.invuln, 2);
    }
    if (ranged && attack.elapsed === attack.startup && !attack.spawned) {
      attack.spawned = true;
      const superMove = attack.name === 'super';
      const count = player.character.kind === 'burst' ? 2 : 1;
      for (let j = 0; j < count; j++) {
        this.projectiles.push({ owner: player.index, x: player.x + attack.facing * (45 - j * 48), y: player.y + 105 + j * 20,
          vx: attack.facing * (player.character.kind === 'shot' ? 14 : 9), life: 125,
          damage: count > 1 ? Math.round(attack.damage * .56) : attack.damage, radius: superMove ? 44 : player.character.kind === 'shot' ? 10 : 22,
          super: superMove, name: attack.name, direction: attack.facing, color: player.character.color, stun: attack.stun, push: attack.push, kind: player.character.kind });
      }
    }
    if (attack.elapsed >= attack.startup + attack.active + attack.recovery) player.attack = null;
  }

  hit(attacker, defender, hit, unguardable = false, contact = null) {
    if (defender.invuln || defender.hp <= 0) return false;
    const direction = hit.direction || hit.facing || Math.sign(defender.x - attacker.x) || 1;
    const guarding = !unguardable && defender.block && defender.facing === -direction && defender.guard > 0 && !defender.attack && (!hit.low || defender.crouch);
    const damage = guarding ? (hit.name === 'special' || hit.super ? Math.ceil(hit.damage * .08) : 0) : hit.damage;
    const trainingFloor = this.mode === 'training' ? 1 : 0;
    defender.hp = Math.max(trainingFloor, defender.hp - damage);
    defender.lastHit = this.frame;
    defender.flash = 7;
    defender.vx = direction * (guarding ? 3 : hit.push || 7);
    defender.stun = guarding ? 12 : hit.stun || 20;
    defender.blockStun = guarding;
    defender.invuln = guarding ? 5 : 8;
    defender.poseTime = 0;
    if (guarding) {
      defender.guard = Math.max(0, defender.guard - hit.damage * .31);
      defender.pose = 'guard';
      if (defender.guard <= 0) {
        defender.stun = 65;
        defender.blockStun = false;
        defender.block = false;
        this.emit('guardbreak', { player: defender.index, text: 'CALCIUM BREAK' });
      }
    } else {
      defender.block = false;
      defender.attack = null;
      defender.pose = 'hit';
      attacker.combo++;
      attacker.comboDamage += damage;
      attacker.comboTimer = 85;
    }
    attacker.meter = clamp(attacker.meter + (guarding ? 3 : damage * .12), 0, 100);
    defender.meter = clamp(defender.meter + damage * .075, 0, 100);
    const point = contact || { x: defender.x - direction * 20, y: defender.y + (hit.low ? 40 : 115) };
    this.emit(guarding ? 'block' : 'hit', { x: point.x, y: point.y, direction, move: hit.name || hit.kind, damage, player: attacker.index, heavy: hit.damage > 95, color: attacker.character.color });
    return true;
  }

  advanceProjectiles() {
    for (const projectile of this.projectiles) {
      const oldX = projectile.x;
      projectile.previousX = oldX;
      projectile.x += projectile.vx;
      projectile.life--;
      const defender = this.players[1 - projectile.owner];
      const contact = !defender.invuln && projectileContact(projectile, oldX, projectile.x, defender);
      if (contact) {
        projectile.direction ||= Math.sign(projectile.vx) || Math.sign(defender.x - this.players[projectile.owner].x) || 1;
        if (this.hit(this.players[projectile.owner], defender, projectile, false, contact)) projectile.life = 0;
      }
      if (projectile.x < -100 || projectile.x > WIDTH + 100) projectile.life = 0;
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0);
  }

  advanceHelpers() {
    for (const helper of this.helpers) {
      helper.age++;
      helper.life--;
      const owner = this.players[helper.owner];
      const enemy = this.players[1 - helper.owner];
      if (helper.age === 25 && !helper.fired) {
        helper.fired = true;
        if (helper.id === 'kanae') {
          helper.x = helper.target;
          this.projectiles.push({ owner: helper.owner, x: helper.target, y: 30, vx: 0, life: 90, damage: 90, radius: 42, color: '#dbea9c', stun: 35, push: 6, kind: 'trap', low: true });
        } else if (helper.id === 'juliet') {
          helper.x = clamp(enemy.x - helper.facing * 65, 75, WIDTH - 75);
          this.projectiles.push({ owner: helper.owner, x: helper.x, y: 85, vx: helper.facing * 6, life: 35, damage: 116, radius: 65, color: '#ffe5a7', stun: 35, push: 13, kind: 'wave' });
        } else {
          this.projectiles.push({ owner: helper.owner, x: helper.x, y: 105, vx: helper.facing * (helper.id === 'sierra' ? 18 : 11), life: 95,
            damage: helper.id === 'sierra' ? 78 : 61, radius: helper.id === 'sierra' ? 38 : 23, color: helper.id === 'sierra' ? '#cca0ff' : '#96e5fc', stun: 28, push: 4, kind: helper.id === 'sierra' ? 'beam' : 'wave' });
        }
        owner.meter = Math.min(100, owner.meter + 3);
      }
    }
    this.helpers = this.helpers.filter(h => h.life > 0);
  }
}
