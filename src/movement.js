// Melty-inspired movement tuned for this arena's scale. These are adaptation
// values, not extracted Actress Again physics or moon-specific character rules.
export const MOVEMENT = Object.freeze({
  walkScale: 1.5, backWalkScale: .8, runStartScale: 2.15, runMaxScale: 3.2, runAcceleration: 1.05,
  airSpeedScale: 1.8, airAcceleration: .95, airDrag: .99,
  jumpSpeed: 16.2, doubleJumpSpeed: 14.4, highJumpSpeed: 20.2, gravity: .78, terminalSpeed: 18,
  airDashFrames: 12, airDashStartup: 2, airDashScale: 3.9, airBackDashScale: 3.15, minAirDashHeight: 12,
  backdashFrames: 16, backdashInvulnerability: 6, backdashScale: 3.3,
  inputBuffer: 6, doubleTapWindow: 11, highJumpWindow: 10, landingRecovery: 2,
});

const approachSpeed = (value, target, amount) => value + Math.max(-amount, Math.min(amount, target - value));

export function movementProfile(character) {
  const weight = character.kind === 'armor' ? 1.07 : character.id === 3 ? 1.04 : 1;
  return {
    weight,
    walkSpeed: character.speed * MOVEMENT.walkScale,
    backWalkSpeed: character.speed * MOVEMENT.walkScale * MOVEMENT.backWalkScale,
    runStart: character.speed * MOVEMENT.runStartScale, runMax: character.speed * MOVEMENT.runMaxScale,
    airSpeed: character.speed * MOVEMENT.airSpeedScale,
    airDashSpeed: character.speed * MOVEMENT.airDashScale, airBackDashSpeed: character.speed * MOVEMENT.airBackDashScale,
    backdashSpeed: character.speed * MOVEMENT.backdashScale,
    gravity: MOVEMENT.gravity * weight, jumpSpeed: MOVEMENT.jumpSpeed,
    doubleJumpSpeed: MOVEMENT.doubleJumpSpeed, highJumpSpeed: MOVEMENT.highJumpSpeed,
  };
}

export function initialMovement() {
  return { moveVx: 0, runDirection: 0, runMinimum: 0, dashKind: null, dashFrames: 0, dashAge: 0, dashDirection: 0,
    airJumps: 1, airDashes: 1, airTime: 0, jumpLaunchSpeed: MOVEMENT.jumpSpeed, landingLag: 0,
    jumpBuffer: null, dashBuffer: null, attackBuffer: null, lastDown: -999,
    directionTaps: { left: -999, right: -999 } };
}

export function clearMovementInputs(player) {
  player.jumpBuffer = player.dashBuffer = player.attackBuffer = null;
  player.directionTaps = { left: -999, right: -999 }; player.lastDown = -999;
}

export function cancelMovement(player) {
  player.moveVx = 0; player.runDirection = 0; player.runMinimum = 0;
  player.dashKind = null; player.dashFrames = 0; player.dashAge = 0;
}

export function movementAttackLocked(player) {
  return player.landingLag > 0 || player.dashKind === 'back' || player.dashKind === 'air' && player.dashAge < MOVEMENT.airDashStartup;
}

export function attackMovement(player) {
  player.runDirection = 0; player.runMinimum = 0;
  if (player.dashKind === 'air') {
    const profile = movementProfile(player.character);
    const speed = player.dashDirection === player.facing ? profile.airDashSpeed : profile.airBackDashSpeed;
    player.moveVx = (player.moveVx || player.dashDirection * speed) * .7;
    player.dashKind = null; player.dashFrames = 0;
  }
  if (!player.y) player.moveVx *= .25;
}

export function queueMovement(player, input, frame) {
  const pressed = key => input[key] && !player.previous[key];
  const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (pressed('down')) player.lastDown = frame;
  if (pressed('up')) player.jumpBuffer = { until: frame + MOVEMENT.inputBuffer, high: frame - player.lastDown <= MOVEMENT.highJumpWindow };
  let dashDirection = pressed('dash') ? direction || player.facing : 0;
  for (const [key, sign] of [['left', -1], ['right', 1]]) if (pressed(key)) {
    if (frame - player.directionTaps[key] <= MOVEMENT.doubleTapWindow) {
      dashDirection = sign; player.directionTaps[key] = -999;
    } else player.directionTaps[key] = frame;
  }
  if (dashDirection) player.dashBuffer = { until: frame + MOVEMENT.inputBuffer, direction: dashDirection };
  for (const key of ['jumpBuffer', 'dashBuffer', 'attackBuffer']) if (player[key]?.until < frame) player[key] = null;
}

