// === Three.js Particle Background (Viridis) ===

const VIRIDIS = [
  0x440154, 0x482878, 0x3e4989, 0x31688e, 0x26828e,
  0x1f9e89, 0x35b779, 0x6ece58, 0xb5de2b, 0xfde725
];

const SPECIES_DATA = [
  { name: 'axolotl', emoji: '\u{1F98E}' },
  { name: 'blob', emoji: '\u{1FAE0}' },
  { name: 'cactus', emoji: '\u{1F335}' },
  { name: 'capybara', emoji: '\u{1F9AB}' },
  { name: 'cat', emoji: '\u{1F431}' },
  { name: 'chonk', emoji: '\u{1F99B}' },
  { name: 'dragon', emoji: '\u{1F409}' },
  { name: 'duck', emoji: '\u{1F986}' },
  { name: 'ghost', emoji: '\u{1F47B}' },
  { name: 'goose', emoji: '\u{1FABF}' },
  { name: 'mushroom', emoji: '\u{1F344}' },
  { name: 'octopus', emoji: '\u{1F419}' },
  { name: 'owl', emoji: '\u{1F989}', current: true },
  { name: 'penguin', emoji: '\u{1F427}' },
  { name: 'rabbit', emoji: '\u{1F407}' },
  { name: 'robot', emoji: '\u{1F916}' },
  { name: 'snail', emoji: '\u{1F40C}' },
  { name: 'turtle', emoji: '\u{1F422}' }
];

// --- Three.js Scene ---
let scene, camera, renderer, particles, mouseX = 0, mouseY = 0;

function initThree() {
  const canvas = document.getElementById('bg-canvas');
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 50;

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x08080f, 1);

  createParticles();

  window.addEventListener('resize', onResize);
  document.addEventListener('mousemove', onMouseMove);
  animate();
}

function createParticles() {
  const count = 2000;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const velocities = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;

    // Spread particles in a large volume
    positions[i3] = (Math.random() - 0.5) * 120;
    positions[i3 + 1] = (Math.random() - 0.5) * 120;
    positions[i3 + 2] = (Math.random() - 0.5) * 80;

    // Viridis color
    const colorIdx = Math.floor(Math.random() * VIRIDIS.length);
    const color = new THREE.Color(VIRIDIS[colorIdx]);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;

    sizes[i] = Math.random() * 1.5 + 0.3;

    // Slow drift velocities
    velocities[i3] = (Math.random() - 0.5) * 0.01;
    velocities[i3 + 1] = (Math.random() - 0.5) * 0.01;
    velocities[i3 + 2] = (Math.random() - 0.5) * 0.005;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    size: 0.4,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });

  particles = new THREE.Points(geometry, material);
  particles._velocities = velocities;
  scene.add(particles);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseMove(e) {
  mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
  mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
}

function animate() {
  requestAnimationFrame(animate);

  const positions = particles.geometry.attributes.position.array;
  const velocities = particles._velocities;
  const time = Date.now() * 0.0001;

  // Animate particles
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] += velocities[i];
    positions[i + 1] += velocities[i + 1];
    positions[i + 2] += velocities[i + 2];

    // Wrap around
    if (positions[i] > 60) positions[i] = -60;
    if (positions[i] < -60) positions[i] = 60;
    if (positions[i + 1] > 60) positions[i + 1] = -60;
    if (positions[i + 1] < -60) positions[i + 1] = 60;
  }

  particles.geometry.attributes.position.needsUpdate = true;

  // Gentle rotation based on mouse
  particles.rotation.x += (mouseY * 0.02 - particles.rotation.x) * 0.02;
  particles.rotation.y += (mouseX * 0.02 - particles.rotation.y) * 0.02;

  // Scroll-based camera shift
  const scrollY = window.scrollY;
  camera.position.y = -scrollY * 0.01;
  particles.material.opacity = Math.max(0.15, 0.6 - scrollY * 0.0003);

  renderer.render(scene, camera);
}

// --- Species Grid ---
function populateSpecies() {
  const grid = document.getElementById('species-grid');
  if (!grid) return;

  SPECIES_DATA.forEach(sp => {
    const card = document.createElement('div');
    card.className = 'species-card' + (sp.current ? ' current' : '');

    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'species-emoji';
    emojiSpan.textContent = sp.emoji;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'species-name';
    nameSpan.textContent = sp.name;

    card.appendChild(emojiSpan);
    card.appendChild(nameSpan);
    grid.appendChild(card);
  });
}

// Harness flow diagram: pre-rendered SVG at docs/harness-flow.svg
// Source: harness-flow.md  Re-render: mmdc -i /tmp/harness.mmd -o docs/harness-flow.svg --theme dark --backgroundColor transparent

