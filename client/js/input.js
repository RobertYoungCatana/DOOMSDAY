// DOOMSDAY - input.js
// Gestione tastiera, mouse e Gamepad API.
// Fornisce: movimento, visuale, salto, corsa, accovacciamento, sparo, mira, interazione, pausa.
//
// Tastiera: i tasti delle azioni sono RIMAPPABILI dalle Impostazioni (salvati nel browser).
//   Di base: WASD muoversi, Spazio salta, C corre, Shift si accovaccia, E raccoglie.
// Controller (layout standard, come Fortnite): RT spara, LT mira, premere la levetta sinistra (L3)
//   fa correre, premere la levetta destra (R3) fa accovacciare, Start/Options mette in pausa.
//
// Ultimo dispositivo usato: tastiera/mouse oppure controller. I suggerimenti a schermo
// ("premi E", "premi Y"...) cambiano da soli in base a quello (vedi Input.label e Input.onDeviceChange).

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
let padPrevCrouch = false;
let padCrouchToggled = false;   // accovacciato col controller in modalita' "premi una volta"
let padCrouchHeld = false;
let kbPrevCrouch = false;
let kbCrouchToggled = false;    // accovacciato da tastiera in modalita' "premi una volta"

// ---------------------------------------------------------------
// Tasti rimappabili (tastiera). Il valore e' KeyboardEvent.code.
// ---------------------------------------------------------------
const ACTIONS = [
  { id: 'forward',  label: 'Avanti' },
  { id: 'back',     label: 'Indietro' },
  { id: 'left',     label: 'Sinistra' },
  { id: 'right',    label: 'Destra' },
  { id: 'jump',     label: 'Salta' },
  { id: 'sprint',   label: 'Corri' },
  { id: 'crouch',   label: 'Accovacciati' },
  { id: 'interact', label: 'Raccogli' },
];
const DEFAULT_BINDINGS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', sprint: 'KeyC', crouch: 'ShiftLeft', interact: 'KeyE',
};
// Tasti che non si possono assegnare: servono al browser o alla pausa
const RESERVED_KEYS = ['Escape', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight', 'ContextMenu'];
// Shift, Ctrl e Alt valgono sia a sinistra sia a destra
const KEY_TWIN = {
  ShiftLeft: 'ShiftRight', ShiftRight: 'ShiftLeft',
  ControlLeft: 'ControlRight', ControlRight: 'ControlLeft',
  AltLeft: 'AltRight', AltRight: 'AltLeft',
};

let bindings = Object.assign({}, DEFAULT_BINDINGS);
// Modalita' accovacciamento: 'hold' = tieni premuto, 'toggle' = premi una volta
let crouchModeKey = 'hold';
let crouchModePad = 'toggle';

(function loadInputPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem('doomsday_keys') || 'null');
    if (saved && typeof saved === 'object') {
      ACTIONS.forEach((a) => {
        const c = saved[a.id];
        if (typeof c === 'string' && /^[A-Za-z0-9]{1,24}$/.test(c) && RESERVED_KEYS.indexOf(c) < 0) bindings[a.id] = c;
      });
    }
    const mk = localStorage.getItem('doomsday_crouch_key');
    const mp = localStorage.getItem('doomsday_crouch_pad');
    if (mk === 'hold' || mk === 'toggle') crouchModeKey = mk;
    if (mp === 'hold' || mp === 'toggle') crouchModePad = mp;
  } catch (e) { /* localStorage non disponibile: tasti di base */ }
})();

function saveBindings() {
  try { localStorage.setItem('doomsday_keys', JSON.stringify(bindings)); } catch (e) { /* pazienza */ }
}

// L'azione e' premuta adesso? (tastiera)
function actionKey(id) {
  const code = bindings[id];
  if (!code) return false;
  return !!(keys[code] || (KEY_TWIN[code] && keys[KEY_TWIN[code]]));
}

function isBoundKey(code) {
  return ACTIONS.some((a) => bindings[a.id] === code || KEY_TWIN[bindings[a.id]] === code);
}

