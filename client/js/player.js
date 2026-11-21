// DOOMSDAY - player.js
// Movimento FPS, sparo, mira, raccolta oggetti, effetti e arma in mano.
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
  crouching: false,                         // accovacciato (Shift / R3): piu' basso e piu' lento
  height: 1.8,                              // altezza per le collisioni (piu' bassa da accovacciati)
  dead: false,                              // eliminato: resta a guardare
  fireCooldown: 0,                          // secondi prima del prossimo colpo
};

// --- Armi: i numeri (danni, cadenza, dispersione, zoom...) sono in js/shared/weapons.js ---
const MAX_RANGE = 100;          // metri: portata usata se un'arma non ne indica una
const MISS_DISTANCE = 250;      // un colpo a vuoto si manda al server qui: fuori mappa, non colpisce nessuno
const AIM_TIME = 0.14;          // secondi per entrare/uscire dalla mira
const AIM_MOVE_SPEED = 0.6;     // mirando si cammina piu' piano (e non si corre)
const STAND_HEIGHT = 1.8;       // altezza del giocatore in piedi (collisioni)
const CROUCH_HEIGHT = 1.35;     // altezza da accovacciato: si passa sotto gli ostacoli bassi
const CROUCH_EYE = (CONFIG.CAMERA && CONFIG.CAMERA.CROUCH_HEIGHT) || 1.2;   // occhi da accovacciato
const CROUCH_SPEED = (CONFIG.MOVEMENT && CONFIG.MOVEMENT.CROUCH_SPEED) || 0.5;  // velocita' (x camminata)
const CROUCH_TIME = 0.12;       // secondi per abbassarsi / rialzarsi
// Mirando l'arma scende un po' sotto il mirino, cosi' non lo copre (il mirino resta dov'e')
const ADS_DROP = 0.026;

const prevPosition = new THREE.Vector3();   // posizione al passo di fisica precedente (camera morbida)

let triggerWasDown = false;
let interactWasDown = false;
let collectCooldown = 0;
let shownWeapon = '';
let crouchAmount = 0;           // 0 = in piedi, 1 = accovacciato (per la camera, sfuma)
let prevCrouchAmount = 0;

// Arma attuale, decisa dal server (pistola di partenza, poi quella raccolta)
function currentWeapon() {
  const me = typeof Network !== 'undefined' ? Network.me() : null;
  return me && CONFIG.WEAPONS[me.weapon] ? me.weapon : 'pistol';
}

function weaponStats(name) {
  return CONFIG.WEAPONS[name || currentWeapon()] || CONFIG.WEAPONS.pistol;
}

// ---------------------------------------------------------------
// Mira (tasto destro / grilletto sinistro): la visuale si stringe (zoom),
// i colpi si allargano meno, il mirino si stringe e l'arma va al centro.
// ---------------------------------------------------------------
const aim = { amount: 0 };      // 0 = arma al fianco, 1 = mira completa

function ease(t) { return t * t * (3 - 2 * t); }

function setCameraFov(fov) {
  const cam = Render.camera();
  if (!cam || Math.abs(cam.fov - fov) < 0.01) return;
  cam.fov = fov;
  cam.updateProjectionMatrix();
}

function updateAim(dt) {
  const target = !player.dead && Input.isAiming() ? 1 : 0;
  const step = dt / AIM_TIME;
  aim.amount += Math.max(-step, Math.min(step, target - aim.amount));
  const base = CONFIG.CAMERA.FOV;
  setCameraFov(base + (weaponStats().adsFov - base) * ease(aim.amount));
}

// Fuori dalla partita (menu, lobby, classifica) la visuale torna normale
function resetAim() {
  aim.amount = 0;
  setCameraFov(CONFIG.CAMERA.FOV);
}

// Mirando lo zoom rende il mouse piu' veloce sullo schermo: si rallenta in proporzione
function lookScale() {
  const cam = Render.camera();
  if (!cam) return 1;
  const rad = Math.PI / 360;
  return Math.tan(cam.fov * rad) / Math.tan(CONFIG.CAMERA.FOV * rad);
}

// Dispersione attuale dei colpi (radianti): meno mirando, di piu' in salto
function currentSpread() {
  const w = weaponStats();
  const s = w.spread + (w.adsSpread - w.spread) * aim.amount;
  return player.onGround ? s : s * 1.6;
}