// --- Tab Switching ---
const VALID_TABS = ['buddy', 'advisor', 'subsystems', 'lineage', 'harness'];

function switchTab(tabId) {
  if (!VALID_TABS.includes(tabId)) tabId = 'buddy';

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.id === 'tab-' + tabId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // Show/hide panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    const isActive = panel.id === 'panel-' + tabId;
    if (isActive) {
      panel.removeAttribute('hidden');
      const panelEl = document.getElementById('panel-' + tabId);
      if (panelEl) panelEl.focus();
      // Trigger visible class on all animatable elements in the revealed panel
      // so IntersectionObserver doesn't miss them (they were hidden when registered)
      setTimeout(() => {
        panel.querySelectorAll(
          '.section > h2, .section > .section-intro, .detail-card, .species-card, ' +
          '.trigger-card, .security-card, .finding-card, .strategy-card, .command-row, ' +
          '.question-item, .stat-card, .rarity-bar, .trait-group, .timing-card, ' +
          '.owl-profile, .nav-card, .timeline-node, .arch-compare-panel, .gate-check'
        ).forEach((el, idx) => {
          setTimeout(() => el.classList.add('visible'), idx * 30);
        });
      }, 50);
    } else {
      panel.setAttribute('hidden', '');
    }
  });

  // Update hash without triggering scroll
  if (history.replaceState) {
    history.replaceState(null, '', '#' + tabId);
  }

  // Scroll to the top of the newly-activated tab's content so the user
  // sees the tab bar + the panel's first section ("overview") on switch.
  // Using the sticky tab-nav-wrapper as the anchor keeps it visible at the top.
  const anchor = document.querySelector('.tab-nav-wrapper');
  if (anchor) {
    anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// --- Hash Routing ---
function initHashRouting() {
  function applyHash() {
    const hash = window.location.hash.replace('#', '');
    if (VALID_TABS.includes(hash)) {
      switchTab(hash);
    }
  }

  window.addEventListener('hashchange', applyHash);
  applyHash();
}

// --- Tab Keyboard Navigation ---
function initTabKeyboard() {
  const tablist = document.querySelector('[role="tablist"]');
  if (!tablist) return;
  tablist.addEventListener('keydown', (e) => {
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex === -1) return;
    let newIndex = currentIndex;
    if (e.key === 'ArrowRight') newIndex = (currentIndex + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') newIndex = 0;
    else if (e.key === 'End') newIndex = tabs.length - 1;
    else return;
    e.preventDefault();
    tabs[newIndex].focus();
    const tabId = tabs[newIndex].id.replace('tab-', '');
    switchTab(tabId);
  });
}

// --- Scroll Animations ---
function initScrollAnimations() {
  const SELECTOR =
    '.section > h2, .section > .section-intro, .detail-card, .species-card, ' +
    '.trigger-card, .security-card, .finding-card, .strategy-card, .command-row, ' +
    '.question-item, .stat-card, .rarity-bar, .trait-group, .timing-card, ' +
    '.owl-profile, .nav-card, .timeline-node, .arch-compare-panel, .gate-check';

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        // Stagger siblings
        const parent = entry.target.parentElement;
        const siblings = Array.from(parent.children).filter(el => el.matches(SELECTOR));
        const sibIdx = siblings.indexOf(entry.target);
        const delay = sibIdx >= 0 ? sibIdx * 60 : 0;

        setTimeout(() => {
          entry.target.classList.add('visible');
        }, delay);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });

  // Observe elements in visible panels only (buddy panel is default)
  document.querySelectorAll('#panel-buddy ' + SELECTOR + ', #hero ' + SELECTOR + ', #stats ' + SELECTOR + ', #timeline ' + SELECTOR + ', #subsystem-nav ' + SELECTOR).forEach(el => observer.observe(el));
}