// Nome leggibile di un tasto (per le Impostazioni e i suggerimenti a schermo)
const KEY_NAMES = {
  Space: 'Spazio', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
  AltLeft: 'Alt', AltRight: 'Alt Gr', Enter: 'Invio', NumpadEnter: 'Invio', Backspace: '⌫', Tab: 'Tab',
  CapsLock: 'Bloc Maiusc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Backquote: '\\', Minus: "'", Equal: 'ì', BracketLeft: 'è', BracketRight: '+', Backslash: 'ù',
  Semicolon: 'ò', Quote: 'à', Comma: ',', Period: '.', Slash: '-', IntlBackslash: '<',
  Insert: 'Ins', Delete: 'Canc', Home: 'Home', End: 'Fine', PageUp: 'Pag ↑', PageDown: 'Pag ↓',
};
// Se il browser lo permette (Chrome/Edge), il nome viene dal layout vero della tastiera (QWERTY, AZERTY...)
let layoutMap = null;
try {
  if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
    navigator.keyboard.getLayoutMap().then((m) => { layoutMap = m; }).catch(() => {});
  }
} catch (e) { /* non disponibile: si usa la tabella */ }

function keyName(code) {
  if (!code) return '—';
  if (layoutMap && /^(Key|Digit|Backquote|Minus|Equal|Bracket|Backslash|Semicolon|Quote|Comma|Period|Slash|IntlBackslash)/.test(code)) {
    const ch = layoutMap.get(code);
    if (ch && ch.trim()) return ch.toUpperCase();
  }
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1];
  m = /^Numpad(.+)$/.exec(code);
  if (m) return 'Num ' + m[1];
  return code;
}

// ---------------------------------------------------------------
// Ultimo dispositivo usato: 'kbm' (tastiera e mouse) oppure 'pad' (controller)
// ---------------------------------------------------------------
let lastDevice = 'kbm';
const deviceListeners = [];

function setDevice(d) {
  if (d === lastDevice) return;
  lastDevice = d;
  deviceListeners.forEach((f) => { try { f(d); } catch (e) { console.error(e); } });
}

// Tipo di controller, per mostrare i simboli giusti: 'ps' (PlayStation) oppure 'xbox'
let padType = 'xbox';
function detectPadType(gp) {
  padType = gp && /054c|playstation|dualsense|dualshock|wireless controller/i.test(gp.id || '') ? 'ps' : 'xbox';
}

// Simboli dei tasti del controller (azione -> simbolo per Xbox e per PlayStation)
const PAD_GLYPHS = {
  jump:     { xbox: 'A',   ps: '✕',       cls: 'pad-a' },
  interact: { xbox: 'Y',   ps: '△',       cls: 'pad-y' },
  sprint:   { xbox: 'LS',  ps: 'L3',      cls: 'pad-stick' },
  crouch:   { xbox: 'RS',  ps: 'R3',      cls: 'pad-stick' },
  shoot:    { xbox: 'RT',  ps: 'R2',      cls: 'pad-trigger' },
  aim:      { xbox: 'LT',  ps: 'L2',      cls: 'pad-trigger' },
  pause:    { xbox: 'Start', ps: 'Options', cls: 'pad-menu' },
  confirm:  { xbox: 'A',   ps: '✕',       cls: 'pad-a' },
  backBtn:  { xbox: 'B',   ps: '○',       cls: 'pad-b' },
  next:     { xbox: 'RB',  ps: 'R1',      cls: 'pad-bumper' },
  move:     { xbox: 'Levetta sx', ps: 'Levetta sx', cls: 'pad-stick' },
  look:     { xbox: 'Levetta dx', ps: 'Levetta dx', cls: 'pad-stick' },
};
// Azioni che da tastiera e mouse non sono rimappabili
const KBM_FIXED = {
  shoot: 'Clic sx', aim: 'Clic dx', pause: 'Esc', confirm: 'Invio', backBtn: 'Esc', next: 'Clic sx',
  move: 'W A S D', look: 'Mouse',
};

// Etichetta del tasto per un'azione, sul dispositivo indicato (di base: l'ultimo usato).
// Restituisce { text, device, cls } (cls: classe CSS del simbolo del controller).
function label(action, device) {
  const dev = device || lastDevice;
  if (dev === 'pad') {
    const g = PAD_GLYPHS[action];
    if (!g) return { text: action, device: 'pad', cls: '' };
    return { text: padType === 'ps' ? g.ps : g.xbox, device: 'pad', cls: g.cls + (padType === 'ps' ? ' pad-ps' : ' pad-xbox') };
  }
  if (action === 'move') {
    return { text: [bindings.forward, bindings.left, bindings.back, bindings.right].map(keyName).join(' '), device: 'kbm', cls: '' };
  }
  if (KBM_FIXED[action]) return { text: KBM_FIXED[action], device: 'kbm', cls: '' };
  return { text: keyName(bindings[action]), device: 'kbm', cls: '' };
}

