import { Battle } from './engine.js';
import { COMBAT_DATA } from './combat-data.js';
import { SPRITE_SCALE, fighterFrame, hurtboxes, attackBox } from './combat-geometry.js';
import { movementProfile } from './movement.js';

export const SPRITE_ANIMATION_NAMES = {
  idle: 'Idle', walk: 'Walk forward', back: 'Walk backward', run: 'Run', backdash: 'Backdash', airDash: 'Air dash', jump: 'Jump', crouch: 'Crouch',
  light: 'Light attack', medium: 'Medium attack', heavy: 'Heavy attack', special: 'Special', super: 'Liberty Art',
  lowLight: 'Crouching light', lowMedium: 'Crouching medium', lowHeavy: 'Crouching heavy',
  airLight: 'Aerial light', airMedium: 'Aerial medium', airHeavy: 'Aerial heavy',
  hit: 'Hit reaction', lowHit: 'Crouching hit reaction', guard: 'Guard', lowGuard: 'Crouching guard',
  ko: 'Knockout', win: 'Victory',
};

// Use Battle.startMove and the same frame sampler/geometry as the arena. The
// checker must not maintain a second set of timings, damage or collision rules.
export function createSpriteClip(character, animation, requestedMode = 'animation') {
  const sequence = character.animations[animation];
  if (!sequence?.length) throw new Error('This animation has no prepared frames.');
  const moveName = animation.replace(/^(low|air)/, '').toLowerCase();
  const isMove = ['light', 'medium', 'heavy', 'special', 'super'].includes(moveName);
  const battle = new Battle({ characters: [character, character], mode: 'versus' });
  battle.phase = 'fight';
  const player = battle.players[0];
  player.x = 75; player.y = animation.startsWith('air') ? 1000 : 0; player.meter = 100;
  battle.players[1].x = 885;
  if (isMove) battle.startMove(player, moveName, { down: animation.startsWith('low') });
  const attack = player.attack ? { ...player.attack } : null;
  const mode = requestedMode === 'combat' && attack ? 'combat' : 'animation';
  const peakIndex = COMBAT_DATA[character.id]?.peaks[animation] ?? null;
  const steps = [];
  if (mode === 'combat') {
    const total = attack.startup + attack.active + attack.recovery;
    for (let elapsed = 1; elapsed <= total; elapsed++) {
      battle.step([{}, {}]);
      const frame = fighterFrame(player);
      const phase = elapsed === total ? 'ready' : elapsed < attack.startup ? 'startup' : elapsed < attack.startup + attack.active ? 'active' : 'recovery';
      steps.push({ frame, sourceIndex: sequence.indexOf(frame), elapsed, phase, duration: 1 });
    }
  } else {
    for (const [sourceIndex, frame] of sequence.entries()) {
      steps.push({ frame, sourceIndex, elapsed: null, phase: attack && sourceIndex === peakIndex ? 'active pose' : 'sprite', duration: frame.t });
    }
  }
  const move = attack ? { name: moveName, startup: attack.startup, active: attack.active, recovery: attack.recovery,
    total: attack.startup + attack.active + attack.recovery, damage: attack.damage, low: attack.low, aerial: attack.aerial,
    ranged: ['special', 'super'].includes(moveName) && ['wave', 'shot', 'burst'].includes(character.kind) } : null;
  return { character, animation, mode, sequence, attack, move, peakIndex, steps, totalTicks: steps.reduce((sum, step) => sum + step.duration, 0) };
}

export function inspectSpriteFrame(clip, index, facing = 1) {
  const step = clip.steps[index];
  if (!step) throw new Error('Frame is outside this animation.');
  const { character, animation } = clip;
  const [x, y, width, height] = character.rects[step.frame.id];
  const elapsed = step.elapsed ?? (step.sourceIndex === clip.peakIndex ? clip.attack?.startup : 0);
  const player = { character, x: 0, y: 0, facing, pose: animation, poseTime: 0,
    crouch: animation === 'crouch' || animation.startsWith('low'),
    attack: clip.attack && step.phase !== 'ready' ? { ...clip.attack, elapsed, facing } : null };
  return {
    fighter: character.name, fighterId: character.id, animation, playback: clip.mode,
    frameIndex: index, sourceFrameIndex: step.sourceIndex, spriteId: step.frame.id,
    gameFrame: step.elapsed, phase: step.phase, sourceDurationTicks: step.frame.t, playbackDurationTicks: step.duration, tickRate: 60,
    atlas: { file: character.atlas, x, y, width, height },
    anchor: { x: character.anchors[step.frame.id], y: height },
    sourceOffset: { x: step.frame.x, y: step.frame.y },
    scale: SPRITE_SCALE, facing,
    bodyBoxes: hurtboxes(player, step.frame), attackBox: attackBox(player, step.frame), move: clip.move, movement: movementProfile(character),
  };
}

export function advanceSpriteClock(clip, index, carry, ticks) {
  // Whole loops return to the same position even with variable frame durations.
  let remaining = carry + Math.max(0, ticks) % clip.totalTicks;
  while (remaining + 1e-9 >= clip.steps[index].duration) {
    remaining = Math.max(0, remaining - clip.steps[index].duration);
    index = (index + 1) % clip.steps.length;
  }
  return { index, carry: remaining };
}