// --- Radar Charts ---
function drawRadarCharts() {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const LABELS = ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK'];
  const VIEW_W = 200;
  const VIEW_H = 180;
  const CX = 100;
  const CY = 95;
  const R = 70;
  const RINGS = [0.33, 0.66, 1.0];

  // Pentagon vertex angles: top (DEBUGGING) = -90deg, clockwise
  function vertexPoint(index, radius) {
    const angle = (Math.PI * 2 * index) / 5 - Math.PI / 2;
    return {
      x: CX + radius * Math.cos(angle),
      y: CY + radius * Math.sin(angle)
    };
  }

  function pointsString(pts) {
    return pts.map(p => p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(' ');
  }

  const containers = document.querySelectorAll('#multi-buddy .radar-chart');
  containers.forEach(container => {
    const isMage = container.closest('.owl-profile.mage') !== null;
    const rawStats = (container.getAttribute('data-stats') || '').split(',').map(Number);

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + VIEW_W + ' ' + VIEW_H);
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('class', 'radar-svg');

    // Draw concentric pentagon guide rings
    RINGS.forEach(fraction => {
      const pts = Array.from({ length: 5 }, (_, i) => vertexPoint(i, R * fraction));
      const polygon = document.createElementNS(SVG_NS, 'polygon');
      polygon.setAttribute('points', pointsString(pts));
      polygon.setAttribute('fill', 'none');
      polygon.setAttribute('stroke', 'rgba(255,255,255,0.08)');
      polygon.setAttribute('stroke-width', '1');
      svg.appendChild(polygon);
    });

    // Draw axis lines from center to each vertex
    for (let i = 0; i < 5; i++) {
      const pt = vertexPoint(i, R);
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', CX.toString());
      line.setAttribute('y1', CY.toString());
      line.setAttribute('x2', pt.x.toFixed(2));
      line.setAttribute('y2', pt.y.toFixed(2));
      line.setAttribute('stroke', 'rgba(255,255,255,0.08)');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
    }

    // Draw stat polygon
    const statPts = rawStats.map((val, i) => vertexPoint(i, R * (Math.min(Math.max(val, 0), 100) / 100)));
    const statPolygon = document.createElementNS(SVG_NS, 'polygon');
    statPolygon.setAttribute('points', pointsString(statPts));
    if (isMage) {
      statPolygon.setAttribute('fill', 'rgba(49,104,142,0.25)');
      statPolygon.setAttribute('stroke', 'var(--v3)');
    } else {
      statPolygon.setAttribute('fill', 'rgba(53,183,121,0.25)');
      statPolygon.setAttribute('stroke', 'var(--v6)');
    }
    statPolygon.setAttribute('stroke-width', '1.5');
    svg.appendChild(statPolygon);

    // Draw vertex labels
    LABELS.forEach((label, i) => {
      const pt = vertexPoint(i, R + 14);
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', pt.x.toFixed(2));
      text.setAttribute('y', pt.y.toFixed(2));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', 'var(--text-dim)');
      text.setAttribute('font-size', '9');
      text.setAttribute('font-family', "'SF Mono', 'Fira Code', monospace");
      text.setAttribute('text-transform', 'uppercase');
      text.textContent = label;
      svg.appendChild(text);
    });

    container.appendChild(svg);
  });
}

// --- Nav Card & Tab Button Click Handlers ---
function initClickHandlers() {
  // Nav cards (hero section)
  document.querySelectorAll('.nav-card[href]').forEach(card => {
    card.addEventListener('click', e => {
      e.preventDefault();
      const tab = card.getAttribute('href').replace('#', '');
      switchTab(tab);
    });
  });

  // Tab buttons
  document.querySelectorAll('.tab-btn[id^="tab-"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.id.replace('tab-', '');
      switchTab(tab);
    });
  });
}

// --- Timeline Layout ---
// All rows flow strictly left-to-right in version order. When a row wraps,
// a right-angle meander path carries the visual continuity from the end of
// the previous row, across the container, into the start of the next row.
function layoutTimelineSnake() {
  const timeline = document.querySelector('.timeline');
  if (!timeline) return;
  const children = Array.from(timeline.children);
  if (!children.length) return;

  // Force layout so offsetTop is accurate after any prior resize
  void timeline.offsetHeight;

  // Group siblings by offsetTop. Tolerance must exceed the connector's
  // margin-top (9px) since connectors sit slightly lower than nodes on
  // the same row. Row gap is much larger (~32px+), so 20px is safe.
  const rows = [];
  let currentTop = null;
  let currentRow = null;
  children.forEach(el => {
    const top = el.offsetTop;
    if (currentTop === null || Math.abs(top - currentTop) > 20) {
      currentRow = [];
      rows.push(currentRow);
      currentTop = top;
    }
    currentRow.push(el);
  });

  // Draw SVG meander paths between row wraps.
  drawTimelineBridges(timeline, rows);

  // Notify any listeners (e.g. Shingle flight path) to recompute
  timeline.dispatchEvent(new CustomEvent('snake-relayout', { bubbles: true }));
}

