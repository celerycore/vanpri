import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Battle } from '../src/engine.js';
import { fighterFrame, attackBox } from '../src/combat-geometry.js';
import { createSpriteClip, inspectSpriteFrame, advanceSpriteClock } from '../src/sprite-data.js';

const { characters } = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url)));

test('the sprite checker reports every prepared frame, duration, crop and anchor accurately', () => {
  for (const character of characters) for (const [animation, sequence] of Object.entries(character.animations)) {
    const clip = createSpriteClip(character, animation);
    assert.equal(clip.steps.length, sequence.length);
    assert.equal(clip.totalTicks, sequence.reduce((sum, frame) => sum + frame.t, 0));
    for (let index = 0; index < sequence.length; index++) {
      const data = inspectSpriteFrame(clip, index), frame = sequence[index];
      assert.equal(data.spriteId, frame.id);
      assert.equal(data.sourceDurationTicks, frame.t);
      assert.equal(data.sourceFrameIndex, index);
      assert.deepEqual([data.atlas.x, data.atlas.y, data.atlas.width, data.atlas.height], character.rects[frame.id]);
      assert.equal(data.anchor.x, character.anchors[frame.id]);
      assert.deepEqual(data.sourceOffset, { x: frame.x, y: frame.y });
      for (const box of data.bodyBoxes) for (const value of Object.values(box)) assert.ok(Number.isFinite(value));
    }
  }
});

test('combat inspection matches the real battle frame and active box on every tick for every attack', () => {
  for (const character of characters) for (const animation of ['light', 'medium', 'heavy', 'lowLight', 'lowMedium', 'lowHeavy', 'airLight', 'airMedium', 'airHeavy', 'special', 'super']) {
    const clip = createSpriteClip(character, animation, 'combat');
    const battle = new Battle({ characters: [character, character], mode: 'versus' });
    battle.phase = 'fight';
    const player = battle.players[0]; player.x = 100; player.meter = 100;
    battle.players[1].x = 850;
    if (animation.startsWith('air')) player.y = 1;
    battle.startMove(player, clip.move.name, { down: animation.startsWith('low') });
    assert.equal(clip.move.damage, player.attack.damage);
    for (let index = 0; index < clip.steps.length; index++) {
      battle.step([{}, {}]);
      const data = inspectSpriteFrame(clip, index), actualBox = attackBox(player);
      assert.equal(data.spriteId, fighterFrame(player).id, `${character.name} ${animation} game frame ${index + 1}`);
      assert.equal(data.gameFrame, index + 1);
      assert.equal(!!data.attackBox, !!actualBox);
      if (actualBox) {
        const local = { left: actualBox.left - player.x, right: actualBox.right - player.x, bottom: actualBox.bottom - player.y, top: actualBox.top - player.y };
        for (const key of Object.keys(local)) assert.ok(Math.abs(local[key] - data.attackBox[key]) < 1e-6, `${character.name} ${animation} ${key}`);
      }
    }
    assert.equal(clip.steps.at(-1).phase, 'ready');
  }
});

test('non-attack animations fall back to sprite playback and do not invent combat timings', () => {
  for (const animation of ['idle', 'walk', 'crouch', 'guard', 'ko']) {
    const clip = createSpriteClip(characters[0], animation, 'combat');
    assert.equal(clip.mode, 'animation');
    assert.equal(clip.move, null);
    assert.equal(inspectSpriteFrame(clip, 0).attackBox, null);
  }
  assert.throws(() => createSpriteClip(characters[0], 'missing'), /no prepared frames/);
});

test('flipping the preview mirrors collision coordinates without changing source metadata', () => {
  const clip = createSpriteClip(characters[0], 'light', 'combat');
  const index = clip.steps.findIndex(step => step.phase === 'active');
  const right = inspectSpriteFrame(clip, index, 1), left = inspectSpriteFrame(clip, index, -1);
  assert.deepEqual(right.atlas, left.atlas);
  for (let i = 0; i < right.bodyBoxes.length; i++) {
    assert.equal(left.bodyBoxes[i].left, -right.bodyBoxes[i].right);
    assert.equal(left.bodyBoxes[i].right, -right.bodyBoxes[i].left);
  }
  assert.equal(left.attackBox.left, -right.attackBox.right);
  assert.equal(left.attackBox.right, -right.attackBox.left);
});

test('playback honors variable sprite durations, wraps and stays consistent across refresh rates', () => {
  const clip = createSpriteClip(characters[0], 'light');
  assert.deepEqual(advanceSpriteClock(clip, 0, 0, clip.steps[0].duration - .5), { index: 0, carry: clip.steps[0].duration - .5 });
  assert.deepEqual(advanceSpriteClock(clip, 0, 0, clip.steps[0].duration), { index: 1, carry: 0 });
  assert.deepEqual(advanceSpriteClock(clip, 2, .25, clip.totalTicks * 3), { index: 2, carry: .25 });
  const expected = advanceSpriteClock(clip, 0, 0, 360);
  for (const refreshRate of [30, 60, 120, 144]) {
    let state = { index: 0, carry: 0 };
    for (let paint = 0; paint < refreshRate * 6; paint++) state = advanceSpriteClock(clip, state.index, state.carry, 60 / refreshRate);
    assert.equal(state.index, expected.index, `${refreshRate} Hz`);
    assert.ok(Math.abs(state.carry - expected.carry) < 1e-6);
  }
});
