// ============================================================
//  ALIEN COMING SOON — main.js
// ============================================================

// ── CONFIG ───────────────────────────────────────────────────
const TARGET_DATE = new Date('2027-06-15T00:00:00');

const STAR_COUNT   = 300;
const METEOR_RATE  = 0.0025; // probability per frame
const UFO_RATE     = 0.0008; // probability per frame (max 2 UFOs)
const MAX_UFOS     = 2;

// ── UTILITY ──────────────────────────────────────────────────
const rand  = (min, max) => Math.random() * (max - min) + min;
const randI = (min, max) => Math.floor(rand(min, max));
const lerp  = (a, b, t)  => a + (b - a) * t;

// ── STARFIELD RENDERER ───────────────────────────────────────
class Renderer {
  constructor() {
    this.canvas  = document.getElementById('canvas');
    this.ctx     = this.canvas.getContext('2d');
    this.W       = 0;
    this.H       = 0;
    this.mouse   = { x: 0, y: 0, tx: 0, ty: 0 };
    this.time    = 0;

    this.stars    = [];
    this.meteors  = [];
    this.ufos     = [];
    this.particles = [];
    this.ufoEnabled = true;

    this._rafId = null;
    this._resizeHandler = () => this._onResize();
    this._mousemoveHandler = (e) => {
      this.mouse.tx = e.clientX;
      this.mouse.ty = e.clientY;
    };

    this._setup();
  }

  _setup() {
    window.addEventListener('resize', this._resizeHandler);
    window.addEventListener('mousemove', this._mousemoveHandler);
    this._onResize();
  }

  _onResize() {
    this.W = this.canvas.width  = window.innerWidth;
    this.H = this.canvas.height = window.innerHeight;
    this._initStars();
  }

  // ── STARS ──────────────────────────────────────────────────
  _initStars() {
    this.stars = Array.from({ length: STAR_COUNT }, () => this._mkStar(true));
  }

  _mkStar(randomX = false) {
    const layer = randI(0, 3); // 0=far 1=mid 2=near
    return {
      x: randomX ? rand(0, this.W) : rand(-5, 5) + this.W,
      y: rand(0, this.H),
      size: rand(0.3, layer === 2 ? 2.8 : 1.5),
      layer,
      speed: rand(0.05, 0.2) * (layer + 1),
      twinkleOffset: rand(0, Math.PI * 2),
      twinkleSpeed:  rand(0.008, 0.025),
      brightness:    rand(0.5, 1),
      // occasional coloured stars
      color: Math.random() < 0.08 ? '#a0cfff'
           : Math.random() < 0.06 ? '#ffd898'
           : '#ffffff',
    };
  }

  _drawStar(star) {
    const { ctx, W, H, mouse, time } = this;
    const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset) * 0.4 + 0.6;
    const alpha   = star.brightness * twinkle;

    // subtle parallax offset based on mouse
    const px = (mouse.x - W / 2) * star.layer * 0.0015;
    const py = (mouse.y - H / 2) * star.layer * 0.0015;
    const sx = star.x + px;
    const sy = star.y + py;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (star.size > 1.6) {
      // soft glow halo
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, star.size * 4);
      g.addColorStop(0, star.color);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, star.size * 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = star.color;
    ctx.beginPath();
    ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── METEORS ────────────────────────────────────────────────
  _mkMeteor() {
    const angle = rand(30, 55) * (Math.PI / 180);
    const speed = rand(6, 14);
    return {
      x:     rand(0, this.W * 0.7),
      y:     rand(-50, -10),
      vx:    Math.cos(angle) * speed,
      vy:    Math.sin(angle) * speed,
      len:   rand(80, 200),
      alpha: 1,
      fade:  rand(0.012, 0.022),
      w:     rand(0.5, 2),
    };
  }

  _drawMeteor(m) {
    const { ctx } = this;
    const angle = Math.atan2(m.vy, m.vx);
    const ex = m.x - Math.cos(angle) * m.len;
    const ey = m.y - Math.sin(angle) * m.len;

    const g = ctx.createLinearGradient(ex, ey, m.x, m.y);
    g.addColorStop(0, 'transparent');
    g.addColorStop(1, `rgba(200, 220, 255, ${m.alpha})`);

    ctx.save();
    ctx.globalAlpha = m.alpha;
    ctx.strokeStyle = g;
    ctx.lineWidth   = m.w;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(m.x, m.y);
    ctx.stroke();
    ctx.restore();
  }

