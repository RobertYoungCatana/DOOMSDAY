// DOOMSDAY - collision.js
// Collisioni giocatore vs scatole di MAP.boxes (AABB), un asse alla volta.
// Formato scatola: { x, z (CENTRO), y (BASE), w, h, d, solid }  (solid:false = decorazione)
// Il giocatore e' una scatola: raggio 0.3, altezza 1.8. player.position = piedi.
// Funziona sia nel browser sia in Node: move(player, dt, map) accetta la mappa come parametro.

(function () {
  const R = 0.3;        // raggio del giocatore
  const H = 1.8;        // altezza del giocatore
  const STEP = 0.5;     // gradino massimo che si sale camminando
  const EPS = 0.001;

  // true se il giocatore (nella posizione p) si sovrappone alla scatola b
  function overlaps(p, b) {
    const y0 = b.y || 0;
    return (
      p.x + R > b.x - b.w / 2 && p.x - R < b.x + b.w / 2 &&
      p.z + R > b.z - b.d / 2 && p.z - R < b.z + b.d / 2 &&
      p.y + H > y0 && p.y < y0 + b.h
    );
  }

  // Muove lungo X o Z. Gradino basso: ci sale sopra. Altrimenti si ferma contro la scatola.
  function moveHorizontal(player, boxes, axis, amount) {
    const p = player.position;
    const size = axis === 'x' ? 'w' : 'd';
    p[axis] += amount;

    for (const b of boxes) {
      if (b.solid === false || !overlaps(p, b)) continue;

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
    p.y += dy;
    player.onGround = false;

    for (const b of boxes) {
      if (b.solid === false || !overlaps(p, b)) continue;

      const y0 = b.y || 0;
      if (dy <= 0) {
        p.y = y0 + b.h;               // atterrato sopra la scatola
        player.onGround = true;
      } else {
        p.y = y0 - H - EPS;           // testa contro il soffitto
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
  function move(player, dt, map) {
    const m = map || (typeof MAP !== 'undefined' ? MAP : null);
    const boxes = m ? m.boxes : [];
    const v = player.velocity;

    moveHorizontal(player, boxes, 'x', v.x * dt);
    moveHorizontal(player, boxes, 'z', v.z * dt);
    moveVertical(player, boxes, v.y * dt);
  }

  const api = { move, overlaps, PLAYER_RADIUS: R, PLAYER_HEIGHT: H };

  if (typeof window !== 'undefined') window.collision = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();