// DOOMSDAY - arena.js
// Disegna la mappa Three.js leggendo SOLO i dati di shared/map.js (MAP).
// Cosi' cio' che vedi e' esattamente cio' contro cui collidi.
//
// Per le prestazioni tutto il paesaggio fisso (scatole di MAP.boxes + forme di MAP.shapes)
// viene UNITO in poche mesh con il colore nei vertici: migliaia di pezzi costano 4-5
// chiamate di disegno. In basso ogni oggetto e' un po' piu' scuro ("ombra di contatto"):
// sembra appoggiato a terra invece che galleggiare.
// Dipendenze: Three.js, CONFIG, Render, MAP (caricato prima in index.html)

const ARENA = CONFIG.ARENA;

const arenaObjects = [];   // tutto cio' che aggiungiamo alla scena (per poterlo rimuovere)
const pickupMeshes = [];   // (non usati: gli oggetti li manda il server)
const smokeMeshes = [];
const flickerLights = [];  // luci dei fuochi che tremolano
let fireMaterial = null;

function addArenaObject(obj) {
  Render.addToScene(obj);
  arenaObjects.push(obj);
}

// ---------------------------------------------------------------
// Accumulatore: tante geometrie -> una mesh (posizioni, normali, colori)
// ---------------------------------------------------------------
function Batch() {
  this.pos = [];
  this.nor = [];
  this.col = [];
}

const tmpColor = new THREE.Color();

// geo: gia' nella posizione finale. ao = { base, height }: piu' scuro vicino alla base
Batch.prototype.add = function (geo, color, ao) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();                 // facce piatte: aspetto low-poly
  const pos = g.attributes.position.array;
  const nor = g.attributes.normal.array;
  tmpColor.setHex(color);
  for (let i = 0; i < pos.length; i += 3) {
    let k = 1;
    if (ao) {
      const t = Math.max(0, Math.min(1, (pos[i + 1] - ao.base) / ao.height));
      k = 0.66 + 0.34 * t;
    }
    this.pos.push(pos[i], pos[i + 1], pos[i + 2]);
    this.nor.push(nor[i], nor[i + 1], nor[i + 2]);
    this.col.push(tmpColor.r * k, tmpColor.g * k, tmpColor.b * k);
  }
  if (g !== geo) g.dispose();
  geo.dispose();
};

Batch.prototype.build = function (material, castShadow) {
  if (!this.pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = !material.isMeshBasicMaterial;
  return mesh;
};

// Scatola di MAP.boxes (centro x,z, base y)
function boxGeometry(b) {
  const g = new THREE.BoxGeometry(b.w, b.h, b.d);
  g.translate(b.x, (b.y || 0) + b.h / 2, b.z);
  return g;
}

// Forma di MAP.shapes (centro x,y,z, rotazione, scala)
const shapeEuler = new THREE.Euler();
const shapeQuat = new THREE.Quaternion();
const shapePos = new THREE.Vector3();
const shapeScale = new THREE.Vector3();
const shapeMatrix = new THREE.Matrix4();

function shapeGeometry(s) {
  let g;
  if (s.t === 'cyl') g = new THREE.CylinderGeometry(s.rt, s.rb !== undefined ? s.rb : s.rt, s.h, s.seg || 8);
  else if (s.t === 'cone') g = new THREE.ConeGeometry(s.r, s.h, s.seg || 6);
  else if (s.t === 'ball') g = new THREE.IcosahedronGeometry(s.r, s.detail || 0);
  else g = new THREE.BoxGeometry(s.w, s.h, s.d);
  shapeEuler.set(s.rx || 0, s.ry || 0, s.rz || 0);
  shapeQuat.setFromEuler(shapeEuler);
  shapePos.set(s.x, s.y, s.z);
  shapeScale.set(s.sx || 1, s.sy || 1, s.sz || 1);
  g.applyMatrix4(shapeMatrix.compose(shapePos, shapeQuat, shapeScale));
  return g;
}

// ---------------------------------------------------------------
// Terreno e asfalto (texture disegnate al volo: niente file)
// ---------------------------------------------------------------
function noiseCanvas(size, base, specks, cracks, seed0) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  let seed = seed0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < specks; i++) {
    const light = rnd() < 0.5;
    ctx.fillStyle = light ? 'rgba(150,148,128,.05)' : 'rgba(6,8,7,.09)';
    ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 3, 1 + rnd() * 2);
  }
  for (let i = 0; i < cracks; i++) {
    let x = rnd() * size, y = rnd() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += (rnd() - 0.5) * 22;
      y += (rnd() - 0.5) * 22;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(10,12,10,.38)';
    ctx.lineWidth = 1 + rnd() * 1.5;
    ctx.stroke();
  }
  return c;
}

