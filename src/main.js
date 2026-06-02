import * as THREE from 'three';
import { prepareSkillsGraph, startSkillsDraw } from './skills.js?v=2';
import { initHeroParticles } from './hero.js';
import { initSceneObjects, tickSceneObjects } from './scene-objects.js';
import { initParallax, tickParallax, initGlitchLabels, initHeroNameGlitch, initCursor, initScrollProgress, initHeroTerminal } from './effects.js?v=2';

const gsap         = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
gsap.registerPlugin(ScrollTrigger);

// Phones/tablets get a lighter scene: fewer particles, lower pixel ratio, no
// antialiasing, fewer data streams. Big battery/heat win, visually near-identical.
const IS_MOBILE = window.matchMedia('(max-width: 768px)').matches;

// ── LOADER ───────────────────────────────────────────────────────────────────
const loaderEl  = document.getElementById('loader');
const loaderBar = document.querySelector('.loader-bar');

const heroContent = document.querySelector('.hero-content');
const scrollHint  = document.querySelector('.scroll-hint');
heroContent.style.opacity = '0';
scrollHint.style.opacity  = '0';

let loadProgress = 0;
const loadInterval = setInterval(() => {
  loadProgress += Math.random() * 16;
  if (loadProgress >= 100) {
    loadProgress = 100;
    clearInterval(loadInterval);
    loaderBar.style.width = '100%';
    setTimeout(() => {
      loaderEl.classList.add('hidden');
      setTimeout(() => { loaderEl.remove(); startHeroSequence(); }, 650);
    }, 300);
  }
  loaderBar.style.width = loadProgress + '%';
}, 80);

// ── THREE.JS SCENE ───────────────────────────────────────────────────────────
const canvas   = document.getElementById('bg');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_MOBILE, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_MOBILE ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 50);

// ── PARTICLE FIELD ───────────────────────────────────────────────────────────
const PARTICLE_COUNT = IS_MOBILE ? 1000 : 2800;
const positions  = new Float32Array(PARTICLE_COUNT * 3);
const colors     = new Float32Array(PARTICLE_COUNT * 3);
const sizes      = new Float32Array(PARTICLE_COUNT);
const velocities = [];

const cyanColor  = new THREE.Color(0x00d4ff);
const amberColor = new THREE.Color(0xf59e0b);
const dimColor   = new THREE.Color(0x0d1f2d);

for (let i = 0; i < PARTICLE_COUNT; i++) {
  positions[i * 3]     = (Math.random() - 0.5) * 200;
  positions[i * 3 + 1] = (Math.random() - 0.5) * 200;
  positions[i * 3 + 2] = (Math.random() - 0.5) * 120 - 30;

  const r   = Math.random();
  const col = r < 0.04 ? cyanColor : r < 0.08 ? amberColor : dimColor;
  colors[i * 3]     = col.r;
  colors[i * 3 + 1] = col.g;
  colors[i * 3 + 2] = col.b;

  sizes[i] = r < 0.06 ? Math.random() * 2.5 + 1 : Math.random() * 1.2 + 0.3;
  velocities.push({
    x: (Math.random() - 0.5) * 0.012,
    y: (Math.random() - 0.5) * 0.012,
    z: (Math.random() - 0.5) * 0.006,
  });
}

const particleGeo = new THREE.BufferGeometry();
particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
particleGeo.setAttribute('aColor',   new THREE.BufferAttribute(colors, 3));
particleGeo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));

