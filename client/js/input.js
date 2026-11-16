// DOOMSDAY - input.js
// Gestione tastiera, mouse e Gamepad API.
// Fornisce: movimento, visuale, salto, corsa, sparo, ricarica, cambio arma, interazione.

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

// --- Tastiera ---
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;

  if (e.code === 'Escape') {
    if (mouse.locked && typeof window.togglePause === 'function') window.togglePause();
  }

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
});

document.addEventListener('mouseup', (e) => {
  if (e.button === 0) keys['Mouse0'] = false;
});

document.addEventListener('pointerlockchange', () => {
  mouse.locked = document.pointerLockElement === getCanvas();
  if (!mouse.locked) keys['Mouse0'] = false;
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

function readGamepad() {
  if (!gamepadConnected) return null;
  const gp = navigator.getGamepads ? navigator.getGamepads()[gamepadIndex] : null;
  if (!gp) return null;

  const deadzone = 0.15;
  const dz = (v) => (Math.abs(v) < deadzone ? 0 : v);

  return {
    move: { x: dz(gp.axes[0] || 0), z: -dz(gp.axes[1] || 0) },
    look: { x: dz(gp.axes[2] || 0), y: dz(gp.axes[3] || 0) },   // y positivo = guarda in basso, come il mouse
    buttons: {
      jump: pressed(gp, 0),
      shoot: pressed(gp, 7),      // grilletto destro
      reload: pressed(gp, 2),
      interact: pressed(gp, 3),
      weaponPrev: pressed(gp, 4),
      weaponNext: pressed(gp, 5),
      run: pressed(gp, 6),        // grilletto sinistro
    },
  };
}

// --- API pubblica ---
function isJumping() {
  const gp = readGamepad();
  return !!(keys['Space'] || (gp && gp.buttons.jump));
}

function isRunning() {
  const gp = readGamepad();
  return !!(keys['ShiftLeft'] || keys['ShiftRight'] || (gp && gp.buttons.run));
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

function getMove() {
  const yaw = Render ? Render.yawPivot() : null;
  const a = yaw ? yaw.rotation.y : 0;

  // Con rotazione Y = a: avanti = (-sin a, -cos a), destra = (cos a, -sin a)
  const forward = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a));
  const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));

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

  const dir = new THREE.Vector3();
  dir.addScaledVector(forward, moveZ);
  dir.addScaledVector(right, moveX);
  if (dir.lengthSq() > 1) dir.normalize();   // niente diagonale piu' veloce

  return { x: dir.x, z: dir.z };
}

// Rotazione da applicare in QUESTO passo (radianti): mouse = variazione accumulata, poi si azzera.
function getLook(dt = 1 / 60) {
  let x = mouse.x;
  let y = mouse.y;
  mouse.x = 0;
  mouse.y = 0;

  const gp = readGamepad();
  if (gp) {
    const k = controllerSensitivity * 60 * dt;   // rad per passo a stick tutto spinto
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
  isReloading: isReloading,
  isInteracting: isInteracting,
  getMouseLocked: () => mouse.locked,
  resetLook: () => { mouse.x = 0; mouse.y = 0; },

  // Impostazioni regolabili dal menu
  getMouseSensitivity: () => mouse.sensitivity,
  setMouseSensitivity: (v) => { mouse.sensitivity = v; },
  getControllerSensitivity: () => controllerSensitivity,
  setControllerSensitivity: (v) => { controllerSensitivity = v; },
  isGamepadConnected: () => gamepadConnected,
};

if (typeof window !== 'undefined') {
  window.Input = Input;
}