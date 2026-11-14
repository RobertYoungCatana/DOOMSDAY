// DOOMSDAY - input.js
// Gestione tastiera, mouse e Gamepad API.
// Fornisce: movimento, look, salto, sparo, ricarica, cambio arma, interazione.

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

  // Previeni scrolling per tasti gioco
  if (['Space', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(e.code)) {
    e.preventDefault();
  }

  // Tasti selezione arma (1-3)
  if (e.code === 'Digit1') Player.selectWeapon(0);
  if (e.code === 'Digit2') Player.selectWeapon(1);
  if (e.code === 'Digit3') Player.selectWeapon(2);
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
    jump: gp.buttons[0].pressed,
    shoot: gp.buttons[1].pressed,
    reload: gp.buttons[2].pressed,
    interact: gp.buttons[3].pressed,
    weaponPrev: gp.buttons[4].pressed,
    weaponNext: gp.buttons[5].pressed,
    run: gp.buttons[6].pressed,
  };

  return { move, look, buttons };
}

// --- API pubblica ---
function isJumping() {
  return keys['Space'] || (readGamepad() && readGamepad().buttons.jump);
}

function isRunning() {
  return keys['ShiftLeft'] || keys['ShiftRight'] || (readGamepad() && readGamepad().buttons.run);
}

function isShooting() {
  return keys['Mouse0'] || (readGamepad() && readGamepad().buttons.shoot);
}

function isReloading() {
  return keys['KeyR'] || (readGamepad() && readGamepad().buttons.reload);
}

function isInteracting() {
  return keys['KeyE'] || (readGamepad() && readGamepad().buttons.interact);
}

function getMove() {
  const yaw = Render ? Render.yawPivot() : null;
  const yawAngle = yaw ? yaw.rotation.y : 0;

  const forward = new THREE.Vector3(-Math.sin(yawAngle), 0, -Math.cos(yawAngle));
  const right = new THREE.Vector3(Math.cos(yawAngle), 0, -Math.sin(yawAngle));

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

  if (dir.lengthSq() > 1) dir.normalize();

  return { x: dir.x, z: dir.z };
}

function getLook() {
  const gp = readGamepad();
  if (gp) {
    return { x: gp.look.x, y: gp.look.y, fromGamepad: true };
  }
  const result = { x: mouse.x, y: mouse.y, fromGamepad: false };
  mouse.x = 0;
  mouse.y = 0;
  return result;
}

const Input = {
  getMove,
  getLook,
  isJumping,
  isRunning,
  isShooting,
  isReloading,
  isInteracting,
  getMouseLocked: () => mouse.locked,
  resetLook: () => { mouse.x = 0; mouse.y = 0; }
};

if (typeof window !== 'undefined') {
  window.Input = Input;
}
