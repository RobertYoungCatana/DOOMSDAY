// DOOMSDAY - player.js
// Movimento FPS, armi (sparo hitscan, ricarica, cambio arma), oggetti raccoglibili,
// effetti di sparo e arma in mano.
// Dipendenze: Three.js, CONFIG, Render, Input, collision (collision.js), MAP, Arena
//
// Lo sparo e' "hitscan": un raggio dall'occhio verso il mirino, contro le scatole della mappa.
// Per ora si vedono tracce e impatti. Quando ci sara' il server, basta impostare
// Player.onShoot = (info) => ... per mandargli origine e direzione del colpo.

// --- Stato del giocatore ---
const player = {
  id: '',                                   // verra' impostato dal multiplayer
  position: new THREE.Vector3(0, 0, 0),     // posizione dei PIEDI
  velocity: new THREE.Vector3(0, 0, 0),
  onGround: false,
  isRunning: false,
  ammo: CONFIG.GAME.STARTING_AMMO,          // riserva di munizioni (condivisa tra le armi)
  magazine: 0,                              // colpi nel caricatore dell'arma corrente
  mags: {},                                 // caricatore di ogni arma
  health: CONFIG.GAME.STARTING_LIVES,
  kills: 0,
  deaths: 0,
  currentWeapon: 'pistol',
  fireCooldown: 0,                          // secondi prima del prossimo colpo
  reloadTimer: 0,                           // secondi alla fine della ricarica (0 = non ricarica)
};

// --- Parametri delle armi (non presenti in config.js) ---
const AUTO_FIRE = { pistol: false, rifle: true, shotgun: false };   // tenere premuto = raffica
const PELLETS = { pistol: 1, rifle: 1, shotgun: 7 };                 // pallini per colpo
const SPREAD = { pistol: 0.004, rifle: 0.012, shotgun: 0.055 };      // dispersione (radianti)
const MAX_RANGE = 100;                                               // metri

let triggerWasDown = false;   // per le armi a colpo singolo: un clic = un colpo

// ---------------------------------------------------------------
// Spawn
// ---------------------------------------------------------------
function spawnPlayer(x, z, y = 0) {
  const p = player;
  p.position.set(x, y, z);
  p.velocity.set(0, 0, 0);
  p.onGround = false;
  p.health = CONFIG.GAME.STARTING_LIVES;
  p.ammo = CONFIG.GAME.STARTING_AMMO;
  Object.keys(CONFIG.WEAPONS).forEach((name) => { p.mags[name] = CONFIG.WEAPONS[name].magazine; });
  p.magazine = p.mags[p.currentWeapon];
  p.fireCooldown = 0;
  p.reloadTimer = 0;
  triggerWasDown = false;
  clearEffects();
  applyViewModel();
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

// ---------------------------------------------------------------
// Effetti visivi: tracce dei colpi, lampi, impatti
// ---------------------------------------------------------------
const effects = [];
const unitBox = new THREE.BoxGeometry(1, 1, 1);

function addEffect(mesh, ttl, shrink) {
  Render.addToScene(mesh);
  effects.push({ mesh: mesh, ttl: ttl, max: ttl, shrink: shrink });
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.ttl -= dt;
    if (e.ttl <= 0) {
      Render.removeFromScene(e.mesh);
      e.mesh.material.dispose();
      effects.splice(i, 1);
      continue;
    }
    const k = e.ttl / e.max;
    e.mesh.material.opacity = k;
    if (e.shrink) e.mesh.scale.setScalar(e.shrink * k);
  }
}

function clearEffects() {
  effects.forEach((e) => {
    Render.removeFromScene(e.mesh);
    e.mesh.material.dispose();
  });
  effects.length = 0;
}

function glowMaterial(color) {
  return new THREE.MeshBasicMaterial({ color: color, transparent: true, fog: false });
}

function spawnTracer(from, to) {
  const m = new THREE.Mesh(unitBox, glowMaterial(0xffd27a));
  m.position.copy(from).lerp(to, 0.5);
  m.lookAt(to);
  m.scale.set(0.025, 0.025, from.distanceTo(to));
  addEffect(m, 0.07, 0);
}

function spawnFlash(point, size, color, ttl) {
  const m = new THREE.Mesh(unitBox, glowMaterial(color));
  m.position.copy(point);
  m.scale.setScalar(size);
  addEffect(m, ttl, size);
}

