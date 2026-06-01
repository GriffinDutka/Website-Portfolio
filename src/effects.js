// ── EFFECTS ───────────────────────────────────────────────────────────────────
// 1. Mouse-driven HTML parallax on content layers
// 2. Glitch typewriter on section labels + case IDs
// 3. Old-TV RGB glitch on hero name (first scroll trigger)

const gsap = window.gsap;

// ── 1. PARALLAX (hero only — avoids ScrollTrigger conflicts on sections) ──────

let _tx = 0, _ty = 0, _cx = 0, _cy = 0;
let _heroContent = null;

export function initParallax() {
  _heroContent = document.querySelector('.hero-content');
  document.addEventListener('mousemove', e => {
    _tx = (e.clientX / window.innerWidth  - 0.5);
    _ty = (e.clientY / window.innerHeight - 0.5);
  }, { passive: true });
}

let _parallaxActive = true;

export function tickParallax() {
  if (!_heroContent) return;
  const inHero = window.scrollY < window.innerHeight;
  if (!inHero) {
    if (_parallaxActive) {
      _heroContent.style.transform = '';
      _parallaxActive = false;
    }
    return;
  }
  _parallaxActive = true;
  _cx += (_tx - _cx) * 0.06;
  _cy += (_ty - _cy) * 0.06;
  _heroContent.style.transform = `translate(${_cx * -12}px, ${_cy * -8}px)`;
}

// ── 2. GLITCH TYPEWRITER ──────────────────────────────────────────────────────

const GLITCH_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#@%^&*';
const PASS_THROUGH = new Set([' ', '/', '·', '#', '.', '-', '_', ':', '(', ')']);

function glitchReveal(el) {
  if (el._glitched) return;
  el._glitched = true;

  const original = el.textContent;
  let frame = 0;
  const SETTLE_RATE = 3;
  const HOLD_FRAMES = 8;
  const TOTAL = original.length * SETTLE_RATE + HOLD_FRAMES + 6;

  const id = setInterval(() => {
    let out = '';
    for (let i = 0; i < original.length; i++) {
      const ch = original[i];
      if (PASS_THROUGH.has(ch)) {
        out += ch;
        continue;
      }
      const settled = frame > i * SETTLE_RATE + HOLD_FRAMES;
      const glitching = frame > i * SETTLE_RATE;

      if (settled)   { out += ch; }
      else if (glitching) { out += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]; }
      else           { out += '_'; }
    }
    el.textContent = out;
    frame++;
    if (frame >= TOTAL) {
      el.textContent = original;
      clearInterval(id);
    }
  }, 36);
}

export function initGlitchLabels() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      // Small delay so GSAP slide-in animation settles first
      setTimeout(() => glitchReveal(entry.target), 680);
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.75 });

  document.querySelectorAll('.section-label, .case-id').forEach(el => observer.observe(el));
}

// ── 3. OLD-TV HERO NAME GLITCH ────────────────────────────────────────────────

function makeOverlay(parent, originalHTML, color) {
  const d = document.createElement('div');
  d.innerHTML = originalHTML;
  d.style.cssText = [
    'position:absolute', 'top:0', 'left:0', 'right:0',
    'pointer-events:none', 'user-select:none',
    `color:${color}`, 'mix-blend-mode:screen',
  ].join(';');
  parent.appendChild(d);
  return d;
}

