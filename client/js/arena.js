// DOOMSDAY - arena.js
// Disegna la mappa Three.js leggendo SOLO i dati di shared/map.js (MAP).
// Cosi' cio' che vedi e' esattamente cio' contro cui collidi.
// Per le prestazioni: tutte le scatole vengono UNITE in poche mesh (colore per vertice),
// quindi 200 scatole costano pochissime chiamate di disegno.
// Formato scatola: { x, z (CENTRO), y (BASE), w, h, d, color, solid, emissive }
// Dipendenze: Three.js, CONFIG, Render, MAP (caricato prima in index.html)

const ARENA = CONFIG.ARENA;

const arenaObjects = [];   // tutto cio' che aggiungiamo alla scena (per poterlo rimuovere)

function addArenaObject(obj) {
  Render.addToScene(obj);
  arenaObjects.push(obj);
}

// Unisce molte scatole in UNA sola mesh. Il colore di ogni scatola va nei vertici.
function mergeBoxes(list, material, castShadow) {
  if (!list.length) return null;

  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  const color = new THREE.Color();
  let offset = 0;

  list.forEach((b) => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d);
    g.translate(b.x, (b.y || 0) + b.h / 2, b.z);   // y = BASE, quindi centro = base + h/2

    const pos = g.attributes.position.array;
    const nor = g.attributes.normal.array;
    const idx = g.index.array;
    color.setHex(b.color !== undefined ? b.color : 0x555555);

    for (let i = 0; i < pos.length; i += 3) {
      positions.push(pos[i], pos[i + 1], pos[i + 2]);
      normals.push(nor[i], nor[i + 1], nor[i + 2]);
      colors.push(color.r, color.g, color.b);
    }
    for (let i = 0; i < idx.length; i++) indices.push(idx[i] + offset);
    offset += pos.length / 3;
    g.dispose();
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);

  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

function buildGround(size) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size + 4, size + 4),
    new THREE.MeshStandardMaterial({ color: ARENA.FLOOR_COLOR, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  addArenaObject(ground);
}

// Muri perimetrali: solo se MAP.boxes non li contiene gia' (solo scatole solide contano)
function perimeterWalls(size) {
  const hasWalls = MAP.boxes.some(
    (b) => b.solid !== false && (b.w >= size * 0.9 || b.d >= size * 0.9)
  );
  if (hasWalls) return [];

  const H = ARENA.WALL_HEIGHT;
  const off = size / 2 + 0.5;
  const c = ARENA.WALL_COLOR;
  return [
    { x: 0, z: -off, w: size + 2, d: 1, h: H, y: 0, color: c },   // nord
    { x: 0, z: off, w: size + 2, d: 1, h: H, y: 0, color: c },    // sud
    { x: -off, z: 0, w: 1, d: size + 2, h: H, y: 0, color: c },   // ovest
    { x: off, z: 0, w: 1, d: size + 2, h: H, y: 0, color: c },    // est
  ];
}

function buildLights() {
  (MAP.lights || []).forEach((l) => {
    const light = new THREE.PointLight(l.color, l.intensity, l.distance);
    light.position.set(l.x, l.y, l.z);
    addArenaObject(light);
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

  const solid = MAP.boxes.filter((b) => b.solid !== false && !b.emissive).concat(perimeterWalls(size));
  const decor = MAP.boxes.filter((b) => b.solid === false && !b.emissive);
  const glow = MAP.boxes.filter((b) => b.emissive);

  const litMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.9, metalness: 0.0, flatShading: true,
  });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });   // fuoco: sempre acceso

  [
    mergeBoxes(solid, litMat, true),      // blocchi solidi: proiettano ombra
    mergeBoxes(decor, litMat, false),     // strade, lampioni: solo decorazione
    mergeBoxes(glow, glowMat, false),     // fiamme
  ].forEach((mesh) => { if (mesh) addArenaObject(mesh); });

  buildLights();
  console.log('Arena costruita da MAP:', MAP.boxes.length, 'scatole');
}

function clearArena() {
  arenaObjects.forEach((obj) => {
    if (obj.parent) obj.parent.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
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
