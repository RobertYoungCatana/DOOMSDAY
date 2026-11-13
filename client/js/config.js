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
    NEAR: 0.1,
    FAR: 200,
  },

  // --- Arena ---
  ARENA: {
    SIZE: 40,               // metri di lato (quadrata)
    WALL_HEIGHT: 10,        // altezza muri
    FLOOR_COLOR: 0x3a3a3a,  // grigio cemento
    WALL_COLOR: 0x2a2a2a,
    ACCENT_COLOR: 0xff4500, // arancione DOOMSDAY
  },

  // --- Armi ---
  WEAPONS: {
    pistol: {
      name: "Pistola",
      damage: 25,
      fireRate: 0.3,         // secondi tra un colpo e l'altro
      magazine: 12,
      reloadTime: 1.2,
      color: 0xcccccc,
    },
    rifle: {
      name: "Fucile Automatico",
      damage: 18,
      fireRate: 0.12,
      magazine: 30,
      reloadTime: 2.0,
      color: 0x8B4513,
    },
    shotgun: {
      name: "Fucile a Pompa",
      damage: 80,
      fireRate: 0.8,
      magazine: 8,
      reloadTime: 2.5,
      color: 0x5a3a2a,
    },
  },

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
    INTERPOLATION: 0.2,     // secondi di interpoltazione
  },

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