const particleMat = new THREE.ShaderMaterial({
  uniforms: { uColorShift: { value: new THREE.Color(0x000000) }, uShiftStrength: { value: 0.0 } },
  vertexShader: `
    attribute float size;
    attribute vec3 aColor;
    varying vec3 vColor;
    void main() {
      vColor = aColor;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (300.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 uColorShift;
    uniform float uShiftStrength;
    varying vec3 vColor;
    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      float alpha = 1.0 - smoothstep(0.2, 0.5, d);
      vec3 col = mix(vColor, uColorShift, uShiftStrength * 0.18);
      gl_FragColor = vec4(col, alpha * 0.9);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const particlesMesh = new THREE.Points(particleGeo, particleMat);
scene.add(particlesMesh);

// ── DATA STREAMS ─────────────────────────────────────────────────────────────
const streams = [];
for (let s = 0; s < (IS_MOBILE ? 8 : 18); s++) {
  const pts = [];
  const x = (Math.random() - 0.5) * 180;
  const y = (Math.random() - 0.5) * 180;
  const z = (Math.random() - 0.5) * 80 - 20;
  for (let j = 0; j < 12; j++) {
    pts.push(new THREE.Vector3(x + (Math.random() - 0.5) * 2, y - j * (Math.random() * 2.5 + 1), z));
  }
  const geo  = new THREE.BufferGeometry().setFromPoints(pts);
  const mat  = new THREE.LineBasicMaterial({
    color: Math.random() < 0.3 ? 0xf59e0b : 0x00d4ff,
    opacity: Math.random() * 0.25 + 0.04,
    transparent: true,
  });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  streams.push({ line, speed: Math.random() * 0.3 + 0.1 });
}

// ── CAMERA RIG ────────────────────────────────────────────────────────────────
// All scroll-driven camera movement targets this proxy object.
// The render loop lerps the actual Three.js camera toward it.
const rig = { x: 0, y: 0, z: 50, rx: 0, ry: 0 };

// Section waypoints — camera drifts to these positions as each section enters
const WAYPOINTS = [
  { id: 'hero',       z: 50,  x:  0,  y:  0,  rx:  0.000, ry:  0.000, color: null        },
  { id: 'summary',    z: 44,  x: -5,  y:  1,  rx:  0.018, ry: -0.040, color: 0x00d4ff    },
  { id: 'experience', z: 37,  x:  5,  y: -2,  rx: -0.022, ry:  0.055, color: 0xf59e0b    },
  { id: 'stats',      z: 30,  x: -3,  y:  0,  rx:  0.008, ry: -0.030, color: 0x22c55e    },
  { id: 'skills',     z: 23,  x:  4,  y:  2,  rx:  0.012, ry:  0.045, color: 0xa78bfa    },
  { id: 'education',  z: 17,  x: -2,  y: -1,  rx: -0.010, ry: -0.020, color: 0x00d4ff    },
  { id: 'about',      z: 14,  x:  3,  y:  1,  rx:  0.010, ry:  0.030, color: 0x22c55e    },
  { id: 'contact',    z: 12,  x:  0,  y:  0,  rx:  0.000, ry:  0.000, color: null        },
];

// ── MOUSE PARALLAX ────────────────────────────────────────────────────────────
let mouseX = 0, mouseY = 0, targetX = 0, targetY = 0;
document.addEventListener('mousemove', e => {
  mouseX = (e.clientX / window.innerWidth  - 0.5) * 2;
  mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
});

// ── CURSOR + SCROLL PROGRESS (init immediately — no need to wait for hero) ───
initCursor();
initScrollProgress();

// ── SIDE NAV ─────────────────────────────────────────────────────────────────
const sideNav    = document.getElementById('side-nav');
const navDots    = document.querySelectorAll('.nav-dot');
const vignetteEl = document.getElementById('vignette');

function setActiveNav(sectionId) {
  navDots.forEach(d => d.classList.toggle('active', d.dataset.section === sectionId));
}

function flashVignette() {
  vignetteEl.classList.add('flash');
  setTimeout(() => vignetteEl.classList.remove('flash'), 300);
}

// ── HERO PARTICLE ANIMATION ──────────────────────────────────────────────────
let heroAnim = null;

function startHeroSequence() {
  heroAnim = initHeroParticles(particleGeo, velocities, revealHeroContent);
}

function revealHeroContent() {
  const tl = gsap.timeline();
  tl.to(heroContent, { opacity: 1, duration: 0.1 })
    .from('.hero-tag',     { y: 24, opacity: 0, duration: 0.55, ease: 'power2.out' })
    .from('.hero-name',    { y: 32, opacity: 0, duration: 0.70, ease: 'power3.out' }, '-=0.2')
    .from('.hero-title',   { y: 20, opacity: 0, duration: 0.50, ease: 'power2.out' }, '-=0.35')
    .from('.hero-status',  { y: 16, opacity: 0, duration: 0.45, ease: 'power2.out' }, '-=0.25')
    .from('.hero-contact', { y: 16, opacity: 0, duration: 0.45, ease: 'power2.out' }, '-=0.2')
    .to(scrollHint,        { opacity: 1, duration: 0.5, ease: 'power1.out' }, '-=0.1');

  gsap.to('.hero-name', {
    delay: 1.4, skewX: 3, duration: 0.06, ease: 'none',
    yoyo: true, repeat: 3,
    onComplete: () => gsap.set('.hero-name', { skewX: 0 }),
  });

  // Show side nav after hero reveal
  setTimeout(() => sideNav.classList.add('visible'), 1200);

  // Reveal terminal feed after hero text settles
  setTimeout(() => {
    initHeroTerminal();
    const terminal = document.getElementById('hero-terminal');
    if (terminal) terminal.classList.add('visible');
  }, 1800);

}

// ── SCROLL ANIMATIONS ─────────────────────────────────────────────────────────
function initScrollAnimations() {

  // ── Camera waypoint scroll triggers ───────────────────────────────────────
  WAYPOINTS.forEach((wp, i) => {
    const el = document.getElementById(wp.id);
    if (!el) return;

    // Active nav dot + vignette flash when section hits top of viewport
    ScrollTrigger.create({
      trigger: el,
      start: 'top 60%',
      onEnter:      () => { setActiveNav(wp.id); flashVignette(); },
      onEnterBack:  () => { setActiveNav(wp.id); flashVignette(); },
    });

    // Camera rig animation — scrubbed between sections
    if (i === 0) return;
    const prev = WAYPOINTS[i - 1];
    const prevEl = document.getElementById(prev.id);

    gsap.fromTo(rig,
      { x: prev.x, y: prev.y, z: prev.z, rx: prev.rx, ry: prev.ry },
      {
        x: wp.x, y: wp.y, z: wp.z, rx: wp.rx, ry: wp.ry,
        ease: 'none',
        scrollTrigger: {
          trigger: el,
          start: 'top bottom',
          end:   'top top',
          scrub: 2.0,
        },
      }
    );

    // Particle color shift per section
    if (wp.color) {
      const shiftCol = new THREE.Color(wp.color);
      ScrollTrigger.create({
        trigger: el,
        start: 'top 70%',
        end:   'bottom top',
        onEnter: () => {
          gsap.to(particleMat.uniforms.uColorShift.value, {
            r: shiftCol.r, g: shiftCol.g, b: shiftCol.b, duration: 1.2,
          });
          gsap.to(particleMat.uniforms.uShiftStrength, { value: 1.0, duration: 1.2 });
        },
        onLeave: () => {
          gsap.to(particleMat.uniforms.uShiftStrength, { value: 0.0, duration: 1.0 });
        },
        onLeaveBack: () => {
          gsap.to(particleMat.uniforms.uShiftStrength, { value: 0.0, duration: 1.0 });
        },
      });
    }
  });

  // ── 3D scene accent objects ────────────────────────────────────────────────
  initSceneObjects(scene, clock);

  // ── Parallax + glitch ────────────────────────────────────────────────────
  initParallax();
  initGlitchLabels();
  initHeroNameGlitch();

  // ── Section label slide-ins ────────────────────────────────────────────────
  document.querySelectorAll('.section-label').forEach(el => {
    gsap.from(el, {
      scrollTrigger: { trigger: el, start: 'top 85%' },
      x: -30, opacity: 0, duration: 0.6, ease: 'power2.out',
    });
  });

  // ── Summary text ──────────────────────────────────────────────────────────
  gsap.from('.summary-text', {
    scrollTrigger: { trigger: '#summary', start: 'top 80%' },
    y: 30, opacity: 0, duration: 0.9, ease: 'power3.out',
    stagger: 0.15,
  });

  // ── Particle cloud slow rotation with scroll ───────────────────────────────
  // Explicitly bound scrub so GSAP doesn't create an unbounded page-wide tween.
  gsap.to(particlesMesh.rotation, {
    y: Math.PI * 0.5,
    ease: 'none',
    scrollTrigger: {
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1,
    },
  });
}

// ── RENDER LOOP ───────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let _raf = 0;

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();
  _raf++;

  // Hero particle convergence tick
  if (heroAnim) {
    const alive = heroAnim.tick(performance.now());
    if (!alive) heroAnim = null;
  } else if (_raf % 2 === 0) {
    // Normal drift — update every other frame (imperceptible at 30fps, halves CPU cost)
    const pos = particleGeo.attributes.position.array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3]     += velocities[i].x;
      pos[i * 3 + 1] += velocities[i].y;
      pos[i * 3 + 2] += velocities[i].z;
      if (pos[i * 3]     >  100) pos[i * 3]     = -100;
      if (pos[i * 3]     < -100) pos[i * 3]     =  100;
      if (pos[i * 3 + 1] >  100) pos[i * 3 + 1] = -100;
      if (pos[i * 3 + 1] < -100) pos[i * 3 + 1] =  100;
      if (pos[i * 3 + 2] >   30) pos[i * 3 + 2] =  -60;
      if (pos[i * 3 + 2] <  -60) pos[i * 3 + 2] =   30;
    }
    particleGeo.attributes.position.needsUpdate = true;
  }

  // Smooth mouse parallax
  targetX += (mouseX - targetX) * 0.03;
  targetY += (mouseY - targetY) * 0.03;

  // Lerp camera toward rig target + mouse offset
  camera.position.x += (rig.x + targetX * 5  - camera.position.x) * 0.04;
  camera.position.y += (rig.y - targetY * 3.5 - camera.position.y) * 0.04;
  camera.position.z += (rig.z              - camera.position.z)    * 0.04;
  camera.rotation.x += (rig.rx            - camera.rotation.x)    * 0.04;
  camera.rotation.y += (rig.ry            - camera.rotation.y)    * 0.04;

  // Data stream animation
  streams.forEach(s => {
    s.line.position.y -= s.speed * 0.4;
    if (s.line.position.y < -60) s.line.position.y = 60;
    s.line.material.opacity = 0.04 + 0.12 * Math.abs(Math.sin(elapsed * 0.5 + s.speed));
  });

  particlesMesh.rotation.x = elapsed * 0.003;

  tickSceneObjects();
  tickParallax();

  renderer.render(scene, camera);
}

animate();
// Defer by one tick so the module finishes before ScrollTrigger setup runs.
// Uses setTimeout (not rAF) so it fires even when the tab starts in the background.
setTimeout(initScrollAnimations, 0);

// ── RESIZE ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── SCROLL REVEAL (cards, stats, education) ───────────────────────────────────
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const siblings = [...entry.target.parentElement.querySelectorAll('[data-reveal]')];
    const idx   = siblings.indexOf(entry.target);
    const delay = siblings.length > 1 ? idx * 95 : 0;
    entry.target.style.transitionDelay = `${delay}ms`;
    entry.target.classList.add('revealed');

    // Stagger findings after the card slides in
    entry.target.querySelectorAll('.case-findings li').forEach((li, i) => {
      li.style.transitionDelay = `${delay + 320 + i * 65}ms`;
      li.classList.add('revealed');
    });

    entry.target.querySelectorAll('.dms-layer').forEach((layer, i) =>
      setTimeout(() => layer.classList.add('revealed'), delay + i * 160 + 200)
    );
    revealObserver.unobserve(entry.target);
  });
}, { threshold: 0.12 });

document.querySelectorAll('[data-reveal]').forEach(el => revealObserver.observe(el));

// ── STAT COUNTERS ─────────────────────────────────────────────────────────────
const countObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const card      = entry.target;
    const target    = parseFloat(card.dataset.count);
    const isDecimal = card.dataset.decimal === 'true';
    const countEl   = card.querySelector('.count');
    const start     = performance.now();
    const DURATION  = 1800;

    (function step(now) {
      const t   = Math.min((now - start) / DURATION, 1);
      const val = target * (1 - Math.pow(1 - t, 3));
      countEl.textContent = isDecimal ? val.toFixed(1) : Math.floor(val).toLocaleString();
      if (t < 1) requestAnimationFrame(step);
    })(performance.now());

    countObserver.unobserve(card);
  });
}, { threshold: 0.4 });

document.querySelectorAll('.stat-card').forEach(el => countObserver.observe(el));

// ── SKILLS GRAPH ──────────────────────────────────────────────────────────────
// Force layout runs at startup (async, after loader) so it never blocks scroll.
// Drawing starts only when the section becomes visible.
setTimeout(prepareSkillsGraph, 0);

const _skillsObserver = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting) {
    _skillsObserver.disconnect();
    startSkillsDraw();
  }
}, { threshold: 0.2 });
_skillsObserver.observe(document.getElementById('skills'));
