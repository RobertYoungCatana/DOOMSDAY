// DOOMSDAY - input.js
// Gestione tastiera, mouse e Gamepad API.
// Fornisce: movimento, look, salto, sparo, ricarica, cambio arma.

const keys = {};
const mouse = {
  x: 0,
  y: 0,
  locked: false,
  sensitivity: CONFIG ? CONFIG.MOVEMENT.MOUSE_SENSITIVITY : 0.002,
};

let gamepadIndex = -1;
let gamepadConnected = false;

// --- Eventi tastiera ---
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;

  if (e.code === 'Escape') {
    if (mouse.locked && typeof window.togglePause === 'function') {
      window.togglePause();
    }
  }

  // Impedisce lo scrolling della pagina con la barra spaziatrice
  if (e.code === 'Space') {
    e.preventDefault();
    console.log('Spazio premuto'); // debug
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

// --- Mouse: movimento visivo ---
function getCanvas() {
  if (!Render) return null;
  const renderer = Render.renderer();
  return renderer ? renderer.domElement : null;
}

document.addEventListener('mousemove', (e) => {
  if (!mouse.locked) return;
  mouse.x += e.movementX * mouse.sensitivity;
  mouse.y += e.movementY * mouse.sensitivity;
  mouse.y = Math.max(-1.5, Math.min(1.5, mouse.y));
});

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  keys['Mouse0'] = true; // sparo
});

document.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  keys['Mouse0'] = false;
});

document.addEventListener('pointerlockchange', () => {
  mouse.locked = document.pointerLockElement === getCanvas();
});

// --- Gamepad API ---
window.addEventListener('gamepadconnected', (e) => {
  gamepadIndex = e.index;
  gamepadConnected = true;
  console.log('Gamepad collegato:', e.gamepad.id);
});

window.addEventListener('gamepaddisconnected', (e) => {
  if (gamepadIndex === e.index) {
    gamepadIndex = -1;
    gamepadConnected = false;
  }
});

// --- Lettura Gamepad ---
function readGamepad() {
  if (!gamepadConnected) return null;
  const gp = navigator.getGamepads ? navigator.getGamepads()[gamepadIndex] : null;
  if (!gp) return null;

  const deadzone = 0.15;
  const ax = gp.axes[0];
  const ay = gp.axes[1];
  const rx = gp.axes[2];
  const ry = gp.axes[3];

  const move = {
    x: Math.abs(ax) < deadzone ? 0 : ax,
    z: Math.abs(ay) < deadzone ? 0 : -ay,
  };
  const look = {
    x: Math.abs(rx) < deadzone ? 0 : rx,
    y: Math.abs(ry) < deadzone ? 0 : -ry,
  };

  const buttons = {
    jump: gp.buttons[0] ? gp.buttons[0].pressed : false,
    shoot: gp.buttons[1] ? gp.buttons[1].pressed : false,
    reload: gp.buttons[2] ? gp.buttons[2].pressed : false,
    weaponPrev: gp.buttons[4] ? gp.buttons[4].pressed : false,
    weaponNext: gp.buttons[5] ? gp.buttons[5].pressed : false,
    run: gp.buttons[6] ? gp.buttons[6].pressed : false,
  };

  return { move, look, buttons, raw: gp };
}

// --- API pubblica ---
function isJumping() {
  if (keys['Space']) return true;
  const gp = readGamepad();
  if (gp && gp.buttons.jump) return true;
  return false;
}

function isRunning() {
  if (keys['ShiftLeft'] || keys['ShiftRight']) return true;
  const gp = readGamepad();
  if (gp && gp.buttons.run) return true;
  return false;
}

function isShooting() {
  if (keys['Mouse0']) return true;
  const gp = readGamepad();
  if (gp && gp.buttons.shoot) return true;
  return false;
}

function isReloading() {
  if (keys['KeyR']) return true;
  const gp = readGamepad();
  if (gp && gp.buttons.reload) return true;
  return false;
}

function getMove() {
  const yaw = Render ? Render.yawPivot() : null;
  const yawAngle = yaw ? yaw.rotation.y : 0;

  // Vettori direzionali della camera (solo piano orizzontale).
  // Con rotazione Y = θ:
  //   forward (avanti) = (-sin θ, 0, -cos θ)
  //   right (destra)   = (cos θ, 0, -sin θ)
  const forward = new THREE.Vector3(
    -Math.sin(yawAngle),
    0,
    -Math.cos(yawAngle)
  );
  const right = new THREE.Vector3(
    Math.cos(yawAngle),
    0,
    -Math.sin(yawAngle)
  );

  let moveX = 0; // destra/sinistra
  let moveZ = 0; // avanti/indietro

  if (keys['KeyW']) moveZ += 1;  // avanti
  if (keys['KeyS']) moveZ -= 1;  // indietro
  if (keys['KeyD']) moveX += 1;  // destra
  if (keys['KeyA']) moveX -= 1;  // sinistra

  const gp = readGamepad();
  if (gp) {
    moveX = gp.move.x;
    moveZ = gp.move.z;
  }

  // Combina i vettori: moveZ * forward + moveX * right
  const dir = new THREE.Vector3();
  dir.addScaledVector(forward, moveZ);
  dir.addScaledVector(right, moveX);

  // Normalizza il vettore in diagonale (evita di correre più veloce in diagonale)
  if (dir.lengthSq() > 1) {
    dir.normalize();
  }

  return { x: dir.x, z: dir.z };
}

function getLook() {
  const gp = readGamepad();
  let result;
  if (gp) {
    result = { x: gp.look.x, y: gp.look.y, fromGamepad: true };
  } else {
    result = { x: mouse.x, y: mouse.y, fromGamepad: false };
  }
  // Azzeriamo la variazione dopo averla letta (delta frame)
  mouse.x = 0;
  mouse.y = 0;
  return result;
}

function isGamepadConnected() {
  return gamepadConnected;
}

function getGamepadState() {
  return readGamepad();
}

function resetLook() {
  mouse.x = 0;
  mouse.y = 0;
}

const Input = {
  getMove,
  getLook,
  isJumping,
  isRunning,
  isShooting,
  isReloading,
  isGamepadConnected,
  getGamepadState,
  resetLook,
  getMouseLocked: () => mouse.locked,
};

if (typeof window !== 'undefined') {
  window.Input = Input;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Input;
}