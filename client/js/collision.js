// DOOMSDAY - collision.js
// Collisione giocatore vs world: AABB con i box della mappa.
// Il player è trattato come un punto (posizione dei piedi = player.position.y).
// Dopo ogni movimento, controlliamo se è dentro una box e lo spingiamo fuori.
// Dipendenze: MAP (shared/map.js)

// -----------------------------------------------------
// AABB Intersection test: due box {x, y, z, w, h, d}
// Restituisce true se si sovrappongono, false altrimenti
// -----------------------------------------------------
function aabbIntersect(boxA, boxB) {
  const halfA = { w: boxA.w / 2, h: boxA.h / 2, d: boxA.d / 2 };
  const halfB = { w: boxB.w / 2, h: boxB.h / 2, d: boxB.d / 2 };

  if (boxA.x + halfA.w < boxB.x - halfB.w) return false;
  if (boxA.x - halfA.w > boxB.x + halfB.w) return false;
  if (boxA.z + halfA.d < boxB.z - halfB.d) return false;
  if (boxA.z - halfA.d > boxB.z + halfB.d) return false;

  const aBottom = (boxA.y || 0) - halfA.h;
  const aTop = (boxA.y || 0) + halfA.h;
  const bBottom = (boxB.y || 0) - halfB.h;
  const bTop = (boxB.y || 0) + halfB.h;

  if (aTop <= bBottom || aBottom >= bTop) return false;

  return true;
}

// -----------------------------------------------------
// Check if player can step up onto a box
// Step-up height limit: ≤ 0.5m
// -----------------------------------------------------
function canStepUp(playerY, boxHeight, playerHeight = 1.8) {
  const maxStepHeight = 0.5;
  const effectiveHeight = boxHeight;
  return effectiveHeight > 0 && effectiveHeight <= playerHeight + maxStepHeight;
}

// -----------------------------------------------------
// Player-on-platform detection
// Restituisce l'obj box se il player sta su una piattaforma, false altrimenti
// -----------------------------------------------------
function getPlayerOnPlatform(playerPos) {
  const boxes = MAP.boxes;
  const playerX = playerPos.x;
  const playerZ = playerPos.z;

  for (const box of boxes) {
    const halfW = box.w / 2;
    const halfD = box.d / 2;
    const boxY = box.y || 0;
    const boxTop = boxY + box.h;

    if (playerX >= box.x - halfW && playerX <= box.x + halfW &&
        playerZ >= box.z - halfD && playerZ <= box.z + halfD) {
      const playerBottom = playerPos.y;
      if (playerBottom >= boxY && playerBottom < boxTop) {
        return box;
      }
    }
  }
  return false;
}

// -----------------------------------------------------
// Main collision update: controlla se il player è dentro una box
// e lo spinge fuori lungo l'asse di minore penetrazione.
// Aggiorna anche onGround se il player è appoggiato su una piattaforma.
// -----------------------------------------------------
function updatePlayerCollisions(player, dt) {
  const boxes = MAP.boxes;
  const position = player.position;
  const velocity = player.velocity;

  let onGround = false;

  for (const box of boxes) {
    const halfW = box.w / 2;
    const halfD = box.d / 2;
    const boxY = box.y || 0;
    const boxTop = boxY + box.h;

    // Check se il player è nei confini XZ della box
    const inX = position.x >= box.x - halfW && position.x <= box.x + halfW;
    const inZ = position.z >= box.z - halfD && position.z <= box.z + halfD;

    if (!inX && !inZ) continue;

    // --- Collisione verticale: player dentro la box (in alto/basso) ---
    if (position.y < boxTop && position.y >= boxY) {
      // Player è dentro la box verticalmente - spingilo fuori orizzontalmente
      const distLeft = position.x - (box.x - halfW);
      const distRight = (box.x + halfW) - position.x;
      const distBack = position.z - (box.z - halfD);
      const distFront = (box.z + halfD) - position.z;

      const minDist = Math.min(distLeft, distRight, distBack, distFront);

      if (minDist === distLeft) {
        position.x = box.x - halfW - 0.01;
        velocity.x = 0;
      } else if (minDist === distRight) {
        position.x = box.x + halfW + 0.01;
        velocity.x = 0;
      } else if (minDist === distBack) {
        position.z = box.z - halfD - 0.01;
        velocity.z = 0;
      } else {
        position.z = box.z + halfD + 0.01;
        velocity.z = 0;
      }
    }

    // --- Rilevamento appoggio: player sopra la box, in piedi ---
    // Se il player è appena sotto il top della box e sta cadendo o è fermo
    if (position.y < boxTop && position.y >= boxTop - 0.15 && velocity.y <= 0) {
      onGround = true;
      position.y = boxTop;
      velocity.y = 0;
    }
  }

  // --- Terreno (y=0) ---
  if (position.y < 0) {
    position.y = 0;
    velocity.y = 0;
    onGround = true;
  }

  player.onGround = onGround;
}

// Esporta funzioni per l'uso in player.js
if (typeof window !== 'undefined') {
  window.collision = {
    aabbIntersect,
    canStepUp,
    getPlayerOnPlatform,
    updatePlayerCollisions,
  };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    aabbIntersect,
    canStepUp,
    getPlayerOnPlatform,
    updatePlayerCollisions,
  };
}