import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { prepareSkillsGraph, startSkillsDraw } from './skills.js?v=2';
import { initMorphParticles } from './particles.js?v=1';
import { initSceneObjects, tickSceneObjects } from './scene-objects.js?v=2';
import { initParallax, tickParallax, initGlitchLabels, initHeroNameGlitch, initCursor, initScrollProgress, initHeroTerminal } from './effects.js?v=3';
import { initAgentOps } from './agents.js?v=3';

const gsap         = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
gsap.registerPlugin(ScrollTrigger);

const PREFERS_REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── FORCE SCROLL TO TOP ON (RE)LOAD ───────────────────────────────────────────
// Stop the browser from restoring the previous scroll position so every load
// starts at the hero and the intro plays from the top.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);
window.addEventListener('load', () => window.scrollTo(0, 0));

// Phones/tablets get a lighter scene: fewer particles, lower pixel ratio, no
// antialiasing, fewer data streams. Big battery/heat win, visually near-identical.
const IS_MOBILE = window.matchMedia('(max-width: 768px)').matches;

// ── LENIS INERTIA SCROLL ─────────────────────────────────────────────────────
// Desktop only — touch devices keep native scrolling, reduced-motion users
// keep instant scrolling. GSAP's ticker drives Lenis so ScrollTrigger and the
// scroll position never disagree.
let lenis = null;
if (!IS_MOBILE && !PREFERS_REDUCED && window.Lenis) {
  lenis = new window.Lenis({ lerp: 0.09 });
  window.__lenis = lenis;
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // Anchor links (side nav) route through Lenis for an eased flight
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { duration: 1.6 });
    });
  });
}

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

