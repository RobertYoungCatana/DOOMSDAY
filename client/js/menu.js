// DOOMSDAY - menu.js
// Menu principale, pausa, fine partita e HUD.
// Stati: MENU, PLAYING, PAUSED, ENDED

let currentMenuState = 'MENU';
let nickname = '';

function initMenu() {
  const overlay = document.createElement('div');
  overlay.id = 'menu-overlay';
  overlay.innerHTML = createMainMenuHTML();
  document.body.appendChild(overlay);

  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = createHUDHTML();
  hud.style.display = 'none';
  document.body.appendChild(hud);

  const pauseMenu = document.createElement('div');
  pauseMenu.id = 'pause-menu';
  pauseMenu.innerHTML = `
    <h2>PAUSA</h2>
    <button class="pause-btn" id="resume-btn">RIPRENDI</button>
    <button class="pause-btn quit-btn" id="quit-to-main-btn">ESCI AL MENU</button>
  `;
  pauseMenu.style.display = 'none';
  document.body.appendChild(pauseMenu);

  const endMenu = document.createElement('div');
  endMenu.id = 'end-menu';
  endMenu.innerHTML = `
    <h2>PARTITA FINITA</h2>
    <p>Giocatore: <span id="end-nickname"></span></p>
    <p>Uccisioni: <span id="end-kills">0</span> &nbsp; Morti: <span id="end-deaths">0</span></p>
    <button class="pause-btn" id="play-again-btn">GIOCA ANCORA</button>
    <button class="pause-btn quit-btn" id="end-quit-btn">ESCI AL MENU</button>
  `;
  endMenu.style.display = 'none';
  document.body.appendChild(endMenu);

  setupMenuListeners();

  try {
    const saved = localStorage.getItem('doomsday_nick');
    if (saved) document.getElementById('nickname-input').value = saved;
  } catch (e) {}
}

function createMainMenuHTML() {
  return `
    <div id="main-menu">
      <h1>DOOMSDAY</h1>
      <div id="nickname-container">
        <label for="nickname-input">NICKNAME (max 12 caratteri)</label>
        <input type="text" id="nickname-input" class="nickname-input" maxlength="12" placeholder="Il tuo nome">
      </div>
      <button class="play-btn" id="play-btn">GIOCA</button>
      <button class="controls-btn" id="controls-btn">CONTROLLI</button>
      <div class="controls-help" id="controls-help">
        <h3>Controlli:</h3>
        <ul>
          <li><span class="key">WASD</span>: Muovi</li>
          <li><span class="key">Spazio</span>: Salta</li>
          <li><span class="key">Shift</span>: Corri</li>
          <li><span class="key">Click</span>: Spara</li>
          <li><span class="key">R</span>: Ricarica</li>
          <li><span class="key">1-3</span>: Armi</li>
          <li><span class="key">E</span>: Raccogli</li>
          <li><span class="key">Esc</span>: Pausa</li>
        </ul>
      </div>
    </div>
  `;
}

function createHUDHTML() {
  return `
    <div class="crosshair"></div>
    <div class="health" id="hud-health">SALUTE: <span id="health-value">100</span></div>
    <div class="ammo" id="hud-ammo"><span id="weapon-name">PISTOLA</span> &nbsp; <span id="ammo-value">0 / 0</span></div>
    <div class="timer" id="hud-timer">TEMPO: <span id="timer-value">120</span>s</div>
  `;
}

function setupMenuListeners() {
  document.getElementById('play-btn').addEventListener('click', () => {
    const input = document.getElementById('nickname-input');
    nickname = (input.value.trim() || 'Player').substring(0, 12);
    try { localStorage.setItem('doomsday_nick', nickname); } catch (e) {}
    startGame();
  });

  document.getElementById('controls-btn').addEventListener('click', () => {
    const help = document.getElementById('controls-help');
    help.style.display = help.style.display === 'block' ? 'none' : 'block';
  });

  document.getElementById('resume-btn').addEventListener('click', resumeGame);
  document.getElementById('quit-to-main-btn').addEventListener('click', quitToMain);
  document.getElementById('play-again-btn').addEventListener('click', restartGame);
  document.getElementById('end-quit-btn').addEventListener('click', quitToMain);

  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && currentMenuState === 'PLAYING') togglePause();
  });
}

function updateHUD() {
  const p = Player.get();
  const weapon = CONFIG.WEAPONS[p.currentWeapon];
  document.getElementById('health-value').textContent = Math.round(p.health);
  document.getElementById('weapon-name').textContent = weapon.name.toUpperCase();
  document.getElementById('ammo-value').textContent = p.magazine + ' / ' + p.ammo;
  document.getElementById('timer-value').textContent = Math.max(0, Math.ceil(window.gameTimer));
}

function showEl(id, display) {
  const el = document.getElementById(id);
  if (el) el.style.display = display;
}

function lockPointer() {
  Render.renderer().domElement.requestPointerLock();
}

function beginMatch() {
  const spawns = MAP.spawnPoints;
  const spawn = spawns[Math.floor(Math.random() * spawns.length)];

  Player.spawn(spawn.x, spawn.z, spawn.y || 0);
  Player.resetKills();
  Input.resetLook();
  Render.yawPivot().rotation.y = spawn.rot || 0;
  Render.pitchPivot().rotation.x = 0;

  window.gameTimer = CONFIG.GAME.MATCH_TIME;
  currentMenuState = 'PLAYING';

  showEl('hud', 'block');
  lockPointer();

  if (typeof initNetworking === 'function') initNetworking();
}

function startGame() {
  showEl('menu-overlay', 'none');
  beginMatch();
}

function restartGame() {
  showEl('end-menu', 'none');
  beginMatch();
}

function togglePause() {
  if (currentMenuState !== 'PLAYING') return;
  currentMenuState = 'PAUSED';
  showEl('pause-menu', 'block');
  if (document.pointerLockElement) document.exitPointerLock();
}

function resumeGame() {
  currentMenuState = 'PLAYING';
  showEl('pause-menu', 'none');
  lockPointer();
}

function quitToMain() {
  currentMenuState = 'MENU';
  showEl('pause-menu', 'none');
  showEl('end-menu', 'none');
  showEl('hud', 'none');
  showEl('menu-overlay', 'flex');
  if (document.pointerLockElement) document.exitPointerLock();
}

function endGame() {
  if (currentMenuState !== 'PLAYING') return;
  currentMenuState = 'ENDED';
  if (document.pointerLockElement) document.exitPointerLock();
  showEl('hud', 'none');
  document.getElementById('end-nickname').textContent = nickname || 'Player';
  document.getElementById('end-kills').textContent = Player.get().kills;
  document.getElementById('end-deaths').textContent = Player.get().deaths;
  showEl('end-menu', 'block');
}

window.togglePause = togglePause;
window.currentMenuState = () => currentMenuState;
window.endGame = endGame;
window.updateHUD = updateHUD;
window.initMenu = initMenu;
