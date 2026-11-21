// DOOMSDAY - main.js
// Loop di gioco principale. Il loop parte SUBITO (cosi' dietro al menu si vede la mappa)
// e parte UNA sola volta. Lo stato (MENU, LOBBY, PLAYING, ...) e' in menu.js.
// Non c'e' piu' un timer locale: la partita la gestisce il server (vince l'ultimo vivo).
//
// Fluidita':
// - la fisica va a passo fisso (60 al secondo), ma la camera viene messa a meta' strada tra
//   un passo e l'altro: il movimento e' morbido a qualsiasi frame rate (60, 75, 144 Hz...);
// - la visuale (mouse/levetta) si aggiorna a OGNI frame, non solo a ogni passo di fisica;
// - la qualita' grafica (risoluzione e ombre) si sceglie nelle Impostazioni.

let lastTime = 0;
let accumulator = 0;
const FIXED_STEP = 1 / 60;
const MAX_STEPS = 6;          // dopo una pausa lunga non si rincorre il tempo perso

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

// Visuale: a ogni frame (prima del movimento, cosi' W va dove si guarda)
function applyLook(dt) {
  const look = Input.getLook(dt, Player.aimAmount());   // sensibilita' in mira scelta nelle Impostazioni
  const k = Player.lookScale();                  // mirando (zoom) la visuale gira piu' piano
  const yawPivot = Render.yawPivot();
  const pitchPivot = Render.pitchPivot();
  yawPivot.rotation.y -= look.x * k;             // mouse a destra = gira a destra
  pitchPivot.rotation.x = Math.max(-1.55, Math.min(1.55, pitchPivot.rotation.x - look.y * k));
}

// Aggiornamento a passo fisso: solo mentre si sta giocando
function update(dt) {
  if (currentMenuState !== 'PLAYING') return;
  Player.update(dt);           // movimento, sparo, oggetti
  Network.tick(dt);            // posizione verso il server (20 volte al secondo)
}

function render(frameDt) {
  const playing = currentMenuState === 'PLAYING';
  const orbit = currentMenuState === 'MENU' || currentMenuState === 'CONNECTING' ||
                currentMenuState === 'LOBBY' || currentMenuState === 'ENDED';

  // Menu, lobby e classifica: la camera gira lentamente sopra la mappa
  if (orbit) {
    Player.resetAim();                     // niente zoom della mira fuori dalla partita
    const yaw = Render.yawPivot();
    yaw.position.set(0, 16, 0);
    yaw.rotation.y += 0.18 * frameDt;      // stessa velocita' a ogni frame rate
    Render.pitchPivot().rotation.x = -0.55;
  }

  Network.update(frameDt);                 // giocatori remoti e oggetti
  // Eliminati: la telecamera segue un altro giocatore (dopo che i giocatori remoti si sono mossi)
  if (spectating() && (playing || currentMenuState === 'PAUSED')) Spectate.update(frameDt);
  Player.showViewModel(playing);           // l'arma in mano si vede solo mentre si gioca
  Arena.animate(performance.now() / 1000);
  Render.animateAtmosphere(performance.now() / 1000);
  Render.draw(playing);                    // scena + arma in prima persona sopra
}

// Eliminato e in modalita' spettatore (vedi spectate.js)
function spectating() {
  return !!(window.Spectate && Spectate.isActive());
}

function loop(time) {
  if (!lastTime) lastTime = time;
  let dt = (time - lastTime) / 1000;
  lastTime = time;
  if (dt > 0.1) dt = 0.1;
  if (dt < 0) dt = 0;

  // Controller: tasti premuti una volta (Start = pausa, L3 = corsa)
  Input.pollGamepad();
  if (Input.consumePausePress() && typeof window.onPadPause === 'function') window.onPadPause();
  if (window.MenuNav) MenuNav.update(dt);   // menu col controller: croce, A, B, LB/RB

  const playing = currentMenuState === 'PLAYING';
  if (playing && !spectating()) applyLook(dt);

  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_STEP && steps < MAX_STEPS) {
    update(FIXED_STEP);
    accumulator -= FIXED_STEP;
    steps++;
  }
  if (steps === MAX_STEPS) accumulator = 0;

  // Camera tra l'ultimo passo e il prossimo: niente scatti
  if (playing && !spectating()) Player.smoothCamera(accumulator / FIXED_STEP);

  render(dt);
  if (currentMenuState === 'PLAYING') updateHUD();
  if (window.GameMusic) GameMusic.update(currentMenuState);   // musica solo nel menu e in lobby

  requestAnimationFrame(loop);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
