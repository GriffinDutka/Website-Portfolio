import * as THREE from 'three';

// ── MORPHING GPU PARTICLE ENGINE ──────────────────────────────────────────────
// One particle system for the whole site. Every particle carries two target
// positions/colors (slot A and slot B); the vertex shader blends between them
// with a per-particle stagger, so a 40k-particle morph costs the CPU nothing
// after the one-time target upload. Section ScrollTriggers call setShape() to
// morph the cloud into a padlock, neural network, orbit rings, shield or globe.
//
// The old CPU drift is replaced by pseudo-curl wobble in the vertex shader,
// scaled per shape: the free field drifts hard, structured shapes only shimmer.

const gsap = window.gsap;

const STAGGER = 0.3; // fraction of the morph spent staggering particle starts

// Palette
const DIM     = [0.051, 0.122, 0.176]; // 0x0d1f2d
const CYAN    = [0.0,   0.83,  1.0  ];
const AMBER   = [0.96,  0.62,  0.04 ];
const RED     = [0.937, 0.267, 0.267];
const PURPLE  = [0.655, 0.545, 0.98 ];
const GREEN   = [0.133, 0.773, 0.357];
const WHITE   = [0.85,  0.95,  1.0  ];

function setV3(arr, i, x, y, z) {
  arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
}
function setCol(arr, i, c, k = 1) {
  arr[i * 3] = c[0] * k; arr[i * 3 + 1] = c[1] * k; arr[i * 3 + 2] = c[2] * k;
}
function gauss(k = 1) {
  return (Math.random() + Math.random() + Math.random() - 1.5) * k;
}
function sphereDir() {
  const z = Math.random() * 2 - 1;
  const phi = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  return [s * Math.cos(phi), s * Math.sin(phi), z];
}

// Fill the tail of a shape with ambient far-field scatter so structured shapes
// keep depth behind them instead of emptying the scene.
function ambientTail(pos, col, n, from) {
  for (let i = from; i < n; i++) {
    setV3(pos, i, (Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200, (Math.random() - 0.5) * 110 - 35);
    const r = Math.random();
    setCol(col, i, r < 0.05 ? CYAN : DIM, r < 0.05 ? 0.7 : 1);
  }
}

// ── SHAPE GENERATORS ─────────────────────────────────────────────────────────
// Each returns { pos, col, wobble, struct, boost } for n particles.

function shapeField(n) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    setV3(pos, i, (Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200, (Math.random() - 0.5) * 120 - 30);
    const r = Math.random();
    setCol(col, i, r < 0.04 ? CYAN : r < 0.08 ? AMBER : DIM);
  }
  return { pos, col, wobble: 1.0, struct: 0.0, boost: 1.0 };
}

function shapeBurst(n) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const d = sphereDir();
    const r = 130 + Math.random() * 100;
    setV3(pos, i, d[0] * r, d[1] * r, d[2] * r - 30);
    setCol(col, i, Math.random() < 0.06 ? CYAN : DIM, 0.8);
  }
  return { pos, col, wobble: 1.3, struct: 0.0, boost: 1.0 };
}


