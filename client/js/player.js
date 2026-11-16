// DOOMSDAY - player.js
// Movimento FPS, sparo, raccolta oggetti, effetti e arma in mano.
// In multiplayer salute, scudo, munizioni e arma le decide il SERVER (Network.me()):
// qui si legge soltanto, si mostra e si mandano al server spari e raccolte.
// Dipendenze: Three.js, CONFIG, Render, Input, collision, MAP, Network

// --- Stato fisico del giocatore ---
const player = {
  id: '',
  position: new THREE.Vector3(0, 0, 0),     // posizione dei PIEDI
  velocity: new THREE.Vector3(0, 0, 0),
  onGround: false,
  isRunning: false,
  dead: false,                              // eliminato: resta a guardare
  fireCooldown: 0,                          // secondi prima del prossimo colpo
};

// --- Parametri delle armi disponibili sul server ---
const PELLETS = { pistol: 1, shotgun: 7 };                 // tracce disegnate per colpo
const SPREAD = { pistol: 0.004, shotgun: 0.055 };          // dispersione visiva (radianti)
const MAX_RANGE = 100;                                      // metri

let triggerWasDown = false;
let interactWasDown = false;
let collectCooldown = 0;
let shownWeapon = '';

// Arma attuale, decisa dal server (pistola di partenza, fucile a pompa se raccolto)
function currentWeapon() {
  const me = typeof Network !== 'undefined' ? Network.me() : null;
  return me && CONFIG.WEAPONS[me.weapon] ? me.weapon : 'pistol';
}

// ---------------------------------------------------------------
// Spawn
// ---------------------------------------------------------------
function overlapsSolid(x, y, z) {
  const p = { x: x, y: y, z: z };
  return MAP.boxes.some((b) => b.solid !== false && window.collision.overlaps(p, b));
}

// Il server sceglie lo spawn a caso e puo' cadere dentro un container: se succede,
// si usa il punto di partenza libero piu' vicino della mappa.
function safeSpawn(x, z) {
  let sx = x;
  let sz = z;
  let sy = 0;
  if (overlapsSolid(sx, 0, sz) || Math.abs(sx) > MAP.SIZE / 2 - 1 || Math.abs(sz) > MAP.SIZE / 2 - 1) {
    let best = null;
    MAP.spawnPoints.forEach((s) => {
      if (overlapsSolid(s.x, s.y || 0, s.z)) return;
      const d = Math.hypot(s.x - x, s.z - z);
      if (!best || d < best.d) best = { s: s, d: d };
    });
    if (best) { sx = best.s.x; sz = best.s.z; sy = best.s.y || 0; }
  }
  return { x: sx, y: sy, z: sz, rot: Math.atan2(sx, sz) };   // guarda verso il centro
}

function spawnPlayer(x, z, y = 0) {
  const p = player;
  p.position.set(x, y, z);
  p.velocity.set(0, 0, 0);
  p.onGround = false;
  p.dead = false;
  p.fireCooldown = 0;
  triggerWasDown = false;
  interactWasDown = false;
  collectCooldown = 0;
  shownWeapon = '';
  clearEffects();
  applyViewModel();
  updatePlayerCamera();
}

function setDead(dead) {
  player.dead = dead;
  if (dead) player.velocity.set(0, player.velocity.y, 0);
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

// Colpo di un altro giocatore (se il server lo inoltra con l'evento facoltativo playerShot)
function showShot(from, to) {
  const a = new THREE.Vector3(from.x, from.y, from.z);
  const b = new THREE.Vector3(to.x, to.y, to.z);
  spawnTracer(a, b);
  spawnFlash(b, 0.14, 0xffe9b0, 0.15);
}

// ---------------------------------------------------------------
// Arma in mano (modello semplice a scatole, sempre visibile sopra la scena)
// ---------------------------------------------------------------
let viewModel = null;
let recoil = 0;
const VIEW_LENGTH = { pistol: 0.26, shotgun: 0.55 };

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
  const name = currentWeapon();
  shownWeapon = name;
  const len = VIEW_LENGTH[name] || 0.4;
  const body = viewModel.userData.body;
  body.scale.set(1, 1, len / 0.4);
  body.position.z = -len / 2 + 0.1;
  viewModel.userData.mat.color.setHex(CONFIG.WEAPONS[name].color);
}

function showViewModel(visible) {
  ensureViewModel();
  if (viewModel) viewModel.visible = visible && !player.dead;
}

function animateViewModel(dt) {
  if (!viewModel) return;
  recoil = Math.max(0, recoil - dt * 9);
  viewModel.position.set(0.24, -0.22, -0.55 + recoil * 0.07);
  viewModel.rotation.set(recoil * 0.1, 0, 0);
}

// ---------------------------------------------------------------
// Sparo: il client calcola dove cade il colpo, il server decide chi e' colpito
// ---------------------------------------------------------------
function aimDirection(yaw, pitch, spread) {
  const y = yaw + (Math.random() - 0.5) * 2 * spread;
  const pt = pitch + (Math.random() - 0.5) * 2 * spread;
  const c = Math.cos(pt);
  return new THREE.Vector3(-Math.sin(y) * c, Math.sin(pt), -Math.cos(y) * c);
}