// Draws a rectangular meander path across each row break. Each path starts
// above the last node of row N, drops into the row-gap, traverses left to
// the start of row N+1, and rises above the first node of row N+1. Together
// with the normal inline connectors this forms a continuous L→R spine.
function drawTimelineBridges(timeline, rows) {
  const container = timeline.parentElement;
  if (!container) return;

  // Remove any prior bridge overlay before redrawing
  const existing = container.querySelector('.timeline-bridges');
  if (existing) existing.remove();

  if (!rows || rows.length < 2) return;

  const children = Array.from(timeline.children);
  const containerRect = container.getBoundingClientRect();

  // For each row transition, locate the nearest nodes (skipping connector
  // stubs) on both sides so the meander anchors on real release markers.
  const bridges = [];
  for (let r = 0; r < rows.length - 1; r++) {
    const rowEndEl = rows[r][rows[r].length - 1];
    const rowStartEl = rows[r + 1][0];
    const endDomIdx = children.indexOf(rowEndEl);
    const startDomIdx = children.indexOf(rowStartEl);
    let fromIdx = endDomIdx;
    while (fromIdx >= 0 && !children[fromIdx].classList.contains('timeline-node')) {
      fromIdx--;
    }
    let toIdx = startDomIdx;
    while (toIdx < children.length && !children[toIdx].classList.contains('timeline-node')) {
      toIdx++;
    }
    if (fromIdx < 0 || toIdx >= children.length) continue;
    bridges.push({ from: children[fromIdx], to: children[toIdx] });
  }
  if (!bridges.length) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('timeline-bridges');
  svg.setAttribute('aria-hidden', 'true');

  // Shared Viridis gradient matching the inline .timeline-connector colour.
  const defs = document.createElementNS(SVG_NS, 'defs');
  const grad = document.createElementNS(SVG_NS, 'linearGradient');
  grad.setAttribute('id', 'timeline-bridge-grad');
  grad.setAttribute('x1', '0%');
  grad.setAttribute('y1', '0%');
  grad.setAttribute('x2', '0%');
  grad.setAttribute('y2', '100%');
  const stop1 = document.createElementNS(SVG_NS, 'stop');
  stop1.setAttribute('offset', '0%');
  stop1.setAttribute('stop-color', '#3e4989');
  const stop2 = document.createElementNS(SVG_NS, 'stop');
  stop2.setAttribute('offset', '100%');
  stop2.setAttribute('stop-color', '#b5de2b');
  grad.appendChild(stop1);
  grad.appendChild(stop2);
  defs.appendChild(grad);
  svg.appendChild(defs);

  bridges.forEach(({ from, to }) => {
    const fr = from.getBoundingClientRect();
    const tr = to.getBoundingClientRect();
    // Start and end at each node's centre column, dot-height, so the
    // meander reads as centred on the node.
    const dotY = 7;
    const fx = fr.left - containerRect.left + fr.width / 2;
    const fy = fr.top - containerRect.top + dotY;
    const tx = tr.left - containerRect.left + tr.width / 2;
    const ty = tr.top - containerRect.top + dotY;

    // True visual extents of the two rows. Row-2's caption-top sits
    // ABOVE the node's bounding box (position: absolute), so toTop alone
    // would understate the row's visible top edge. Reading the caption's
    // own rect gives the real row-2 top, so the rail can be computed as
    // the exact midpoint of the visible inter-row zone.
    const fromBottom = fr.bottom - containerRect.top;
    const captionTopEl = to.querySelector('.timeline-caption-top');
    const row2TopEdge = captionTopEl
      ? captionTopEl.getBoundingClientRect().top - containerRect.top
      : tr.top - containerRect.top;
    const rail = (fromBottom + row2TopEdge) / 2;

    // Five-move meander: node-1 → right → down → left → down → right → node-2.
    //   right  : jog out of node-1 centre at dot-y
    //   down   : drop to the rail
    //   left   : long rail traversal right→left
    //   down   : drop to node-2's dot-y
    //   right  : jog into node-2 centre
    // Four inner corners. Rail is the exact midpoint of the visible
    // inter-row zone (row-1 bottom ↔ row-2 caption-top top).
    const jog = 18;
    const fxJog = fx + jog; // right of node-1 centre
    const txJog = tx - jog; // left of node-2 centre
    const d =
      `M ${fx} ${fy} ` +
      `L ${fxJog} ${fy} ` +
      `L ${fxJog} ${rail} ` +
      `L ${txJog} ${rail} ` +
      `L ${txJog} ${ty} ` +
      `L ${tx} ${ty}`;

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', 'url(#timeline-bridge-grad)');
    path.setAttribute('stroke-linejoin', 'miter');
    svg.appendChild(path);
  });

  container.appendChild(svg);
}

// Debounced resize handler
let snakeResizeTimer = null;
function onSnakeResize() {
  clearTimeout(snakeResizeTimer);
  snakeResizeTimer = setTimeout(layoutTimelineSnake, 120);
}

// --- Shingle Flight ---
// A small owl traces the snake path once when the timeline first enters
// the viewport. Flight respects reduced-motion: user preference wins.
function initShingleFlight() {
  const timeline = document.querySelector('.timeline');
  if (!timeline) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const container = timeline.parentElement; // .timeline-container
  if (!container) return;
  container.style.position = container.style.position || 'relative';

  const flyer = document.createElement('div');
  flyer.className = 'shingle-flyer';
  flyer.textContent = '\u{1F989}'; // owl emoji
  flyer.setAttribute('aria-hidden', 'true');
  container.appendChild(flyer);

  let hasFlown = false;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !hasFlown) {
        hasFlown = true;
        // Give snake layout a tick to settle
        requestAnimationFrame(() => flyShingle(flyer, timeline, container));
        observer.disconnect();
      }
    });
  }, { threshold: 0.3 });
  observer.observe(timeline);
}

