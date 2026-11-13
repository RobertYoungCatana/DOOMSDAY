// DOOMSDAY - render.js
// Scena 3D, camera, renderer, luci.
// Dipendenze: Three.js (globale), CONFIG (config.js)

let scene, camera, renderer;
let playerYaw, cameraLookAt;

function initRender(container) {
  // 1. Scena
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);
  scene.fog = new THREE.Fog(0x1a1a1a, 50, 120);

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

  // 4. Pivot per rotazione verticale (pitch) — evita di guardare sotto terra
  cameraLookAt = new THREE.Group();
  playerYaw.add(cameraLookAt);

  // 5. Camera posizionata all'interno dei pivot
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
  const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xffaa66, 0.8);
  sunLight.position.set(20, 30, 15);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 100;
  sunLight.shadow.camera.left = -60;
  sunLight.shadow.camera.right = 60;
  sunLight.shadow.camera.top = 60;
  sunLight.shadow.camera.bottom = -60;
  scene.add(sunLight);

  const pointLight1 = new THREE.PointLight(0xff6600, 1.5, 30);
  pointLight1.position.set(-10, 5, -10);
  scene.add(pointLight1);

  const pointLight2 = new THREE.PointLight(0xff6600, 1.5, 30);
  pointLight2.position.set(10, 5, 10);
  scene.add(pointLight2);

  // Gestione resize
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