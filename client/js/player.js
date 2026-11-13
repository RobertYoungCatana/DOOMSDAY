// DOOMSDAY - player.js
// Movimento FPS: WASD, salto, gravita', corsa, collisioni con le scatole della mappa.
// Dipendenze: Three.js, CONFIG, Render, Input (input.js), collision (collision.js), MAP

// Stato del giocatore
const player = {
  id: '', // verra' impostato quando ci si collega al multiplayer
  position: new THREE.Vector3(0, 0, 0),   // posizione dei PIEDI
  velocity: new THREE.Vector3(0, 0, 0),
  onGround: false,
  isRunning: false,
  ammo: CONFIG.GAME.STARTING_AMMO,        // riserva
  magazine: 0,                            // colpi nel caricatore
  health: CONFIG.GAME.STARTING_LIVES,
  kills: 0,
  deaths: 0,
  currentWeapon: 'pistol',
};

// Mette il giocatore in una posizione di partenza (y opzionale per spawn su piattaforme)
function spawnPlayer(x, z, y = 0) {
  player.position.set(x, y, z);
  player.velocity.set(0, 0, 0);
  player.onGround = false;
  player.health = CONFIG.GAME.STARTING_LIVES;
  const weapon = CONFIG.WEAPONS[player.currentWeapon];
  player.magazine = weapon.magazine;
  player.ammo = CONFIG.GAME.STARTING_AMMO;
  updatePlayerCamera();
}

// La camera segue i piedi + altezza occhi (cosi' si vede anche il salto)
function updatePlayerCamera() {
  const yaw = Render.yawPivot();
  if (yaw) {
    yaw.position.set(
      player.position.x,
      player.position.y + CONFIG.CAMERA.HEIGHT,
      player.position.z
    );
  }
}

// Movimento principale (chiamato a passo fisso)
function updatePlayerMovement(dt) {
  if (!Render.yawPivot()) return;

  player.isRunning = Input.isRunning();

  // --- Velocita' desiderata dall'input ---
  const move = Input.getMove(); // {x, z} gia' ruotato secondo la camera, lunghezza max 1
  const speed = player.isRunning ? CONFIG.MOVEMENT.RUN_SPEED : CONFIG.MOVEMENT.WALK_SPEED;
  const vx = move.x * speed;
  const vz = move.z * speed;

  // A terra: risposta immediata. In aria: controllo ridotto (AIR_CONTROL)
  if (player.onGround) {
    player.velocity.x = vx;
    player.velocity.z = vz;
  } else {
    const k = CONFIG.MOVEMENT.AIR_CONTROL;
    player.velocity.x += (vx - player.velocity.x) * k;
    player.velocity.z += (vz - player.velocity.z) * k;
  }

  // --- Gravita': SEMPRE attiva (la collisione azzera la velocita' quando si atterra) ---
  player.velocity.y -= CONFIG.MOVEMENT.GRAVITY * dt;

  // --- Salto ---
  if (Input.isJumping() && player.onGround) {
    player.velocity.y = CONFIG.MOVEMENT.JUMP_FORCE;
    player.onGround = false;
  }

  // --- Movimento + collisioni (scatole, gradini, terreno) ---
  window.collision.move(player, dt);

  // --- Limiti arena ---
  const half = (MAP.SIZE || ARENA.SIZE) / 2 - 0.5;
  player.position.x = Math.max(-half, Math.min(half, player.position.x));
  player.position.z = Math.max(-half, Math.min(half, player.position.z));

  updatePlayerCamera();
}

// Danni
function takeDamage(amount) {
  player.health -= amount;
  if (player.health <= 0) {
    player.health = 0;
    player.deaths++;
    return true; // morto
  }
  return false;
}

// Ricarica: porta il caricatore al massimo usando la riserva
function reload() {
  const weapon = CONFIG.WEAPONS[player.currentWeapon];
  const taken = Math.min(weapon.magazine - player.magazine, player.ammo);
  player.magazine += taken;
  player.ammo -= taken;
}

// Cambio arma
function selectWeapon(index) {
  const names = Object.keys(CONFIG.WEAPONS);
  if (index >= 0 && index < names.length) {
    player.currentWeapon = names[index];
    player.magazine = Math.min(player.magazine, CONFIG.WEAPONS[names[index]].magazine);
  }
}

// Aggiungi munizioni
function addAmmo(amount) {
  player.ammo += amount;
}

// Aggiungi vita
function addHealth(amount) {
  player.health = Math.min(CONFIG.GAME.STARTING_LIVES, player.health + amount);
}

// Esporta
const Player = {
  get: () => player,
  spawn: spawnPlayer,
  update: updatePlayerMovement,
  takeDamage,
  reload,
  selectWeapon,
  addAmmo,
  addHealth,
  resetKills: () => { player.kills = 0; player.deaths = 0; },
};

if (typeof window !== 'undefined') {
  window.Player = Player;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Player;
}