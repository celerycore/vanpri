import { COMBAT_DATA } from './combat-data.js';

export const SPRITE_SCALE = .83;
const bound = (value, low, high) => Math.max(low, Math.min(high, value));
const normals = new Set(['light', 'medium', 'heavy']);

export function animationName(player) {
  const attack = player.attack;
  if (attack) {
    const name = attack.name === 'throw' ? 'heavy' : attack.name;
    const prefix = normals.has(name) ? attack.aerial ? 'air' : attack.low ? 'low' : '' : '';
    const variant = prefix + name[0].toUpperCase() + name.slice(1);
    return prefix && player.character.animations[variant] ? variant : name;
  }
  if (player.crouch && ['hit', 'guard'].includes(player.pose)) {
    const variant = 'low' + player.pose[0].toUpperCase() + player.pose.slice(1);
    if (player.character.animations[variant]) return variant;
  }
  return player.pose;
}

export function fighterFrame(player, battle = null) {
  const name = animationName(player);
  const sequence = player.character.animations[name] || player.character.animations.idle;
  if (player.attack) {
    const attack = player.attack;
    const peak = COMBAT_DATA[player.character.id]?.peaks[name] ?? Math.floor(sequence.length * .4);
    if (attack.elapsed < attack.startup) {
      return sequence[Math.min(peak, Math.floor(attack.elapsed / attack.startup * peak))];
    }
    if (attack.elapsed < attack.startup + attack.active) return sequence[peak];
    const recovery = (attack.elapsed - attack.startup - attack.active) / attack.recovery;
    const remaining = sequence.length - peak - 1;
    if (!remaining && recovery > .5) return player.character.animations.idle[0];
    return sequence[Math.min(sequence.length - 1, peak + 1 + Math.floor(recovery * Math.max(1, remaining)))];
  }
  const duration = sequence.reduce((sum, frame) => sum + frame.t, 0);
  let time = player.poseTime;
  if (battle && ['roundover', 'matchover'].includes(battle.phase)) time = Math.min(duration - 1, (155 - battle.phaseTimer) * .75);
  else if (['hit', 'guard'].includes(player.pose)) time = Math.min(time, duration - 1);
  else if (player.pose === 'jump') time = Math.min(duration - 1, time / 43 * duration);
  else time %= duration;
  for (const frame of sequence) { time -= frame.t; if (time < 0) return frame; }
  return sequence[sequence.length - 1];
}

function frameGeometry(player) {
  const frame = fighterFrame(player);
  return COMBAT_DATA[player.character.id]?.frames[frame.id] || { body: [0, 25, player.crouch ? 105 : 210], strike: { normal: [80, 85, 130], low: [70, 15, 55], air: [80, 20, 90] } };
}

function worldBox(player, left, right, bottom, top, facing = player.facing) {
  const x0 = player.x + left * facing, x1 = player.x + right * facing;
  return { left: Math.min(x0, x1), right: Math.max(x0, x1), bottom: player.y + bottom, top: player.y + top };
}

export function hurtboxes(player) {
  const [center, half, height] = frameGeometry(player).body;
  return [
    worldBox(player, center - half * .78, center + half * .78, 5, height * .43),
    worldBox(player, center - half, center + half, height * .34, height * .80),
    worldBox(player, center - half * .72, center + half * .72, height * .73, height),
  ];
}

export function attackBox(player) {
  const attack = player.attack;
  if (!attack || attack.elapsed < attack.startup || attack.elapsed >= attack.startup + attack.active) return null;
  if (['special', 'super'].includes(attack.name) && ['wave', 'shot', 'burst'].includes(player.character.kind)) return null;
  if (attack.name === 'throw') return worldBox(player, 12, 54, 55, 155, attack.facing);
  const geometry = frameGeometry(player);
  const band = attack.low ? 'low' : attack.aerial ? 'air' : 'normal';
  const [extent, bottom, top] = geometry.strike[band];
  const inner = Math.max(3, geometry.body[0] + geometry.body[1] * .25);
  return worldBox(player, inner, Math.max(inner + 12, extent + 4), bottom, top, attack.facing);
}

export function overlapContact(a, b) {
  const left = Math.max(a.left, b.left), right = Math.min(a.right, b.right);
  const bottom = Math.max(a.bottom, b.bottom), top = Math.min(a.top, b.top);
  if (right <= left || top <= bottom) return null;
  return { x: (left + right) / 2, y: (bottom + top) / 2 };
}

export function meleeContact(attacker, defender) {
  const attack = attacker.attack, box = attackBox(attacker);
  if (!box || (defender.x - attacker.x) * attack.facing < 0) return null;
  if (attack.name === 'throw' && (attacker.y > 0 || defender.y > 0)) return null;
  const bodies = hurtboxes(defender);
  const center = (box.bottom + box.top) / 2;
  return (attack.name === 'throw' ? bodies.slice(1) : bodies)
    .map(body => overlapContact(box, body)).filter(Boolean)
    .sort((a, b) => Math.abs(a.y - center) - Math.abs(b.y - center))[0] || null;
}

export function projectileShape(projectile) {
  const r = projectile.radius;
  if (projectile.kind === 'trap') return { rx: r, ry: Math.max(10, r * .32) };
  if (projectile.kind === 'shot') return { rx: r * 1.6, ry: r * .45 };
  if (projectile.kind === 'beam') return { rx: r * 2.1, ry: r * .42 };
  return { rx: r * 1.2, ry: r * .72 };
}

export function projectileContact(projectile, fromX, toX, defender) {
  const { rx, ry } = projectileShape(projectile);
  let first = null;
  // Projectiles travel horizontally. The ellipse's horizontal extent at the
  // closest body height gives a continuous sweep, including grazing corners.
  for (const body of hurtboxes(defender)) {
    const y = bound(projectile.y, body.bottom, body.top);
    const vertical = Math.abs(projectile.y - y) / ry;
    if (vertical >= 1) continue;
    const reach = rx * Math.sqrt(1 - vertical * vertical);
    const low = body.left - reach, high = body.right + reach;
    const delta = toX - fromX;
    let time;
    if (fromX >= low && fromX <= high) time = 0;
    else if (!delta) continue;
    else time = ((delta > 0 ? low : high) - fromX) / delta;
    if (time < 0 || time > 1) continue;
    const x = fromX + delta * time;
    const contact = { x: bound(x, body.left, body.right), y, time, centerX: x };
    if (!first || time < first.time) first = contact;
  }
  return first;
}
