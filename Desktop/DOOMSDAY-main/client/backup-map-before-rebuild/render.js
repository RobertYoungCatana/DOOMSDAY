// DOOMSDAY - render.js
// Scena 3D, camera, renderer, luci. Atmosfera apocalittica: cielo polveroso grigio-arancione,
// nebbia, sole basso e caldo con ombre lunghe.
// Le luci puntiformi dei fuochi sono in shared/map.js (MAP.lights) e le crea arena.js.
// Dipendenze: Three.js (globale), CONFIG (config.js)

let scene, camera, renderer;
let playerYaw, cameraLookAt;
let toxicClouds = [];

const SKY_COLOR = 0x626b58;   // foschia oliva di una citta' segnata dalla guerra

function initRender(container) {
  // 1. Scena: cielo e nebbia dello stesso colore, cosi' l'orizzonte sparisce nella polvere
  scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.FogExp2(SKY_COLOR, 0.0065);

  // 2. Camera
  camera = new THREE.PerspectiveCamera(
    CONFIG.CAMERA.FOV,
    window.innerWidth / window.innerHeight,
    CONFIG.CAMERA.NEAR,
    CONFIG.CAMERA.FAR
  );

  // 3. Pivot per rotazione orizzontale (yaw)
  playerYaw = new THREE.Group();
  playerYaw.position.set(0, CONFIG.CAMERA.HEIGHT, 0);
  scene.add(playerYaw);

  // 4. Pivot per rotazione verticale (pitch)
  cameraLookAt = new THREE.Group();
  playerYaw.add(cameraLookAt);

  // 5. Camera dentro i pivot (la sua posizione locale resta 0,0,0)
  camera.position.set(0, 0, 0);
  cameraLookAt.add(camera);

  // 6. Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // 7. Luci
  // Luce ambiente calda e polverosa + cielo/terra: niente zone completamente nere
  scene.add(new THREE.AmbientLight(0x9a9d7b, 0.76));
  scene.add(new THREE.HemisphereLight(0xaeb798, 0x292c25, 0.62));

  // Sole basso arancione: ombre lunghe
  const sunLight = new THREE.DirectionalLight(0xb8b99a, 1.05);
  sunLight.position.set(-35, 18, 22);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 140;
  sunLight.shadow.camera.left = -45;
  sunLight.shadow.camera.right = 45;
  sunLight.shadow.camera.top = 45;
  sunLight.shadow.camera.bottom = -45;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  buildToxicClouds();

  window.addEventListener('resize', onWindowResize);
}

function buildToxicClouds() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(256, 256);
  // Fractal value noise: strati irregolari al posto dei cerchi procedurali.
  const grids = [16, 8, 4, 2].map((size, octave) => {
    let seed = 9137 + octave * 7919;
    const values = new Float32Array(size * size);
    for (let i = 0; i < values.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; values[i] = seed / 4294967295; }
    return { size, values, weight: [0.48, 0.27, 0.16, 0.09][octave] };
  });
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    let noise = 0;
    grids.forEach((g) => {
      const gx = x / 256 * g.size, gy = y / 256 * g.size;
      const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
      const smoothX = fx * fx * (3 - 2 * fx), smoothY = fy * fy * (3 - 2 * fy);
      const at = (xx, yy) => g.values[(yy % g.size) * g.size + (xx % g.size)];
      const a = at(ix, iy) * (1 - smoothX) + at(ix + 1, iy) * smoothX;
      const b = at(ix, iy + 1) * (1 - smoothX) + at(ix + 1, iy + 1) * smoothX;
      noise += (a * (1 - smoothY) + b * smoothY) * g.weight;
    });
    const density = Math.max(0, Math.min(1, (noise - 0.43) * 2.4));
    const idx = (y * 256 + x) * 4;
    image.data[idx] = 105; image.data[idx + 1] = 151; image.data[idx + 2] = 59;
    image.data[idx + 3] = Math.round(density * 205);
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.34, fog: false });
  for (let i = 0; i < 8; i++) {
    const cloud = new THREE.Sprite(material);
    const angle = i * Math.PI * 2 / 8;
    const radius = 42 + (i % 3) * 8;
    cloud.position.set(Math.cos(angle) * radius, 30 + (i % 4) * 3.2, Math.sin(angle) * radius);
    cloud.userData.baseX = cloud.position.x;
    const size = 20 + (i % 5) * 5;
    cloud.scale.set(size * 1.7, size, 1);
    scene.add(cloud);
    toxicClouds.push(cloud);
  }
}

function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

const Render = {
  initRender,
  scene: () => scene,
  camera: () => camera,
  renderer: () => renderer,
  yawPivot: () => playerYaw,
  pitchPivot: () => cameraLookAt,
  addToScene: (obj) => scene.add(obj),
  removeFromScene: (obj) => scene.remove(obj),
  animateAtmosphere: (time) => toxicClouds.forEach((cloud, i) => {
    cloud.position.x = cloud.userData.baseX + Math.sin(time * 0.025 + i) * 1.1;
    cloud.material.opacity = 0.42 + Math.sin(time * 0.2 + i * 1.7) * 0.045;
  }),
  getSize: () => ({ w: window.innerWidth, h: window.innerHeight }),
};

if (typeof window !== 'undefined') {
  window.Render = Render;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Render;
}