function shapePadlock(n) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const S = 1.7, CX = 0, CY = 1, CZ = -16;
  const i1 = Math.floor(n * 0.32), i2 = Math.floor(n * 0.82), i3 = Math.floor(n * 0.88);

  // Shackle — upper torus arc with legs reaching into the body
  for (let i = 0; i < i1; i++) {
    const th = -0.12 * Math.PI + Math.random() * 1.24 * Math.PI;
    const ph = Math.random() * Math.PI * 2;
    const R = 9.5, r = 1.3;
    const rr = R + r * Math.cos(ph);
    setV3(pos, i, CX + rr * Math.cos(th) * S, CY + (7.5 + rr * Math.sin(th)) * S, CZ + r * Math.sin(ph) * S);
    setCol(col, i, AMBER, Math.random() < 0.1 ? 0.85 : 0.45);
  }

  // Body — box surface, faces weighted by area (w22 h15 d5.5, centred y −2.5)
  const w = 22, h = 15, d = 5.5, by = -2.5;
  const areas = [w * h * 2, w * d * 2, h * d * 2];
  const total = areas[0] + areas[1] + areas[2];
  for (let i = i1; i < i2; i++) {
    const pick = Math.random() * total;
    let x, y, z;
    if (pick < areas[0]) {            // front/back
      x = (Math.random() - 0.5) * w; y = by + (Math.random() - 0.5) * h; z = (Math.random() < 0.5 ? -1 : 1) * d / 2;
    } else if (pick < areas[0] + areas[1]) { // top/bottom
      x = (Math.random() - 0.5) * w; y = by + (Math.random() < 0.5 ? -1 : 1) * h / 2; z = (Math.random() - 0.5) * d;
    } else {                          // sides
      x = (Math.random() < 0.5 ? -1 : 1) * w / 2; y = by + (Math.random() - 0.5) * h; z = (Math.random() - 0.5) * d;
    }
    setV3(pos, i, CX + x * S, CY + y * S, CZ + z * S);
    setCol(col, i, AMBER, Math.random() < 0.06 ? 0.8 : 0.3);
  }

  // Keyhole — bright red ring + slot on the front face
  for (let i = i2; i < i3; i++) {
    const front = d / 2 + 0.4;
    if (Math.random() < 0.62) {
      const a = Math.random() * Math.PI * 2;
      setV3(pos, i, CX + (Math.cos(a) * 1.9 + gauss(0.15)) * S, CY + (-1.2 + Math.sin(a) * 1.9 + gauss(0.15)) * S, CZ + front * S);
    } else {
      setV3(pos, i, CX + gauss(0.3) * S, CY + (-3.4 - Math.random() * 2.6) * S, CZ + front * S);
    }
    setCol(col, i, RED, 0.85);
  }
  ambientTail(pos, col, n, i3);
  return { pos, col, wobble: 0.08, struct: 1.0, boost: 1.4 };
}

function shapeNetwork(n) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const CZ = -14;

  const NODES = 26;
  const nodes = [];
  for (let k = 0; k < NODES; k++) {
    nodes.push([gauss(13), gauss(9), CZ + gauss(5)]);
  }
  // Each node links to its 2 nearest neighbours
  const edges = [];
  for (let a = 0; a < NODES; a++) {
    const d2 = nodes.map((nb, b) => ({
      b,
      d: a === b ? Infinity : (nodes[a][0] - nb[0]) ** 2 + (nodes[a][1] - nb[1]) ** 2 + (nodes[a][2] - nb[2]) ** 2,
    })).sort((u, v) => u.d - v.d);
    for (let e = 0; e < 2; e++) {
      const b = d2[e].b;
      if (!edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) edges.push([a, b]);
    }
  }

  const i1 = Math.floor(n * 0.5), i2 = Math.floor(n * 0.86);
  for (let i = 0; i < i1; i++) {
    const nd = nodes[i % NODES];
    setV3(pos, i, nd[0] + gauss(1.5), nd[1] + gauss(1.5), nd[2] + gauss(1.5));
    const r = Math.random();
    setCol(col, i, r < 0.12 ? WHITE : RED, r < 0.12 ? 0.8 : 0.55);
  }
  for (let i = i1; i < i2; i++) {
    const [a, b] = edges[i % edges.length];
    const t = Math.random();
    setV3(pos, i,
      nodes[a][0] + (nodes[b][0] - nodes[a][0]) * t + gauss(0.4),
      nodes[a][1] + (nodes[b][1] - nodes[a][1]) * t + gauss(0.4),
      nodes[a][2] + (nodes[b][2] - nodes[a][2]) * t + gauss(0.4));
    setCol(col, i, CYAN, 0.3);
  }
  ambientTail(pos, col, n, i2);
  return { pos, col, wobble: 0.12, struct: 1.0, boost: 1.35 };
}

function shapeRings(n) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const CZ = -15;
  const rings = [
    { R: 13, tube: 0.5, rx: 1.05, rz: 0.2 },
    { R: 19, tube: 0.5, rx: -0.5, rz: 0.9 },
    { R: 25, tube: 0.5, rx: 0.3,  rz: -0.6 },
  ];
  const wsum = rings.reduce((s, r) => s + r.R, 0);

  const i1 = Math.floor(n * 0.7), i2 = Math.floor(n * 0.84);
  for (let i = 0; i < i1; i++) {
    let pick = Math.random() * wsum, ring = rings[0];
    for (const r of rings) { if (pick < r.R) { ring = r; break; } pick -= r.R; }
    const th = Math.random() * Math.PI * 2;
    let x = Math.cos(th) * ring.R + gauss(ring.tube);
    let y = Math.sin(th) * ring.R + gauss(ring.tube);
    let z = gauss(ring.tube);
    // tilt: rotate about x then z
    let y2 = y * Math.cos(ring.rx) - z * Math.sin(ring.rx);
    let z2 = y * Math.sin(ring.rx) + z * Math.cos(ring.rx);
    const x3 = x * Math.cos(ring.rz) - y2 * Math.sin(ring.rz);
    const y3 = x * Math.sin(ring.rz) + y2 * Math.cos(ring.rz);
    setV3(pos, i, x3, y3, CZ + z2);
    setCol(col, i, PURPLE, Math.random() < 0.08 ? 0.85 : 0.4);
  }
  for (let i = i1; i < i2; i++) {
    setV3(pos, i, gauss(3.5), gauss(3.5), CZ + gauss(3));
    setCol(col, i, Math.random() < 0.2 ? WHITE : PURPLE, 0.75);
  }
  ambientTail(pos, col, n, i2);
  return { pos, col, wobble: 0.15, struct: 1.0, boost: 1.3 };
}

