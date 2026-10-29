import { createSpriteClip, inspectSpriteFrame, advanceSpriteClock, SPRITE_ANIMATION_NAMES } from './sprite-data.js';

export class SpriteInspector {
  constructor({ dialog, manifest, assets }) {
    this.dialog = dialog; this.manifest = manifest; this.assets = assets;
    this.el = id => document.getElementById('sprite-' + id);
    this.canvas = this.el('canvas'); this.ctx = this.canvas.getContext('2d');
    this.index = 0; this.carry = 0; this.playing = false; this.token = 0; this.raf = 0;
    this.el('fighter').replaceChildren(...manifest.characters.map(character => new Option(`${character.name} ${character.surname}`.trim(), character.id)));
    this.el('fighter').addEventListener('change', () => { this.fillAnimations(); this.load(); });
    for (const id of ['animation', 'mode']) this.el(id).addEventListener('change', () => this.load());
    for (const id of ['boxes', 'onion', 'flip', 'zoom']) this.el(id).addEventListener('change', () => this.render());
    this.el('speed').addEventListener('change', () => { this.lastTime = performance.now(); });
    this.el('play').addEventListener('click', () => this.setPlaying(!this.playing));
    this.el('previous').addEventListener('click', () => this.step(-1));
    this.el('next').addEventListener('click', () => this.step(1));
    this.el('scrub').addEventListener('input', () => this.seek(Number(this.el('scrub').value)));
    this.el('timeline').addEventListener('click', event => {
      const button = event.target.closest('[data-sprite-frame]');
      if (button) this.seek(Number(button.dataset.spriteFrame));
    });
    this.canvas.addEventListener('keydown', event => {
      if (!this.clip || this.loading) return;
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Space'].includes(event.code)) event.preventDefault();
      if (event.code === 'ArrowLeft') this.step(-1);
      if (event.code === 'ArrowRight') this.step(1);
      if (event.code === 'Home') this.seek(0);
      if (event.code === 'End') this.seek(this.clip.steps.length - 1);
      if (event.code === 'Space' && !event.repeat) this.setPlaying(!this.playing);
    });
    this.el('json').addEventListener('click', () => {
      if (!this.data || this.loading) return;
      this.save(new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' }), 'json');
    });
    this.el('png').addEventListener('click', () => this.savePng());
    dialog.addEventListener('close', () => { this.token++; this.setPlaying(false); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.setPlaying(false); });
    this.fillAnimations();
  }

  character() { return this.manifest.characters.find(character => character.id === Number(this.el('fighter').value)); }

  fillAnimations() {
    const previous = this.el('animation').value;
    this.el('animation').replaceChildren(...Object.keys(SPRITE_ANIMATION_NAMES).filter(name => this.character().animations[name]?.length)
      .map(name => new Option(SPRITE_ANIMATION_NAMES[name], name)));
    if (this.character().animations[previous]) this.el('animation').value = previous;
  }

  open(characterId) {
    this.el('fighter').value = String(characterId);
    this.fillAnimations();
    this.load();
  }

  async load() {
    const token = ++this.token;
    this.setPlaying(false); this.loading = true;
    this.el('status').textContent = 'Loading sprites…';
    this.canvas.dataset.ready = 'false';
    for (const id of ['play', 'previous', 'next', 'scrub', 'json', 'png']) this.el(id).disabled = true;
    this.el('timeline').replaceChildren();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    try {
      const character = this.character(), animation = this.el('animation').value;
      this.clip = createSpriteClip(character, animation, this.el('mode').value);
      this.el('mode').value = this.clip.mode;
      this.el('mode').querySelector('[value="combat"]').disabled = !this.clip.move;
      await this.assets.load([character.atlas]);
      if (token !== this.token || !this.dialog.open) return;
      this.index = 0; this.carry = 0; this.loading = false;
      this.el('scrub').max = String(this.clip.steps.length - 1);
      this.buildTimeline();
      for (const id of ['play', 'previous', 'next', 'scrub', 'json', 'png']) this.el(id).disabled = false;
      this.el('status').textContent = `${character.name} · ${SPRITE_ANIMATION_NAMES[animation]} · ${this.clip.steps.length} ${this.clip.mode === 'combat' ? 'game frames' : 'sprite frames'}`;
      this.render();
    } catch (error) {
      if (token !== this.token || !this.dialog.open) return;
      this.el('status').textContent = `Could not load these sprites: ${error.message}. Choose another fighter to try again.`;
      this.loading = true;
    }
  }

  buildTimeline() {
    this.el('timeline').replaceChildren(...this.clip.steps.map((step, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.spriteFrame = String(index); button.dataset.phase = step.phase;
      button.setAttribute('aria-label', `${this.clip.mode === 'combat' ? 'Game' : 'Sprite'} frame ${index + 1}, sprite ${step.frame.id}, ${step.phase}`);
      const number = document.createElement('b'); number.textContent = String(index + 1).padStart(2, '0');
      const duration = document.createElement('span'); duration.textContent = this.clip.mode === 'combat' ? step.phase === 'ready' ? '✓' : step.phase[0].toUpperCase() : `${step.duration}f`;
      button.append(number, duration); return button;
    }));
  }

  setPlaying(value) {
    cancelAnimationFrame(this.raf);
    this.playing = !!value && !!this.clip && !this.loading && this.dialog.open;
    this.el('play').textContent = this.playing ? 'Pause' : 'Play';
    this.el('play').setAttribute('aria-pressed', String(this.playing));
    if (this.playing) { this.lastTime = performance.now(); this.raf = requestAnimationFrame(time => this.tick(time)); }
  }

  tick(time) {
    if (!this.playing || !this.dialog.open) return;
    const ticks = Math.min(250, time - this.lastTime) / (1000 / 60) * Number(this.el('speed').value);
    this.lastTime = time;
    const next = advanceSpriteClock(this.clip, this.index, this.carry, ticks);
    this.carry = next.carry;
    if (next.index !== this.index) { this.index = next.index; this.render(); }
    this.raf = requestAnimationFrame(nextTime => this.tick(nextTime));
  }

  seek(index) {
    if (!this.clip || this.loading) return;
    this.setPlaying(false); this.index = index; this.carry = 0; this.render();
    const selected = this.el('timeline').children[this.index];
    const timeline = this.el('timeline');
    if (selected.offsetLeft < timeline.scrollLeft || selected.offsetLeft + selected.offsetWidth > timeline.scrollLeft + timeline.clientWidth) timeline.scrollLeft = selected.offsetLeft - timeline.clientWidth / 2;
  }

  step(direction) {
    if (!this.clip || this.loading) return;
    this.seek((this.index + direction + this.clip.steps.length) % this.clip.steps.length);
  }

  render() {
    if (!this.clip || this.loading || !this.dialog.open) return;
    const clip = this.clip, ctx = this.ctx;
    const data = inspectSpriteFrame(clip, this.index, this.el('flip').checked ? -1 : 1);
    this.data = data;
    this.canvas.dataset.ready = 'true'; this.canvas.dataset.spriteId = String(data.spriteId); this.canvas.dataset.phase = data.phase;
    this.el('scrub').value = String(this.index);
    this.el('position').textContent = `${String(this.index + 1).padStart(2, '0')} / ${String(clip.steps.length).padStart(2, '0')}`;
    this.el('phase').textContent = data.phase === 'sprite' ? 'Sprite sequence' : data.phase;
    this.el('phase').dataset.phase = data.phase;
    for (const [index, button] of [...this.el('timeline').children].entries()) button.setAttribute('aria-pressed', String(index === this.index));
    const selected = this.el('timeline').children[this.index], timeline = this.el('timeline');
    if (this.playing && (selected.offsetLeft < timeline.scrollLeft || selected.offsetLeft + selected.offsetWidth > timeline.scrollLeft + timeline.clientWidth)) timeline.scrollLeft = selected.offsetLeft - timeline.clientWidth / 2;
    this.updateData(data);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const origin = { x: this.canvas.width / 2, y: this.canvas.height - 42 };
    // Fit the complete sequence, rather than resizing every frame as limbs move.
    const frames = clip.steps.map(step => {
      const rect = clip.character.rects[step.frame.id];
      return { width: rect[2], height: rect[3], anchor: clip.character.anchors[step.frame.id] };
    });
    const extent = Math.max(...frames.flatMap(frame => [frame.anchor, frame.width - frame.anchor]));
    const fit = Math.min((this.canvas.width / 2 - 24) / (extent * data.scale), (origin.y - 22) / (Math.max(...frames.map(frame => frame.height)) * data.scale));
    const zoom = fit * Number(this.el('zoom').value);
    ctx.save(); ctx.translate(origin.x, origin.y); ctx.scale(zoom, zoom); ctx.imageSmoothingEnabled = false;
    const drawSprite = (frameData, alpha = 1) => {
      const rect = frameData.atlas;
      ctx.save(); ctx.globalAlpha = alpha; ctx.scale(data.facing, 1);
      ctx.drawImage(this.assets.image(clip.character.atlas), rect.x, rect.y, rect.width, rect.height,
        -frameData.anchor.x * data.scale, -rect.height * data.scale, rect.width * data.scale, rect.height * data.scale);
      ctx.restore();
    };
    if (this.el('onion').checked && this.index > 0) drawSprite(inspectSpriteFrame(clip, this.index - 1), .22);
    drawSprite(data);
    if (this.el('boxes').checked) {
      const drawBox = (box, color) => {
        ctx.fillStyle = color + '18'; ctx.strokeStyle = color; ctx.lineWidth = 1 / zoom;
        ctx.fillRect(box.left, -box.top, box.right - box.left, box.top - box.bottom);
        ctx.strokeRect(box.left, -box.top, box.right - box.left, box.top - box.bottom);
      };
      for (const box of data.bodyBoxes) drawBox(box, '#7fdfff');
      if (data.attackBox) drawBox(data.attackBox, '#ff668f');
    }
    ctx.restore();
    ctx.strokeStyle = '#baacc060'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(20, origin.y + .5); ctx.lineTo(this.canvas.width - 20, origin.y + .5); ctx.stroke();
    ctx.strokeStyle = '#e6c18d'; ctx.beginPath(); ctx.moveTo(origin.x - 6, origin.y); ctx.lineTo(origin.x + 6, origin.y); ctx.moveTo(origin.x, origin.y - 6); ctx.lineTo(origin.x, origin.y + 6); ctx.stroke();
    ctx.font = '11px monospace'; ctx.fillStyle = '#b5a8bc'; ctx.fillText(`FEET ORIGIN  0, 0     ${Math.round(zoom * data.scale * 100)}% SOURCE SIZE`, 20, this.canvas.height - 15);
  }

  updateData(data) {
    const number = value => Number(value.toFixed(2));
    this.el('id').textContent = `#${data.spriteId}`;
    this.el('source-position').textContent = data.sourceFrameIndex < 0 ? 'Neutral / ready' : `${data.sourceFrameIndex + 1} / ${this.clip.sequence.length}`;
    this.el('duration').textContent = `${data.sourceDurationTicks}f · ${number(data.sourceDurationTicks * 1000 / 60)} ms`;
    this.el('size').textContent = `${data.atlas.width} × ${data.atlas.height} px`;
    this.el('crop').textContent = `${data.atlas.x}, ${data.atlas.y}`;
    this.el('anchor').textContent = `${number(data.anchor.x)}, ${data.anchor.y}`;
    this.el('offset').textContent = `${data.sourceOffset.x}, ${data.sourceOffset.y}`;
    this.el('atlas').textContent = data.atlas.file;
    for (const [id, key] of [['walk-speed', 'walkSpeed'], ['run-speed', 'runMax'], ['air-speed', 'airDashSpeed'], ['jump-speed', 'jumpSpeed'], ['gravity', 'gravity'], ['weight', 'weight']]) this.el(id).textContent = String(number(data.movement[key]));
    this.el('move-data').hidden = !data.move;
    this.el('no-move').hidden = !!data.move;
    if (data.move) {
      for (const key of ['startup', 'active', 'recovery']) this.el(key).textContent = `${data.move[key]}f`;
      this.el('damage').textContent = String(data.move.damage);
      this.el('move-note').textContent = data.move.ranged ? 'Projectile launches on the first active frame. Individual projectile damage may differ from base damage.' :
        `${data.move.aerial ? 'Aerial' : data.move.low ? 'Low' : 'Standing'} attack · first active game frame: ${data.move.startup}.`;
    }
    this.el('coordinates').textContent = JSON.stringify({ units: 'game units, y upward from feet', body: data.bodyBoxes, attack: data.attackBox }, null, 2);
  }

  save(blob, extension, data = this.data) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `${data.fighter}-${data.animation}-${data.spriteId}.${extension}`;
    this.dialog.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  savePng() {
    if (!this.data || this.loading) return;
    const data = this.data, { atlas } = data, canvas = document.createElement('canvas'); canvas.width = atlas.width; canvas.height = atlas.height;
    canvas.getContext('2d').drawImage(this.assets.image(this.clip.character.atlas), atlas.x, atlas.y, atlas.width, atlas.height, 0, 0, atlas.width, atlas.height);
    canvas.toBlob(blob => { if (blob) this.save(blob, 'png', data); }, 'image/png');
  }
}
