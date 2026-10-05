// Pipeline walkthrough, copy-email button, and current-section nav state.
// The page is complete without this script: the run renders finished and the
// report filled, so JS only adds stepping and replay on top.

(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Pipeline run ─────────────────────────────────────────────────────────
  const run = document.getElementById('run');
  if (run) {
    const steps  = [...run.querySelectorAll('.step')];
    const fields = [...run.querySelectorAll('.report [data-from]')];
    const replay = document.getElementById('run-replay');
    const last   = steps.length - 1;
    let timer = null;

    function show(idx) {
      steps.forEach((step, i) => {
        step.classList.toggle('is-done', i < idx);
        step.classList.toggle('is-current', i === idx);
        step.classList.toggle('is-pending', i > idx);
        const head = step.querySelector('.step-head');
        head.setAttribute('aria-expanded', String(i <= idx));
        if (i === idx) head.setAttribute('aria-current', 'step');
        else head.removeAttribute('aria-current');
      });
      fields.forEach(f => f.classList.toggle('is-empty', Number(f.dataset.from) > idx));
    }

    function stop() {
      clearInterval(timer);
      timer = null;
      replay.textContent = 'Replay run';
    }

    function play() {
      stop();
      let idx = 0;
      show(idx);
      replay.textContent = 'Stop';
      timer = setInterval(() => {
        idx += 1;
        show(idx);
        if (idx >= last) stop();
      }, reduced ? 900 : 1600);
    }

    steps.forEach((step, i) => {
      step.querySelector('.step-head').addEventListener('click', () => { stop(); show(i); });
    });
    replay.addEventListener('click', () => (timer ? stop() : play()));

    show(last);

    // Play once the first time the run scrolls into view.
    if ('IntersectionObserver' in window && !reduced) {
      const obs = new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting) return;
        obs.disconnect();
        play();
      }, { threshold: 0.45 });
      obs.observe(run);
    }
  }

  // ── Copy email ───────────────────────────────────────────────────────────
  const copyBtn = document.getElementById('copy-email');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const text = copyBtn.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Copied';
      } catch {
        const range = document.createRange();
        range.selectNodeContents(document.getElementById('email-addr'));
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        copyBtn.textContent = 'Selected';
      }
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
    });
  }

  // ── Current section in the top nav ───────────────────────────────────────
  const links = [...document.querySelectorAll('.topnav a[href^="#"]')];
  const targets = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window && targets.length) {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        links.forEach(a => a.toggleAttribute('aria-current', a.getAttribute('href') === '#' + e.target.id));
        links.forEach(a => { if (a.hasAttribute('aria-current')) a.setAttribute('aria-current', 'true'); });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    targets.forEach(t => obs.observe(t));
  }
})();
