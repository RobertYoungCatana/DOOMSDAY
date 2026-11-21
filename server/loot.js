// DOOMSDAY - loot.js (solo server)
// Dove compaiono armi e oggetti: in un punto CASUALE della mappa raggiungibile a piedi.
//
// All'avvio la mappa viene divisa in una griglia (celle da 1 m). Una cella e' buona se:
//   - c'e' spazio per un giocatore in piedi (niente scatole solide che lo blocchino);
//   - non e' dentro una decorazione (alberi, auto, barili...);
//   - si raggiunge camminando da un punto di partenza (riempimento a macchia d'olio).
// In piu' ci sono i punti "speciali" di MAP.pickups (tetti, piattaforme): ogni tanto il loot va li'.
// Gli oggetti non compaiono troppo vicini tra loro.

'use strict';

const CELL = 1.0;            // lato di una cella della griglia (metri)
const EDGE = 2.0;            // distanza minima dal bordo della mappa
const CLEAR_R = 0.5;         // spazio libero attorno al punto (raggio del giocatore + margine)
const STAND_H = 1.8;         // altezza del giocatore
const STEP = 0.5;            // gradino massimo che si sale camminando
const SPECIAL_CHANCE = 0.2;  // probabilita' di usare un punto speciale (tetti, piattaforme...)
const MIN_GAP = 3.0;         // distanza minima tra due oggetti
const JITTER = 0.2;          // piccolo spostamento casuale dentro la cella

function buildLoot(MAP) {
  const half = MAP.SIZE / 2 - EDGE;
  const solid = MAP.boxes.filter((b) => b.solid !== false);
  const deco = MAP.boxes.filter((b) => b.solid === false);

  const covers = (b, x, z, m) =>
    x > b.x - b.w / 2 - m && x < b.x + b.w / 2 + m &&
    z > b.z - b.d / 2 - m && z < b.z + b.d / 2 + m;

  // Raggio orizzontale approssimato delle forme solo grafiche (cilindri, coni, palle, scatole ruotate)
  const shapes = (MAP.shapes || []).map((s) => {
    const r = Math.max(s.r || 0, s.rt || 0, s.rb || 0, (s.w || 0) / 2, (s.d || 0) / 2, 0.05);
    const h = s.h || (s.r ? s.r * 2 : 0.2);
    return { x: s.x, z: s.z, r: r, y0: s.y - h / 2, y1: s.y + h / 2 };
  });

  // Altezza del pavimento in (x, z): il terreno o un gradino basso (marciapiede, pedana...)
  function floorAt(x, z) {
    let floor = 0;
    for (const b of solid) {
      const top = (b.y || 0) + b.h;
      if (top <= STEP && covers(b, x, z, 0)) floor = Math.max(floor, top);
    }
    return floor;
  }

  function isFree(x, z, floor) {
    for (const b of solid) {
      const y0 = b.y || 0;
      const top = y0 + b.h;
      if (top <= floor + 0.02 || y0 >= floor + STAND_H) continue;   // sotto i piedi o sopra la testa
      if (covers(b, x, z, CLEAR_R)) return false;
    }
    for (const b of deco) {
      const y0 = b.y || 0;
      const top = y0 + b.h;
      if (top <= floor + 0.05 || y0 >= floor + 1.2) continue;
      if (covers(b, x, z, 0.2)) return false;
    }
    for (const s of shapes) {
      if (s.y1 <= floor + 0.05 || s.y0 >= floor + 1.2) continue;
      if (Math.hypot(s.x - x, s.z - z) < s.r + 0.35) return false;
    }
    return true;
  }

  // --- Griglia ---
  const n = Math.floor((half * 2) / CELL) + 1;
  const cells = new Array(n * n);
  const at = (i, j) => cells[j * n + i];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -half + i * CELL;
      const z = -half + j * CELL;
      const floor = floorAt(x, z);
      cells[j * n + i] = { x: x, z: z, y: floor, free: isFree(x, z, floor), reach: false };
    }
  }

  // --- Raggiungibili a piedi dai punti di partenza ---
  const queue = [];
  (MAP.spawnPoints || []).forEach((s) => {
    const i = Math.round((s.x + half) / CELL);
    const j = Math.round((s.z + half) / CELL);
    if (i < 0 || j < 0 || i >= n || j >= n) return;
    const c = at(i, j);
    if (c && c.free && !c.reach) { c.reach = true; queue.push([i, j]); }
  });
  while (queue.length) {
    const [i, j] = queue.pop();
    const c = at(i, j);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([di, dj]) => {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) return;
      const nc = at(ni, nj);
      if (!nc.free || nc.reach || Math.abs(nc.y - c.y) > STEP) return;
      nc.reach = true;
      queue.push([ni, nj]);
    });
  }

  const ground = cells.filter((c) => c.reach);
  const special = (MAP.pickups || []).map((p) => ({ x: p.x, y: p.y || 0, z: p.z }));

  // Un punto a caso lontano dagli oggetti gia' presenti (taken = [{x, z}, ...])
  function randomSpot(taken) {
    const far = (p) => taken.every((t) => Math.hypot(t.x - p.x, t.z - p.z) >= MIN_GAP);
    if (special.length && Math.random() < SPECIAL_CHANCE) {
      const free = special.filter(far);
      if (free.length) return Object.assign({}, free[Math.floor(Math.random() * free.length)]);
    }
    for (let tries = 0; tries < 40 && ground.length; tries++) {
      const c = ground[Math.floor(Math.random() * ground.length)];
      const p = {
        x: +(c.x + (Math.random() * 2 - 1) * JITTER).toFixed(2),
        y: c.y,
        z: +(c.z + (Math.random() * 2 - 1) * JITTER).toFixed(2),
      };
      if (far(p)) return p;
    }
    // mappa piena: un punto qualsiasi
    const all = ground.length ? ground : special;
    const c = all[Math.floor(Math.random() * all.length)];
    return { x: c.x, y: c.y, z: c.z };
  }

  return { randomSpot: randomSpot, groundCount: ground.length, specialCount: special.length };
}

module.exports = { buildLoot: buildLoot };
