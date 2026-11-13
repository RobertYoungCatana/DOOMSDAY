// DOOMSDAY - main.js
// Loop di gioco principale + combat integration.
let lastTime = 0;
let accumulator = 0;
const FIXED_STEP = 1 / 60;

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
  if (currentMenuState !== 'PLAYING') return;

  // XOR: Salta sparo mentre si guarda - W sara' sparato
  const look = Input.getLook();
  const yawPivot = Render.yawPivot();
  const pitchPivot = Render.pitchPivot();
  yawPivot.rotation.y -= look.x;
  pitchPivot.rotation.x = Math.max(-1.55, Math.min(1.55, pitchPivot.rotation.x - look.y));

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
window.currentMenuState = currentMenuState
window.gameTimer = CONFIG.GAME.MATCH_TIME;
window.timer = CONFIG.GAME.MATCH_TIME;

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}