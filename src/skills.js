// ── SKILLS NODE GRAPH — SVG implementation ────────────────────────────────────
// Replaces the Canvas 2D version which caused hard freezes on Retina displays
// due to shadowBlur forcing a full software-rasterized blit every frame.
// SVG is hardware-accelerated, resolution-independent, and needs zero RAF loop.

const NODES = [
  { name: 'CyberHaven',      cat: 'DLP & Monitoring',   desc: 'Primary DLP platform — built custom skill prompts for real-time activity user reviews and reviewing policies',                                                    color: '#00d4ff' },
  { name: 'Teramind',        cat: 'DLP & Monitoring',   desc: 'Built AI activity review producing user timelines surrounding suspicious/malicious events; user activity monitoring for insider threat detection and behavioral analysis', color: '#00d4ff' },
  { name: 'Abnormal',        cat: 'DLP & Monitoring',   desc: 'AI-driven email security — deployed phishing campaigns and built email compromise detection rules',                                                                color: '#00d4ff' },
  { name: 'Datadog',         cat: 'SIEM & Detection',   desc: 'Built detection monitors for anomalous user behavior and activity; automated updating reference tables via Torq SOAR automation + S3 integration',                color: '#7c3aed' },
  { name: 'CrowdStrike',     cat: 'DLP & Monitoring',   desc: 'Endpoint threat detection integrated into daily DLP triage workflow',                                                                                             color: '#00d4ff' },
  { name: 'Absolute',        cat: 'Endpoint & MDM',     desc: 'Architected Dead Man Switch — firmware-level freeze with embedded offline timer to ensure device lockdown post-termination covering 4,000+ devices',             color: '#f59e0b' },
  { name: 'JumpCloud',       cat: 'Endpoint & MDM',     desc: 'Built JC user device lifecycle management using Tray.io and asset tagging to accurately tag devices and reduce seats',                                           color: '#f59e0b' },
  { name: 'NinjaOne',        cat: 'Endpoint & MDM',     desc: 'MDM layer in Dead Man Switch — credential clearing on 3–5 day device inactivity',                                                                               color: '#f59e0b' },
  { name: 'ServiceNow',      cat: 'Endpoint & MDM',     desc: 'Security request intake standardization; assisted in SNOW org deployment',                                                                                       color: '#f59e0b' },
  { name: 'Carbon Black',    cat: 'Endpoint & MDM',     desc: 'Endpoint detection at Exelon — optimized policies to reduce false positives across 10,000+ endpoints',                                                          color: '#f59e0b' },
  { name: 'Torq',            cat: 'Automation & Cloud', desc: 'Automated full HRUM lifecycle — replaced manual spreadsheet tracking with 100% accuracy workflow with automated triaging',                                       color: '#22c55e' },
  { name: 'AWS S3',          cat: 'Automation & Cloud', desc: 'Storage backend for HRUM automation pipeline via Torq and Datadog',                                                                                             color: '#22c55e' },
  { name: 'PowerShell',      cat: 'Automation & Cloud', desc: 'Custom Windows discovery scripts deployed fleet-wide to surface 80,000+ GB of stale data risk; subsequent deletion script removes stale data on cadence',       color: '#22c55e' },
  { name: 'Claude',          cat: 'AI & Automation',    desc: 'Built end-to-end DLP report generation — 200+ reports at 0% failure, <10 min vs. 90 min before; built DLP agentics to review and surface potentially malicious behaviors', color: '#a78bfa' },
  { name: 'Gemini',          cat: 'AI & Automation',    desc: 'DLP-specific prompts for real-time CyberHaven user reviews; Datadog investigation skill prompts with self-improving prompt',                                     color: '#a78bfa' },
  { name: 'CyberArk',        cat: 'Identity & Access',  desc: 'Privileged access management at both Beyond Finance and Exelon; integrated into daily triage workflow',                                                          color: '#ef4444' },
  { name: 'Aruba ClearPass', cat: 'Identity & Access',  desc: 'Identity-based network access control at Exelon — NERC CIP compliance',                                                                                         color: '#ef4444' },
  { name: 'Splunk',          cat: 'SIEM & Detection',   desc: 'Developed SPL queries and crafted stakeholder dashboards for real-time endpoint activity at Exelon',                                                             color: '#7c3aed' },
  { name: 'Google Vault',    cat: 'E-Discovery & Data', desc: 'Data custodian for legal and HR — e-discovery exports for investigations and compliance',                                                                        color: '#0ea5e9' },
  { name: 'Looker',          cat: 'E-Discovery & Data', desc: 'Analytics and reporting layer for compliance data and e-discovery workflows',                                                                                    color: '#0ea5e9' },
  { name: 'Logikull',        cat: 'E-Discovery & Data', desc: 'Data custodian for legal and HR — e-discovery exports for investigations and compliance',                                                                        color: '#0ea5e9' },
  { name: 'Onna',            cat: 'E-Discovery & Data', desc: 'Data custodian for legal and HR — e-discovery exports for investigations and compliance',                                                                        color: '#0ea5e9' },
];