function shapeShield(n) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const CZ = -15, TOP = 15, H = 33, W = 14;
  const halfw = (tt) => W * (tt < 0.32 ? 1 : Math.pow(1 - (tt - 0.32) / 0.68, 1.35));

  const i1 = Math.floor(n * 0.48), i2 = Math.floor(n * 0.74), i3 = Math.floor(n * 0.86);
  for (let i = 0; i < i1; i++) {
    const tt = Math.random();
    setV3(pos, i, (Math.random() * 2 - 1) * halfw(tt), TOP - H * tt, CZ + gauss(1.3));
    setCol(col, i, CYAN, 0.22);
  }
  // Outline — top edge + both tapering sides
  for (let i = i1; i < i2; i++) {
    const u = Math.random();
    let x, y;
    if (u < 0.25) { x = (Math.random() * 2 - 1) * W; y = TOP; }
    else { const tt = Math.random(); x = (u < 0.625 ? 1 : -1) * halfw(tt); y = TOP - H * tt; }
    setV3(pos, i, x + gauss(0.3), y + gauss(0.3), CZ + gauss(1.3));
    setCol(col, i, CYAN, 0.7);
  }
  // Emblem — checkmark
  for (let i = i2; i < i3; i++) {
    const t = Math.random();
    let x, y;
    if (Math.random() < 0.38) { x = -5 + 4 * t; y = -2 - 4 * t; }
    else { x = -1 + 8 * t; y = -6 + 10 * t; }
    setV3(pos, i, x + gauss(0.45), y + gauss(0.45), CZ + 1.6 + gauss(0.5));
    setCol(col, i, WHITE, 0.8);
  }
  ambientTail(pos, col, n, i3);
  return { pos, col, wobble: 0.1, struct: 1.0, boost: 1.35 };
}

function shapeGlobe(n) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  // Big and close on purpose: the camera flight ends just inside the front
  // face, so the finale reads as flying INTO the globe. The near-camera fade
  // dissolves particles before they can blow out, and the contact content
  // sits on glass panels.
  const CZ = -16, R = 20;

  const i1 = Math.floor(n * 0.46), i2 = Math.floor(n * 0.72), i3 = Math.floor(n * 0.86);
  for (let i = 0; i < i1; i++) {
    const d = sphereDir();
    setV3(pos, i, d[0] * R, d[1] * R, CZ + d[2] * R);
    setCol(col, i, Math.random() < 0.5 ? CYAN : GREEN, 0.25);
  }
  // Grid — 8 meridians + 3 parallels
  for (let i = i1; i < i2; i++) {
    let x, y, z;
    if (Math.random() < 0.66) {
      const m = Math.floor(Math.random() * 8) * (Math.PI / 8);
      const th = Math.random() * Math.PI * 2;
      x = Math.cos(th) * R; const r2 = Math.sin(th) * R;
      y = x * 0; // meridian plane: rotate (cos,sin) circle around y
      const px = Math.cos(th) * R;
      x = px * Math.cos(m); z = px * Math.sin(m); y = Math.sin(th) * R;
    } else {
      const lat = [-0.45, 0, 0.45][Math.floor(Math.random() * 3)];
      const rr = Math.cos(lat) * R, yy = Math.sin(lat) * R;
      const th = Math.random() * Math.PI * 2;
      x = Math.cos(th) * rr; z = Math.sin(th) * rr; y = yy;
    }
    setV3(pos, i, x + gauss(0.25), y + gauss(0.25), CZ + z + gauss(0.25));
    setCol(col, i, GREEN, 0.65);
  }
  // Data arcs between random shell points
  const arcs = [];
  for (let a = 0; a < 10; a++) arcs.push([sphereDir(), sphereDir()]);
  for (let i = i2; i < i3; i++) {
    const [p, q] = arcs[i % arcs.length];
    const t = Math.random();
    let x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t, z = p[2] + (q[2] - p[2]) * t;
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    const lift = R * (1.02 + 0.16 * Math.sin(t * Math.PI));
    x = x / len * lift; y = y / len * lift; z = z / len * lift;
    setV3(pos, i, x + gauss(0.2), y + gauss(0.2), CZ + z + gauss(0.2));
    setCol(col, i, CYAN, 0.8);
  }
  ambientTail(pos, col, n, i3);
  return { pos, col, wobble: 0.12, struct: 1.0, boost: 1.3 };
}

