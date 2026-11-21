// DOOMSDAY - render.js
// Scena 3D, camera, renderer, luci. Atmosfera apocalittica: cielo polveroso grigio-arancione,
// nebbia, sole basso e caldo con ombre lunghe.
// Le luci puntiformi dei fuochi sono in shared/map.js (MAP.lights) e le crea arena.js.
// Dipendenze: Three.js (globale), CONFIG (config.js)

let scene, camera, renderer;
let playerYaw, cameraLookAt;
// Arma in prima persona: scena e camera a parte, disegnate SOPRA la scena principale.
// Cosi' l'arma non entra nei muri e non si deforma con lo zoom della mira.
let viewScene, viewCamera;
let sunLight = null;

// Qualita' grafica, scelta nelle Impostazioni (salvata nel browser). Niente cambi automatici:
// la risoluzione resta quella scelta, cosi' l'immagine non diventa mai sfocata da sola.
//   maxRatio/scale = risoluzione rispetto allo schermo · shadow = dettaglio delle ombre · soft = ombre morbide
const QUALITY = {
  alta:  { label: 'Alta',  maxRatio: 2,   scale: 1,   shadow: 2048, soft: true },
  media: { label: 'Media', maxRatio: 1.5, scale: 1,   shadow: 1024, soft: false },
  bassa: { label: 'Bassa', maxRatio: 1,   scale: 0.8, shadow: 512,  soft: false },
};
let qualityName = 'alta';
try {
  const q = localStorage.getItem('doomsday_quality');
  if (q && QUALITY[q]) qualityName = q;
} catch (e) { /* localStorage non disponibile: qualita' alta */ }

function qualityRatio() {
  const q = QUALITY[qualityName];
  return Math.min(window.devicePixelRatio || 1, q.maxRatio) * q.scale;
}
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
  renderer.setPixelRatio(qualityRatio());           // risoluzione piena dello schermo (qualita' alta)
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = QUALITY[qualityName].soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  // 7. Luci
  // Luce ambiente calda e polverosa + cielo/terra: niente zone completamente nere
  scene.add(new THREE.AmbientLight(0x9a9d7b, 0.76));
  scene.add(new THREE.HemisphereLight(0xaeb798, 0x292c25, 0.62));

  // Sole basso arancione: ombre lunghe
  sunLight = new THREE.DirectionalLight(0xb8b99a, 1.05);
  sunLight.position.set(-35, 18, 22);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(QUALITY[qualityName].shadow, QUALITY[qualityName].shadow);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 140;
  sunLight.shadow.camera.left = -45;
  sunLight.shadow.camera.right = 45;
  sunLight.shadow.camera.top = 45;
  sunLight.shadow.camera.bottom = -45;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  buildToxicClouds();
  initViewModelScene();

  window.addEventListener('resize', onWindowResize);
}

function initViewModelScene() {
  viewScene = new THREE.Scene();
  viewCamera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.01, 10);
  viewScene.add(new THREE.AmbientLight(0x9a9d7b, 0.8));
  viewScene.add(new THREE.HemisphereLight(0xaeb798, 0x292c25, 0.65));
  const key = new THREE.DirectionalLight(0xd7ddcf, 0.95);
  key.position.set(1.5, 2, 1);
  viewScene.add(key);
}

// Disegna la scena e, se richiesto, l'arma in prima persona sopra (con la profondita' azzerata)
function draw(withViewModel) {
  renderer.render(scene, camera);
  if (!withViewModel || !viewScene) return;
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(viewScene, viewCamera);
  renderer.autoClear = true;
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

// Cambia la qualita' (dalle Impostazioni): risoluzione, dettaglio e morbidezza delle ombre
function setQuality(name) {
  if (!QUALITY[name]) return;
  const before = QUALITY[qualityName];
  qualityName = name;
  try { localStorage.setItem('doomsday_quality', name); } catch (e) { /* pazienza */ }
  if (!renderer) return;
  const q = QUALITY[name];
  renderer.setPixelRatio(qualityRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (sunLight && sunLight.shadow.mapSize.x !== q.shadow) {
    sunLight.shadow.mapSize.set(q.shadow, q.shadow);
    if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
  }
  if (before.soft !== q.soft) {
    renderer.shadowMap.type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    [scene, viewScene].forEach((sc) => sc && sc.traverse((o) => {      // i materiali si ricompilano
      if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; });
    }));
  }
}

function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (viewCamera) {
    viewCamera.aspect = camera.aspect;
    viewCamera.updateProjectionMatrix();
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
}

const Render = {
  initRender,
  scene: () => scene,
  camera: () => camera,
  renderer: () => renderer,
  yawPivot: () => playerYaw,
  pitchPivot: () => cameraLookAt,
  viewScene: () => viewScene,
  draw: draw,
  setQuality: setQuality,
  getQuality: () => qualityName,
  qualityNames: () => Object.keys(QUALITY).map((k) => ({ id: k, label: QUALITY[k].label })),
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
