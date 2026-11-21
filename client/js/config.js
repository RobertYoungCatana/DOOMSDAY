// DOOMSDAY - Configurazione centrale
// Modifica qui tutte le impostazioni del gioco

const CONFIG = {
  // --- Gioco ---
  GAME: {
    MATCH_TIME: 120,        // secondi per partita (2 minuti)
    RESPAWN_TIME: 3,        // secondi prima di ricomparire
    MAX_PLAYERS: 4,
    STARTING_LIVES: 100,
    STARTING_AMMO: 30,
  },

  // --- Movimento ---
  MOVEMENT: {
    WALK_SPEED: 5,          // m/s
    RUN_SPEED: 9,           // m/s
    CROUCH_SPEED: 0.5,      // accovacciati: velocita' rispetto alla camminata (0.5 = meta')
    JUMP_FORCE: 7,          // forza salto (m/s)
    GRAVITY: 20,            // m/s^2
    AIR_CONTROL: 0.15,      // controllo in aria (0-1)
    MOUSE_SENSITIVITY: 0.002,
    CONTROLLER_SENSITIVITY: 0.04,
    SPRINT_MIN: 0.7,        // minimo stick per corsa
  },

  // --- Camera ---
  CAMERA: {
    FOV: 75,
    HEIGHT: 1.75,           // altezza occhi dal terreno
    CROUCH_HEIGHT: 1.2,     // altezza occhi da accovacciati
    NEAR: 0.1,
    FAR: 200,
  },

  // --- Arena ---
  ARENA: {
    SIZE: 56,               // metri di lato (quadrata)
    WALL_HEIGHT: 10,        // altezza muri
    FLOOR_COLOR: 0x66645a,  // calcestruzzo urbano segnato dalla guerra
    WALL_COLOR: 0x30322d,
    ACCENT_COLOR: 0x65ef18, // colata tossica radioattiva
  },

  // --- Armi ---
  // Le armi (danni, velocita' di sparo, mira...) sono in js/shared/weapons.js:
  // stesso file letto anche dal server, cosi' i numeri non possono andare fuori sincrono.
  WEAPONS: (typeof window !== 'undefined' && window.WEAPONS) || {},

  // --- Bot ---
  BOT: {
    COUNT: 2,
    WALK_SPEED: 3.5,
    CHASE_SPEED: 5,
    ATTACK_RANGE: 12,       // metri
    RESPAWN_DELAY: 4,
    EYE_HEIGHT: 1.6,
  },

  // --- Rete ---
  NETWORK: {
    UPDATE_RATE: 20,        // Hz (aggiornamenti al secondo)
    SERVER_VERSION: 6,      // versione del server che serve a questo client (vedi server.js)
    INTERPOLATION: 0.2,     // secondi di interpoltazione
  },

  // --- Skin dei personaggi (scelta nel menu) ---
  // Per aggiungerne una: un vestito in OUTFITS di js/characters.js + una riga qui con builder: 'nome'.
  //   id: nome breve (minuscole, senza spazi) · name: nome mostrato nel menu
  //   file: modello .gltf · rotationY: rotazione per farlo guardare in avanti
  //   credit: autore del modello (licenza CC-BY: va citato)
  //   builder: personaggio low-poly fatto a codice in js/characters.js (niente file)
  //   (i modelli .gltf funzionano ancora, ma serve di nuovo lo script GLTFLoader in index.html)
  // Il primo della lista e' quello di partenza.
  SKINS: [
    { id: 'military',  name: 'Militare',   builder: 'military' },
    { id: 'nurse',     name: 'Infermiera', builder: 'nurse' },
    { id: 'zombie',    name: 'Zombie',     builder: 'zombie' },
    { id: 'ninja',     name: 'Ninja',      builder: 'ninja' },
    { id: 'police',    name: 'Poliziotto', builder: 'police' },
    { id: 'astronaut', name: 'Astronauta', builder: 'astronaut' },
    { id: 'explorer',  name: 'Bobby',      builder: 'explorer' },
    { id: 'jackson',   name: 'Jackson',    builder: 'jackson' },
    { id: 'superman',  name: 'Superman',   builder: 'superman' },
    { id: 'batman',    name: 'Batman',     builder: 'batman' },
    { id: 'spiderman', name: 'Spider-Man', builder: 'spiderman' },
    { id: 'pirate',    name: 'Pirata',     builder: 'pirate' },
    { id: 'skeleton',  name: 'Scheletro',  builder: 'skeleton' },
    { id: 'vampire',   name: 'Vampiro',    builder: 'vampire' },
    { id: 'ghost',     name: 'Fantasma',   builder: 'ghost' },
  ],

  // --- Colori HUD ---
  COLORS: {
    PRIMARY: 0xff4500,      // arancione
    SECONDARY: 0x888888,    // grigio
    HEALTH: 0x4CAF50,       // verde
    AMMO: 0xffcc00,         // giallo
    BG: 0x1a1a1a,
  },
};

// Esporta globalmente (browser) e come modulo (Node)
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
