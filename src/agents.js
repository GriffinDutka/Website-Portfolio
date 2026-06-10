// ── AGENT OPERATIONS CENTER ───────────────────────────────────────────────────
// Scroll-pinned SOC pipeline simulation. Scrolling drives a synthetic DLP
// incident packet through five agent nodes; each stage types sanitized agent
// output into the terminal, ending with the generated report artifact.
//
// Desktop: ScrollTrigger pins the stage and scroll position scrubs progress.
// Mobile / reduced-motion: no pin — the sequence auto-plays once when the
// section scrolls into view.

const gsap = window.gsap;
const ST   = window.ScrollTrigger;

const STAGES = [
  {
    label: 'ALERT INGEST',
    lines: [
      { lvl: 'ALERT', msg: 'dlp.sensor — exfil signature matched' },
      { lvl: 'INFO',  msg: 'incident DLP-2026-0609 opened · severity: HIGH' },
      { lvl: 'INFO',  msg: 'payload: 412 files → personal cloud drive' },
    ],
  },
  {
    label: 'TRIAGE AGENT',
    lines: [
      { lvl: 'AGENT', msg: 'agent.triage engaged — incident context loaded' },
      { lvl: 'WARN',  msg: 'user risk profile: HRUM watchlist · score 87/100' },
      { lvl: 'AGENT', msg: 'verdict: ESCALATE → full activity review' },
    ],
  },
  {
    label: 'ACTIVITY REVIEW',
    lines: [
      { lvl: 'AGENT', msg: 'agent.overwatch — pulling 24h user activity via UAM footage' },
      { lvl: 'WARN',  msg: '3 anomalous sessions · USB + personal gmail flagged' },
      { lvl: 'AGENT', msg: 'evidence package compiled → 14 artifacts' },
    ],
  },
  {
    label: 'LOG & TIMELINE',
    lines: [
      { lvl: 'AGENT', msg: 'agent.sift — querying SIEM auth + endpoint logs' },
      { lvl: 'AGENT', msg: 'emails + footage + log data → timeline agent' },
      { lvl: 'INFO',  msg: 'full timeline report built · intent confirmed @ 13:58' },
    ],
  },
  {
    label: 'REPORT GEN',
    lines: [
      { lvl: 'AGENT', msg: 'agent.scribe — drafting executive report' },
      { lvl: 'INFO',  msg: 'sections: summary · evidence · risk · next actions' },
      { lvl: 'CRIT',  msg: 'report ready in 9:47 · human corrections: 0' },
    ],
  },
];

// Stage i activates when overall progress crosses THRESHOLDS[i]
const THRESHOLDS    = [0.04, 0.24, 0.44, 0.62, 0.80];
const REPORT_AT     = 0.88;
const PACKET_START  = THRESHOLDS[0];
const PACKET_END    = THRESHOLDS[4];

let nodes, packet, fill, termBody, report;
let currentStage = -1;
let typeTimers   = [];

function clearTypeTimers() {
  typeTimers.forEach(t => clearInterval(t));
  typeTimers = [];
}

function lineHTML(line, cls = '') {
  return `<span class="alog-level ${line.lvl}">${line.lvl}</span>` +
         `<span class="alog-msg ${cls}">${line.msg}</span>`;
}

// Render terminal so it always reflects exactly the stages <= idx.
// Earlier stages render instantly; the newest stage types out.
function renderTerminal(idx, typeNewest) {
  clearTypeTimers();
  termBody.innerHTML = '';
  if (idx < 0) return;

  for (let s = 0; s <= idx; s++) {
    const header = document.createElement('div');
    header.className = 'alog-stage-header';
    header.textContent = `── ${STAGES[s].label} ──`;
    termBody.appendChild(header);

    STAGES[s].lines.forEach(line => {
      const div = document.createElement('div');
      div.className = 'alog-entry';
      const isNewest = typeNewest && s === idx;
      if (isNewest) {
        div.innerHTML = lineHTML(line, 'typing');
        div.style.visibility = 'hidden';
      } else {
        div.innerHTML = lineHTML(line);
      }
      termBody.appendChild(div);
    });
  }

  if (typeNewest) {
    // Reveal newest stage's lines one by one with a per-line typewriter
    const hidden = [...termBody.querySelectorAll('.alog-entry')]
      .filter(d => d.style.visibility === 'hidden');
    hidden.forEach((div, i) => {
      const msgEl = div.querySelector('.alog-msg');
      const full  = msgEl.textContent;
      const start = setTimeout(() => {
        div.style.visibility = 'visible';
        msgEl.textContent = '';
        let ch = 0;
        const t = setInterval(() => {
          ch += 2;
          msgEl.textContent = full.slice(0, ch);
          if (ch >= full.length) { msgEl.textContent = full; clearInterval(t); }
        }, 14);
        typeTimers.push(t);
      }, i * 220);
      typeTimers.push(start);
    });
  }

  termBody.scrollTop = termBody.scrollHeight;
}

function setStage(idx) {
  if (idx === currentStage) return;
  const advancing = idx > currentStage;
  currentStage = idx;

  nodes.forEach((node, i) => {
    node.classList.toggle('active', i === idx);
    node.classList.toggle('done',   i <  idx);
  });

  renderTerminal(idx, advancing);
}

function update(progress) {
  // Packet position along the track (node centers sit at 10%..90%)
  const p = Math.max(0, Math.min(1, (progress - PACKET_START) / (PACKET_END - PACKET_START)));
  const leftPct = 10 + p * 80;
  packet.style.left = leftPct + '%';
  fill.style.width  = leftPct + '%';
  packet.classList.toggle('visible', progress > 0.01 && progress < 0.97);

  // Stage activation
  let idx = -1;
  for (let i = 0; i < THRESHOLDS.length; i++) {
    if (progress >= THRESHOLDS[i]) idx = i;
  }
  setStage(idx);

  // Report artifact
  report.classList.toggle('visible', progress >= REPORT_AT);
}

export function initAgentOps() {
  const stage = document.getElementById('agent-stage');
  if (!stage) return;

  nodes    = [...stage.querySelectorAll('.agent-node')];
  packet   = document.getElementById('pipeline-packet');
  fill     = document.getElementById('pipeline-fill');
  termBody = document.getElementById('agent-terminal-body');
  report   = document.getElementById('agent-report');

  const isMobile  = window.matchMedia('(max-width: 900px)').matches;
  const reduced   = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (isMobile || reduced) {
    // Auto-play once when visible — no pin, no scrub
    const obs = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return;
      obs.disconnect();
      const state = { p: 0 };
      gsap.to(state, {
        p: 1,
        duration: reduced ? 0.01 : 9,
        ease: 'none',
        onUpdate: () => update(state.p),
      });
    }, { threshold: 0.35 });
    obs.observe(stage);
    return;
  }

  ST.create({
    trigger: stage,
    start: 'top top',
    end: '+=260%',
    pin: true,
    anticipatePin: 1,
    onUpdate: self => update(self.progress),
  });
}