function flyShingle(flyer, timeline, container) {
  // Trace only the published (non-skipped) spine so the flight stays snappy
  // and the perched stops correspond to real release events.
  const nodes = Array.from(timeline.querySelectorAll('.timeline-node:not(.skipped)'));
  if (nodes.length < 2) return;

  // getBoundingClientRect reflects post-reorder visual positions, so
  // iterating nodes in DOM order automatically traces the snake path.
  const containerRect = container.getBoundingClientRect();
  const points = nodes.map(n => {
    const r = n.getBoundingClientRect();
    return {
      x: r.left - containerRect.left + r.width / 2,
      y: r.top - containerRect.top - 42 // soar above the version/date caption
    };
  });

  flyer.style.opacity = '1';
  let segmentIdx = 0;
  let segmentStart = performance.now();
  const perSegment = 500;
  let prevX = points[0].x;

  function step(now) {
    if (segmentIdx >= points.length - 1) {
      // Fade out gently at the last node
      flyer.style.transition = 'opacity 0.8s ease';
      flyer.style.opacity = '0';
      setTimeout(() => flyer.remove(), 1000);
      return;
    }
    const a = points[segmentIdx];
    const b = points[segmentIdx + 1];
    const t = Math.min(1, (now - segmentStart) / perSegment);
    // Ease-in-out for a more avian arc
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const x = a.x + (b.x - a.x) * e;
    const y = a.y + (b.y - a.y) * e;
    // Flip horizontally when flying right→left so Shingle faces travel direction
    const facing = b.x < prevX - 1 ? -1 : 1;
    flyer.style.transform = `translate(${x - 12}px, ${y - 18}px) scaleX(${facing})`;
    prevX = x;
    if (t >= 1) {
      segmentIdx++;
      segmentStart = now;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// --- Counts SSOT Walker ---
// Replaces textContent of every [data-count="path.to.key"] with the
// resolved value from window.VIZ_COUNTS (loaded by counts.js).
// If a path is missing, the HTML fallback text stays in place and a
// console warning is emitted — catches drift between counts.js and HTML.
function applyCounts() {
  const counts = window.VIZ_COUNTS;
  if (!counts) {
    console.warn('[counts] VIZ_COUNTS not loaded — using HTML fallbacks');
    return;
  }
  const resolve = path => path.split('.').reduce(
    (obj, key) => (obj == null ? undefined : obj[key]),
    counts
  );
  let applied = 0, missing = 0;
  document.querySelectorAll('[data-count]').forEach(node => {
    const path = node.getAttribute('data-count');
    const value = resolve(path);
    if (value === undefined) {
      console.warn(`[counts] unknown path "${path}" — keeping HTML fallback`);
      missing++;
      return;
    }
    node.textContent = String(value);
    applied++;
  });
  console.debug(`[counts] applied ${applied} values, ${missing} missing`);
}

// --- Harness Fullscreen Dialog ---
function initHarnessFullscreen() {
  const dialog = document.getElementById('harness-dialog');
  const openBtn = document.getElementById('harness-fs-open');
  const closeBtn = document.getElementById('harness-fs-close');
  const img = document.getElementById('harness-img');
  if (!dialog) return;
  function open() { dialog.showModal(); }
  function close() { dialog.close(); }
  if (openBtn) openBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (img) img.addEventListener('click', open);
  dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  applyCounts();
  initThree();
  populateSpecies();
  drawRadarCharts();
  initScrollAnimations();
  initHashRouting();
  initClickHandlers();
  initTabKeyboard();
  layoutTimelineSnake();
  window.addEventListener('resize', onSnakeResize);
  initShingleFlight();
  initHarnessFullscreen();
});
