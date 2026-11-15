// DOOMSDAY - render.js
// Scena 3D, camera, renderer, luci. Atmosfera apocalittica: cielo polveroso grigio-arancione,
// nebbia, sole basso e caldo con ombre lunghe.
// Le luci puntiformi dei fuochi sono in shared/map.js (MAP.lights) e le crea arena.js.
// Dipendenze: Three.js (globale), CONFIG (config.js)

let scene, camera, renderer;
let playerYaw, cameraLookAt;

const SKY_COLOR = 0x7b5f4c;   // polvere e fumo

function initRender(container) {
  // 1. Scena: cielo e nebbia dello stesso colore, cosi' l'orizzonte sparisce nella polvere
  scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(SKY_COLOR, 25, 95);

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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // 7. Luci
  // Luce ambiente calda e polverosa + cielo/terra: niente zone completamente nere
  scene.add(new THREE.AmbientLight(0x8a7060, 0.7));
  scene.add(new THREE.HemisphereLight(0xc99a72, 0x2b2420, 0.45));

  // Sole basso arancione: ombre lunghe
  const sunLight = new THREE.DirectionalLight(0xffa35c, 1.05);
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

  window.addEventListener('resize', onWindowResize);
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
  getSize: () => ({ w: window.innerWidth, h: window.innerHeight }),
};

if (typeof window !== 'undefined') {
  window.Render = Render;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Render;
}
