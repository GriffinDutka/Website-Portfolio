import * as THREE from 'three';

// ── SCENE OBJECTS ─────────────────────────────────────────────────────────────
// Scroll-triggered 3D accent geometries. Each section gets its own shape
// that fades/scales in, animates while visible, then fades out.

const gsap = window.gsap;
const ST   = window.ScrollTrigger;

let _scene, _clock;
const objects   = [];   // { mesh, tick }
const disposals = [];   // cleanup refs

export function initSceneObjects(scene, clock) {
  _scene = scene;
  _clock = clock;

  makePersistentGlobe();
  makeFloatingCrosses();

  // Wiring per-section objects to ScrollTrigger
  wireSummaryObjects();
  wireExperienceObjects();
  wireStatsObjects();
  wireSkillsObjects();
  wireEducationObjects();
  wireContactObjects();
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function edgeMesh(geometry, color, opacity) {
  const edges = new THREE.EdgesGeometry(geometry);
  const mat   = new THREE.LineBasicMaterial({
    color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  return new THREE.LineSegments(edges, mat);
}

function fadeIn(mesh, duration = 1.2) {
  gsap.killTweensOf(mesh.material);
  gsap.killTweensOf(mesh.scale);
  mesh.material.opacity = 0;
  gsap.to(mesh.material, { opacity: mesh._targetOpacity, duration, ease: 'power2.out' });
  gsap.fromTo(mesh.scale, { x: 0.4, y: 0.4, z: 0.4 }, { x: 1, y: 1, z: 1, duration, ease: 'back.out(1.4)' });
}

function fadeOut(mesh, duration = 0.8) {
  gsap.killTweensOf(mesh.material);
  gsap.killTweensOf(mesh.scale);
  gsap.to(mesh.material, { opacity: 0, duration, ease: 'power2.in' });
  gsap.to(mesh.scale, { x: 0.5, y: 0.5, z: 0.5, duration, ease: 'power2.in' });
}

const _sections = [];

function sectionTrigger(id, onEnter, onLeave) {
  const el = document.getElementById(id);
  if (!el) return;
  const st = ST.create({
    trigger: el,
    start: 'top 70%',
    end:   'bottom 20%',
    onEnter,
    onLeaveBack: onLeave,
    onEnterBack: onEnter,
    onLeave,
  });
  _sections.push({ st, onLeave });
}

// Self-heal: instant scroll jumps (nav dots, anchor links) and ScrollTrigger
// refreshes can strand a fade-in/fade-out race mid-flight, leaving accent
// objects visible in the wrong section. Periodically force objects of any
// inactive section back out. (try/catch: onLeave closures assume build() ran.)
setInterval(() => {
  _sections.forEach(({ st, onLeave }) => {
    if (!st.isActive) { try { onLeave(); } catch (_) { /* not built yet */ } }
  });
}, 2500);

// ── 1. PERSISTENT GLOBE ────────────────────────────────────────────────────────
function makePersistentGlobe() {
  const geo  = new THREE.IcosahedronGeometry(55, 3);
  const mesh = edgeMesh(geo, 0x00d4ff, 0.018);
  mesh._targetOpacity = 0.018;
  mesh.position.set(0, 0, -40);
  _scene.add(mesh);

  objects.push({
    mesh,
    tick: (t) => {
      mesh.rotation.y = t * 0.04;
      mesh.rotation.x = t * 0.015;
    },
  });
}

// ── 2. FLOATING MINI-CROSSES ─────────────────────────────────────────────────
function makeFloatingCrosses() {
  const group = new THREE.Group();
  const mat   = new THREE.LineBasicMaterial({
    color: 0x00d4ff, transparent: true, opacity: 0.12,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  for (let i = 0; i < 22; i++) {
    const s = Math.random() * 1.2 + 0.4;
    const pts1 = [new THREE.Vector3(-s, 0, 0), new THREE.Vector3(s, 0, 0)];
    const pts2 = [new THREE.Vector3(0, -s, 0), new THREE.Vector3(0, s, 0)];
    const g1   = new THREE.BufferGeometry().setFromPoints(pts1);
    const g2   = new THREE.BufferGeometry().setFromPoints(pts2);
    const l1   = new THREE.Line(g1, mat);
    const l2   = new THREE.Line(g2, mat);
    const sub  = new THREE.Group();
    sub.add(l1, l2);
    sub.position.set(
      (Math.random() - 0.5) * 160,
      (Math.random() - 0.5) * 160,
      (Math.random() - 0.5) * 80 - 20
    );
    sub._phase = Math.random() * Math.PI * 2;
    group.add(sub);
  }

  _scene.add(group);
  objects.push({
    mesh: group,
    tick: (t) => {
      group.children.forEach(sub => {
        sub.position.y += Math.sin(t * 0.3 + sub._phase) * 0.008;
        sub.rotation.z  = t * 0.2 + sub._phase;
      });
    },
  });
}

// ── 3. SUMMARY — counter-rotating octahedra ──────────────────────────────────
function wireSummaryObjects() {
  let oct1, oct2;

  function build() {
    if (oct1) return;

    oct1 = edgeMesh(new THREE.OctahedronGeometry(7, 0), 0x00d4ff, 0);
    oct1._targetOpacity = 0.55;
    oct1.position.set(42, 8, 5);

    oct2 = edgeMesh(new THREE.OctahedronGeometry(4.5, 0), 0xf59e0b, 0);
    oct2._targetOpacity = 0.4;
    oct2.position.set(-40, -10, 0);

    _scene.add(oct1, oct2);

    objects.push({
      mesh: oct1,
      tick: (t) => { oct1.rotation.x = t * 0.4; oct1.rotation.y = t * 0.6; },
    });
    objects.push({
      mesh: oct2,
      tick: (t) => { oct2.rotation.x = -t * 0.5; oct2.rotation.z = t * 0.3; },
    });
  }

  sectionTrigger('summary',
    () => { build(); fadeIn(oct1); fadeIn(oct2, 1.6); },
    () => { fadeOut(oct1); fadeOut(oct2, 0.6); }
  );
}

// ── 4. EXPERIENCE — DMS pulse rings (amber) ──────────────────────────────────
function wireExperienceObjects() {
  let rings = [];

  function build() {
    if (rings.length) return;
    const radii  = [10, 15, 21];
    const colors = [0xef4444, 0xf59e0b, 0xfca5a5];

    radii.forEach((r, i) => {
      const geo  = new THREE.TorusGeometry(r, 0.18, 6, 64);
      const mat  = new THREE.MeshBasicMaterial({
        color: colors[i], transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        wireframe: true,
      });
      const ring = new THREE.Mesh(geo, mat);
      ring._targetOpacity  = 0.18 - i * 0.04;
      ring._phase          = i * (Math.PI / 3);
      ring.rotation.x      = Math.PI / 2 + i * 0.3;
      ring.position.set(36, -5 + i * 8, -8);
      _scene.add(ring);
      rings.push(ring);

      objects.push({
        mesh: ring,
        tick: (t) => {
          ring.rotation.z = t * (0.3 - i * 0.08) + ring._phase;
          ring.scale.setScalar(1 + Math.sin(t * 0.8 + ring._phase) * 0.04);
        },
      });
    });
  }

  sectionTrigger('experience',
    () => {
      build();
      rings.forEach((r, i) => {
        gsap.to(r.material, { opacity: r._targetOpacity, duration: 1.2 + i * 0.3, ease: 'power2.out', overwrite: true });
        gsap.fromTo(r.scale, { x: 0.2, y: 0.2, z: 0.2 }, { x: 1, y: 1, z: 1, duration: 1.4 + i * 0.2, ease: 'back.out(1.2)' });
      });
    },
    () => rings.forEach(r => gsap.to(r.material, { opacity: 0, duration: 0.7, ease: 'power2.in', overwrite: true }))
  );
}

// ── 5. STATS — 3D EQ bar visualizer ─────────────────────────────────────────
function wireStatsObjects() {
  let bars = [], group;

  function build() {
    if (bars.length) return;
    group = new THREE.Group();
    group.position.set(-38, 0, 0);
    const BAR_COUNT = 14;
    const spacing   = 2.8;

    for (let i = 0; i < BAR_COUNT; i++) {
      const h   = Math.random() * 8 + 2;
      const geo = new THREE.BoxGeometry(1.6, h, 1.6);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x22c55e, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true,
      });
      const bar   = new THREE.Mesh(geo, mat);
      bar._base   = h;
      bar._phase  = (i / BAR_COUNT) * Math.PI * 2;
      bar.position.set((i - BAR_COUNT / 2) * spacing, 0, 0);
      group.add(bar);
      bars.push(bar);
    }

    _scene.add(group);
    bars.forEach(b => objects.push({
      mesh: b,
      tick: (t) => {
        const h  = b._base * (0.4 + 0.6 * Math.abs(Math.sin(t * 1.1 + b._phase)));
        b.scale.y = h / b._base;
        b.position.y = (h - b._base) / 2;
      },
    }));
  }

  sectionTrigger('stats',
    () => {
      build();
      bars.forEach((b, i) => {
        gsap.to(b.material, { opacity: 0.35, duration: 0.8 + i * 0.05, ease: 'power2.out', delay: i * 0.04, overwrite: true });
      });
    },
    () => bars.forEach(b => gsap.to(b.material, { opacity: 0, duration: 0.5, overwrite: true }))
  );
}

// ── 6. SKILLS — dodecahedron with orbit arc ──────────────────────────────────
function wireSkillsObjects() {
  let dodec, orbit1, orbit2;

  function build() {
    if (dodec) return;

    dodec = edgeMesh(new THREE.DodecahedronGeometry(9, 0), 0xa78bfa, 0);
    dodec._targetOpacity = 0.5;
    dodec.position.set(-40, 5, -2);

    // Two orbit ellipses as torus slices
    const toGeo1 = new THREE.TorusGeometry(14, 0.15, 4, 80);
    const toMat  = new THREE.MeshBasicMaterial({
      color: 0xa78bfa, transparent: true, opacity: 0,
      wireframe: false, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    orbit1 = new THREE.Mesh(toGeo1, toMat.clone());
    orbit1._targetOpacity = 0.22;
    orbit1.rotation.x = Math.PI / 3;
    orbit1.position.copy(dodec.position);

    orbit2 = new THREE.Mesh(new THREE.TorusGeometry(18, 0.1, 4, 80), toMat.clone());
    orbit2._targetOpacity = 0.12;
    orbit2.rotation.x = -Math.PI / 5;
    orbit2.rotation.z = Math.PI / 4;
    orbit2.position.copy(dodec.position);

    _scene.add(dodec, orbit1, orbit2);

    objects.push({ mesh: dodec,  tick: (t) => { dodec.rotation.y = t * 0.35; dodec.rotation.x = t * 0.2; } });
    objects.push({ mesh: orbit1, tick: (t) => { orbit1.rotation.z = t * 0.25; } });
    objects.push({ mesh: orbit2, tick: (t) => { orbit2.rotation.y = -t * 0.18; } });
  }

  sectionTrigger('skills',
    () => {
      build();
      fadeIn(dodec, 1.4);
      gsap.to(orbit1.material, { opacity: orbit1._targetOpacity, duration: 1.8, ease: 'power2.out', overwrite: true });
      gsap.to(orbit2.material, { opacity: orbit2._targetOpacity, duration: 2.2, ease: 'power2.out', overwrite: true });
    },
    () => {
      fadeOut(dodec);
      gsap.to(orbit1.material, { opacity: 0, duration: 0.7, overwrite: true });
      gsap.to(orbit2.material, { opacity: 0, duration: 0.7, overwrite: true });
    }
  );
}

// ── 7. EDUCATION — tetrahedron + slow pulse ───────────────────────────────────
function wireEducationObjects() {
  let tetra, ring;

  function build() {
    if (tetra) return;

    tetra = edgeMesh(new THREE.TetrahedronGeometry(9, 0), 0x00d4ff, 0);
    tetra._targetOpacity = 0.55;
    tetra.position.set(40, 2, -3);

    const rGeo = new THREE.TorusGeometry(13, 0.12, 4, 64);
    const rMat = new THREE.MeshBasicMaterial({
      color: 0x00d4ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    ring = new THREE.Mesh(rGeo, rMat);
    ring._targetOpacity = 0.18;
    ring.rotation.x = Math.PI / 4;
    ring.position.copy(tetra.position);

    _scene.add(tetra, ring);

    objects.push({
      mesh: tetra,
      tick: (t) => {
        tetra.rotation.x = t * 0.3;
        tetra.rotation.z = t * 0.5;
        tetra.scale.setScalar(1 + Math.sin(t * 0.6) * 0.06);
      },
    });
    objects.push({ mesh: ring, tick: (t) => { ring.rotation.z = t * 0.2; } });
  }

  sectionTrigger('education',
    () => {
      build();
      fadeIn(tetra, 1.2);
      gsap.to(ring.material, { opacity: ring._targetOpacity, duration: 1.6, overwrite: true });
    },
    () => {
      fadeOut(tetra);
      gsap.to(ring.material, { opacity: 0, duration: 0.6, overwrite: true });
    }
  );
}

// ── 8. CONTACT — expanding concentric rings ──────────────────────────────────
function wireContactObjects() {
  let rings = [];

  function build() {
    if (rings.length) return;
    [8, 14, 20, 27].forEach((r, i) => {
      const geo  = new THREE.RingGeometry(r - 0.15, r + 0.15, 80);
      const mat  = new THREE.MeshBasicMaterial({
        color: 0x00d4ff, transparent: true, opacity: 0,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const ring = new THREE.Mesh(geo, mat);
      ring._targetOpacity = 0.25 - i * 0.05;
      ring._phase         = i * 0.6;
      ring._fade          = 0;   // tween target — tick owns material.opacity
      ring.position.set(0, 0, -15);
      ring.rotation.x     = -Math.PI / 6;
      _scene.add(ring);
      rings.push(ring);

      objects.push({
        mesh: ring,
        tick: (t) => {
          ring.scale.setScalar(1 + Math.sin(t * 0.5 + ring._phase) * 0.06);
          ring.material.opacity = ring._fade * ring._targetOpacity * (0.7 + 0.3 * Math.sin(t * 0.8 + ring._phase));
        },
      });
    });
  }

  sectionTrigger('contact',
    () => {
      build();
      rings.forEach((r, i) => {
        // Seed opacity above the tick-skip threshold so the fade can restart
        r.material.opacity = Math.max(r.material.opacity, 0.01);
        gsap.to(r, { _fade: 1, duration: 1 + i * 0.3, delay: i * 0.15, ease: 'power2.out', overwrite: true });
      });
    },
    () => rings.forEach(r => gsap.to(r, { _fade: 0, duration: 0.5, overwrite: true }))
  );
}

// ── TICK — called from main render loop ───────────────────────────────────────
export function tickSceneObjects() {
  const t = _clock ? _clock.getElapsedTime() : 0;
  objects.forEach(o => {
    const mat = o.mesh?.material;
    if (mat && mat.opacity < 0.005) return;
    if (o.tick) o.tick(t);
  });
}
