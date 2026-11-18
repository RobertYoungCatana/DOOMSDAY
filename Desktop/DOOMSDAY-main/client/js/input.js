// DOOMSDAY - input.js
// Gestione tastiera, mouse e Gamepad API.
// Fornisce: movimento, visuale, salto, corsa, sparo, mira, ricarica, cambio arma, interazione, pausa.
// Controller (layout standard, come Fortnite): RT spara, LT mira, premere la levetta sinistra (L3)
// fa correre, Start/Options mette in pausa.

const keys = {};
const mouse = {
  x: 0,          // rotazione accumulata dall'ultimo frame (si azzera quando viene letta)
  y: 0,
  locked: false,
  sensitivity: CONFIG ? CONFIG.MOVEMENT.MOUSE_SENSITIVITY : 0.002,
};

let gamepadIndex = -1;
let gamepadConnected = false;
let controllerSensitivity = CONFIG ? CONFIG.MOVEMENT.CONTROLLER_SENSITIVITY : 0.04;

// Sensibilita' mentre si mira (tasto destro / grilletto sinistro): 1 = come senza mira
// (la visuale rallenta gia' da sola con lo zoom), meno di 1 = piu' lenta, piu' di 1 = piu' veloce.
let mouseAimSensitivity = 1;
let controllerAimSensitivity = 1;

// Dopo aver premuto un tasto del controller in un menu (per esempio A su "Riprendi"),
// i tasti non contano per il gioco finche' non vengono rilasciati: niente salto involontario.
let padSuppressed = false;

// Stato del controller che serve tra un frame e l'altro (letto da pollGamepad, una volta per frame)
let padSprint = false;          // corsa attivata con L3: resta attiva finche' ci si muove
let padPrevSprint = false;
let padPrevPause = false;
let padPausePressed = false;    // Start premuto (da consumare con consumePausePress)