// Per l'HUD: quanto e' aperto il mirino (pixel dal centro) e quanto si sta mirando
function crosshairInfo() {
  const cam = Render.camera();
  const half = window.innerHeight / 2;
  const fov = cam ? cam.fov : CONFIG.CAMERA.FOV;
  const gap = Math.tan(currentSpread()) / Math.tan(fov * Math.PI / 360) * half;
  return { gap: Math.max(3, Math.min(48, gap)), aim: aim.amount };
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
  prevPosition.set(x, y, z);
  p.velocity.set(0, 0, 0);
  p.onGround = false;
  p.dead = false;
  p.crouching = false;
  p.height = STAND_HEIGHT;
  p.fireCooldown = 0;
  crouchAmount = 0;
  prevCrouchAmount = 0;
  if (window.Input && Input.resetCrouch) Input.resetCrouch();
  triggerWasDown = false;
  interactWasDown = false;
  collectCooldown = 0;
  shownWeapon = '';
  resetAim();
  clearEffects();
  applyViewModel();
  updatePlayerCamera();
}

function setDead(dead) {
  player.dead = dead;
  if (dead) player.velocity.set(0, player.velocity.y, 0);
}

// Altezza degli occhi: in piedi CONFIG.CAMERA.HEIGHT, accovacciati piu' in basso (sfuma)
function eyeHeight(amount) {
  const a = ease(amount === undefined ? crouchAmount : amount);
  return CONFIG.CAMERA.HEIGHT + (CROUCH_EYE - CONFIG.CAMERA.HEIGHT) * a;
}

// La camera segue i piedi + altezza occhi (cosi' si vede anche il salto)
function updatePlayerCamera() {
  const yaw = Render.yawPivot();
  if (yaw) {
    yaw.position.set(
      player.position.x,
      player.position.y + eyeHeight(),
      player.position.z
    );
  }
}

// Accovacciamento: ci si abbassa subito; ci si rialza solo se sopra la testa c'e' spazio
function updateCrouch(dt) {
  prevCrouchAmount = crouchAmount;
  const want = !player.dead && Input.isCrouching();
  if (want) player.crouching = true;
  else if (player.crouching && !overlapsSolid(player.position.x, player.position.y, player.position.z)) player.crouching = false;
  player.height = player.crouching ? CROUCH_HEIGHT : STAND_HEIGHT;
  const step = dt / CROUCH_TIME;
  crouchAmount += Math.max(-step, Math.min(step, (player.crouching ? 1 : 0) - crouchAmount));
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
// Arma in mano (prima persona): modello low-poly di models.js, disegnato in una scena
// a parte sopra a tutto (Render.viewScene). Al fianco o al centro mirando, con rinculo,
// oscillazione mentre si cammina e un'animazione quando si cambia arma.
// ---------------------------------------------------------------
let viewModel = null;           // gruppo che si muove (fianco/mira/rinculo)
let viewWeapon = null;          // modello dell'arma attuale
let muzzleFlash = null;         // lampo alla bocca della canna
let recoil = 0;
let flashTime = 0;
let switchAnim = 0;
let bobPhase = 0;

function ensureViewModel() {
  if (viewModel || !Render.viewScene || !Render.viewScene()) return;
  viewModel = new THREE.Group();
  viewModel.visible = false;

  // Lampo: tre quadrati incrociati che brillano (si vedono per un attimo dopo ogni colpo)
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffc860, transparent: true, opacity: 0.95, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  muzzleFlash = new THREE.Group();
  const a = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.11), flashMat);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), flashMat);
  b.rotation.y = Math.PI / 2;
  const c = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.16), flashMat);
  c.rotation.y = Math.PI / 2;
  muzzleFlash.add(a, b, c);
  muzzleFlash.visible = false;
  viewModel.add(muzzleFlash);

  Render.viewScene().add(viewModel);
  applyViewModel();
}

function applyViewModel() {
  ensureViewModel();
  if (!viewModel) return;
  const name = currentWeapon();
  if (name === shownWeapon && viewWeapon) return;
  shownWeapon = name;
  if (viewWeapon) viewModel.remove(viewWeapon);
  viewWeapon = Models.weapon(name);
  viewModel.add(viewWeapon);
  muzzleFlash.position.fromArray(Models.info(name).muzzle);
  switchAnim = 1;                       // l'arma nuova sale dal basso
}

function showViewModel(visible) {
  ensureViewModel();
  if (viewModel) viewModel.visible = visible && !player.dead;
}

