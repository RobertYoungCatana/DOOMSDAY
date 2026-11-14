// DOOMSDAY - arena.js
// Disegna la mappa Three.js leggendo SOLO i dati di shared/map.js (MAP).
// Supporta scatole solid, decorazioni, luci e pickup 3D.
// Dipendenze: Three.js, CONFIG, Render, MAP

const ARENA = CONFIG.ARENA;

const arenaObjects = [];
const pickupMeshes = [];
const materialCache = {};

function getMaterial(color) {
  if (!materialCache[color]) {
    materialCache[color] = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true,
    });
  }
  return materialCache[color];
}

function addArenaObject(obj) {
  Render.addToScene(obj);
  arenaObjects.push(obj);
}

function buildGround(size) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size + 4, size + 4),
    new THREE.MeshStandardMaterial({ color: ARENA.FLOOR_COLOR, roughness: 0.95, flatShading: true })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  addArenaObject(ground);
}

function buildBoxes() {
  MAP.boxes.forEach((b) => {
    const color = b.color !== undefined ? b.color : 0x555555;
    const mat = b.emissive
      ? new THREE.MeshBasicMaterial({ color: color })
      : getMaterial(color);

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
    mesh.position.set(b.x, (b.y || 0) + b.h / 2, b.z);
    mesh.castShadow = b.solid !== false && !b.emissive;
    mesh.receiveShadow = true;
    addArenaObject(mesh);
  });
}

function buildLights() {
  if (!MAP.lights) return;
  MAP.lights.forEach((l) => {
    const light = new THREE.PointLight(l.color, l.intensity, l.distance);
    light.position.set(l.x, l.y, l.z);
    addArenaObject(light);
  });
}

function buildPickups() {
  if (!MAP.pickups) return;
  MAP.pickups.forEach((pk, index) => {
    const geo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const color = pk.type === 'health' ? 0x4CAF50 : 0xffcc00;
    const mat = new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.3, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pk.x, (pk.y || 0) + 0.4, pk.z);
    mesh.castShadow = true;
    mesh.userData = { type: pk.type, index: index, taken: false };
    addArenaObject(mesh);
    pickupMeshes.push(mesh);
  });
}

function buildArena() {
  clearArena();

  if (typeof MAP === 'undefined' || !MAP.boxes) {
    console.error('ERRORE: MAP.boxes non trovato.');
    return;
  }

  const size = MAP.SIZE || ARENA.SIZE;
  buildGround(size);
  buildBoxes();
  buildLights();
  buildPickups();
  console.log('Arena costruita da MAP:', MAP.boxes.length, 'scatole,', pickupMeshes.length, 'pickup');
}

function clearArena() {
  arenaObjects.forEach((obj) => {
    if (obj.parent) obj.parent.remove(obj);
  });
  arenaObjects.length = 0;
  pickupMeshes.length = 0;
}

const Arena = {
  build: buildArena,
  clear: clearArena,
  getAll: () => arenaObjects,
  getPickups: () => pickupMeshes,
};

if (typeof window !== 'undefined') {
  window.Arena = Arena;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Arena;
}