// ---------------------------------------------------------------
// Rimappatura: il prossimo tasto premuto viene assegnato (Esc annulla)
// ---------------------------------------------------------------
let captureCallback = null;

// Ascoltatore in fase di "cattura": arriva prima di tutti gli altri (menu, pausa...)
window.addEventListener('keydown', (e) => {
  if (!captureCallback) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  e.stopPropagation();
  const cb = captureCallback;
  captureCallback = null;
  cb(e.code === 'Escape' ? null : e.code);
}, true);

function captureKey(cb) { captureCallback = cb; }
function cancelCapture() {
  const cb = captureCallback;
  captureCallback = null;
  if (cb) cb(null);
}

// Assegna un tasto a un'azione. Se il tasto era gia' usato da un'altra azione, le due si scambiano.
// Restituisce false se il tasto non e' assegnabile.
function setBinding(action, code) {
  if (!ACTIONS.some((a) => a.id === action)) return false;
  if (!code || RESERVED_KEYS.indexOf(code) >= 0 || !/^[A-Za-z0-9]{1,24}$/.test(code)) return false;
  const other = ACTIONS.find((a) => a.id !== action && bindings[a.id] === code);
  if (other) bindings[other.id] = bindings[action];
  bindings[action] = code;
  saveBindings();
  return true;
}

function resetBindings() {
  bindings = Object.assign({}, DEFAULT_BINDINGS);
  saveBindings();
}

// --- Tastiera ---
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  setDevice('kbm');

  // ESC mette in pausa (togglePause non fa niente se non si sta giocando).
  // Serve anche quando si gioca col controller e il mouse non e' bloccato.
  if (e.code === 'Escape' && typeof window.togglePause === 'function') window.togglePause();

  // I tasti di gioco non devono fare altro SOLO mentre si gioca (mouse bloccato):
  // fuori dal gioco servono per scrivere il nickname.
  if (mouse.locked) {
    if (isBoundKey(e.code) || e.code === 'Tab') e.preventDefault();
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
  if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) setDevice('kbm');
  if (!mouse.locked) return;
  mouse.x += e.movementX * mouse.sensitivity;
  mouse.y += e.movementY * mouse.sensitivity;
});

document.addEventListener('mousedown', (e) => {
  setDevice('kbm');
  if (e.button === 0) keys['Mouse0'] = true;   // sparo
  if (e.button === 2) keys['Mouse2'] = true;   // mira (tasto destro)
});

document.addEventListener('mouseup', (e) => {
  if (e.button === 0) keys['Mouse0'] = false;
  if (e.button === 2) keys['Mouse2'] = false;
});

document.addEventListener('wheel', () => setDevice('kbm'), { passive: true });

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
  detectPadType(e.gamepad);
  console.log('Gamepad collegato:', e.gamepad.id);
});