const GENERATORS = {
  field:   shapeField,
  burst:   shapeBurst,
  padlock: shapePadlock,
  network: shapeNetwork,
  rings:   shapeRings,
  shield:  shapeShield,
  globe:   shapeGlobe,
};

// ── ENGINE ───────────────────────────────────────────────────────────────────

export function initMorphParticles(scene, isMobile) {
  const COUNT = isMobile ? 9000 : 40000;
  const cache = {};
  const getShape = (name) => (cache[name] ??= GENERATORS[name](COUNT));

  const burst  = getShape('burst');
  const field0 = getShape('field');

  const geo = new THREE.BufferGeometry();
  const posA = new Float32Array(burst.pos);
  const posB = new Float32Array(field0.pos);
  const colA = new Float32Array(burst.col);
  const colB = new Float32Array(field0.col);
  const sizes = new Float32Array(COUNT);
  const rands = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const r = Math.random();
    sizes[i] = r < 0.05 ? Math.random() * 1.6 + 1.2 : Math.random() * 1.0 + 0.3;
    rands[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(posA, 3)); // slot A
  geo.setAttribute('aPosB',    new THREE.BufferAttribute(posB, 3)); // slot B
  geo.setAttribute('aColA',    new THREE.BufferAttribute(colA, 3));
  geo.setAttribute('aColB',    new THREE.BufferAttribute(colB, 3));
  geo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aRand',    new THREE.BufferAttribute(rands, 1));

  const uniforms = {
    uMix:           { value: 0 },
    uTime:          { value: 0 },
    uRotX:          { value: 0 },
    uRotY:          { value: 0 },
    uWobbleA:       { value: burst.wobble }, uWobbleB: { value: field0.wobble },
    uStructA:       { value: burst.struct }, uStructB: { value: field0.struct },
    uBoostA:        { value: burst.boost },  uBoostB:  { value: field0.boost },
    uColorShift:    { value: new THREE.Color(0x000000) },
    uShiftStrength: { value: 0.0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      attribute vec3 aPosB;
      attribute vec3 aColA;
      attribute vec3 aColB;
      attribute float size;
      attribute float aRand;
      uniform float uMix, uTime, uRotX, uRotY;
      uniform float uWobbleA, uWobbleB, uStructA, uStructB, uBoostA, uBoostB;
      varying vec3 vColor;
      varying float vBoost;
      varying float vFade;

      void main() {
        // Per-particle staggered morph progress
        float m = smoothstep(0.0, 1.0, clamp((uMix - aRand * ${STAGGER}) / ${1 - STAGGER}, 0.0, 1.0));
        vec3 p = mix(position, aPosB, m);

        // Pseudo-curl wobble — heavy in the free field, a shimmer in shapes
        float wob = mix(uWobbleA, uWobbleB, m);
        float t = uTime;
        float r = aRand * 6.2831;
        p.x += wob * (sin(t * 0.32 + r)       * 2.2 + sin(t * 0.07 + r * 3.1) * 4.0);
        p.y += wob * (cos(t * 0.27 + r * 1.7) * 2.2 + sin(t * 0.05 + r * 2.3) * 4.0);
        p.z += wob * (sin(t * 0.23 + r * 2.9) * 2.0);
        p   += 0.14 * vec3(sin(t * 1.3 + r * 7.0), cos(t * 1.1 + r * 5.0), sin(t * 0.9 + r * 3.0));

        // Scroll rotation, damped almost to zero while a shape is held so the
        // padlock/globe/etc stay upright
        float gm = smoothstep(0.0, 1.0, uMix);
        float damp = mix(1.0, 0.05, mix(uStructA, uStructB, gm));
        float ay = uRotY * damp;
        float ax = uRotX * damp;
        p.xz = mat2(cos(ay), -sin(ay), sin(ay), cos(ay)) * p.xz;
        p.yz = mat2(cos(ax), -sin(ax), sin(ax), cos(ax)) * p.yz;

        vColor = mix(aColA, aColB, m);
        vBoost = mix(uBoostA, uBoostB, m);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        // Cap sprite size and fade particles near the camera — close passes
        // stay immersive but never white out the foreground
        gl_PointSize = min(size * (300.0 / -mv.z), 6.0);
        vFade = smoothstep(2.5, 9.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColorShift;
      uniform float uShiftStrength;
      varying vec3 vColor;
      varying float vBoost;
      varying float vFade;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float alpha = (1.0 - smoothstep(0.2, 0.5, d)) * vFade;
        if (alpha < 0.003) discard;
        vec3 col = mix(vColor, uColorShift, uShiftStrength * 0.18) * vBoost;
        gl_FragColor = vec4(col, alpha * 0.85);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.Points(geo, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  let currentShape = 'field'; // slot B at startup

  // Bake the on-screen blend into slot A (replicating the shader's per-particle
  // stagger) so a new morph can start from exactly what's visible — even when
  // it interrupts a morph in flight.
  function bake() {
    const m = uniforms.uMix.value;
    const A = geo.attributes.position.array;
    const B = geo.attributes.aPosB.array;
    const CA = geo.attributes.aColA.array;
    const CB = geo.attributes.aColB.array;
    for (let i = 0; i < COUNT; i++) {
      let mi = Math.min(Math.max((m - rands[i] * STAGGER) / (1 - STAGGER), 0), 1);
      mi = mi * mi * (3 - 2 * mi); // smoothstep
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k;
        A[j]  += (B[j]  - A[j])  * mi;
        CA[j] += (CB[j] - CA[j]) * mi;
      }
    }
    const gm = m * m * (3 - 2 * m);
    uniforms.uWobbleA.value = uniforms.uWobbleA.value + (uniforms.uWobbleB.value - uniforms.uWobbleA.value) * gm;
    uniforms.uStructA.value = uniforms.uStructA.value + (uniforms.uStructB.value - uniforms.uStructA.value) * gm;
    uniforms.uBoostA.value  = uniforms.uBoostA.value  + (uniforms.uBoostB.value  - uniforms.uBoostA.value)  * gm;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aColA.needsUpdate = true;
    uniforms.uMix.value = 0;
  }

  function setShape(name, duration = 1.8) {
    if (!GENERATORS[name] || name === currentShape) return;
    currentShape = name;
    const shape = getShape(name);

    gsap.killTweensOf(uniforms.uMix);
    bake();

    geo.attributes.aPosB.array.set(shape.pos);
    geo.attributes.aColB.array.set(shape.col);
    geo.attributes.aPosB.needsUpdate = true;
    geo.attributes.aColB.needsUpdate = true;
    uniforms.uWobbleB.value = shape.wobble;
    uniforms.uStructB.value = shape.struct;
    uniforms.uBoostB.value  = shape.boost;

    gsap.to(uniforms.uMix, { value: 1, duration, ease: 'power2.inOut' });
  }

  // Intro: distant burst settles calmly into the drift field; the DOM hero
  // text reveals while the particles are still gliding in
  function intro(onReveal) {
    gsap.to(uniforms.uMix, { value: 1, duration: 2.4, ease: 'power2.out' });
    gsap.delayedCall(0.9, onReveal);
  }

  const rot = { x: 0, y: 0 }; // scroll-driven rotation proxy (tweened by main)

  function tick(elapsed) {
    uniforms.uTime.value = elapsed;
    uniforms.uRotX.value = elapsed * 0.003 + rot.x;
    uniforms.uRotY.value = rot.y;
  }

  // Pre-generate every section shape during idle time after the intro, so the
  // first scroll past each section never pays the generation cost mid-frame.
  function prewarm() {
    const names = ['field', 'padlock', 'network', 'rings', 'shield', 'globe'];
    let i = 0;
    const step = () => {
      if (i >= names.length) return;
      getShape(names[i++]);
      setTimeout(step, 150);
    };
    setTimeout(step, 2500);
  }
  prewarm();

  return { mesh, material, rot, setShape, intro, tick };
}