const EDGES = [
  [0,1],[0,4],[0,13],[0,3],
  [5,6],[5,7],[5,8],
  [6,7],
  [10,3],[10,11],
  [13,14],[13,0],
  [15,16],
  [3,17],
  [18,19],[18,20],[18,21],
  [4,15],
];

// Legacy exports — main.js calls these
export function prepareSkillsGraph() {}
export function startSkillsDraw() { _buildSVG(); }
export function initSkillsGraph() { _buildSVG(); }

let _built = false;

function _buildSVG() {
  if (_built) return;
  _built = true;

  const wrap    = document.getElementById('skills-canvas-wrap');
  const tooltip = document.getElementById('node-tooltip');

  // Remove the old canvas if present, insert SVG
  const oldCanvas = document.getElementById('skills-canvas');
  if (oldCanvas) oldCanvas.remove();

  const NS  = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.id = 'skills-svg';
  svg.setAttribute('width',  '100%');
  svg.setAttribute('height', '100%');
  svg.style.cssText = 'position:absolute;top:0;left:0;overflow:visible;';
  wrap.style.position = 'relative';
  wrap.appendChild(svg);

  // ── Layout ──────────────────────────────────────────────────────────────────
  let W = wrap.clientWidth  || 900;
  let H = wrap.clientHeight || 560;

  const nodes = NODES.map((n, i) => {
    const angle = (i / NODES.length) * Math.PI * 2;
    const r = Math.min(W, H) * 0.32 + Math.random() * 80;
    return { ...n, x: W / 2 + Math.cos(angle) * r, y: H / 2 + Math.sin(angle) * r, vx: 0, vy: 0 };
  });

  // Fast force layout — runs once, synchronously, takes <2ms for 22 nodes
  for (let iter = 0; iter < 80; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
        const d  = Math.sqrt(dx * dx + dy * dy) || 1;
        const f  = Math.min(3600 / (d * d), 80); // cap force to prevent explosion
        nodes[i].vx -= (dx / d) * f; nodes[i].vy -= (dy / d) * f;
        nodes[j].vx += (dx / d) * f; nodes[j].vy += (dy / d) * f;
      }
    }
    EDGES.forEach(([a, b]) => {
      const dx = nodes[b].x - nodes[a].x, dy = nodes[b].y - nodes[a].y;
      const d  = Math.sqrt(dx * dx + dy * dy) || 1;
      const f  = (d - 120) * 0.025;
      nodes[a].vx += (dx / d) * f; nodes[a].vy += (dy / d) * f;
      nodes[b].vx -= (dx / d) * f; nodes[b].vy -= (dy / d) * f;
    });
    nodes.forEach(n => {
      n.vx += (W / 2 - n.x) * 0.0012;
      n.vy += (H / 2 - n.y) * 0.0012;
      n.x  += n.vx * 0.45; n.y += n.vy * 0.45;
      n.vx *= 0.55; n.vy *= 0.55;
      n.x = Math.max(60, Math.min(W - 60, n.x));
      n.y = Math.max(40, Math.min(H - 40, n.y));
    });
  }

  // ── SVG edges ───────────────────────────────────────────────────────────────
  const edgeGroup = document.createElementNS(NS, 'g');
  edgeGroup.id = 'sg-edges';
  svg.appendChild(edgeGroup);

  const edgeEls = EDGES.map(([ai, bi]) => {
    const line = document.createElementNS(NS, 'line');
    const a = nodes[ai], b = nodes[bi];
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
    line.setAttribute('stroke', 'rgba(0,212,255,0.08)');
    line.setAttribute('stroke-width', '0.8');
    edgeGroup.appendChild(line);
    return { el: line, ai, bi };
  });

  // ── SVG nodes ───────────────────────────────────────────────────────────────
  const nodeGroup = document.createElementNS(NS, 'g');
  nodeGroup.id = 'sg-nodes';
  svg.appendChild(nodeGroup);

  let activeNode = null;

  const nodeEls = nodes.map((n, i) => {
    const g = document.createElementNS(NS, 'g');
    g.style.cursor = 'pointer';

    // Glow circle (hidden by default, shown on hover via CSS class)
    const glow = document.createElementNS(NS, 'circle');
    glow.setAttribute('r', '22');
    glow.setAttribute('fill', n.color + '22');
    glow.setAttribute('class', 'sg-glow');

    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('r', '7');
    circle.setAttribute('fill', n.color + '55');
    circle.setAttribute('stroke', n.color);
    circle.setAttribute('stroke-width', '0.8');
    circle.setAttribute('class', 'sg-node-circle');

    const label = document.createElementNS(NS, 'text');
    label.textContent = n.name;
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dy', '22');
    label.setAttribute('class', 'sg-label');

    g.appendChild(glow);
    g.appendChild(circle);
    g.appendChild(label);
    g.setAttribute('transform', `translate(${n.x},${n.y})`);
    nodeGroup.appendChild(g);

    // Hover / click
    g.addEventListener('mouseenter', e => {
      if (activeNode !== n) _showTooltip(n, e.clientX, e.clientY);
      _setActive(i, true);
      _highlightEdges(i, true);
    });
    g.addEventListener('mousemove', e => {
      if (activeNode !== n) _showTooltip(n, e.clientX, e.clientY);
    });
    g.addEventListener('mouseleave', () => {
      if (activeNode !== n) { _hideTooltip(); _setActive(i, false); _highlightEdges(i, false); }
    });
    g.addEventListener('click', () => {
      if (activeNode === n) {
        activeNode = null;
        _hideTooltip();
        _setActive(i, false);
        _highlightEdges(i, false);
      } else {
        if (activeNode) {
          const prev = nodes.indexOf(activeNode);
          _setActive(prev, false);
          _highlightEdges(prev, false);
        }
        activeNode = n;
        _setActive(i, true);
        _highlightEdges(i, true);
      }
    });

    return { g, circle, label, glow };
  });

  function _setActive(i, on) {
    const { circle, label, glow } = nodeEls[i];
    const n = nodes[i];
    if (on) {
      circle.setAttribute('r', '10');
      circle.setAttribute('fill', n.color);
      circle.setAttribute('stroke-width', '1.5');
      label.setAttribute('class', 'sg-label sg-label-active');
      glow.setAttribute('opacity', '1');
    } else {
      circle.setAttribute('r', '7');
      circle.setAttribute('fill', n.color + '55');
      circle.setAttribute('stroke-width', '0.8');
      label.setAttribute('class', 'sg-label');
      glow.setAttribute('opacity', '0');
    }
  }

  function _highlightEdges(ni, on) {
    edgeEls.forEach(({ el, ai, bi }) => {
      if (ai === ni || bi === ni) {
        el.setAttribute('stroke', on ? 'rgba(0,212,255,0.30)' : 'rgba(0,212,255,0.08)');
        el.setAttribute('stroke-width', on ? '1.5' : '0.8');
      }
    });
  }

  function _showTooltip(node, cx, cy) {
    tooltip.innerHTML = `
      <div class="tooltip-cat">${node.cat}</div>
      <div class="tooltip-name">${node.name}</div>
      <div class="tooltip-desc">${node.desc}</div>
    `;
    tooltip.classList.remove('hidden');
    const tw = 230, th = tooltip.offsetHeight || 110;
    const wrapRect = wrap.getBoundingClientRect();
    const rx = cx - wrapRect.left, ry = cy - wrapRect.top;
    tooltip.style.left = Math.max(8, Math.min(rx + 14, W - tw - 8)) + 'px';
    tooltip.style.top  = (ry + th + 20 > H) ? Math.max(ry - th - 10, 4) + 'px' : Math.max(ry - 20, 4) + 'px';
  }

  function _hideTooltip() { tooltip.classList.add('hidden'); }

  // Click outside nodes clears active
  svg.addEventListener('click', e => {
    if (e.target === svg) {
      if (activeNode) {
        const i = nodes.indexOf(activeNode);
        _setActive(i, false);
        _highlightEdges(i, false);
        activeNode = null;
        _hideTooltip();
      }
    }
  });

  // ── Resize ──────────────────────────────────────────────────────────────────
  new ResizeObserver(() => {
    W = wrap.clientWidth;
    H = wrap.clientHeight;
  }).observe(wrap);
}