function fire() {
  const name = currentWeapon();
  const w = CONFIG.WEAPONS[name];
  player.fireCooldown = w.fireRate;
  recoil = 1;

  
  if (window.GameAudio) window.GameAudio.playShot(name);

  const yaw = Render.yawPivot().rotation.y;
  const pitch = Render.pitchPivot().rotation.x;
  const eye = new THREE.Vector3(player.position.x, player.position.y + CONFIG.CAMERA.HEIGHT, player.position.z);

  // Raggio centrale: muri e terreno, poi gli altri giocatori se sono piu' vicini.
  // Il server colpisce chi sta entro 2 m dal punto d'impatto, quindi se miro a un giocatore
  // il punto d'impatto deve cadere SU di lui e non sul muro dietro.
  const center = aimDirection(yaw, pitch, 0);
  const worldHit = window.collision.raycast(eye, center, MAX_RANGE);
  const reach = worldHit ? worldHit.distance : MAX_RANGE;
  const playerHit = Network.raycastPlayers(eye, center, reach);
  const impact = playerHit ? playerHit.point
    : worldHit ? worldHit.point
    : { x: eye.x + center.x * MAX_RANGE, y: eye.y + center.y * MAX_RANGE, z: eye.z + center.z * MAX_RANGE };

  Network.sendShoot({ x: impact.x, z: impact.z, y: impact.y, ox: eye.x, oy: eye.y, oz: eye.z });

  // --- Solo grafica: lampo alla bocca e tracce ---
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const muzzle = eye.clone()
    .add(right.multiplyScalar(0.22))
    .add(new THREE.Vector3(0, -0.18, 0))
    .add(center.clone().multiplyScalar(0.7));
  spawnFlash(muzzle, 0.18, 0xffb040, 0.05);

  const end = new THREE.Vector3(impact.x, impact.y, impact.z);
  spawnTracer(muzzle, end);
  if (worldHit || playerHit) spawnFlash(end, 0.14, 0xffe9b0, 0.15);

  for (let i = 1; i < (PELLETS[name] || 1); i++) {
    const dir = aimDirection(yaw, pitch, SPREAD[name] || 0);
    const h = window.collision.raycast(eye, dir, MAX_RANGE);
    const dist = h ? h.distance : MAX_RANGE;
    spawnTracer(muzzle, eye.clone().add(dir.multiplyScalar(dist)));
  }

  if (playerHit && typeof window.hitMarker === 'function') window.hitMarker();
}

function updateWeapon(dt) {
  const me = Network.me();
  if (player.dead || !me || me.isDead) return;

  if (player.fireCooldown > 0) player.fireCooldown -= dt;
  if (currentWeapon() !== shownWeapon) applyViewModel();

  const trigger = Input.isShooting();
  const clicked = trigger && !triggerWasDown;
  triggerWasDown = trigger;
  if (!clicked || player.fireCooldown > 0) return;

  if (me.ammo > 0) fire();
  else player.fireCooldown = 0.25;      // click a vuoto: il server avvisa con outOfAmmo
}

// ---------------------------------------------------------------
// Oggetti: si raccolgono con E quando si e' vicini (il server decide se vale)
// ---------------------------------------------------------------
function updateInteract(dt) {
  if (collectCooldown > 0) collectCooldown -= dt;

  const near = player.dead ? null : Network.nearestItem(player.position);
  if (typeof window.setPrompt === 'function') {
    window.setPrompt(near ? 'E  ·  ' + near.name : '');
  }

  const pressed = Input.isInteracting();
  const edge = pressed && !interactWasDown;
  interactWasDown = pressed;

  if (near && edge && collectCooldown <= 0) {
    Network.collect(near.id);
    collectCooldown = 0.3;
  }
}

// ---------------------------------------------------------------
// Movimento principale (chiamato a passo fisso, solo mentre si gioca)
// ---------------------------------------------------------------
function updatePlayerMovement(dt) {
  if (!Render.yawPivot()) return;

  player.isRunning = !player.dead && Input.isRunning();

  // --- Velocita' desiderata dall'input (da eliminati ci si ferma) ---
  const move = player.dead ? { x: 0, z: 0 } : Input.getMove();
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
  if (!player.dead && Input.isJumping() && player.onGround) {
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
  updateInteract(dt);
}

// --- Esporta ---
const Player = {
  get: () => player,
  spawn: spawnPlayer,
  safeSpawn: safeSpawn,
  update: updatePlayerMovement,
  setDead: setDead,
  showViewModel: showViewModel,
  showShot: showShot,
  // Il server gestisce: niente ricarica, cambio arma o danni locali
  selectWeapon: () => {},
  reload: () => {},
  takeDamage: () => false,
  resetKills: () => {},
};

if (typeof window !== 'undefined') {
  window.Player = Player;
}