function buildGround(size) {
  const tex = new THREE.CanvasTexture(noiseCanvas(256, '#30332e', 2800, 34, 20261117));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(size / 8, size / 8);
  tex.anisotropy = 4;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size + 16, size + 16),
    new THREE.MeshStandardMaterial({ color: ARENA.FLOOR_COLOR, map: tex, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  addArenaObject(ground);
}

// Asfalto: rettangoli di MAP.roads, con le coordinate della texture prese dal mondo
// (cosi' la trama ha la stessa grandezza su tutte le strade)
function buildRoads() {
  if (!MAP.roads || !MAP.roads.length) return;
  const canvas = noiseCanvas(256, '#2a2c29', 3600, 26, 777);
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 6; i++) {                       // toppe di asfalto rifatto
    ctx.fillStyle = 'rgba(58,60,55,.35)';
    ctx.fillRect((i * 97) % 220, (i * 61) % 220, 30 + (i * 13) % 30, 20 + (i * 7) % 26);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  const positions = [];
  const uvs = [];
  MAP.roads.forEach((r) => {
    const quad = [[r.x0, r.z0], [r.x0, r.z1], [r.x1, r.z1], [r.x0, r.z0], [r.x1, r.z1], [r.x1, r.z0]];
    quad.forEach((p) => {
      positions.push(p[0], 0.012, p[1]);
      uvs.push(p[0] / 7, p[1] / 7);
    });
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xbfbfb8, map: tex, roughness: 0.95, metalness: 0 }));
  mesh.receiveShadow = true;
  addArenaObject(mesh);
}

// Muri perimetrali: solo se la mappa non ne ha di suoi
function perimeterWalls(size) {
  if (MAP.noDefaultWalls) return [];
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
  (MAP.lights || []).forEach((l, i) => {
    const light = new THREE.PointLight(l.color, l.intensity, l.distance);
    light.position.set(l.x, l.y, l.z);
    addArenaObject(light);
    if (l.flicker) flickerLights.push({ light: light, base: l.intensity, phase: i * 1.7 });
  });
}

function buildSmoke() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 5, 64, 64, 62);
  g.addColorStop(0, 'rgba(38,39,35,.48)');
  g.addColorStop(.38, 'rgba(44,45,40,.32)');
  g.addColorStop(1, 'rgba(36,37,34,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: .7 });
  const spots = MAP.smoke && MAP.smoke.length ? MAP.smoke : [{ x: -8, y: 4.8, z: -2 }, { x: 12, y: 5.8, z: 3 }];
  spots.forEach((p, i) => {
    for (let k = 0; k < 2; k++) {                     // due sbuffi per colonna, uno sopra l'altro
      const puff = new THREE.Sprite(mat);
      puff.position.set(p.x + k * 0.6, p.y + k * 2.6, p.z - k * 0.4);
      puff.scale.set(5 + k * 2, 7 + k * 2.5, 1);
      puff.userData.baseY = puff.position.y;
      puff.userData.phase = i * 1.8 + k;
      addArenaObject(puff);
      smokeMeshes.push(puff);
    }
  });
}

// Fa ruotare e ondeggiare i pickup (non usati: restano per compatibilita')
function animatePickups(timeSeconds) {
  pickupMeshes.forEach((m, i) => {
    m.rotation.y = timeSeconds * 1.6 + i;
    m.position.y = m.userData.baseY + Math.sin(timeSeconds * 2 + i) * 0.08;
  });
}