window.addEventListener('gamepaddisconnected', (e) => {
  if (gamepadIndex === e.gamepad.index) {
    gamepadIndex = -1;
    gamepadConnected = false;
    setDevice('kbm');
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
      detectPadType(pads[i]);
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
    crouch: pressed(gp, 11),    // premere la levetta destra (R3): accovacciati
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

// Il controller e' stato usato davvero in questo frame? (tasti premuti o levette spinte)
function padActive() {
  const gp = currentPad();
  if (!gp) return false;
  // solo le due levette (assi 0-3): alcuni controller hanno altri assi che a riposo non sono a zero
  return gp.buttons.some((b) => b && (b.pressed || (typeof b.value === 'number' && b.value > 0.3))) ||
    gp.axes.slice(0, 4).some((a) => Math.abs(a) > 0.35);
}

// --- API pubblica ---
function isJumping() {
  const gp = readGamepad();
  return !!(actionKey('jump') || (gp && gp.buttons.jump));
}

// Da chiamare una volta per frame: tasti del controller che si premono e si rilasciano
// (corsa con L3 che resta attiva, accovacciamento con R3, pausa con Start) e
// accovacciamento da tastiera in modalita' "premi una volta".
function pollGamepad() {
  // Tastiera: accovacciati "premi una volta" (scatta quando si preme, non tenendo premuto)
  const kbCrouch = actionKey('crouch');
  if (kbCrouch && !kbPrevCrouch && crouchModeKey === 'toggle') kbCrouchToggled = !kbCrouchToggled;
  kbPrevCrouch = kbCrouch;
  if (kbCrouchToggled && actionKey('sprint')) kbCrouchToggled = false;   // correndo ci si alza

  if (padActive()) setDevice('pad');

  const gp = readGamepad();
  if (!gp) {
    padSprint = false;
    padPrevSprint = false;
    padPrevPause = false;
    padPrevCrouch = false;
    padCrouchHeld = false;
    return;
  }
  const b = gp.buttons;
  if (b.sprint && !padPrevSprint) padSprint = !padSprint;
  if (Math.hypot(gp.move.x, gp.move.z) < 0.3 || b.aim) padSprint = false;   // fermo o mirando: si cammina
  if (b.pause && !padPrevPause) padPausePressed = true;

  padCrouchHeld = b.crouch;
  if (b.crouch && !padPrevCrouch && crouchModePad === 'toggle') {
    padCrouchToggled = !padCrouchToggled;
    if (padCrouchToggled) padSprint = false;          // accovacciandosi si smette di correre
  }
  if (padSprint && b.sprint && !padPrevSprint) padCrouchToggled = false;   // L3: ci si alza e si corre

  padPrevSprint = b.sprint;
  padPrevPause = b.pause;
  padPrevCrouch = b.crouch;
}

// true una sola volta per ogni pressione di Start
function consumePausePress() {
  const p = padPausePressed;
  padPausePressed = false;
  return p;
}

function isRunning() {
  return !!(actionKey('sprint') || padSprint);
}

function isCrouching() {
  const kb = crouchModeKey === 'toggle' ? kbCrouchToggled : actionKey('crouch');
  const pad = crouchModePad === 'toggle' ? padCrouchToggled : padCrouchHeld;
  return !!(kb || pad);
}

// All'inizio della partita (o dopo una pausa) si parte in piedi
function resetCrouch() {
  kbCrouchToggled = false;
  padCrouchToggled = false;
}

function isAiming() {
  const gp = readGamepad();
  return !!((keys['Mouse2'] && mouse.locked) || (gp && gp.buttons.aim));
}

function isShooting() {
  const gp = readGamepad();
  return !!((keys['Mouse0'] && mouse.locked) || (gp && gp.buttons.shoot));
}

// RB / R1 premuto (per esempio per cambiare giocatore da guardare)
function isNextPressed() {
  const gp = readGamepad();
  return !!(gp && gp.buttons.weaponNext);
}

function isReloading() {
  const gp = readGamepad();
  return !!(keys['KeyR'] || (gp && gp.buttons.reload));
}

function isInteracting() {
  const gp = readGamepad();
  return !!(actionKey('interact') || (gp && gp.buttons.interact));
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
  if (actionKey('forward')) moveZ += 1;
  if (actionKey('back')) moveZ -= 1;
  if (actionKey('right')) moveX += 1;
  if (actionKey('left')) moveX -= 1;

  const gp = readGamepad();
  if (gp && (gp.move.x || gp.move.z)) {
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

function setCrouchMode(device, mode) {
  if (mode !== 'hold' && mode !== 'toggle') return;
  if (device === 'pad') crouchModePad = mode; else crouchModeKey = mode;
  resetCrouch();
  try { localStorage.setItem(device === 'pad' ? 'doomsday_crouch_pad' : 'doomsday_crouch_key', mode); } catch (e) { /* pazienza */ }
}

const Input = {
  getMove: getMove,
  getLook: getLook,
  isJumping: isJumping,
  isRunning: isRunning,
  isCrouching: isCrouching,
  resetCrouch: resetCrouch,
  isShooting: isShooting,
  isAiming: isAiming,
  isNextPressed: isNextPressed,
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

  // Tasti rimappabili e accovacciamento
  actions: () => ACTIONS.slice(),
  getBinding: (id) => bindings[id],
  setBinding: setBinding,
  resetBindings: resetBindings,
  keyName: keyName,
  captureKey: captureKey,
  cancelCapture: cancelCapture,
  isCapturing: () => !!captureCallback,
  getCrouchMode: (device) => (device === 'pad' ? crouchModePad : crouchModeKey),
  setCrouchMode: setCrouchMode,

  // Ultimo dispositivo usato e simboli dei tasti
  lastDevice: () => lastDevice,
  padType: () => padType,
  onDeviceChange: (fn) => { deviceListeners.push(fn); },
  label: label,

  // Menu col controller
  readMenuPad: readMenuPad,
  suppressPadUntilRelease: () => { padSuppressed = true; },
};

if (typeof window !== 'undefined') {
  window.Input = Input;
}
