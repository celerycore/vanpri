export class Sound {
  constructor() {
    try { this.muted = localStorage.getItem('vp-muted') === 'true'; } catch { this.muted = false; }
    this.music = null;
    this.context = null;
    this.suspended = false;
    this.contextUnavailable = false;
  }
  unlock() {
    if (!this.context && !this.contextUnavailable) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) this.context = new AudioContext();
      } catch { this.contextUnavailable = true; }
    }
    if (this.context?.state === 'suspended') this.context.resume().catch(() => {});
  }
  toggle() {
    this.muted = !this.muted;
    try { localStorage.setItem('vp-muted', String(this.muted)); } catch { /* Storage is optional. */ }
    if (this.music) this.music.muted = this.muted;
    return this.muted;
  }
  playMusic(stage) {
    this.stop();
    this.music = new Audio(assetUrl(`music-${stage}.ogg`));
    this.music.loop = true;
    this.music.volume = .28;
    this.music.muted = this.muted;
    this.music.play().catch(() => {});
  }
  stop() { if (this.music) { this.music.pause(); this.music = null; } }
  pause(paused) {
    this.suspended = paused;
    if (!this.music) return;
    if (paused) this.music.pause(); else this.music.play().catch(() => {});
  }
  clip(name) {
    if (this.muted) return;
    const clip = new Audio(assetUrl(`sfx-${name}.ogg`));
    clip.volume = .28;
    clip.play().catch(() => {});
  }
  tone(type, heavy = false) {
    if (this.muted || !this.context || this.suspended) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.type = type === 'hit' ? 'sawtooth' : type === 'block' ? 'triangle' : 'sine';
    const pitch = type === 'hit' ? heavy ? 130 : 210 : type === 'block' ? 700 : 340;
    oscillator.frequency.setValueAtTime(pitch, now);
    oscillator.frequency.exponentialRampToValueAtTime(type === 'swing' ? 110 : 45, now + .09);
    gain.gain.setValueAtTime(type === 'swing' ? .015 : .065, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + (heavy ? .17 : .09));
    oscillator.start(now); oscillator.stop(now + .19);
  }
}
import { assetUrl } from './asset-url.js';
