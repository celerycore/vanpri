import { WIDTH, HEIGHT, FLOOR, MAX_HP, clamp } from './engine.js';
import { assetUrl } from './asset-url.js';
import { SPRITE_SCALE, fighterFrame, hurtboxes, attackBox, projectileShape } from './combat-geometry.js';
import { ImpactEffects } from './impact-effects.js';

export class Assets {
  constructor() { this.images = new Map(); }
  image(name) { return this.images.get(name); }
  async load(names) {
    await Promise.all([...new Set(names)].filter(n => !this.images.has(n)).map(name => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => { this.images.set(name, image); resolve(); };
      image.onerror = () => reject(new Error(`Could not load ${name}`));
      image.src = assetUrl(name);
    })));
  }
}

export class ArenaRenderer {
  constructor(canvas, assets, manifest) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.assets = assets;
    this.manifest = manifest;
    this.notices = [];
    this.health = [MAX_HP, MAX_HP];
    this.shake = 0;
    this.shakeX = this.shakeY = 0;
    this.flash = 0;
    this.superFlash = 0;
    this.hitStop = 0;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.effects = new ImpactEffects({ reducedMotion: this.reducedMotion });
    this.showHitboxes = false;
  }
  event(event) {
    if (event.type === 'hit' || event.type === 'block') {
      this.effects.add(event);
      this.shake = Math.max(this.shake, event.type === 'hit' && !this.reducedMotion ? event.heavy ? 7 : 3 : 0);
      this.shakeX = (Math.random() - .5) * this.shake * 2;
      this.shakeY = (Math.random() - .5) * this.shake;
      this.hitStop = Math.max(this.hitStop, event.type === 'hit' ? event.heavy ? 5 : 3 : 1);
      if (event.heavy) this.flash = 2;
    }
    if (event.type === 'super') this.superFlash = 42;
    if (['super', 'assist', 'guardbreak'].includes(event.type)) this.notices.push({ ...event, life: event.type === 'super' ? 75 : 65 });
  }

  updateEffects() {
    this.effects.update();
    this.shake *= .76;
    this.shakeX = this.shake > .05 ? (Math.random() - .5) * this.shake * 2 : 0;
    this.shakeY = this.shake > .05 ? (Math.random() - .5) * this.shake : 0;
    this.flash = Math.max(0, this.flash - 1);
    this.superFlash = Math.max(0, this.superFlash - 1);
    for (const notice of this.notices) notice.life--;
    this.notices = this.notices.filter(notice => notice.life > 0);
  }

  resetEffects() {
    this.effects.clear(); this.notices = [];
    this.hitStop = this.flash = this.shake = this.superFlash = 0;
    this.shakeX = this.shakeY = 0;
  }

  text(text, x, y, size, color = '#fff5ec', align = 'left', font = 'Arial', weight = '600') {
    const ctx = this.ctx;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
  }

  draw(battle, stage, timestamp) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1c1b2a'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);
    const background = this.assets.image(`stage-${stage.id}.webp`);
    if (background) {
      const scale = Math.max(WIDTH / background.width, HEIGHT / background.height);
      const h = background.height * scale;
      ctx.drawImage(background, 0, -(h - HEIGHT) * .72, WIDTH, h);
    }
    const shade = ctx.createLinearGradient(0, 270, 0, HEIGHT);
    shade.addColorStop(0, '#100b2200'); shade.addColorStop(1, '#17101d70');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    if (!this.reducedMotion) {
      for (let i = 0; i < 11; i++) {
        const t = timestamp * .018;
        const x = ((i * 177 + t * (1 + i % 3 * .3)) % 1080) - 60;
        const y = (i * 71 + Math.sin(t / 90 + i) * 30) % 430 + 45;
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * .01 + i); ctx.fillStyle = '#ffe8e847'; ctx.fillRect(-2, -1, 4, 2); ctx.restore();
      }
    }
    if (this.superFlash > 0) {
      ctx.fillStyle = `rgba(20,8,40,${Math.min(.73, this.superFlash / 60)})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.strokeStyle = '#f4b6d259'; ctx.lineWidth = 1;
      for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.moveTo(0, 90 + i * 27); ctx.lineTo(WIDTH, 60 + i * 27); ctx.stroke(); }
    }
    for (const helper of battle.helpers) this.drawAssist(helper);
    for (const player of [...battle.players].sort((a, b) => a.y - b.y)) this.drawFighter(player, battle);
    for (const projectile of battle.projectiles) this.drawProjectile(projectile, battle.frame);
    if (this.showHitboxes && battle.mode === 'training') this.drawHitboxes(battle);
    this.drawImpacts();
    this.drawParticles();
    ctx.restore();
    if (this.flash > 0 && !this.reducedMotion) { ctx.fillStyle = '#fff2d821'; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
    this.drawHud(battle);
    this.drawAnnouncements(battle);
  }

  animationFrame(player, battle) {
    return fighterFrame(player, battle);
  }

  drawFighter(player, battle) {
    const ctx = this.ctx, character = player.character;
    const image = this.assets.image(character.atlas);
    if (!image) return;
    const frame = this.animationFrame(player, battle);
    const rect = character.rects[frame.id];
    if (!rect) return;
    const [sx, sy, w, h] = rect;
    const scale = SPRITE_SCALE;
    ctx.save();
    ctx.fillStyle = '#0c071c69';
    ctx.beginPath(); ctx.ellipse(player.x, FLOOR + 3, 47 * (1 - Math.min(player.y, 180) / 320), 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(player.x, FLOOR - player.y);
    ctx.scale(player.facing, 1);
    // The new physics engine owns movement; anchor trimmed original frames at
    // their feet rather than executing FM2K's per-command position changes.
    const anchor = character.anchors?.[frame.id] ?? w + frame.x + (character.anchorCorrection || 0);
    const x = -anchor * scale;
    const y = -h * scale;
    if (player.index === 1 && battle.players[0].character.id === character.id) ctx.filter = 'hue-rotate(140deg)';
    if (player.flash > 0) ctx.filter = (player.block ? 'brightness(1.6) drop-shadow(0 0 6px #90dfff)' : 'brightness(1.8) drop-shadow(0 0 6px #ffb4cb)');
    ctx.drawImage(image, sx, sy, w, h, Math.round(x), Math.round(y), w * scale, h * scale);
    ctx.filter = 'none';
    ctx.restore();
    if (player.block && battle.phase === 'fight') {
      ctx.save(); ctx.strokeStyle = '#b7e9fc55'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(player.x + player.facing * 14, FLOOR - player.y - (player.crouch ? 60 : 108), 44, player.crouch ? 57 : 100, 0, -Math.PI / 2, Math.PI / 2, player.facing < 0); ctx.stroke(); ctx.restore();
    }
  }

  drawAssist(helper) {
    const assist = this.manifest.assists.find(a => a.id === helper.id);
    if (!assist) return;
    const image = this.assets.image(assist.atlas);
    if (!image) return;
    const ids = helper.age >= 25 ? assist.attack : assist.idle;
    const index = ids[Math.floor(helper.age / 6) % ids.length];
    const [sx, sy, w, h] = assist.rects[index];
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.min(1, helper.age / 9, helper.life / 15);
    ctx.translate(helper.x, FLOOR - Math.sin(Math.min(1, helper.age / 20) * Math.PI) * 30);
    ctx.scale(helper.facing, 1);
    ctx.shadowColor = '#adf4e1'; ctx.shadowBlur = 14;
    ctx.drawImage(image, sx, sy, w, h, -w * .36, -h * .7, w * .7, h * .7);
    ctx.restore();
    this.text(assist.name.toUpperCase(), helper.x, FLOOR - h * .7 - 12, 9, '#d1ffe5', 'center');
  }

  drawProjectile(p, frame) {
    const ctx = this.ctx;
    const { rx, ry } = projectileShape(p);
    ctx.save(); ctx.translate(p.x, FLOOR - p.y); ctx.globalCompositeOperation = 'lighter';
    if (p.kind === 'trap') {
      ctx.scale(1, ry / rx); ctx.rotate(frame * .035); ctx.strokeStyle = p.color; ctx.lineWidth = 3;
      ctx.shadowColor = p.color; ctx.shadowBlur = 15;
      for (let i = 0; i < 2; i++) { ctx.rotate(Math.PI / 4); ctx.strokeRect(-p.radius * .7, -p.radius * .7, p.radius * 1.4, p.radius * 1.4); }
    } else {
      ctx.scale(p.vx > 0 ? 1 : -1, 1);
      ctx.scale(rx, ry);
      const glow = ctx.createRadialGradient(0, 0, .1, 0, 0, 2);
      glow.addColorStop(0, '#ffffff'); glow.addColorStop(.3, p.color); glow.addColorStop(1, p.color + '00');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.ellipse(-.3, 0, 2, 1.65, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff2e9'; ctx.beginPath(); ctx.ellipse(0, 0, 1, .8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff5ed'; ctx.lineWidth = .08;
      ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(.7, 0); ctx.stroke();
    }
    ctx.restore();
  }

  drawParticles() {
    const ctx = this.ctx;
    for (const p of this.effects.particles) {
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.strokeStyle = p.color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(p.x, FLOOR - p.y); ctx.lineTo(p.x - p.vx * 2, FLOOR - p.y + p.vy * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawImpacts() {
    const ctx = this.ctx;
    for (const impact of this.effects.impacts) {
      const progress = impact.age / impact.life;
      const radius = impact.size * (this.reducedMotion ? 1 : .6 + Math.min(1, impact.age / 4) * .5);
      ctx.save(); ctx.translate(impact.x, FLOOR - impact.y); ctx.rotate(impact.angle);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - progress) ** 1.5;
      if (impact.type === 'block') {
        ctx.strokeStyle = '#8edfff'; ctx.lineWidth = 3 * (1 - progress) + .5;
        ctx.beginPath(); ctx.ellipse(0, 0, radius * .65, radius, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#e8fcff'; ctx.fillRect(-3, -3, 6, 6);
      } else {
        const texture = this.assets.image('impact.webp');
        if (texture) ctx.drawImage(texture, -radius, -radius, radius * 2, radius * 2);
        ctx.fillStyle = '#ffd083'; ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const angle = i * Math.PI / 8;
          const length = radius * (i % 2 ? .16 : i % 4 ? .72 : 1);
          const x = Math.cos(angle) * length, y = Math.sin(angle) * length;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fffaf2'; ctx.beginPath();
        ctx.ellipse(0, 0, radius * .28, radius * .22, 0, 0, Math.PI * 2); ctx.fill();
        if (impact.heavy) {
          ctx.strokeStyle = '#ffe6b3'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(0, 0, radius * (.7 + progress), 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  drawHitboxes(battle) {
    const ctx = this.ctx;
    const box = (shape, color) => {
      ctx.fillStyle = color + '20'; ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.fillRect(shape.left, FLOOR - shape.top, shape.right - shape.left, shape.top - shape.bottom);
      ctx.strokeRect(shape.left, FLOOR - shape.top, shape.right - shape.left, shape.top - shape.bottom);
    };
    for (const player of battle.players) {
      for (const shape of hurtboxes(player)) box(shape, '#7fdfff');
      const active = attackBox(player);
      if (active) box(active, '#ff668f');
    }
    for (const projectile of battle.projectiles) {
      const { rx, ry } = projectileShape(projectile);
      ctx.strokeStyle = '#ffdd78'; ctx.beginPath(); ctx.ellipse(projectile.x, FLOOR - projectile.y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    }
    this.text('BODY / BLUE     ACTIVE ATTACK / PINK     PROJECTILE CORE / GOLD', 480, 480, 8, '#e3edf6', 'center');
  }

  drawHud(battle) {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, 135);
    gradient.addColorStop(0, '#17101ff5'); gradient.addColorStop(1, '#17101f00');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, WIDTH, 135);
    ctx.fillStyle = '#181222c7'; ctx.fillRect(0, 489, WIDTH, 51);
    for (const player of battle.players) {
      const i = player.index, color = i ? '#b7dfce' : '#efb6c7';
      const x = i ? 558 : 46, width = 356;
      this.health[i] += (player.hp - this.health[i]) * .10;
      ctx.fillStyle = '#f4e1df'; ctx.fillRect(x - 2, 51, width + 4, 18);
      ctx.fillStyle = '#4f303f'; ctx.fillRect(x, 53, width, 14);
      ctx.fillStyle = '#bf686e';
      ctx.fillRect(i ? x : x + width * (1 - this.health[i] / MAX_HP), 53, width * this.health[i] / MAX_HP, 14);
      ctx.fillStyle = color;
      const hpWidth = width * player.hp / MAX_HP;
      ctx.fillRect(i ? x : x + width - hpWidth, 53, hpWidth, 14);
      const align = i ? 'right' : 'left';
      this.text(`${i ? battle.mode === 'versus' ? 'P2' : 'CPU' : 'P1'}  /  ${player.character.name.toUpperCase()}`, i ? x + width : x, 38, 16, '#fff0ed', align, 'Arial', '700');
      ctx.fillStyle = '#342b3d'; ctx.fillRect(x, 77, width * .6, 3);
      ctx.fillStyle = '#d8bd8c'; ctx.fillRect(x, 77, width * .6 * player.guard / 100, 3);
      this.text('CALCIUM', x, 92, 7, '#b6aab8');
      for (let n = 0; n < 2; n++) {
        ctx.beginPath(); ctx.arc(i ? x + 337 - n * 20 : x + 336 - n * 20, 81, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = battle.wins[i] > n ? color : '#463747'; ctx.fill();
        ctx.strokeStyle = battle.wins[i] > n ? '#fff1e7' : '#907884'; ctx.lineWidth = 1; ctx.stroke();
      }
      // Each player has one Liberty stock and an independently recharging assist.
      const mx = i ? 617 : 46, mw = 297;
      this.text(player.meter >= 100 ? 'LIBERTY ART  /  READY' : 'LIBERTY', mx, 506, 8, player.meter >= 100 ? color : '#b5a4bd');
      this.text(`${Math.floor(player.meter)}%`, mx + mw, 506, 8, color, 'right');
      ctx.fillStyle = '#493348'; ctx.fillRect(mx, 513, mw, 8);
      ctx.fillStyle = color; ctx.fillRect(mx, 513, mw * player.meter / 100, 8);
      if (player.meter >= 100) { ctx.fillStyle = '#fffaed'; ctx.fillRect(mx, 513, mw, 2); }
      const ax = i ? 505 : 364;
      this.text(player.assistId.toUpperCase(), ax, 506, 8, player.assist >= 100 ? '#c7f4db' : '#a499ac');
      ctx.fillStyle = '#3f3447'; ctx.fillRect(ax, 514, 90, 6);
      ctx.fillStyle = player.assist >= 100 ? '#b7dfce' : '#68988e'; ctx.fillRect(ax, 514, 90 * player.assist / 100, 6);
      if (player.combo >= 2 && player.comboTimer > 0) {
        const cx = i ? 895 : 65;
        this.text(String(player.combo).padStart(2, '0'), cx, 183, 47, color, align, 'Georgia', '400');
        this.text('HIT COMBO', cx, 203, 10, '#fff0df', align);
        if (battle.mode === 'training') this.text(`${player.comboDamage} DAMAGE`, cx, 221, 10, '#dac8e4', align);
      }
    }
    ctx.fillStyle = '#201625d9'; ctx.beginPath(); ctx.moveTo(421, 10); ctx.lineTo(539, 10); ctx.lineTo(530, 79); ctx.lineTo(430, 79); ctx.closePath(); ctx.fill();
    this.text(battle.mode === 'training' ? '∞' : String(Math.ceil(battle.timer / 60)).padStart(2, '0'), 480, 62, 47, battle.timer < 600 ? '#ff9fbd' : '#f7ece2', 'center', 'Georgia', '400');
    this.text(battle.mode === 'training' ? 'FREE PRACTICE' : `ROUND ${battle.round}`, 480, 96, 8, '#e0ccd6', 'center');
  }

  drawAnnouncements(battle) {
    const ctx = this.ctx;
    if (battle.phase === 'intro') {
      const fight = battle.phaseTimer <= 28;
      ctx.save(); ctx.shadowColor = '#130a1e'; ctx.shadowBlur = 20;
      this.text(fight ? 'FIGHT' : `ROUND ${battle.round}`, 480, 258, fight ? 76 : 55, fight ? '#ffe7ee' : '#fff0e0', 'center', 'Georgia', '400');
      if (!fight) this.text('MAKE EVERY MOVE COUNT.', 480, 286, 10, '#eee0dc', 'center');
      ctx.restore();
    }
    if (battle.phase === 'roundover') {
      ctx.fillStyle = '#160c252a'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
      const text = battle.winner < 0 ? 'DRAW' : battle.timer <= 0 ? 'TIME’S UP' : 'K.O.';
      ctx.save(); ctx.shadowColor = '#11081f'; ctx.shadowBlur = 18;
      this.text(text, 480, 258, 84, '#ffe2eb', 'center', 'Georgia', '400');
      this.text(battle.winner < 0 ? 'GO AGAIN.' : `${battle.players[battle.winner].character.name.toUpperCase()} TAKES THE ROUND`, 480, 292, 12, '#fff3e5', 'center'); ctx.restore();
    }
    for (const notice of this.notices) {
      ctx.globalAlpha = Math.min(1, notice.life / 12);
      this.text(notice.text, notice.player ? 890 : 70, notice.type === 'super' ? 140 : 252, notice.type === 'super' ? 23 : 11, notice.type === 'guardbreak' ? '#ffb3a6' : '#e6e2ff', notice.player ? 'right' : 'left', notice.type === 'super' ? 'Georgia' : 'Arial', '500');
    }
    ctx.globalAlpha = 1;
  }
}
