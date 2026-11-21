// DOOMSDAY - collision.js
// Collisioni giocatore vs scatole di MAP.boxes (AABB), un asse alla volta.
// Formato scatola: { x, z (CENTRO), y (BASE), w, h, d, solid }  (solid:false = decorazione)
// Il giocatore e' una scatola: raggio 0.3, altezza 1.8 (1.35 da accovacciato: player.height). player.position = piedi.
// Funziona sia nel browser sia in Node: move(player, dt, map) accetta la mappa come parametro.

(function () {
  const R = 0.3;        // raggio del giocatore
  const H = 1.8;        // altezza del giocatore
  const STEP = 0.5;     // gradino massimo che si sale camminando
  const EPS = 0.001;

  // true se il giocatore (nella posizione p, alto h: di base H) si sovrappone alla scatola b
  function overlaps(p, b, h) {
    const y0 = b.y || 0;
    return (
      p.x + R > b.x - b.w / 2 && p.x - R < b.x + b.w / 2 &&
      p.z + R > b.z - b.d / 2 && p.z - R < b.z + b.d / 2 &&
      p.y + (h || H) > y0 && p.y < y0 + b.h
    );
  }

  // Muove lungo X o Z. Gradino basso: ci sale sopra. Altrimenti si ferma contro la scatola.
  function moveHorizontal(player, boxes, axis, amount) {
    const p = player.position;
    const size = axis === 'x' ? 'w' : 'd';
    const h = player.height || H;     // accovacciati si passa sotto gli ostacoli piu' bassi
    p[axis] += amount;

    for (const b of boxes) {
      if (b.solid === false || !overlaps(p, b, h)) continue;

      const top = (b.y || 0) + b.h;
      if (player.onGround && top - p.y <= STEP) {
        p.y = top;            // gradino: sali
        continue;
      }
      if (amount > 0) p[axis] = b[axis] - b[size] / 2 - R - EPS;   // fermati sul lato "meno"
      else            p[axis] = b[axis] + b[size] / 2 + R + EPS;   // fermati sul lato "piu'"
      player.velocity[axis] = 0;
    }
  }

  // Muove in verticale: atterra sopra le scatole oppure sbatte la testa sotto
  function moveVertical(player, boxes, dy) {
    const p = player.position;
    const h = player.height || H;
    p.y += dy;
    player.onGround = false;

    for (const b of boxes) {
      if (b.solid === false || !overlaps(p, b, h)) continue;

      const y0 = b.y || 0;
      if (dy <= 0) {
        p.y = y0 + b.h;               // atterrato sopra la scatola
        player.onGround = true;
      } else {
        p.y = y0 - h - EPS;           // testa contro il soffitto
      }
      player.velocity.y = 0;
    }

    // Terreno a y = 0
    if (p.y <= 0) {
      p.y = 0;
      player.velocity.y = 0;
      player.onGround = true;
    }
  }

  // Integra la velocita' del giocatore e risolve le collisioni.
  // La gravita' va applicata PRIMA (ogni frame), cosi' onGround resta stabile.
  // Le decorazioni non bloccano: l'elenco delle sole scatole solide si calcola una volta per mappa
  function solidBoxes(m) {
    if (!m) return [];
    if (!m._solid || m._solidCount !== m.boxes.length) {
      m._solid = m.boxes.filter((b) => b.solid !== false);
      m._solidCount = m.boxes.length;
    }
    return m._solid;
  }

  function move(player, dt, map) {
    const m = map || (typeof MAP !== 'undefined' ? MAP : null);
    const boxes = solidBoxes(m);
    const v = player.velocity;

    moveHorizontal(player, boxes, 'x', v.x * dt);
    moveHorizontal(player, boxes, 'z', v.z * dt);
    moveVertical(player, boxes, v.y * dt);
  }

  // Raggio contro le scatole solide e il terreno (per gli spari "hitscan").
  // origin e dir: oggetti con x,y,z (dir lunga 1). Restituisce null oppure
  // { distance, box, point:{x,y,z} } (box = null se colpisce il terreno).
  // Il server puo' usare la stessa funzione per verificare i colpi.
  function raycast(origin, dir, maxDist, map) {
    const m = map || (typeof MAP !== 'undefined' ? MAP : null);
    const boxes = solidBoxes(m);
    const o = [origin.x, origin.y, origin.z];
    const d = [dir.x, dir.y, dir.z];
    let best = maxDist;
    let hitBox = null;
    let hit = false;

    for (const b of boxes) {
      if (b.solid === false) continue;
      const y0 = b.y || 0;
      const min = [b.x - b.w / 2, y0, b.z - b.d / 2];
      const max = [b.x + b.w / 2, y0 + b.h, b.z + b.d / 2];
      let tmin = 0;
      let tmax = best;
      let miss = false;
      for (let i = 0; i < 3 && !miss; i++) {
        if (Math.abs(d[i]) < 1e-9) {
          if (o[i] < min[i] || o[i] > max[i]) miss = true;
        } else {
          let t1 = (min[i] - o[i]) / d[i];
          let t2 = (max[i] - o[i]) / d[i];
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          if (t1 > tmin) tmin = t1;
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) miss = true;
        }
      }
      if (!miss && tmin <= best) {
        best = tmin;
        hitBox = b;
        hit = true;
      }
    }

    // Terreno a y = 0
    if (d[1] < -1e-9) {
      const t = -o[1] / d[1];
      if (t > 0 && t < best) {
        best = t;
        hitBox = null;
        hit = true;
      }
    }

    if (!hit) return null;
    return {
      distance: best,
      box: hitBox,
      point: { x: o[0] + d[0] * best, y: o[1] + d[1] * best, z: o[2] + d[2] * best },
    };
  }

  const api = { move, overlaps, raycast, PLAYER_RADIUS: R, PLAYER_HEIGHT: H };

  if (typeof window !== 'undefined') window.collision = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();