// ── POST-PROCESSING (desktop only) ───────────────────────────────────────────
// RenderPass → bloom → OutputPass (sRGB) → CRT pass. The CRT pass carries
// film grain plus chromatic aberration that scales with scroll velocity, so
// fast scrolling smears the scene like a damaged feed.
const CRTShader = {
  uniforms: {
    tDiffuse:  { value: null },
    uTime:     { value: 0 },
    uVelocity: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVelocity;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      float v = clamp(abs(uVelocity), 0.0, 60.0) / 60.0;
      vec2 dir = vUv - 0.5;
      float amt = 0.0012 + v * 0.011;
      float r = texture2D(tDiffuse, vUv - dir * amt).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv + dir * amt).b;
      vec3 col = vec3(r, g, b);
      col += (rand(vUv * fract(uTime) * 100.0) - 0.5) * 0.045;
      float vig = smoothstep(0.95, 0.35, length(dir));
      col *= mix(0.84, 1.0, vig);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

const USE_FX = !IS_MOBILE && !PREFERS_REDUCED;
let composer = null, crtPass = null;
if (USE_FX) {
  // Composer output is opaque, so paint the scene background to match the page
  scene.background = new THREE.Color(0x050a0f);
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.85, 0.0
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  crtPass = new ShaderPass(CRTShader);
  composer.addPass(crtPass);
}

// Smoothed scroll velocity (px/frame) feeding the CRT aberration uniform
let scrollVel = 0, lastScrollY = window.scrollY;

// ── MORPHING PARTICLE ENGINE ─────────────────────────────────────────────────
// 40k GPU-blended particles (9k mobile). Sections morph the cloud into shapes
// via setShape(); see particles.js. particleMat keeps the same uniform names
// so the per-section color-shift triggers below work unchanged.
const particles   = initMorphParticles(scene, IS_MOBILE);
const particleMat = particles.material;
window.__particles = particles; // debug/inspection handle

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

// Section waypoints — stops along the camera flight path. The camera flies a
// single Catmull-Rom curve through these positions, so the journey between
// sections is one continuous banked flight instead of discrete lerps.
const WAYPOINTS = [
  { id: 'hero',       z: 50,  x:  0,  y:  0,  rx:  0.000, ry:  0.000, color: null,     shape: null      },
  { id: 'summary',    z: 44,  x: -5,  y:  1,  rx:  0.018, ry: -0.040, color: 0x00d4ff, shape: 'field'   },
  { id: 'experience', z: 37,  x:  5,  y: -2,  rx: -0.022, ry:  0.055, color: 0xf59e0b, shape: 'padlock' },
  { id: 'stats',      z: 30,  x: -3,  y:  0,  rx:  0.008, ry: -0.030, color: 0x22c55e, shape: 'field'   },
  { id: 'agents',     z: 26,  x:  4,  y: -1,  rx: -0.012, ry:  0.040, color: 0xef4444, shape: 'network' },
  { id: 'skills',     z: 22,  x:  4,  y:  2,  rx:  0.012, ry:  0.045, color: 0xa78bfa, shape: 'rings'   },
  { id: 'education',  z: 17,  x: -2,  y: -1,  rx: -0.010, ry: -0.020, color: 0x00d4ff, shape: 'shield'  },
  { id: 'about',      z: 14,  x:  3,  y:  1,  rx:  0.010, ry:  0.030, color: 0x22c55e, shape: 'field'   },
  { id: 'contact',    z: 12,  x:  0,  y:  0,  rx:  0.000, ry:  0.000, color: null,     shape: 'globe'   },
];

const cameraPath = new THREE.CatmullRomCurve3(
  WAYPOINTS.map(wp => new THREE.Vector3(wp.x, wp.y, wp.z)),
  false, 'catmullrom', 0.6
);
// Single scalar scrubbed by ScrollTrigger; the render loop samples the curve
const pathState = { t: 0 };
const _pathPoint = new THREE.Vector3();

function samplePath() {
  const t = Math.max(0, Math.min(1, pathState.t));
  cameraPath.getPoint(t, _pathPoint);
  rig.x = _pathPoint.x;
  rig.y = _pathPoint.y;
  rig.z = _pathPoint.z;
  const seg = t * (WAYPOINTS.length - 1);
  const i0  = Math.min(Math.floor(seg), WAYPOINTS.length - 2);
  const f   = seg - i0;
  rig.rx = WAYPOINTS[i0].rx + (WAYPOINTS[i0 + 1].rx - WAYPOINTS[i0].rx) * f;
  rig.ry = WAYPOINTS[i0].ry + (WAYPOINTS[i0 + 1].ry - WAYPOINTS[i0].ry) * f;
}

// ── MOUSE PARALLAX ────────────────────────────────────────────────────────────
let mouseX = 0, mouseY = 0, targetX = 0, targetY = 0;
document.addEventListener('mousemove', e => {
  mouseX = (e.clientX / window.innerWidth  - 0.5) * 2;
  mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
});

// ── CURSOR + SCROLL PROGRESS (init immediately — no need to wait for hero) ───
initCursor();
initScrollProgress();

// ── VIEW_RESUME MENU ─────────────────────────────────────────────────────────
// JS-driven open class alongside CSS :hover — covers keyboard focus and touch
const rvWrap = document.querySelector('.resume-view-wrap');
if (rvWrap) {
  let closeTimer = null;
  const openMenu  = () => { clearTimeout(closeTimer); rvWrap.classList.add('open'); };
  // Grace period so the pointer can cross the gap to the menu without closing
  const closeMenu = () => {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => rvWrap.classList.remove('open'), 250);
  };
  rvWrap.addEventListener('mouseenter', openMenu);
  rvWrap.addEventListener('mouseleave', closeMenu);
  rvWrap.addEventListener('focusin', openMenu);
  rvWrap.addEventListener('focusout', e => {
    if (!rvWrap.contains(e.relatedTarget)) closeMenu();
  });
}

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
// Burst cloud converges into "GRIFFIN DUTKA", holds, then dissolves to field.
function startHeroSequence() {
  particles.intro(revealHeroContent);
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

    // Camera path scrub — each section advances the flight-path scalar one
    // segment; the render loop samples the curve for position + rotation.
    if (i === 0) return;
    const segLen = 1 / (WAYPOINTS.length - 1);

    gsap.fromTo(pathState,
      { t: (i - 1) * segLen },
      {
        t: i * segLen,
        ease: 'none',
        scrollTrigger: {
          trigger: el,
          start: 'top bottom',
          end:   'top top',
          scrub: 2.0,
        },
      }
    );

    // Particle shape morph per section — fires in both scroll directions
    if (wp.shape) {
      ScrollTrigger.create({
        trigger: el,
        start: 'top 58%',
        end:   'bottom 42%',
        onEnter:     () => particles.setShape(wp.shape),
        onEnterBack: () => particles.setShape(wp.shape),
      });
    }

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

  // ── Agent Operations pipeline (pinned scrub section) ──────────────────────
  initAgentOps();

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
  // Rotation lives in the particle vertex shader (damped to ~0 while a shape
  // is held so the padlock/globe stay upright); this just scrubs the proxy.
  gsap.to(particles.rot, {
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

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  // Particle engine: time + scroll rotation uniforms (all motion is GPU-side)
  particles.tick(elapsed);

  // Smooth mouse parallax
  targetX += (mouseX - targetX) * 0.03;
  targetY += (mouseY - targetY) * 0.03;

  // Flight path → rig
  samplePath();

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

  tickSceneObjects();
  tickParallax();

  if (composer) {
    // Smoothed scroll velocity drives the chromatic aberration smear
    const sy = window.scrollY;
    scrollVel += ((sy - lastScrollY) - scrollVel) * 0.12;
    lastScrollY = sy;
    crtPass.uniforms.uTime.value     = elapsed;
    crtPass.uniforms.uVelocity.value = scrollVel;
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
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
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
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
