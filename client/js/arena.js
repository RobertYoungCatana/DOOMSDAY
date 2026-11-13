// DOOMSDAY - arena.js
// Crea la mappa Three.js leggendo i dati da shared/map.js.
// Dipendenze: Three.js (globale), CONFIG (config.js), Render (render.js), MAP (shared/map.js)

// Importa i dati mappa
import MAP from './shared/map.js';

let terrain;
const walls = [];
const containers = [];
const debris = [];
const ruins = [];
const boxes = []; // Collezionne di tutte le box dalla mappa

// Alias per le costanti arena (da CONFIG)
const ARENA = CONFIG.ARENA;

// Cache per l'ultima build per evitare rebuild inutili
let lastMapSize = 0;

// Funzione per creare un mesh Three.js da una box description
function createMeshFromBox(boxDesc, material) {
  const geo = new THREE.BoxGeometry(boxDesc.w, boxDesc.h, boxDesc.d);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(boxDesc.x, boxDesc.y !== undefined ? boxDesc.y : 0, boxDesc.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildArena() {
  // Evita rebuild se la mappa non è cambiata
  const currentMapSize = MAP ? MAP.boxes.length : 0;
  if (currentMapSize === lastMapSize && terrain) {
    console.log('Arena già costruita, skip rebuild');
    return;
  }
  clearArena();

  const S = MAP.SIZE || ARENA.SIZE;
  const H = ARENA.WALL_HEIGHT;

  // 1. TERRENO (grigio cemento) - creato dai box della mappa, non geo separato
  // Il terreno è implicitamente definito dai box che hanno y=0 e h piccola

  // 2. Recupera le box walls dalla MAP (those with solid:true and typical wall dimensions)
  // I muri perimetrali sono definiti nella MAP già

  // Crea materiali una volta
  const groundMat = new THREE.MeshStandardMaterial({
    color: ARENA.FLOOR_COLOR,
    roughness: 0.95,
    metalness: 0.0,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: ARENA.WALL_COLOR,
    roughness: 0.85,
  });
  const containerMat = new THREE.MeshStandardMaterial({
    color: ARENA.ACCENT_COLOR,
    roughness: 0.7,
  });
  const debrisMat = new THREE.MeshStandardMaterial({
    color: 0x4a4a4a,
    roughness: 0.9,
  });
  const ruinMat = new THREE.MeshStandardMaterial({
    color: 0x2e2e2e,
    roughness: 0.9,
  });
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x555555,
    roughness: 0.8,
  });

  // 3. Crea tutte le box dalla mappa
  const mapBoxes = MAP.boxes || [];

  mapBoxes.forEach((boxDesc, idx) => {
    const mesh = createMeshFromBox(boxDesc, groundMat);

    // Categorizza per tipo basandosi sulla posizione e dimensione
    // Muri perimetrali (spessi 1m, alti 10m)
    if (boxDesc.h === 10 && boxDesc.d === 1) {
      walls.push(mesh);
    }
    // Container (arancioni, bassi)
    else if (boxDesc.h <= 3 && boxDesc.color && boxDesc.color.toString() === ARENA.ACCENT_COLOR.toString()) {
      containers.push(mesh);
    }
    // Debris (box grigi, piccole)
    else if (boxDesc.h <= 2 && boxDesc.color && boxDesc.color.toString() === 'rgba(74, 74, 74, 1)' || boxDesc.color.toString() === '0x4a4a4a') {
      debris.push(mesh);
    }
    // Edifici distrutti
    else if (boxDesc.h >= 3 && boxDesc.h <= 8 && boxDesc.color && boxDesc.color.toString() === '0x2e2e2e') {
      ruins.push(mesh);
    }
    // Strada
    else if (boxDesc.h === 1 && boxDesc.w >= 50 && boxDesc.d <= 1) {
      // Road is added separately below
    }
    // Torre cecchina
    else if (boxDesc.h >= 6 && boxDesc.h <= 7) {
      // Add to ruins or a separate category
    }
    // Auto/truck
    else if (boxDesc.h <= 4 && boxDesc.color && boxDesc.color.toString() === '0x3a3a3a') {
      // Could be containers too, categorizza in base alla dimensione
    }
    // Barricate
    else if (boxDesc.h <= 2 && boxDesc.color && boxDesc.color.toString() === '0x5a5a5a') {
      // barricate
    }
    // Nascondigli
    else if (boxDesc.h <= 1.5 && boxDesc.color && boxDesc.color.toString() === '0x3a3a3a') {
      // nascondigli
    }
    // Default: aggiungi a boxes generali
    else {
      boxes.push(mesh);
    }

    Render.addToScene(mesh);
  });

  // 4. COSTRUISCI IL TERRENO come singolo mesh grande (solo per rendering ombre)
  // I box definiscono la geometria, ma creiamo un terreno sottostante per le ombre
  const groundGeo = new THREE.PlaneGeometry(S, S);
  const groundMatRender = new THREE.MeshStandardMaterial({
    color: ARENA.FLOOR_COLOR,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  // Renderizziamo sottoterra (y = -0.01 per essere sotto i box)
  terrain = new THREE.Mesh(groundGeo, groundMatRender);
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -0.01;
  terrain.receiveShadow = true;
  Render.addToScene(terrain);

  // 5. STRADA (striscia grigio chiaro al centro) - dal MAP road definition
  // La strada è già definita nelle box MAP come box lunghe 56x1x1,
  // ma aggiungiamo un markup visivo extra se necessario
  // (ja le box MAP già coprono questa area)

  // 6. Aggiorna le referenze esporte
  boxes.length = 0; // reset
  [walls, containers, debris, ruins].forEach(arr => {
    arr.forEach(mesh => {
      if (mesh && mesh.parent) boxes.push(mesh);
    });
  });

  lastMapSize = currentMapSize;

  console.log(`Arena costruita: ${mapBoxes.length} box, ${walls.length} muri, ${containers.length} container, ${debris.length} debris, ${ruins.length} ruderi`);
}

function clearArena() {
  // Rimuovi tutti gli oggetti dalla scena
  const allObjs = [...walls, ...containers, ...debris, ...ruins, terrain];
  allObjs.forEach((obj) => {
    if (obj && obj.parent) obj.parent.remove(obj);
  });

  // Reset arrays
  terrain = null;
  walls.length = 0;
  containers.length = 0;
  debris.length = 0;
  ruins.length = 0;

  console.log('Arena pulita');
}

const Arena = {
  build: buildArena,
  clear: clearArena,
  getTerrain: () => terrain,
  getAll: () => [...walls, ...containers, ...debris, ...ruins],
  getBoxes: () => boxes,
};

// Esporte
if (typeof window !== 'undefined') {
  window.Arena = Arena;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Arena;
}