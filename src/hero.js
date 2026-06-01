// ── HERO PARTICLE TEXT CONVERGENCE ───────────────────────────────────────────
// Samples letter pixels from a hidden canvas, animates Three.js particles
// into formation, holds, then scatters them back out.

export function initHeroParticles(particleGeo, velocities, onComplete) {
  const PARTICLE_COUNT = particleGeo.attributes.position.array.length / 3;
  const positions      = particleGeo.attributes.position.array;
  const colors         = particleGeo.attributes.aColor.array;

  // ── Sample letter positions from hidden canvas ─────────────────────────────
  const offscreen = document.createElement('canvas');
  offscreen.width  = 900;
  offscreen.height = 260;
  const ctx = offscreen.getContext('2d');

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, offscreen.width, offscreen.height);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 130px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GRIFFIN', offscreen.width / 2, offscreen.height / 2 - 58);
  ctx.fillText('DUTKA',   offscreen.width / 2, offscreen.height / 2 + 58);

  const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
  const data      = imageData.data;

  // Collect lit pixel positions, sampling every 5th pixel for density control
  const letterPixels = [];
  for (let y = 0; y < offscreen.height; y += 5) {
    for (let x = 0; x < offscreen.width; x += 5) {
      const idx = (y * offscreen.width + x) * 4;
      if (data[idx] > 128) {
        // Map pixel → world coords (centered around 0,0)
        const wx = ((x / offscreen.width)  - 0.5) * 80;
        const wy = -((y / offscreen.height) - 0.5) * 25;
        letterPixels.push({ x: wx, y: wy });
      }
    }
  }

  // Shuffle so we pick a random spread of particles
  for (let i = letterPixels.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letterPixels[i], letterPixels[j]] = [letterPixels[j], letterPixels[i]];
  }

  const FORMATION_COUNT = Math.min(letterPixels.length, 520);

  // Store original positions for scatter-back
  const origins = [];
  for (let i = 0; i < FORMATION_COUNT; i++) {
    origins.push({
      x: positions[i * 3],
      y: positions[i * 3 + 1],
      z: positions[i * 3 + 2],
    });
  }

  // ── Animation state ────────────────────────────────────────────────────────
  let phase      = 'converge'; // 'converge' | 'hold' | 'scatter'
  let phaseTimer = 0;
  const CONVERGE_MS = 1800;
  const HOLD_MS     = 700;
  const SCATTER_MS  = 1200;

  const startTime = performance.now();
  let holdStart   = 0;
  let scatterStart = 0;

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInCubic(t)  { return t * t * t; }

  // Phase colors: cyan while in formation
  const cyanR = 0, cyanG = 0.83, cyanB = 1.0;

  // ── Per-frame update (called from main animate loop) ───────────────────────
  function tick(now) {
    if (phase === 'done') return false; // signal: stop calling

    if (phase === 'converge') {
      const t = Math.min((now - startTime) / CONVERGE_MS, 1);
      const e = easeOutCubic(t);

      for (let i = 0; i < FORMATION_COUNT; i++) {
        const target = letterPixels[i];
        positions[i * 3]     = origins[i].x + (target.x - origins[i].x) * e;
        positions[i * 3 + 1] = origins[i].y + (target.y - origins[i].y) * e;
        positions[i * 3 + 2] = origins[i].z * (1 - e * 0.95); // pull toward z=0

        // Shift color toward cyan as they converge
        colors[i * 3]     = cyanR * e + colors[i * 3]     * (1 - e);
        colors[i * 3 + 1] = cyanG * e + colors[i * 3 + 1] * (1 - e);
        colors[i * 3 + 2] = cyanB * e + colors[i * 3 + 2] * (1 - e);
      }

      if (t >= 1) {
        phase = 'hold';
        holdStart = now;
      }

    } else if (phase === 'hold') {
      if (now - holdStart >= HOLD_MS) {
        phase = 'scatter';
        scatterStart = now;
        // Trigger DOM text reveal
        onComplete();
      }

    } else if (phase === 'scatter') {
      const t = Math.min((now - scatterStart) / SCATTER_MS, 1);
      const e = easeInCubic(t);

      // Generate new random scatter targets (far out)
      if (!this._scatterTargets) {
        this._scatterTargets = [];
        for (let i = 0; i < FORMATION_COUNT; i++) {
          this._scatterTargets.push({
            x: (Math.random() - 0.5) * 200,
            y: (Math.random() - 0.5) * 200,
            z: (Math.random() - 0.5) * 120 - 30,
          });
        }
      }

      for (let i = 0; i < FORMATION_COUNT; i++) {
        const from = letterPixels[i];
        const to   = this._scatterTargets[i];
        positions[i * 3]     = from.x + (to.x - from.x) * e;
        positions[i * 3 + 1] = from.y + (to.y - from.y) * e;
        positions[i * 3 + 2] = (to.z * e);

        // Fade back to dim blue
        colors[i * 3]     = cyanR * (1 - e) + 0.10 * e;
        colors[i * 3 + 1] = cyanG * (1 - e) + 0.16 * e;
        colors[i * 3 + 2] = cyanB * (1 - e) + 0.23 * e;
      }

      if (t >= 1) {
        // Restore normal velocities for these particles
        for (let i = 0; i < FORMATION_COUNT; i++) {
          origins[i].x = positions[i * 3];
          origins[i].y = positions[i * 3 + 1];
          origins[i].z = positions[i * 3 + 2];
        }
        phase = 'done';
      }
    }

    particleGeo.attributes.position.needsUpdate = true;
    particleGeo.attributes.aColor.needsUpdate    = true;
    return true; // still active
  }

  return { tick: tick.bind({ _scatterTargets: null }) };
}