function runTVGlitch() {
  const el = document.querySelector('.hero-name');
  if (!el) return;

  const originalHTML = el.innerHTML; // 'Griffin<br>Dutka'

  const red  = makeOverlay(el, originalHTML, '#ff1040');
  const blue = makeOverlay(el, originalHTML, '#0088ff');

  // Horizontal scanline flash overlay
  const scan = document.createElement('div');
  scan.style.cssText = [
    'position:absolute', 'inset:-10px -20px',
    'background:repeating-linear-gradient(transparent 0px,transparent 3px,rgba(255,255,255,0.08) 3px,rgba(255,255,255,0.08) 4px)',
    'pointer-events:none', 'opacity:0',
  ].join(';');
  el.appendChild(scan);

  // Bright noise bar that sweeps top → bottom
  const bar = document.createElement('div');
  bar.style.cssText = 'position:absolute;left:-20px;right:-20px;height:24px;top:-24px;background:rgba(255,255,255,0.14);pointer-events:none;';
  el.appendChild(bar);

  // 10 rapid displacement frames [redX, blueX, mainX, mainSkew]
  const FRAMES = [
    [-22,  18, -7, -5],
    [ 16, -24,  5,  4],
    [-26,  10, -9, -6],
    [  9, -18,  4,  3],
    [-14,  22, -6, -4],
    [ 20, -10,  7,  5],
    [ -8,  16, -3, -2],
    [ 12,  -6,  4,  3],
    [-16,  12, -5, -3],
    [  3,  -3,  1,  1],
  ];

  const tl = gsap.timeline({
    onComplete: () => {
      red.remove(); blue.remove(); scan.remove(); bar.remove();
      gsap.set(el, { clearProps: 'x,skewX,filter' });
    },
  });

  // RGB split + main displacement
  FRAMES.forEach(([rx, bx, ex, sk], i) => {
    const t = i * 0.048;
    tl.to(red,  { x: rx, duration: 0.036, ease: 'none' }, t)
      .to(blue, { x: bx, duration: 0.036, ease: 'none' }, t)
      .to(el,   { x: ex, skewX: sk, duration: 0.036, ease: 'none' }, t);
  });

  // Scanline flicker
  tl.to(scan, { opacity: 1,   duration: 0.02, ease: 'none' }, 0.05)
    .to(scan, { opacity: 0,   duration: 0.05, ease: 'none' }, 0.14)
    .to(scan, { opacity: 0.8, duration: 0.02, ease: 'none' }, 0.27)
    .to(scan, { opacity: 0,   duration: 0.10, ease: 'none' }, 0.31);

  // Brightness spikes
  tl.to(el, { filter: 'brightness(2.0)', duration: 0.03, ease: 'none' }, 0.07)
    .to(el, { filter: 'brightness(1)',   duration: 0.04, ease: 'none' }, 0.13)
    .to(el, { filter: 'brightness(2.5)', duration: 0.02, ease: 'none' }, 0.24)
    .to(el, { filter: 'brightness(1)',   duration: 0.07, ease: 'none' }, 0.29);

  // Noise bar sweep (independent of main tl)
  gsap.fromTo(bar, { top: '-24px' }, { top: '110%', duration: 0.32, ease: 'none', delay: 0.03 });

  // Settle everything
  tl.to([red, blue], { x: 0, opacity: 0, duration: 0.22, ease: 'power2.out' })
    .to(el, { x: 0, skewX: 0, duration: 0.22, ease: 'power2.out' }, '<');
}

export function initHeroNameGlitch() {
  window.addEventListener('scroll', () => {
    setTimeout(runTVGlitch, 40);
  }, { once: true, passive: true });
}

// ── 4. CUSTOM CURSOR (pure rAF — no GSAP, eliminates transform conflicts) ────

export function initCursor() {
  if (!window.matchMedia('(hover: hover)').matches) return;

  const dot  = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (!dot || !ring) return;

  let mx = 0, my = 0;          // raw mouse position → dot snaps here
  let rx = 0, ry = 0;          // ring position (smoothed)
  let scale = 1, targetScale = 1;
  let alpha = 1, targetAlpha = 1;

  document.addEventListener('mousemove', e => {
    mx = e.clientX;
    my = e.clientY;
    // Dot is instant — update in the event for zero lag
    dot.style.transform = `translate(${mx}px,${my}px)`;
  }, { passive: true });

  // Smooth ring with exponential lerp each frame
  (function tick() {
    requestAnimationFrame(tick);
    rx += (mx - rx) * 0.15;
    ry += (my - ry) * 0.15;
    scale += (targetScale - scale) * 0.15;
    alpha += (targetAlpha - alpha) * 0.15;
    ring.style.transform = `translate(${rx}px,${ry}px) scale(${scale})`;
    ring.style.opacity   = alpha;
  })();

  // Expand ring on interactive elements
  document.querySelectorAll('a, .case-card, .stat-card, .edu-card, .nav-dot, .compliance-tags span')
    .forEach(el => {
      el.addEventListener('mouseenter', () => { targetScale = 1.55; targetAlpha = 0.85; });
      el.addEventListener('mouseleave', () => { targetScale = 1;    targetAlpha = 1;    });
    });
}

