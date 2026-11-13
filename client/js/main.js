// DOOMSDAY - main.js
// Loop di gioco principale. Inizializza tutto e aggiorna ogni frame.
// Il loop parte SUBITO (cosi' dietro al menu si vede la mappa) e parte UNA sola volta.
// Lo stato (MENU, PLAYING, PAUSED, ENDED) e' in menu.js: currentMenuState.

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

  // TODO rete: qui, in futuro, si collega NetworkManager (lavoro del backend)

  requestAnimationFrame(loop);
}

// Aggiornamento a passo fisso: solo mentre si sta giocando
function update(dt) {
  if (currentMenuState !== 'PLAYING') return;

  // 1) Visuale (prima del movimento, cosi' W va dove si guarda in questo frame)
  const look = Input.getLook();
  const yawPivot = Render.yawPivot();
  const pitchPivot = Render.pitchPivot();
  yawPivot.rotation.y -= look.x;                 // mouse a destra = gira a destra
  pitchPivot.rotation.x = Math.max(-1.55, Math.min(1.55, pitchPivot.rotation.x - look.y));

  // 2) Movimento e collisioni
  Player.update(dt);

  // 3) Timer partita
  window.gameTimer -= dt;
  if (window.gameTimer <= 0) {
    window.gameTimer = 0;
    endGame();
  }
}

function render() {
  // Nel menu: la camera gira lentamente sopra la mappa
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

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}