  // ── UFO ────────────────────────────────────────────────────
  _mkUFO() {
    const fromLeft = Math.random() < 0.5;
    const startX   = fromLeft ? -160 : this.W + 160;
    const targetX  = rand(this.W * 0.2, this.W * 0.8);
    const targetY  = rand(this.H * 0.05, this.H * 0.42);
    return {
      x: startX,
      y: rand(targetY - 40, targetY + 40),
      targetX,
      targetY,
      vx: fromLeft ? rand(0.3, 0.7) : -rand(0.3, 0.7),
      wobble: rand(0, Math.PI * 2),
      wobbleSpeed: rand(0.012, 0.025),
      wobbleAmp:   rand(8, 18),
      beamPulse: 0,
      scale: rand(0.75, 1.1),
      state: 'enter',    // enter → hover → exit
      hoverTimer: 0,
      hoverDuration: randI(180, 400),
      particleTimer: 0,
      exitVX: fromLeft ? rand(1.5, 3) : -rand(1.5, 3),
    };
  }

  _drawUFO(ufo) {
    const { ctx, time } = this;
    const x = ufo.x;
    const y = ufo.y + Math.sin(ufo.wobble) * ufo.wobbleAmp;
    const s = ufo.scale;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);

    // — Tractor beam —
    const beamH   = 160 + Math.sin(ufo.beamPulse * 0.8) * 25;
    const beamAlpha = 0.035 + Math.sin(ufo.beamPulse) * 0.015;
    const bg = ctx.createLinearGradient(0, 18, 0, beamH + 18);
    bg.addColorStop(0, `rgba(0, 229, 255, ${beamAlpha * 5})`);
    bg.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.moveTo(-18, 18);
    ctx.lineTo(18, 18);
    ctx.lineTo(55, beamH + 18);
    ctx.lineTo(-55, beamH + 18);
    ctx.closePath();
    ctx.fillStyle = bg;
    ctx.fill();

