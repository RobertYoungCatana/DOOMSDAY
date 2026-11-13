// DOOMSDAY - main.js
// Loop di gioco principale. Inizializza tutto e aggiorna ogni frame.
// MAP disponibile globalmente da shared/map.js (caricato prima in index.html)

let lastTime = 0;
let accumulator = 0;
const FIXED_STEP = 1 / 60;

function init() {
  console.log('DOOMSDAY: inizializzazione...');

  const container = document.getElementById('app');
  if (!container) {
    console.error('ERRORE: div #app non trovato!');
    return;
  }
  console.log('Container trovato:', container);

  Render.initRender(container);

  const renderer = Render.renderer();
  const size = Render.getSize();
  console.log('Renderer size:', size.w, 'x', size.h);

  Arena.build();
  console.log('Arena costruita');

  Player.spawn(0, 0);
  Input.resetLook();

  const canvasEl = renderer.domElement;
  canvasEl.addEventListener('click', () => {
    if (!Input.getMouseLocked()) {
      canvasEl.requestPointerLock();
      console.log('Pointer lock richiesto');
    }
  });

  console.log('DOOMSDAY inizializzato. Usa WASD, mouse, spazio, shift.');
  // Nota: il pointer lock viene richiesto dal menu (PASSO C) quando l'utente clicca GIOCA.
}

let fireFlash = 0; // countdown per l'indicatore di sparo (debug)

function update(fixedDt) {
  Player.update(fixedDt);

  const look = Input.getLook();
  const yawPivot = Render.yawPivot();
  const pitchPivot = Render.pitchPivot();

  if (yawPivot) {
    // In Three.js, rotazione Y positiva = gira a SINISTRA.
    // Quindi invertiamo il segno del mouse per che destra = destra.
    yawPivot.rotation.y -= look.x;
  }
  if (pitchPivot) {
    // In Three.js, rotazione X positiva = guarda VERSO IL BASSO.
    // Invertiamo il segno: mouse su = guarda verso l'alto.
    pitchPivot.rotation.x -= look.y;
    pitchPivot.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitchPivot.rotation.x));
  }

  Player.get().isRunning = Input.isRunning();

  // Debug: indicatore di sparo (cerchio rosso quando si clicca)
  if (Input.isShooting()) {
    fireFlash = 0.2; // appare per 200ms
  }
  if (fireFlash > 0) {
    fireFlash -= fixedDt;
  }
}

function render() {
  // La camera è già figlia dei pivot, non copiare la posizione
  Render.renderer().render(Render.scene(), Render.camera());

  // DEBUG: mostra un cerchio rosso quando si spara
  if (fireFlash > 0) {
    if (fireFlash > 0.1) {
      console.log('SPARO!');
    }
  }
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
  requestAnimationFrame(loop);
}

function startGame() {
  if (typeof Render === 'undefined' || typeof Arena === 'undefined' || typeof Player === 'undefined' || typeof Input === 'undefined') {
    console.error('ERRORE: moduli non caricati ancora. Riprovo tra 100ms...');
    setTimeout(startGame, 100);
    return;
  }
  init();
  requestAnimationFrame(loop);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startGame);
} else {
  startGame();
}