// ---------------------------------------------------------------
// Arma in mano (modello semplice a scatole, sempre visibile sopra la scena)
// ---------------------------------------------------------------
let viewModel = null;
let recoil = 0;
const VIEW_LENGTH = { pistol: 0.26, rifle: 0.62, shotgun: 0.55 };

function ensureViewModel() {
  if (viewModel || !Render.camera()) return;

  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xcccccc, depthTest: false });
  const gripMat = new THREE.MeshLambertMaterial({ color: 0x2b2724, depthTest: false });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.4), bodyMat);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.07), gripMat);
  grip.position.set(0, -0.11, 0.06);
  body.renderOrder = 999;
  grip.renderOrder = 999;

  viewModel = new THREE.Group();
  viewModel.add(body);
  viewModel.add(grip);
  viewModel.userData = { body: body, mat: bodyMat };
  viewModel.visible = false;
  Render.camera().add(viewModel);
  applyViewModel();
}

function applyViewModel() {
  ensureViewModel();
  if (!viewModel) return;
  const name = player.currentWeapon;
  const len = VIEW_LENGTH[name] || 0.4;
  const body = viewModel.userData.body;
  body.scale.set(1, 1, len / 0.4);
  body.position.z = -len / 2 + 0.1;
  viewModel.userData.mat.color.setHex(CONFIG.WEAPONS[name].color);
}

function showViewModel(visible) {
  ensureViewModel();
  if (viewModel) viewModel.visible = visible;
}

function animateViewModel(dt) {
  if (!viewModel) return;
  recoil = Math.max(0, recoil - dt * 9);
  const reloading = player.reloadTimer > 0 ? 1 : 0;
  viewModel.position.set(0.24, -0.22 - 0.12 * reloading, -0.55 + recoil * 0.07);
  viewModel.rotation.set(recoil * 0.1 - 0.5 * reloading, 0, 0);
}

// ---------------------------------------------------------------
// Armi: sparo, ricarica, cambio arma
// ---------------------------------------------------------------

// Direzione di sparo da angoli yaw/pitch (con dispersione casuale)
function aimDirection(yaw, pitch, spread) {
  const y = yaw + (Math.random() - 0.5) * 2 * spread;
  const pt = pitch + (Math.random() - 0.5) * 2 * spread;
  const c = Math.cos(pt);
  return new THREE.Vector3(-Math.sin(y) * c, Math.sin(pt), -Math.cos(y) * c);
}

function fire() {
  const p = player;
  const name = p.currentWeapon;
  const w = CONFIG.WEAPONS[name];

  p.magazine--;
  p.fireCooldown = w.fireRate;
  recoil = 1;

  const yaw = Render.yawPivot().rotation.y;
  const pitch = Render.pitchPivot().rotation.x;
  const eye = new THREE.Vector3(p.position.x, p.position.y + CONFIG.CAMERA.HEIGHT, p.position.z);

  // Punto da cui "esce" la traccia: a destra, un po' in basso e davanti all'occhio
  const center = aimDirection(yaw, pitch, 0);
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const muzzle = eye.clone()
    .add(right.multiplyScalar(0.22))
    .add(new THREE.Vector3(0, -0.18, 0))
    .add(center.clone().multiplyScalar(0.7));
  spawnFlash(muzzle, 0.18, 0xffb040, 0.05);

  const pellets = PELLETS[name] || 1;
  for (let i = 0; i < pellets; i++) {
    const dir = aimDirection(yaw, pitch, SPREAD[name] || 0);
    const hit = window.collision.raycast(eye, dir, MAX_RANGE);
    const dist = hit ? hit.distance : MAX_RANGE;
    const end = eye.clone().add(dir.clone().multiplyScalar(dist));
    spawnTracer(muzzle, end);
    if (hit) spawnFlash(end, 0.14, 0xffe9b0, 0.15);
  }

  // Gancio per il multiplayer: origine e direzione del colpo
  if (typeof Player !== 'undefined' && typeof Player.onShoot === 'function') {
    Player.onShoot({
      weapon: name,
      origin: { x: eye.x, y: eye.y, z: eye.z },
      yaw: yaw,
      pitch: pitch,
    });
  }
}

function startReload() {
  const p = player;
  const w = CONFIG.WEAPONS[p.currentWeapon];
  if (p.reloadTimer > 0) return;                       // sta gia' ricaricando
  if (p.magazine >= w.magazine || p.ammo <= 0) return; // pieno o niente riserva
  p.reloadTimer = w.reloadTime;
}