    // — Glow halo —
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 90);
    halo.addColorStop(0, 'rgba(0, 229, 255, 0.12)');
    halo.addColorStop(1, 'transparent');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(0, 0, 90, 35, 0, 0, Math.PI * 2);
    ctx.fill();

    // — Disk body —
    const disk = ctx.createLinearGradient(0, -18, 0, 18);
    disk.addColorStop(0, '#1a4555');
    disk.addColorStop(0.5, '#0a2030');
    disk.addColorStop(1, '#061520');
    ctx.beginPath();
    ctx.ellipse(0, 6, 62, 16, 0, 0, Math.PI * 2);
    ctx.fillStyle = disk;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // — Dome —
    const dome = ctx.createRadialGradient(-8, -18, 2, 0, -14, 28);
    dome.addColorStop(0, 'rgba(160, 230, 255, 0.85)');
    dome.addColorStop(0.45, 'rgba(0, 100, 160, 0.6)');
    dome.addColorStop(1, 'rgba(0, 20, 50, 0.35)');
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 20, 0, Math.PI, 0);
    ctx.fillStyle = dome;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // — Alien silhouette in dome —
    ctx.fillStyle = 'rgba(80, 180, 80, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, -13, 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // eyes
    ctx.fillStyle = 'rgba(0, 255, 80, 0.85)';
    ctx.beginPath();
    ctx.ellipse(-4, -15, 3.5, 2.2, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(4, -15, 3.5, 2.2, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // — Rotating coloured lights —
    const numL = 8;
    for (let i = 0; i < numL; i++) {
      const a   = (i / numL) * Math.PI * 2 + time * 0.0008;
      const lx  = Math.cos(a) * 48;
      const ly  = Math.sin(a) * 11 + 6;
      const hue = (i * 45 + time * 0.04) % 360;

      // light disc
      ctx.beginPath();
      ctx.arc(lx, ly, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue}, 100%, 70%)`;
      ctx.fill();

      // mini glow
      const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, 9);
      lg.addColorStop(0, `hsla(${hue}, 100%, 70%, 0.55)`);
      lg.addColorStop(1, 'transparent');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(lx, ly, 9, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // ── PARTICLES ─────────────────────────────────────────────
  _mkParticle(x, y) {
    const angle = rand(0, Math.PI * 2);
    const spd   = rand(0.4, 2.5);
    return {
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - rand(0.5, 1.5),
      alpha: rand(0.6, 1),
      size:  rand(1, 3.5),
      color: Math.random() < 0.5 ? '#00ff41' : '#00e5ff',
      fade:  rand(0.01, 0.022),
    };
  }

  _drawParticle(p) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.shadowBlur  = 8;
    ctx.shadowColor = p.color;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── NEBULA ────────────────────────────────────────────────
  _drawNebula() {
    const { ctx, W, H } = this;
    const clouds = [
      { x: W * 0.12, y: H * 0.25, r: 220, c: '50, 0, 110' },
      { x: W * 0.88, y: H * 0.72, r: 190, c: '0, 55, 120' },
      { x: W * 0.50, y: H * 0.10, r: 160, c: '0, 90, 55'  },
      { x: W * 0.30, y: H * 0.85, r: 140, c: '80, 0, 100' },
    ];
    clouds.forEach(n => {
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      g.addColorStop(0, `rgba(${n.c}, 0.045)`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ── UPDATE ────────────────────────────────────────────────
  _update(dt) {
    const { W, H } = this;
    this.time += dt;

    // smooth mouse
    this.mouse.x = lerp(this.mouse.x, this.mouse.tx, 0.06);
    this.mouse.y = lerp(this.mouse.y, this.mouse.ty, 0.06);

    // meteors
    if (Math.random() < METEOR_RATE) {
      this.meteors.push(this._mkMeteor());
    }
    this.meteors = this.meteors.filter(m => {
      m.x     += m.vx;
      m.y     += m.vy;
      m.alpha -= m.fade;
      return m.alpha > 0 && m.x < W + 250 && m.y < H + 250;
    });

    // UFOs
    if (this.ufoEnabled && this.ufos.length < MAX_UFOS && Math.random() < UFO_RATE) {
      this.ufos.push(this._mkUFO());
    }
    this.ufos = this.ufos.filter(ufo => {
      ufo.wobble    += ufo.wobbleSpeed;
      ufo.beamPulse += 0.04;

      if (ufo.state === 'enter') {
        const dx = ufo.targetX - ufo.x;
        const dy = ufo.targetY - ufo.y;
        ufo.x += dx * 0.015;
        ufo.y += dy * 0.015;
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) ufo.state = 'hover';
      } else if (ufo.state === 'hover') {
        ufo.hoverTimer++;
        // emit beam particles
        ufo.particleTimer++;
        if (ufo.particleTimer >= 4) {
          ufo.particleTimer = 0;
          const beamX = ufo.x + rand(-40, 40);
          const beamY = ufo.y + 22 + Math.sin(ufo.wobble) * ufo.wobbleAmp;
          this.particles.push(this._mkParticle(beamX, beamY));
        }
        if (ufo.hoverTimer >= ufo.hoverDuration) ufo.state = 'exit';
      } else {
        ufo.x += ufo.exitVX * 1.8;
        ufo.y -= 1.2;
      }
      return ufo.x > -300 && ufo.x < W + 300 && ufo.y > -200;
    });

    // particles
    this.particles = this.particles.filter(p => {
      p.x     += p.vx;
      p.y     += p.vy;
      p.vy    += 0.04;   // mild gravity
      p.alpha -= p.fade;
      p.size  *= 0.985;
      return p.alpha > 0.02;
    });
  }

  // ── RENDER ────────────────────────────────────────────────
  _render() {
    const { ctx, W, H, time } = this;

    ctx.clearRect(0, 0, W, H);

    // deep-space gradient background
    const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) * 0.7);
    bg.addColorStop(0, '#000d20');
    bg.addColorStop(0.5, '#000710');
    bg.addColorStop(1, '#000005');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    this._drawNebula();
    this.stars.forEach(s   => this._drawStar(s));
    this.meteors.forEach(m  => this._drawMeteor(m));

    if (this.ufoEnabled) {
      this.ufos.forEach(u => this._drawUFO(u));
    }
    this.particles.forEach(p => this._drawParticle(p));
  }

  // ── LOOP ──────────────────────────────────────────────────
  start() {
    let last = 0;
    const loop = (ts) => {
      const dt = ts - last;
      last = ts;
      this._update(dt);
      this._render();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  setUFOEnabled(enabled) {
    this.ufoEnabled = enabled;
    if (!enabled) {
      this.ufos      = [];
      this.particles = [];
    }
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    window.removeEventListener('resize', this._resizeHandler);
    window.removeEventListener('mousemove', this._mousemoveHandler);
  }
}

// ── COUNTDOWN ────────────────────────────────────────────────
class CountdownTimer {
  constructor(target) {
    this.target  = target;
    this.els     = {
      days:    document.getElementById('days'),
      hours:   document.getElementById('hours'),
      minutes: document.getElementById('minutes'),
      seconds: document.getElementById('seconds'),
    };
    this._prevValues = {};
    this._tick();
    this._interval = setInterval(() => this._tick(), 1000);
  }

  _pad(n, len = 2) {
    return String(Math.max(0, n)).padStart(len, '0');
  }

  _tick() {
    const diff = this.target - Date.now();

    if (diff <= 0) {
      // We have arrived!
      Object.values(this.els).forEach(el => {
        el.textContent = el.id === 'days' ? '000' : '00';
        el.closest('.count-wrapper').parentElement.closest('.countdown')
          ?.classList.add('arrived');
      });
      clearInterval(this._interval);
      return;
    }

    const totalSec = Math.floor(diff / 1000);
    const days    = Math.floor(totalSec / 86400);
    const hours   = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    const values = {
      days:    this._pad(days, 3),
      hours:   this._pad(hours),
      minutes: this._pad(minutes),
      seconds: this._pad(seconds),
    };

    for (const [key, val] of Object.entries(values)) {
      if (val !== this._prevValues[key]) {
        const el = this.els[key];
        el.textContent = val;
        // flash animation
        el.classList.remove('tick');
        // force reflow
        void el.offsetWidth;
        el.classList.add('tick');
        this._prevValues[key] = val;
      }
    }
  }
}

// ── AUDIO SYSTEM ─────────────────────────────────────────────
class AudioSystem {
  constructor() {
    this._ctx      = null;
    this._nodes    = [];
    this.enabled   = false;
    this._beepTimer = null;
  }

  _init() {
    if (this._ctx) return;
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  _masterGain() {
    const g = this._ctx.createGain();
    g.gain.setValueAtTime(0.9, this._ctx.currentTime);
    g.connect(this._ctx.destination);
    this._nodes.push(g);
    return g;
  }

  _addDrone(master) {
    const now = this._ctx.currentTime;
    const osc    = this._ctx.createOscillator();
    const gain   = this._ctx.createGain();
    const filter = this._ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(38, now);
    osc.frequency.linearRampToValueAtTime(42, now + 10);
    osc.frequency.linearRampToValueAtTime(36, now + 22);

    filter.type      = 'lowpass';
    filter.frequency.setValueAtTime(180, now);
    filter.Q.setValueAtTime(0.8, now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.07, now + 2.5);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(now);

    this._nodes.push(osc, gain, filter);
  }

  _addPad(master) {
    const now   = this._ctx.currentTime;
    const freqs = [55, 82.5, 110, 165, 220];
    freqs.forEach((freq, i) => {
      const osc    = this._ctx.createOscillator();
      const gain   = this._ctx.createGain();
      const filter = this._ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      filter.type      = 'bandpass';
      filter.frequency.setValueAtTime(freq, now);
      filter.Q.setValueAtTime(4, now);

      const vol = Math.max(0.001, 0.025 - i * 0.004);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(vol, now + 2 + i * 0.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start(now);
      this._nodes.push(osc, gain, filter);
    });
  }

  _scheduleBeeps(master) {
    if (!this.enabled) return;
    const now   = this._ctx.currentTime;
    const delay = rand(1.5, 7);
    const freqChoices = [440, 660, 880, 1320, 220, 550];
    const freq  = freqChoices[randI(0, freqChoices.length)];

    const osc  = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type   = 'square';
    osc.frequency.setValueAtTime(freq, now + delay);

    gain.gain.setValueAtTime(0, now + delay);
    gain.gain.linearRampToValueAtTime(0.025, now + delay + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.25);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now + delay);
    osc.stop(now + delay + 0.3);

    this._beepTimer = setTimeout(() => this._scheduleBeeps(master), (delay + 0.5) * 1000);
  }

  enable() {
    this._init();
    this.enabled = true;
    const master = this._masterGain();
    this._addDrone(master);
    this._addPad(master);
    this._scheduleBeeps(master);
  }

  disable() {
    this.enabled = false;
    clearTimeout(this._beepTimer);
    this._nodes.forEach(n => {
      try { if (n.stop) n.stop(); n.disconnect(); } catch (_) {}
    });
    this._nodes = [];
    if (this._ctx) {
      this._ctx.close().catch(() => {});
      this._ctx = null;
    }
  }

  toggle() {
    if (this.enabled) {
      this.disable();
      return false;
    } else {
      this.enable();
      return true;
    }
  }
}

// ── EMAIL FORM ───────────────────────────────────────────────
class EmailForm {
  constructor() {
    this._form    = document.getElementById('signup-form');
    this._input   = document.getElementById('email-input');
    this._msg     = document.getElementById('form-message');
    this._btn     = this._form.querySelector('.submit-btn');
    this._seen    = new Set();
    this._form.addEventListener('submit', e => { e.preventDefault(); this._submit(); });
  }

  _validate(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  _showMsg(text, type) {
    this._msg.className = `form-message ${type}`;
    this._msg.textContent = '';
    // typewriter effect
    let i = 0;
    const fn = () => {
      if (i < text.length) {
        this._msg.textContent += text[i++];
        setTimeout(fn, 28);
      }
    };
    fn();
  }

  _submit() {
    const email = this._input.value.trim().toLowerCase();

    if (!email) {
      this._showMsg('> ERROR: EMAIL ADDRESS REQUIRED', 'error');
      return;
    }
    if (!this._validate(email)) {
      this._showMsg('> ERROR: INVALID TRANSMISSION COORDINATES', 'error');
      return;
    }
    if (this._seen.has(email)) {
      this._showMsg('> STATUS: COORDINATES ALREADY ON FILE', 'error');
      return;
    }

    this._btn.classList.add('loading');
    this._btn.querySelector('.btn-text').textContent = 'SENDING...';

    // Simulate async submission (replace with real API call as needed)
    setTimeout(() => {
      this._seen.add(email);
      this._input.value = '';
      this._btn.classList.remove('loading');
      this._btn.querySelector('.btn-text').textContent = 'TRANSMIT';
      this._showMsg('> TRANSMISSION RECEIVED. SIGNAL LOCKED. WE WILL FIND YOU.', 'success');
    }, 900);
  }
}

// ── BOOTSTRAP ────────────────────────────────────────────────
function init() {
  // Starfield
  const renderer = new Renderer();
  renderer.start();

  // Countdown
  new CountdownTimer(TARGET_DATE);

  // Audio
  const audio = new AudioSystem();

  // Email form
  new EmailForm();

  // Audio toggle
  const audioBtn   = document.getElementById('audio-toggle');
  const audioLabel = document.getElementById('audio-label');
  const audioIcon  = document.getElementById('audio-icon');
  audioBtn.addEventListener('click', () => {
    const on = audio.toggle();
    audioBtn.classList.toggle('active', on);
    audioBtn.setAttribute('aria-pressed', String(on));
    audioLabel.textContent = on ? 'AUDIO ACTIVE' : 'ENABLE AUDIO';
    audioIcon.textContent  = on ? '\u25C9' : '\u25CB';
  });

  // UFO toggle
  const ufoBtn   = document.getElementById('ufo-toggle');
  const ufoLabel = document.getElementById('ufo-label');
  let ufoOn = true;
  ufoBtn.addEventListener('click', () => {
    ufoOn = !ufoOn;
    renderer.setUFOEnabled(ufoOn);
    ufoBtn.classList.toggle('active', ufoOn);
    ufoBtn.setAttribute('aria-pressed', String(ufoOn));
    ufoLabel.textContent = ufoOn ? 'UFO ACTIVE' : 'UFO INACTIVE';
  });

  // Seed mouse to center so parallax starts neutral
  renderer.mouse.x  = renderer.mouse.tx = window.innerWidth  / 2;
  renderer.mouse.y  = renderer.mouse.ty = window.innerHeight / 2;
}

// Wait for DOM + fonts
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
