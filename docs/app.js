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
    card.innerHTML = `
      <span class="species-emoji">${sp.emoji}</span>
      <span class="species-name">${sp.name}</span>
    `;
    grid.appendChild(card);
  });
}

// --- Scroll Animations ---
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, idx) => {
      if (entry.isIntersecting) {
        // Stagger siblings
        const parent = entry.target.parentElement;
        const siblings = Array.from(parent.children).filter(
          el => el.matches('.detail-card, .species-card, .trigger-card, .security-card, .finding-card, .strategy-card, .command-row, .question-item, .stat-card, .rarity-bar, .trait-group, .timing-card, .owl-profile')
        );
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

  // Observe all animatable elements
  document.querySelectorAll(
    '.section > h2, .section > .section-intro, .detail-card, .species-card, .trigger-card, .security-card, .finding-card, .strategy-card, .command-row, .question-item, .stat-card, .rarity-bar, .trait-group, .timing-card, .owl-profile'
  ).forEach(el => observer.observe(el));
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  initThree();
  populateSpecies();
  initScrollAnimations();
});