function finishReload() {
  const p = player;
  const w = CONFIG.WEAPONS[p.currentWeapon];
  const taken = Math.min(w.magazine - p.magazine, p.ammo);
  p.magazine += taken;
  p.ammo -= taken;
  p.reloadTimer = 0;
}

function selectWeapon(index) {
  const p = player;
  const names = Object.keys(CONFIG.WEAPONS);
  if (index < 0 || index >= names.length) return;
  const name = names[index];
  if (name === p.currentWeapon) return;

  p.mags[p.currentWeapon] = p.magazine;   // salva il caricatore dell'arma che lascio
  p.currentWeapon = name;
  p.magazine = p.mags[name] !== undefined ? p.mags[name] : CONFIG.WEAPONS[name].magazine;
  p.reloadTimer = 0;                      // cambiare arma interrompe la ricarica
  p.fireCooldown = 0.25;                  // piccolo ritardo di estrazione
  applyViewModel();
}

// Chiamata a ogni passo: cadenza di fuoco, ricarica, grilletto
function updateWeapon(dt) {
  const p = player;
  if (p.fireCooldown > 0) p.fireCooldown -= dt;

  if (p.reloadTimer > 0) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) finishReload();
  }

  const trigger = Input.isShooting();
  const clicked = trigger && !triggerWasDown;
  triggerWasDown = trigger;

  if (Input.isReloading()) startReload();
  if (p.reloadTimer > 0 || p.fireCooldown > 0) return;

  const wants = AUTO_FIRE[p.currentWeapon] ? trigger : clicked;
  if (!wants) return;

  if (p.magazine > 0) fire();
  else startReload();                      // caricatore vuoto: ricarica da solo
}

// ---------------------------------------------------------------
// Oggetti raccoglibili (salute e munizioni), tornano dopo 20 secondi
// ---------------------------------------------------------------
function checkPickups() {
  if (typeof Arena === 'undefined' || !Arena.getPickups) return;
  const now = performance.now() / 1000;
  const p = player;

  Arena.getPickups().forEach((m) => {
    const u = m.userData;
    if (u.taken) {
      if (now >= u.respawnAt) { u.taken = false; m.visible = true; }
      return;
    }
    if (p.position.distanceTo(m.position) > 1.5) return;

    if (u.type === 'health') {
      if (p.health >= CONFIG.GAME.STARTING_LIVES) return;    // salute piena: lascialo li'
      p.health = Math.min(CONFIG.GAME.STARTING_LIVES, p.health + 25);
    } else {
      p.ammo = Math.min(p.ammo + 30, 120);
    }
    u.taken = true;
    u.respawnAt = now + 20;
    m.visible = false;
  });
}

// ---------------------------------------------------------------
// Movimento principale (chiamato a passo fisso, solo mentre si gioca)
// ---------------------------------------------------------------
function updatePlayerMovement(dt) {
  if (!Render.yawPivot()) return;

  player.isRunning = Input.isRunning();

  // --- Velocita' desiderata dall'input ---
  const move = Input.getMove();   // {x, z} gia' ruotato secondo la camera, lunghezza max 1
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

  // --- Armi, effetti, oggetti ---
  updateWeapon(dt);
  updateEffects(dt);
  animateViewModel(dt);
  checkPickups();
}

// Danni (per quando ci sara' il server): ritorna true se il giocatore muore
function takeDamage(amount) {
  const p = player;
  p.health -= amount;
  if (p.health > 0) return false;

  p.health = 0;
  p.deaths++;
  const spawns = MAP.spawnPoints;
  const spawn = spawns[Math.floor(Math.random() * spawns.length)];
  setTimeout(() => spawnPlayer(spawn.x, spawn.z, spawn.y || 0), CONFIG.GAME.RESPAWN_TIME * 1000);
  return true;
}

// --- Esporta ---
const Player = {
  get: () => player,
  spawn: spawnPlayer,
  update: updatePlayerMovement,
  takeDamage: takeDamage,
  reload: startReload,
  selectWeapon: selectWeapon,
  showViewModel: showViewModel,
  resetKills: () => { player.kills = 0; player.deaths = 0; },
  onShoot: null,   // gancio per il multiplayer
};

if (typeof window !== 'undefined') {
  window.Player = Player;
}