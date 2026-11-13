// DOOMSDAY - player.js
// Movimento FPS: WASD, salto, gravità, corsa, collisioni con i bordi.
// Dipendenze: Three.js, CONFIG, Render, Input (input.js), collision (collision.js)

// Stato del giocatore
const player = {
  position: new THREE.Vector3(0, 0, 0),
  velocity: new THREE.Vector3(0, 0, 0),
  onGround: false,
  isRunning: false,
  // Stato armi (per ora semplificato)
  ammo: CONFIG.GAME.STARTING_AMMO,
  magazine: 0,
  health: CONFIG.GAME.STARTING_LIVES,
  kills: 0,
  deaths: 0,
  currentWeapon: 'pistol',
};

// Inizializza il giocatore in una posizione sicura
function spawnPlayer(x, z) {
  player.position.set(x, 0, z);
  player.velocity.set(0, 0, 0);
  player.onGround = true; // CORREZIONE: il giocatore è a terra all'inizio
  player.health = CONFIG.GAME.STARTING_LIVES;
  // Allinea le munizioni al caricatore dell'arma corrente
  const weapon = CONFIG.WEAPONS[player.currentWeapon];
  player.magazine = weapon.magazine;
  player.ammo = CONFIG.GAME.STARTING_AMMO;
}

// Aggiorna la posizione dei pivot (camera)
function updatePlayerCamera() {
  const yaw = Render.yawPivot();
  if (yaw) yaw.position.set(player.position.x, CONFIG.CAMERA.HEIGHT, player.position.z);
}

// Movimento principale (chiamato ogni frame fisso)
function updatePlayerMovement(dt) {
  if (!Render.yawPivot()) return;

  // --- Input movimento ---
  const move = Input.getMove(); // {x, z} in [-1,1] già ruotato dalla camera
  const speed = player.isRunning ? CONFIG.MOVEMENT.RUN_SPEED : CONFIG.MOVEMENT.WALK_SPEED;

  // Velocità orizzontale basata sull'input
  const vx = move.x * speed;
  const vz = move.z * speed;

  // --- Gravità ---
  if (player.onGround) {
    player.velocity.y = 0;
  } else {
    player.velocity.y -= CONFIG.MOVEMENT.GRAVITY * dt;
  }

  // --- Salto ---
  if (Input.isJumping() && player.onGround) {
    player.velocity.y = CONFIG.MOVEMENT.JUMP_FORCE;
    player.onGround = false;
    console.log('SALTO! vel.y =', player.velocity.y); // debug
  }

  // --- Integrazione posizione ---
  // Applichiamo la velocità integrata con dt
  player.position.x += player.velocity.x * dt;
  player.position.z += player.velocity.z * dt;
  player.position.y += player.velocity.y * dt;

  // --- Collisioni con world (box, muri, platform) ---
  // Questo processa collisioni X, Z e rileva onGround
  if (typeof window !== 'undefined' && window.collision) {
    window.collision.updatePlayerCollisions(player, dt);
  }

  // --- Limiti arena ---
  const half = (MAP.SIZE || ARENA.SIZE) / 2 - 0.5;
  if (player.position.x < -half) player.position.x = -half;
  if (player.position.x > half) player.position.x = half;
  if (player.position.z < -half) player.position.z = -half;
  if (player.position.z > half) player.position.z = half;

  // --- Aggiorna pivot camera ---
  updatePlayerCamera();
}

// Danni
function takeDamage(amount) {
  player.health -= amount;
  if (player.health <= 0) {
    player.health = 0;
    player.deaths++;
    // Respawn handled by game loop
    return true; // morto
  }
  return false;
}

// Ricarica
function reload() {
  const weapon = CONFIG.WEAPONS[player.currentWeapon];
  if (player.magazine === weapon.magazine) return; // già pieno
  player.ammo = Math.max(0, player.ammo - (weapon.magazine - player.magazine));
  player.magazine = weapon.magazine;
}

// Cambio arma
function selectWeapon(index) {
  const keys = Object.keys(CONFIG.WEAPONS);
  if (index >= 0 && index < keys.length) {
    player.currentWeapon = keys[index];
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