// DOOMSDAY - shared/map.js
// Modulo dati mappa condiviso per arena.js e collisione.
// Layout: centro edificio 2-story, 4 angoli (office/distributor/bunker/tower radio),
// torre cecchina 6-7m, viadotto/collapsed bridge, corridor container, auto/truck, barricate.
// ~100-150 box totali, solo ombre dal sole, ottimizzato per PC scuola.

const MAP = {
  // Dimensioni arena in metri (quadrata)
  SIZE: 56,

  // Punti di spawn (almeno 8, distribuiti attorno alla mappa)
  spawnPoints: [
    // Spawn angolo in alto a sinistra
    { x: -20, z: -20, rot: 0 },
    // Spawn angolo in alto a destra
    { x: 20, z: -20, rot: 0 },
    // Spawn angolo in basso a sinistra
    { x: -20, z: 20, rot: 0 },
    // Spawn angolo in basso a destra
    { x: 20, z: 20, rot: 0 },
    // Spawn centrale (retro dell'edificio)
    { x: 0, z: 0, rot: 0 },
    // Spawn secondario lato strada
    { x: 0, z: -28, rot: 0 },
    // Spawn secondario lato edificio
    { x: -28, z: 0, rot: 0 },
    // Spawn secondario diagonale
    { x: 20, z: 20, rot: 0 },
  ],

  // Box della mappa (formati {x,y,z,w,h,d,color,solid})
  // y = altezza base del terreno (0), la altezza totale è h aggiunta sopra
  boxes: [
    // --- MURI PERIMETRALI (spessi 1m, alti 10m) ---
    { x: 0, z: -28, w: 56, h: 10, d: 1, color: 0x2a2a2a, solid: true },  // muro nord
    { x: 0, z: 28, w: 56, h: 10, d: 1, color: 0x2a2a2a, solid: true },   // muro sud
    { x: -28, z: 0, w: 1, h: 10, d: 56, color: 0x2a2a2a, solid: true },  // muro ovest
    { x: 28, z: 0, w: 1, h: 10, d: 56, color: 0x2a2a2a, solid: true },   // muro est

    // --- EDIFICIO CENTRALE 2-story ---
    // Piano terra: base 12×8, altezza 4m, apertura frontale
    { x: -2, z: -4, w: 12, h: 4, d: 8, color: 0x3a3a3a, solid: true },
    // Piano superiore: base 8×6, altezza 4m sopra il piano terra, con apertura
    { x: -2, z: 0, w: 8, h: 4, d: 6, color: 0x3a3a3a, solid: true },
    // Apertura frontale edificio (vuoto al centro piano terra)
    { x: -6, z: -3, w: 4, h: 3, d: 1, color: 0x1a1a1a, solid: false },
    { x: 2, z: -3, w: 4, h: 3, d: 1, color: 0x1a1a1a, solid: false },

    // --- 4 STRUTTURE ANGOLARI (office/distributor/bunker/tower radio) ---
    // Angolo NW: uffico 2-story
    { x: -20, z: -20, w: 6, h: 6, d: 4, color: 0x4a4a4a, solid: true },
    { x: -20, z: -16, w: 6, h: 3, d: 4, color: 0x4a4a4a, solid: true },
    // Angolo NE: distributore
    { x: 18, z: -20, w: 5, h: 5, d: 3, color: 0x5a5a5a, solid: true },
    { x: 16, z: -18, w: 4, h: 2, d: 3, color: 0x5a5a5a, solid: true },
    // Angolo SW: bunker
    { x: -22, z: 18, w: 7, h: 8, d: 5, color: 0x2a3a5a, solid: true },
    { x: -20, z: 20, w: 5, h: 4, d: 3, color: 0x2a3a5a, solid: true },
    // Angolo SE: torre radio
    { x: 22, z: 20, w: 4, h: 10, d: 4, color: 0x5a3a2a, solid: true },
    { x: 20, z: 18, w: 3, h: 5, d: 3, color: 0x5a3a2a, solid: true },

    // --- TORRE CECCHINA 6-7m ---
    { x: 0, z: 24, w: 3, h: 7, d: 3, color: 0x5a5a5a, solid: true },

    // --- VIADUCT / COLLAPSED BRIDGE (asse X, lato rotto) ---
    // Pila di supporto sinistra
    { x: -26, z: 0, w: 6, h: 3, d: 8, color: 0x4a4a4a, solid: true },
    // Pila di supporto destra
    { x: 20, z: 0, w: 6, h: 3, d: 8, color: 0x4a4a4a, solid: true },
    // Travi del ponte (rotte - rappresentate come box bassi)
    { x: -24, z: -2, w: 4, h: 1, d: 6, color: 0x5a5a5a, solid: true },
    { x: -20, z: -1, w: 4, h: 1, d: 6, color: 0x5a5a5a, solid: true },
    { x: -16, z: 0, w: 4, h: 1, d: 6, color: 0x5a5a5a, solid: true },
    { x: -12, z: 1, w: 4, h: 1, d: 6, color: 0x5a5a5a, solid: true },
    { x: -8, z: 0, w: 4, h: 1, d: 6, color: 0x5a5a5a, solid: true },
    { x: -4, z: -1, w: 4, h: 1, d: 6, color: 0x5a5a5a, solid: true },
    { x: 0, z: 0, w: 4, h: 1, d: 6, color: 0x5a5a5a, solid: true },
    { x: 4, z: 0, w: 4, h: 1, d: 6, color: 0x5a5a5a, solid: true },
    { x: 8, z: -1, w: 4, h: 1, d: 6, color: 0x5a5a5a, solid: true },
    { x: 12, z: 0, w: 4, h: 1, d: 6, color: 0x5a5a5a, solid: true },
    { x: 16, z: -1, w: 4, h: 1, d: 6, color: 0x5a5a5a, solid: true },

    // --- CORRIDOI CONTAINER (a volte 2-high) ---
    // Corridoio orizzontale (lungo Z negativo)
    { x: -10, z: -15, w: 8, h: 2, d: 6, color: 0xff8c00, solid: true },
    { x: -6, z: -15, w: 8, h: 2, d: 6, color: 0xff8c00, solid: true },
    { x: -2, z: -15, w: 8, h: 2, d: 6, color: 0xff8c00, solid: true },
    { x: 2, z: -15, w: 8, h: 2, d: 6, color: 0xff8c00, solid: true },
    { x: 6, z: -15, w: 8, h: 2, d: 6, color: 0xff8c00, solid: true },
    { x: 10, z: -15, w: 8, h: 2, d: 6, color: 0xff8c00, solid: true },
    // Livello 2 del contenitore (sopra il primo)
    { x: -10, z: -13, w: 8, h: 2, d: 6, color: 0xff8c00, solid: true },
    { x: -6, z: -13, w: 8, h: 2, d: 6, color: 0xff8c00, solid: true },
    { x: -2, z: -13, w: 8, h: 2, d: 6, color: 0xff8c00, solid: true },
    { x: 2, z: -13, w: 8, h: 2, d: 6, color: 0xff8c00, solid: true },
    { x: 6, z: -13, w: 8, h: 2, d: 6, color: 0xff8c00, solid: true },
    { x: 10, z: -13, w: 8, h: 2, d: 6, color: 0xff8c00, solid: true },

    // --- AUTO/TRUCK come box ---
    { x: -15, z: -8, w: 5, h: 3, d: 3, color: 0x3a3a3a, solid: true },  // auto piccola
    { x: 15, z: -8, w: 6, h: 4, d: 4, color: 0x3a3a3a, solid: true },  // truck medio
    { x: -18, z: 8, w: 4, h: 2, d: 2, color: 0x3a3a3a, solid: true },  // auto compatta
    { x: 18, z: 8, w: 5, h: 3, d: 3, color: 0x3a3a3a, solid: true },   // truck

    // --- BARRICATE ---
    { x: -5, z: -5, w: 3, h: 2, d: 1, color: 0x5a5a5a, solid: true },
    { x: 5, z: -5, w: 3, h: 2, d: 1, color: 0x5a5a5a, solid: true },
    { x: -5, z: 5, w: 3, h: 2, d: 1, color: 0x5a5a5a, solid: true },
    { x: 5, z: 5, w: 3, h: 2, d: 1, color: 0x5a5a5a, solid: true },
    { x: 0, z: 0, w: 3, h: 2, d: 1, color: 0x5a5a5a, solid: true },

    // --- NASCONDIGO COPERTI ---
    { x: -30, z: -5, w: 5, h: 1.5, d: 3, color: 0x3a3a3a, solid: true },
    { x: 30, z: -5, w: 5, h: 1.5, d: 3, color: 0x3a3a3a, solid: true },
    { x: -30, z: 5, w: 5, h: 1.5, d: 3, color: 0x3a3a3a, solid: true },
    { x: 30, z: 5, w: 5, h: 1.5, d: 3, color: 0x3a3a3a, solid: true },
    { x: -8, z: -30, w: 3, h: 1.5, d: 5, color: 0x3a3a3a, solid: true },
    { x: 8, z: -30, w: 3, h: 1.5, d: 5, color: 0x3a3a3a, solid: true },
    { x: -8, z: 30, w: 3, h: 1.5, d: 5, color: 0x3a3a3a, solid: true },
    { x: 8, z: 30, w: 3, h: 1.5, d: 5, color: 0x3a3a3a, solid: true },

    // --- PICCOLE OSTACOLI DISTribuiti ---
    { x: -25, z: -5, w: 2, h: 1.5, d: 2, color: 0x4a4a4a, solid: true },
    { x: 25, z: -5, w: 2, h: 1.5, d: 2, color: 0x4a4a4a, solid: true },
    { x: -25, z: 5, w: 2, h: 1.5, d: 2, color: 0x4a4a4a, solid: true },
    { x: 25, z: 5, w: 2, h: 1.5, d: 2, color: 0x4a4a4a, solid: true },
    { x: -5, z: -25, w: 2, h: 1.5, d: 2, color: 0x4a4a4a, solid: true },
    { x: 5, z: -25, w: 2, h: 1.5, d: 2, color: 0x4a4a4a, solid: true },
    { x: -5, z: 25, w: 2, h: 1.5, d: 2, color: 0x4a4a4a, solid: true },
    { x: 5, z: 25, w: 2, h: 1.5, d: 2, color: 0x4a4a4a, solid: true },

    // --- PERCORSI CROSS-MAP (3+ percorsi) ---
    // Percorso centrale (lungo asse Z)
    { x: 0, z: -10, w: 56, h: 1, d: 1, color: 0x555555, solid: true },
    { x: 0, z: 10, w: 56, h: 1, d: 1, color: 0x555555, solid: true },
    // Percorso laterale sinistro (lungo asse X negativo)
    { x: -30, z: 0, w: 1, h: 1, d: 56, color: 0x555555, solid: true },
    // Percorso laterale destro
    { x: 30, z: 0, w: 1, h: 1, d: 56, color: 0x555555, solid: true },

    // --- DEBRIS VARI (già presenti ma inclusi qui per completezza) ---
    { x: -6, z: -6, w: 2, h: 1.5, d: 2, color: 0x4a4a4a, solid: true },
    { x: 6, z: -4, w: 2, h: 1.5, d: 2, color: 0x4a4a4a, solid: true },
    { x: -4, z: 4, w: 2, h: 1.5, d: 2, color: 0x4a4a4a, solid: true },
    { x: 5, z: 6, w: 2, h: 1.5, d: 2, color: 0x4a4a4a, solid: true },
    { x: -14, z: 2, w: 2, h: 1.5, d: 2, color: 0x4a4a4a, solid: true },
    { x: 14, z: -2, w: 2, h: 1.5, d: 2, color: 0x4a4a4a, solid: true },
  ],

  // Pickup (almeno 6)
  pickups: [
    // Salute pickup
    { x: -10, z: -10, type: 'health', radius: 0.5 },
    { x: 10, z: -10, type: 'health', radius: 0.5 },
    { x: -10, z: 10, type: 'health', radius: 0.5 },
    { x: 10, z: 10, type: 'health', radius: 0.5 },
    // Munizioni pickup
    { x: 0, z: -20, type: 'ammo', radius: 0.5 },
    { x: 0, z: 20, type: 'ammo', radius: 0.5 },
    { x: -25, z: 0, type: 'ammo', radius: 0.5 },
    { x: 25, z: 0, type: 'ammo', radius: 0.5 },
  ],

  // Punti di spawn armi sul terreno (x,z)
  weaponSpawnPoints: [
    { x: -8, z: -8, weapon: 'rifle' },
    { x: 8, z: -8, weapon: 'shotgun' },
    { x: -8, z: 8, weapon: 'pistol' },
    { x: 8, z: 8, weapon: 'rifle' },
  ],
};

if (typeof window !== 'undefined') {
  window.MAP = MAP;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MAP;
}