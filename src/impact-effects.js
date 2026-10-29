// Visual effects advance on the game's fixed 60 Hz clock, never on paint count.
export class ImpactEffects {
  constructor({ random = Math.random, reducedMotion = false } = {}) {
    this.random = random;
    this.reducedMotion = reducedMotion;
    this.impacts = [];
    this.particles = [];
  }
  add(event) {
    const blocked = event.type === 'block';
    const life = blocked ? 12 : event.heavy ? 18 : 14;
    this.impacts.push({ ...event, age: 0, life, size: blocked ? 25 : event.heavy ? 48 : 33, angle: (this.random() - .5) * .7 });
    const count = this.reducedMotion ? 4 : blocked ? 7 : event.heavy ? 19 : 12;
    for (let i = 0; i < count; i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = this.reducedMotion ? .6 : 2 + this.random() * (event.heavy ? 9 : 6);
      this.particles.push({ x: event.x, y: event.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        age: 0, life: 14 + Math.floor(this.random() * 8), color: blocked ? '#9be7ff' : i % 3 ? '#ffe4a4' : event.color });
    }
    this.impacts = this.impacts.slice(-16);
    this.particles = this.particles.slice(-256);
  }
  update() {
    for (const impact of this.impacts) impact.age++;
    for (const particle of this.particles) {
      particle.x += particle.vx; particle.y += particle.vy;
      particle.vx *= .91; particle.vy = particle.vy * .91 - .18;
      particle.age++;
    }
    this.impacts = this.impacts.filter(impact => impact.age < impact.life);
    this.particles = this.particles.filter(particle => particle.age < particle.life);
  }
  clear() { this.impacts = []; this.particles = []; }
}