export function advanceMovement(player, input, frame, emit = () => {}) {
  const profile = movementProfile(player.character);
  const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const normalHit = player.attack?.hitConfirmed && ['light', 'medium', 'heavy'].includes(player.attack.name);
  const canMove = !player.stun && !player.landingLag && (!player.attack || normalHit && player.jumpBuffer);
  if (player.jumpBuffer && canMove && player.dashKind !== 'back' && !input.guard && (!player.y || player.airJumps > 0)) {
    const aerial = player.y > 0, high = !aerial && player.jumpBuffer.high;
    if (player.attack) { player.attack = null; emit('jumpcancel'); }
    if (aerial) player.airJumps--;
    player.vy = aerial ? profile.doubleJumpSpeed : high ? profile.highJumpSpeed : profile.jumpSpeed;
    player.jumpLaunchSpeed = player.vy; player.airTime = 0; player.poseTime = 0;
    player.jumpBuffer = null; player.dashKind = null; player.dashFrames = 0;
    player.runDirection = 0; player.runMinimum = 0; player.crouch = false; player.block = false;
    if (direction && (!player.moveVx || Math.sign(player.moveVx) !== direction)) player.moveVx = direction * profile.airSpeed;
    emit(aerial ? 'doublejump' : high ? 'highjump' : 'jump');
  }

  const airborne = player.y > 0 || player.vy > 0;
  if (player.dashBuffer && !player.stun && !player.attack && !player.landingLag && !player.dashKind && !input.guard) {
    const dashDirection = player.dashBuffer.direction;
    if (airborne && player.y >= MOVEMENT.minAirDashHeight && player.airDashes > 0) {
      player.airDashes--; player.dashKind = 'air'; player.dashFrames = MOVEMENT.airDashFrames;
      player.dashDirection = dashDirection; player.dashAge = 0; player.vy = 0;
      player.moveVx = 0; player.block = false; player.poseTime = 0; player.dashBuffer = null;
      emit('dash', { kind: 'air', direction: dashDirection });
    } else if (!airborne && !input.down) {
      player.dashBuffer = null; player.dashDirection = dashDirection;
      if (dashDirection === player.facing) {
        player.runDirection = dashDirection; player.runMinimum = 4; player.moveVx = dashDirection * profile.runStart;
        emit('dash', { kind: 'run', direction: dashDirection });
      } else {
        player.dashKind = 'back'; player.dashFrames = MOVEMENT.backdashFrames; player.dashAge = 0;
        player.moveVx = dashDirection * profile.backdashSpeed; player.vy = 3;
        player.invuln = Math.max(player.invuln, MOVEMENT.backdashInvulnerability);
        player.block = false; player.poseTime = 0;
        emit('dash', { kind: 'back', direction: dashDirection });
      }
    } else if (airborne && !player.airDashes) player.dashBuffer = null;
  }

  const airNow = player.y > 0 || player.vy > 0;
  if (player.stun) { cancelMovement(player); }
  else if (player.dashKind === 'air') {
    const speed = player.dashDirection === player.facing ? profile.airDashSpeed : profile.airBackDashSpeed;
    player.moveVx = player.dashAge < MOVEMENT.airDashStartup ? 0 : player.dashDirection * speed;
    player.vy = 0; player.block = false;
  } else if (player.dashKind === 'back') {
    player.moveVx = player.dashDirection * profile.backdashSpeed * Math.pow(.9, Math.max(0, player.dashAge - 3));
    player.block = false;
  } else if (airNow) {
    if (!player.attack && direction) {
      if (Math.sign(player.moveVx) === direction && Math.abs(player.moveVx) > profile.airSpeed) player.moveVx *= MOVEMENT.airDrag;
      else player.moveVx = approachSpeed(player.moveVx, direction * profile.airSpeed, MOVEMENT.airAcceleration);
    } else player.moveVx *= MOVEMENT.airDrag;
  } else if (player.attack) { player.moveVx *= .5; }
  else if (input.guard || input.down) { player.runDirection = 0; player.runMinimum = 0; player.moveVx = 0; }
  else if (player.runDirection && (direction === player.runDirection || !direction && (input.dash || player.runMinimum > 0))) {
    player.moveVx = approachSpeed(player.moveVx, player.runDirection * profile.runMax, MOVEMENT.runAcceleration);
    player.runMinimum = Math.max(0, player.runMinimum - 1); player.block = false;
  } else {
    player.runDirection = 0; player.runMinimum = 0;
    if (direction) player.moveVx = direction * (direction === player.facing ? profile.walkSpeed : profile.backWalkSpeed);
    else player.moveVx *= .55;
  }
  if (Math.abs(player.moveVx) < .08) player.moveVx = 0;
  player.x += player.moveVx + player.vx;
  player.vx *= .8;
  if (player.y > 0 || player.vy > 0) {
    player.airTime++;
    player.y += player.vy;
    if (player.dashKind !== 'air') player.vy = Math.max(-MOVEMENT.terminalSpeed, player.vy - profile.gravity);
    if (player.y <= 0) {
      player.y = 0; player.vy = 0; player.airTime = 0;
      player.airJumps = player.airDashes = 1; player.landingLag = MOVEMENT.landingRecovery;
      if (player.attack?.aerial) {
        // A press immediately before touchdown becomes a buffered ground move.
        if (!player.attack.elapsed) player.attackBuffer = { name: player.attack.name, until: frame + MOVEMENT.inputBuffer };
        player.attack = null;
      }
      if (player.dashKind === 'air') { player.dashKind = null; player.dashFrames = 0; }
      emit('land');
    }
  }
  if (player.dashFrames > 0) {
    player.dashAge++; player.dashFrames--;
    if (!player.dashFrames) { player.dashKind = null; if (!player.y) player.moveVx *= .45; }
  }
}