function animateViewModel(dt) {
  if (!viewModel) return;
  const info = Models.info(shownWeapon);
  const a = ease(aim.amount);

  recoil = Math.max(0, recoil - dt * 10);
  switchAnim = Math.max(0, switchAnim - dt * 4);
  flashTime = Math.max(0, flashTime - dt);
  muzzleFlash.visible = flashTime > 0;
  if (muzzleFlash.visible) muzzleFlash.rotation.z = Math.random() * Math.PI;

  // Oscillazione camminando (solo al fianco)
  const speed = Math.hypot(player.velocity.x, player.velocity.z);
  if (player.onGround) bobPhase += dt * speed * 1.7;
  const bob = (1 - a) * Math.min(1, speed / CONFIG.MOVEMENT.RUN_SPEED) * 0.014;

  // Fianco -> centro: le tacche di mira vanno sulla linea dello sguardo, ma un po' piu' in basso
  // (ADS_DROP o adsDrop dell'arma), cosi' l'arma non copre il mirino
  const drop = info.adsDrop !== undefined ? info.adsDrop : ADS_DROP;
  const x = info.hip[0] * (1 - a) + Math.cos(bobPhase) * bob;
  const y = info.hip[1] * (1 - a) - (info.sight + drop) * a - Math.abs(Math.sin(bobPhase)) * bob - switchAnim * 0.22;
  const z = info.hip[2] * (1 - a) + info.adsZ * a + recoil * 0.06 * info.kick;
  viewModel.position.set(x, y, z);
  viewModel.rotation.set(recoil * 0.12 * info.kick - switchAnim * 0.5, 0.05 * (1 - a), 0);
}

// Punto della bocca della canna nel mondo (per far partire le tracce dei colpi)
function muzzleWorld() {
  const cam = Render.camera();
  if (!viewModel || !cam) return null;
  Render.yawPivot().updateMatrixWorld(true);
  viewModel.updateMatrix();
  const p = new THREE.Vector3().fromArray(Models.info(shownWeapon).muzzle).applyMatrix4(viewModel.matrix);
  return cam.localToWorld(p);
}

// ---------------------------------------------------------------
// Sparo: il client calcola dove cade il colpo, il server decide chi e' colpito
// ---------------------------------------------------------------
// Direzione dello sguardo, deviata a caso dentro un cono largo "spread" radianti
function aimDirection(yaw, pitch, spread) {
  const r = spread * Math.sqrt(Math.random());
  const t = Math.random() * Math.PI * 2;
  const y = yaw + Math.cos(t) * r;
  const pt = pitch + Math.sin(t) * r;
  const c = Math.cos(pt);
  return new THREE.Vector3(-Math.sin(y) * c, Math.sin(pt), -Math.cos(y) * c);
}

function fire(name, w) {
  recoil = 1;
  flashTime = 0.05;
  if (window.GameAudio) window.GameAudio.playShot(name);

  const yaw = Render.yawPivot().rotation.y;
  const pitch = Render.pitchPivot().rotation.x;
  const eye = new THREE.Vector3(player.position.x, player.position.y + eyeHeight(), player.position.z);
  const range = w.range || MAX_RANGE;
  const spread = currentSpread();

  // Raggio del colpo: muri e terreno, poi gli altri giocatori se sono piu' vicini.
  // Il server colpisce chi sta entro 2 m dal punto d'impatto, quindi se miro a un giocatore
  // il punto d'impatto deve cadere SU di lui e non sul muro dietro.
  const dir = aimDirection(yaw, pitch, spread);
  const worldHit = window.collision.raycast(eye, dir, range);
  const reach = worldHit ? worldHit.distance : range;
  const playerHit = Network.raycastPlayers(eye, dir, reach);
  const hit = playerHit ? playerHit.point : worldHit ? worldHit.point : null;

  // A vuoto (oltre la portata dell'arma): il punto va fuori mappa, cosi' non colpisce nessuno
  const sent = hit || { x: eye.x + dir.x * MISS_DISTANCE, y: eye.y + dir.y * MISS_DISTANCE, z: eye.z + dir.z * MISS_DISTANCE };
  // targetId = chi ho colpito (null = a vuoto o su un muro): il server controlla e toglie la vita
  Network.sendShoot({ x: sent.x, z: sent.z, y: sent.y, ox: eye.x, oy: eye.y, oz: eye.z, targetId: playerHit ? playerHit.id : null });

  // --- Solo grafica: tracce dalla bocca della canna ---
  const muzzle = muzzleWorld() || eye.clone().add(dir.clone().multiplyScalar(0.7));
  const end = hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : eye.clone().add(dir.clone().multiplyScalar(range));
  spawnTracer(muzzle, end);
  if (hit) spawnFlash(end, 0.14, 0xffe9b0, 0.15);

  for (let i = 1; i < (w.pellets || 1); i++) {
    const d = aimDirection(yaw, pitch, Math.max(spread, 0.02) * 1.6);
    const h = window.collision.raycast(eye, d, range);
    spawnTracer(muzzle, eye.clone().add(d.multiplyScalar(h ? h.distance : range)));
  }

  if (playerHit && typeof window.hitMarker === 'function') window.hitMarker();
}

