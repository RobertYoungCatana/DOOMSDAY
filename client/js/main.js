// DOOMSDAY - main.js
// Loop di gioco principale + combat integration.
let lastTime = 0;
let accumulator = 0;
const FIXED_STEP = 1 / 60;

// --- Cinematica: camera drop + flash di transizione ---
let dropActive = false;
let dropT = 0;
const DROP_DUR = 0.9; // secondi
let flashEl = null;

function getFlashEl() {
  if (!flashEl) flashEl = document.getElementById('flash-transition');
  return flashEl;
}

function setFlash(opacity) {
  const el = getFlashEl();
  if (el) el.style.opacity = opacity;
}

window.startDrop = function () {
  dropActive = true;
  dropT = 0;
  Render.setCameraOffset(new THREE.Vector3(0, 14, 0));
  Render.pitchPivot().rotation.x = -0.35;
  setFlash(1);
};

function init() {
  const container = document.getElementById('app');
  if (!container) {
    console.error('ERRORE: div #app non trovato!');
    return;
  }

  Render.initRender(container);
  Arena.build();
  Input.resetLook();
  initMenu();

  requestAnimationFrame(loop);
}

function update(dt) {
  // --- Cinematica: camera drop ---
  if (dropActive) {
    dropT += dt;
    const k = Math.min(1, dropT / DROP_DUR);
    const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
    const y = 14 * (1 - e);
    Render.setCameraOffset(new THREE.Vector3(0, y, 0));
    Render.pitchPivot().rotation.x = -0.35 + 0.35 * e;
    setFlash(1 - e);
    if (k >= 1) {
      dropActive = false;
      Render.setCameraOffset(new THREE.Vector3(0, 0, 0));
      setFlash(0);
    }
  }

  if (currentMenuState !== 'PLAYING') return;

  // Durante la cinematica drop, blocca il look del mouse
  if (dropActive) {
    Input.resetLook();
  } else {
    // XOR: Salta sparo mentre si guarda - W sara' sparato
    const look = Input.getLook();
    const yawPivot = Render.yawPivot();
    const pitchPivot = Render.pitchPivot();
    yawPivot.rotation.y -= look.x;
    pitchPivot.rotation.x = Math.max(-1.55, Math.min(1.55, pitchPivot.rotation.x - look.y));
  }

  // Update movement & projectiles each frame (nei 20Hz)
  Player.update(dt);
  Player.updateProjectiles(dt);

  timer -= dt;
  if (timer <= 0) {
    timer = 0;
    endGame();
  }
}

function render() {
  if (currentMenuState === 'MENU') {
    const yaw = Render.yawPivot();
    yaw.position.set(0, 16, 0);
    yaw.rotation.y += 0.003;
    Render.pitchPivot().rotation.x = -0.55;
  }
  Render.renderer().render(Render.scene(), Render.camera());
}

function loop(time) {
  if (!lastTime) lastTime = time;
  let dt = (time - lastTime) / 1000;
  lastTime = time;
  if (dt > 0.1) dt = 0.1;

  accumulator += dt;
  while (accumulator >= FIXED_STEP) {
    update(FIXED_STEP);
    accumulator -= FIXED_STEP;
  }

  render();
  if (currentMenuState === 'PLAYING') updateHUD();

  requestAnimationFrame(loop);
}

// Expose globals
window.currentMenuState = () => currentMenuState; // Ora e' una funzione che restituisce il valore dinamico
window.gameTimer = CONFIG.GAME.MATCH_TIME;
window.timer = CONFIG.GAME.MATCH_TIME;

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}