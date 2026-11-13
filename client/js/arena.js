// DOOMSDAY - arena.js
// Disegna la mappa Three.js leggendo SOLO i dati di shared/map.js (MAP).
// Cosi' cio' che vedi e' esattamente cio' contro cui collidi.
// Formato scatola (come in collision.js): { x, z (CENTRO), y (BASE), w, h, d, color, solid }
// Dipendenze: Three.js, CONFIG, Render, MAP (caricato prima in index.html)

const ARENA = CONFIG.ARENA;

const arenaObjects = [];        // tutto cio' che aggiungiamo alla scena
const materialCache = {};       // un materiale per colore (piu' leggero)

function getMaterial(color) {
  if (!materialCache[color]) {
    materialCache[color] = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.9,
      metalness: 0.0,
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
    new THREE.MeshStandardMaterial({ color: ARENA.FLOOR_COLOR, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  addArenaObject(ground);
}

// Muri perimetrali: li crea solo se MAP.boxes non li contiene gia'
function buildPerimeterWalls(size) {
  const hasWalls = MAP.boxes.some((b) => b.w >= size * 0.9 || b.d >= size * 0.9);
  if (hasWalls) return;

  const H = ARENA.WALL_HEIGHT;
  const mat = getMaterial(ARENA.WALL_COLOR);
  const off = size / 2 + 0.5;

  const defs = [
    { w: size + 2, d: 1, x: 0, z: -off },   // nord
    { w: size + 2, d: 1, x: 0, z: off },    // sud
    { w: 1, d: size + 2, x: -off, z: 0 },   // ovest (lungo Z, nessuna rotazione necessaria)
    { w: 1, d: size + 2, x: off, z: 0 },    // est
  ];
  defs.forEach((s) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(s.w, H, s.d), mat);
    wall.position.set(s.x, H / 2, s.z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    addArenaObject(wall);
  });
}

function buildBoxes() {
  MAP.boxes.forEach((b) => {
    const color = b.color !== undefined ? b.color : 0x555555;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), getMaterial(color));
    mesh.position.set(b.x, (b.y || 0) + b.h / 2, b.z);   // y = BASE, quindi centro = base + h/2
    mesh.castShadow = b.solid !== false;
    mesh.receiveShadow = true;
    addArenaObject(mesh);
  });
}

function buildArena() {
  clearArena();

  if (typeof MAP === 'undefined' || !MAP.boxes) {
    console.error('ERRORE: MAP.boxes non trovato. Controlla js/shared/map.js in index.html.');
    return;
  }

  const size = MAP.SIZE || ARENA.SIZE;
  buildGround(size);
  buildPerimeterWalls(size);
  buildBoxes();
  console.log('Arena costruita da MAP:', MAP.boxes.length, 'scatole');
}

function clearArena() {
  arenaObjects.forEach((obj) => {
    if (obj.parent) obj.parent.remove(obj);
  });
  arenaObjects.length = 0;
}

const Arena = {
  build: buildArena,
  clear: clearArena,
  getAll: () => arenaObjects,
};

if (typeof window !== 'undefined') {
  window.Arena = Arena;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Arena;
}