function resetPickups() {
  pickupMeshes.forEach((m) => {
    m.userData.taken = false;
    m.visible = true;
  });
}

// ---------------------------------------------------------------
// Costruzione
// ---------------------------------------------------------------
function buildArena() {
  clearArena();

  if (typeof MAP === 'undefined' || !MAP.boxes) {
    console.error('ERRORE: MAP.boxes non trovato. Controlla js/shared/map.js in index.html.');
    return;
  }

  const size = MAP.SIZE || ARENA.SIZE;
  buildGround(size);
  buildRoads();

  const shadowBatch = new Batch();   // pezzi grandi e solidi: proiettano ombra
  const detailBatch = new Batch();   // dettagli: niente ombra (piu' leggeri)
  const glowBatch = new Batch();     // finestre accese, lampioni, insegne, colate tossiche
  const fireBatch = new Batch();     // fiamme (tremolano)

  MAP.boxes.concat(perimeterWalls(size)).forEach((b) => {
    if (b.hidden) return;
    const geo = boxGeometry(b);
    if (b.fire) fireBatch.add(geo, b.color);
    else if (b.emissive) glowBatch.add(geo, b.color);
    else {
      const ao = b.h > 0.5 ? { base: b.y || 0, height: Math.min(1.6, b.h) } : null;
      if (b.solid !== false || b.cast) shadowBatch.add(geo, b.color, ao);
      else detailBatch.add(geo, b.color, ao);
    }
  });

  (MAP.shapes || []).forEach((s) => {
    const geo = shapeGeometry(s);
    if (s.fire) fireBatch.add(geo, s.c);
    else if (s.glow) glowBatch.add(geo, s.c);
    else if (s.cast) shadowBatch.add(geo, s.c);
    else detailBatch.add(geo, s.c);
  });

  const litMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.9, metalness: 0.0, flatShading: true,
  });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  fireMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false });

  [
    shadowBatch.build(litMat, true),
    detailBatch.build(litMat, false),
    glowBatch.build(glowMat, false),
    fireBatch.build(fireMaterial, false),
  ].forEach((mesh) => { if (mesh) addArenaObject(mesh); });

  buildLights();
  buildSmoke();
  // Gli oggetti raccoglibili non si disegnano qui: li manda il server (vedi network.js)
  console.log('Arena costruita da MAP:', MAP.boxes.length, 'scatole,', (MAP.shapes || []).length, 'forme');
}

function clearArena() {
  arenaObjects.forEach((obj) => {
    if (obj.parent) obj.parent.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
  });
  arenaObjects.length = 0;
  pickupMeshes.length = 0;
  smokeMeshes.length = 0;
  flickerLights.length = 0;
}

// Fuochi: le fiamme pulsano e le loro luci tremolano
function animateFires(t) {
  if (fireMaterial) {
    const k = 0.82 + 0.18 * Math.sin(t * 17.0) * Math.sin(t * 6.3 + 1.1);
    fireMaterial.color.setScalar(k);
  }
  flickerLights.forEach((f) => {
    f.light.intensity = f.base * (0.82 + 0.12 * Math.sin(t * 13 + f.phase) + 0.06 * Math.sin(t * 31 + f.phase * 2));
  });
}

const Arena = {
  build: buildArena,
  clear: clearArena,
  getAll: () => arenaObjects,
  getPickups: () => pickupMeshes,
  animate: (timeSeconds) => {
    animatePickups(timeSeconds);
    animateFires(timeSeconds);
    smokeMeshes.forEach((s) => { s.position.y = s.userData.baseY + Math.sin(timeSeconds * .45 + s.userData.phase) * .65; });
    if (smokeMeshes.length) smokeMeshes[0].material.opacity = .58 + Math.sin(timeSeconds * .7) * .1;
  },
  resetPickups: resetPickups,
};

if (typeof window !== 'undefined') {
  window.Arena = Arena;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Arena;
}