function updateWeapon(dt) {
  const me = Network.me();
  if (player.dead || !me || me.isDead) { triggerWasDown = false; return; }

  if (player.fireCooldown > 0) player.fireCooldown -= dt;
  if (currentWeapon() !== shownWeapon) applyViewModel();

  const name = currentWeapon();
  const w = weaponStats(name);
  const trigger = Input.isShooting();
  const clicked = trigger && !triggerWasDown;
  triggerWasDown = trigger;

  // Pistola e fucile a pompa: un colpo per click. Mitraglietta e fucile d'assalto: a raffica.
  if (!(w.auto ? trigger : clicked) || player.fireCooldown > 0) return;

  if (Network.ammo() > 0) {
    fire(name, w);
    player.fireCooldown += w.fireRate;   // += : la cadenza resta giusta anche a raffica
  } else {
    player.fireCooldown = 0.25;          // click a vuoto: il server avvisa con outOfAmmo
  }
}

// ---------------------------------------------------------------
// Oggetti: si raccolgono con E quando si e' vicini (il server decide se vale)
// ---------------------------------------------------------------
function updateInteract(dt) {
  if (collectCooldown > 0) collectCooldown -= dt;

  const near = player.dead ? null : Network.nearestItem(player.position);
  if (typeof window.setPrompt === 'function') {
    // il tasto mostrato (E, Y, triangolo...) lo sceglie menu.js in base al dispositivo usato
    window.setPrompt(near ? 'interact' : '', near ? 'Raccogli ' + near.name : '');
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
  prevPosition.copy(player.position);

  updateAim(dt);
  updateCrouch(dt);
  // mirando o accovacciati non si corre
  player.isRunning = !player.dead && !player.crouching && Input.isRunning() && aim.amount < 0.5;

  // --- Velocita' desiderata dall'input (da eliminati ci si ferma) ---
  const move = player.dead ? { x: 0, z: 0 } : Input.getMove();
  let baseSpeed = player.isRunning ? CONFIG.MOVEMENT.RUN_SPEED : CONFIG.MOVEMENT.WALK_SPEED;
  if (player.crouching) baseSpeed = CONFIG.MOVEMENT.WALK_SPEED * CROUCH_SPEED;
  const speed = baseSpeed * (1 + (AIM_MOVE_SPEED - 1) * aim.amount);
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

// La fisica va a passo fisso: a ogni frame la camera si mette tra la posizione del passo
// precedente e quella attuale (alpha da 0 a 1). Cosi' il movimento non scatta mai.
function smoothCamera(alpha) {
  const yaw = Render.yawPivot();
  if (!yaw) return;
  const a = Math.max(0, Math.min(1, alpha));
  const eye = eyeHeight(prevCrouchAmount + (crouchAmount - prevCrouchAmount) * a);
  yaw.position.set(
    prevPosition.x + (player.position.x - prevPosition.x) * a,
    prevPosition.y + (player.position.y - prevPosition.y) * a + eye,
    prevPosition.z + (player.position.z - prevPosition.z) * a
  );
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
  resetAim: resetAim,
  smoothCamera: smoothCamera,
  lookScale: lookScale,
  crosshair: crosshairInfo,
  isAiming: () => aim.amount > 0.5,
  isCrouching: () => player.crouching,
  eyeHeight: () => eyeHeight(),
  aimAmount: () => aim.amount,       // 0 = arma al fianco, 1 = mira completa (per la sensibilita' in mira)
  // Il server gestisce: niente ricarica, cambio arma o danni locali
  selectWeapon: () => {},
  reload: () => {},
  takeDamage: () => false,
  resetKills: () => {},
};

if (typeof window !== 'undefined') {
  window.Player = Player;
}