// --- Tastiera ---
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;

  // ESC mette in pausa (togglePause non fa niente se non si sta giocando).
  // Serve anche quando si gioca col controller e il mouse non e' bloccato.
  if (e.code === 'Escape' && typeof window.togglePause === 'function') window.togglePause();

  // I tasti di gioco non devono fare altro SOLO mentre si gioca (mouse bloccato):
  // fuori dal gioco servono per scrivere il nickname.
  if (mouse.locked) {
    if (e.code === 'Space' || ['KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(e.code)) e.preventDefault();

    // Cambio arma: tasti 1-3
    if (e.code === 'Digit1') Player.selectWeapon(0);
    if (e.code === 'Digit2') Player.selectWeapon(1);
    if (e.code === 'Digit3') Player.selectWeapon(2);
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

// Se la finestra perde il focus si rilasciano tutti i tasti (niente tasti "incollati")
window.addEventListener('blur', () => {
  Object.keys(keys).forEach((k) => { keys[k] = false; });
});

// --- Mouse ---
function getCanvas() {
  if (!Render) return null;
  const renderer = Render.renderer();
  return renderer ? renderer.domElement : null;
}

document.addEventListener('mousemove', (e) => {
  if (!mouse.locked) return;
  mouse.x += e.movementX * mouse.sensitivity;
  mouse.y += e.movementY * mouse.sensitivity;
});

document.addEventListener('mousedown', (e) => {
  if (e.button === 0) keys['Mouse0'] = true;   // sparo
  if (e.button === 2) keys['Mouse2'] = true;   // mira (tasto destro)
});

document.addEventListener('mouseup', (e) => {
  if (e.button === 0) keys['Mouse0'] = false;
  if (e.button === 2) keys['Mouse2'] = false;
});

// Il tasto destro serve per mirare: niente menu del browser sopra il gioco
document.addEventListener('contextmenu', (e) => {
  if (mouse.locked || e.target === getCanvas()) e.preventDefault();
});

document.addEventListener('pointerlockchange', () => {
  mouse.locked = document.pointerLockElement === getCanvas();
  if (!mouse.locked) { keys['Mouse0'] = false; keys['Mouse2'] = false; }
});

// --- Gamepad API ---
window.addEventListener('gamepadconnected', (e) => {
  gamepadIndex = e.gamepad.index;
  gamepadConnected = true;
  console.log('Gamepad collegato:', e.gamepad.id);
});

window.addEventListener('gamepaddisconnected', (e) => {
  if (gamepadIndex === e.gamepad.index) {
    gamepadIndex = -1;
    gamepadConnected = false;
  }
});

function pressed(gp, i) {
  return !!(gp.buttons[i] && gp.buttons[i].pressed);
}

// Grilletti analogici: premuti quando sono giu' per almeno un terzo
function triggerDown(gp, i) {
  const b = gp.buttons[i];
  if (!b) return false;
  return typeof b.value === 'number' ? b.value > 0.3 : !!b.pressed;
}

// Il controller in uso. Se l'evento "gamepadconnected" non e' arrivato (pagina aperta col
// controller gia' collegato) lo si cerca tra quelli che il browser vede.
function currentPad() {
  if (!navigator.getGamepads) return null;
  const pads = navigator.getGamepads();
  let gp = gamepadIndex >= 0 ? pads[gamepadIndex] : null;
  if (gp && gp.connected !== false) return gp;
  for (let i = 0; i < pads.length; i++) {
    if (pads[i] && pads[i].connected !== false) {
      gamepadIndex = i;
      gamepadConnected = true;
      return pads[i];
    }
  }
  return null;
}

function readGamepad() {
  const gp = currentPad();
  if (!gp) return null;

  const deadzone = 0.15;
  const dz = (v) => (Math.abs(v) < deadzone ? 0 : v);

  const buttons = {
    jump: pressed(gp, 0),
    shoot: pressed(gp, 7),      // grilletto destro
    aim: triggerDown(gp, 6),    // grilletto sinistro: mira
    reload: pressed(gp, 2),
    interact: pressed(gp, 3),
    weaponPrev: pressed(gp, 4),
    weaponNext: pressed(gp, 5),
    sprint: pressed(gp, 10),    // premere la levetta sinistra (L3): corsa
    pause: pressed(gp, 9),      // Start / Options: pausa
  };
  if (padSuppressed) {
    const held = Object.keys(buttons).some((k) => buttons[k]) || pressed(gp, 1);
    if (held) Object.keys(buttons).forEach((k) => { buttons[k] = false; });
    else padSuppressed = false;
  }

  return {
    move: { x: dz(gp.axes[0] || 0), z: -dz(gp.axes[1] || 0) },
    look: { x: dz(gp.axes[2] || 0), y: dz(gp.axes[3] || 0) },   // y positivo = guarda in basso, come il mouse
    buttons: buttons,
  };
}

// Tasti del controller per muoversi nei menu (letti da menunav.js):
// croce direzionale o levetta sinistra, A conferma, B indietro, LB / RB cambiano scheda.
function readMenuPad() {
  const gp = currentPad();
  if (!gp) return null;
  const ax = gp.axes[0] || 0;
  const ay = gp.axes[1] || 0;
  const S = 0.6;                 // levetta: spinta abbastanza da non scattare per sbaglio
  return {
    up: pressed(gp, 12) || ay < -S,
    down: pressed(gp, 13) || ay > S,
    left: pressed(gp, 14) || ax < -S,
    right: pressed(gp, 15) || ax > S,
    confirm: pressed(gp, 0),
    back: pressed(gp, 1),
    tabPrev: pressed(gp, 4),
    tabNext: pressed(gp, 5),
    active: gp.buttons.some((b) => b && b.pressed) || gp.axes.some((a) => Math.abs(a) > 0.3),
  };
}

// --- API pubblica ---
function isJumping() {
  const gp = readGamepad();
  return !!(keys['Space'] || (gp && gp.buttons.jump));
}

// Da chiamare una volta per frame: tasti del controller che si premono e si rilasciano
// (corsa con L3 che resta attiva, pausa con Start)
function pollGamepad() {
  const gp = readGamepad();
  if (!gp) {
    padSprint = false;
    padPrevSprint = false;
    padPrevPause = false;
    return;
  }
  const b = gp.buttons;
  if (b.sprint && !padPrevSprint) padSprint = !padSprint;
  if (Math.hypot(gp.move.x, gp.move.z) < 0.3 || b.aim) padSprint = false;   // fermo o mirando: si cammina
  if (b.pause && !padPrevPause) padPausePressed = true;
  padPrevSprint = b.sprint;
  padPrevPause = b.pause;
}

// true una sola volta per ogni pressione di Start
function consumePausePress() {
  const p = padPausePressed;
  padPausePressed = false;
  return p;
}

function isRunning() {
  return !!(keys['ShiftLeft'] || keys['ShiftRight'] || padSprint);
}

function isAiming() {
  const gp = readGamepad();
  return !!((keys['Mouse2'] && mouse.locked) || (gp && gp.buttons.aim));
}

function isShooting() {
  const gp = readGamepad();
  return !!((keys['Mouse0'] && mouse.locked) || (gp && gp.buttons.shoot));
}

function isReloading() {
  const gp = readGamepad();
  return !!(keys['KeyR'] || (gp && gp.buttons.reload));
}

function isInteracting() {
  const gp = readGamepad();
  return !!(keys['KeyE'] || (gp && gp.buttons.interact));
}

const moveForward = new THREE.Vector3();
const moveRight = new THREE.Vector3();
const moveDir = new THREE.Vector3();
const moveOut = { x: 0, z: 0 };

function getMove() {
  const yaw = Render ? Render.yawPivot() : null;
  const a = yaw ? yaw.rotation.y : 0;

  // Con rotazione Y = a: avanti = (-sin a, -cos a), destra = (cos a, -sin a)
  const forward = moveForward.set(-Math.sin(a), 0, -Math.cos(a));
  const right = moveRight.set(Math.cos(a), 0, -Math.sin(a));

  let moveX = 0;
  let moveZ = 0;
  if (keys['KeyW']) moveZ += 1;
  if (keys['KeyS']) moveZ -= 1;
  if (keys['KeyD']) moveX += 1;
  if (keys['KeyA']) moveX -= 1;

  const gp = readGamepad();
  if (gp) {
    moveX = gp.move.x;
    moveZ = gp.move.z;
  }

  const dir = moveDir.set(0, 0, 0);
  dir.addScaledVector(forward, moveZ);
  dir.addScaledVector(right, moveX);
  if (dir.lengthSq() > 1) dir.normalize();   // niente diagonale piu' veloce

  moveOut.x = dir.x;
  moveOut.z = dir.z;
  return moveOut;
}

// Rotazione da applicare in QUESTO passo (radianti): mouse = variazione accumulata, poi si azzera.
// aimAmount: 0 = arma al fianco, 1 = mira completa (sfuma tra la sensibilita' normale e quella in mira).
function getLook(dt = 1 / 60, aimAmount = 0) {
  const a = Math.max(0, Math.min(1, aimAmount || 0));
  const mouseK = 1 + (mouseAimSensitivity - 1) * a;
  let x = mouse.x * mouseK;
  let y = mouse.y * mouseK;
  mouse.x = 0;
  mouse.y = 0;

  const gp = readGamepad();
  if (gp) {
    const padK = 1 + (controllerAimSensitivity - 1) * a;
    const k = controllerSensitivity * 60 * dt * padK;   // rad per passo a stick tutto spinto
    x += gp.look.x * k;
    y += gp.look.y * k;
  }
  return { x: x, y: y };
}

const Input = {
  getMove: getMove,
  getLook: getLook,
  isJumping: isJumping,
  isRunning: isRunning,
  isShooting: isShooting,
  isAiming: isAiming,
  pollGamepad: pollGamepad,
  consumePausePress: consumePausePress,
  isReloading: isReloading,
  isInteracting: isInteracting,
  getMouseLocked: () => mouse.locked,
  resetLook: () => { mouse.x = 0; mouse.y = 0; },

  // Impostazioni regolabili dal menu
  getMouseSensitivity: () => mouse.sensitivity,
  setMouseSensitivity: (v) => { mouse.sensitivity = v; },
  getControllerSensitivity: () => controllerSensitivity,
  setControllerSensitivity: (v) => { controllerSensitivity = v; },
  getMouseAimSensitivity: () => mouseAimSensitivity,
  setMouseAimSensitivity: (v) => { mouseAimSensitivity = v; },
  getControllerAimSensitivity: () => controllerAimSensitivity,
  setControllerAimSensitivity: (v) => { controllerAimSensitivity = v; },
  isGamepadConnected: () => gamepadConnected,

  // Menu col controller
  readMenuPad: readMenuPad,
  suppressPadUntilRelease: () => { padSuppressed = true; },
};

if (typeof window !== 'undefined') {
  window.Input = Input;
}