// ── 5. SCROLL PROGRESS BAR ────────────────────────────────────────────────────

export function initScrollProgress() {
  const bar = document.getElementById('scroll-progress');
  if (!bar) return;
  window.addEventListener('scroll', () => {
    const pct = window.scrollY / (document.body.scrollHeight - window.innerHeight) * 100;
    bar.style.width = Math.min(pct, 100) + '%';
  }, { passive: true });
}

// ── 6. HERO TERMINAL FEED ────────────────────────────────────────────────────

const LOGS = [
  { level: 'INFO',  msg: 'CyberHaven: DLP policy scan — 1,847 users active' },
  { level: 'ALERT', msg: 'Exfil attempt blocked: USB transfer on WKSTN-1042' },
  { level: 'INFO',  msg: 'Teramind session review complete: timeline built' },
  { level: 'WARN',  msg: 'Abnormal: credential harvest payload in email flagged' },
  { level: 'CRIT',  msg: 'Post-termination access — DMS Layer 1 triggered' },
  { level: 'INFO',  msg: 'Absolute OS freeze applied: WKSTN-0891 locked' },
  { level: 'INFO',  msg: 'HRUM escalation: behavioral anomaly score 94/100' },
  { level: 'ALERT', msg: 'Datadog monitor: 47 failed logins in 180 seconds' },
  { level: 'INFO',  msg: 'DLP report generated via Claude — 0 corrections' },
  { level: 'WARN',  msg: 'CrowdStrike: lateral movement detected WKSTN-0023' },
  { level: 'INFO',  msg: 'Torq automation: HRUM updated — 12 users processed' },
  { level: 'INFO',  msg: 'Google Vault export: legal hold request fulfilled' },
  { level: 'ALERT', msg: '80,000+ GB stale data queued for auto-deletion' },
  { level: 'INFO',  msg: 'CyberArk audit: 3 privileged sessions reviewed' },
  { level: 'INFO',  msg: 'JumpCloud heartbeat: 4,500 devices checked in' },
  { level: 'CRIT',  msg: 'P0-critical incident declared — commander engaged' },
  { level: 'INFO',  msg: 'NinjaOne: cached credentials cleared — 23 endpoints' },
  { level: 'WARN',  msg: 'ServiceNow: DMS false-positive recovery initiated' },
  { level: 'INFO',  msg: 'Datadog reference table updated via Torq SOAR' },
  { level: 'INFO',  msg: 'PowerShell: stale data deletion script executed' },
];

function fmtTime() {
  return new Date().toTimeString().slice(0, 8);
}

export function initHeroTerminal() {
  const feed = document.getElementById('terminal-feed');
  if (!feed) return;

  let idx = 0;
  const MAX = 8;

  function addLog() {
    const entry = LOGS[idx % LOGS.length];
    idx++;

    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerHTML =
      `<span class="log-time">${fmtTime()}</span>` +
      `<span class="log-level ${entry.level}">${entry.level}</span>` +
      `<span class="log-msg">${entry.msg}</span>`;
    feed.appendChild(div);

    // Fade out oldest when over limit.
    // NOTE: the fade tween must NOT be what removes the node from the loop's
    // count — gsap.onComplete fires ~200ms later (async), so if the while
    // condition waited on it the loop would spin forever and hard-freeze the
    // page. We mark nodes as "leaving" and exclude them from the live count.
    let live = [...feed.children].filter(c => !c._leaving);
    while (live.length > MAX) {
      const old = live.shift();
      old._leaving = true;
      gsap.to(old, { opacity: 0, y: -5, duration: 0.2, onComplete: () => old.remove() });
    }
  }

  // Pre-fill with a few entries, then keep streaming
  for (let i = 0; i < 4; i++) setTimeout(addLog, i * 380);
  setInterval(addLog, 2600);
}
