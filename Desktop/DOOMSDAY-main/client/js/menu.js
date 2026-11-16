// DOOMSDAY - menu.js
// Menu, lobby, HUD, pausa e fine partita.
// Stati: MENU, CONNECTING, LOBBY, PLAYING, PAUSED, ENDED
// Il flusso segue EVENTI.md: GIOCA -> lobby -> START -> partita -> classifica -> lobby.
// ATTENZIONE: non ridichiarare CONFIG qui, e' gia' globale (config.js).
// I nickname arrivano da altri giocatori: si scrivono SEMPRE con textContent, mai con innerHTML.

let currentMenuState = 'MENU';
let nickname = '';
let enteringMatch = false;     // true finche' il mouse non e' stato bloccato la prima volta
let lastPrompt = '';

function byId(id) { return document.getElementById(id); }

function showEl(id, display) {
  const el = byId(id);
  if (el) el.style.display = display;
}

// ---------------------------------------------------------------
// Costruzione dell'interfaccia
// ---------------------------------------------------------------
function initMenu() {
  const overlay = document.createElement('div');
  overlay.id = 'menu-overlay';
  overlay.innerHTML = createMainMenuHTML();
  document.body.appendChild(overlay);

  const lobby = document.createElement('div');
  lobby.id = 'lobby-overlay';
  lobby.innerHTML = createLobbyHTML();
  lobby.style.display = 'none';
  document.body.appendChild(lobby);

  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = createHUDHTML();
  hud.style.display = 'none';
  document.body.appendChild(hud);

  const pauseMenu = document.createElement('div');
  pauseMenu.id = 'pause-menu';
  pauseMenu.innerHTML = `
    <h2 id="pause-title">Pausa</h2>
    <p class="pause-note" id="pause-note">La partita continua: gli altri giocatori possono colpirti.</p>
    <button class="pause-btn" id="resume-btn">Riprendi</button>
    <button class="pause-btn quit-btn" id="quit-to-main-btn">Esci dalla partita</button>
  `;
  pauseMenu.style.display = 'none';
  document.body.appendChild(pauseMenu);

  const endMenu = document.createElement('div');
  endMenu.id = 'end-menu';
  endMenu.innerHTML = `
    <h2>Partita finita</h2>
    <p class="winner" id="end-winner"></p>
    <ol class="scoreboard" id="end-scoreboard"></ol>
    <p class="end-note">Tra pochi secondi si torna alla lobby.</p>
    <button class="pause-btn quit-btn" id="end-quit-btn">Esci al menu</button>
  `;
  endMenu.style.display = 'none';
  document.body.appendChild(endMenu);

  setupMenuListeners();
  setupNetworkHandlers();

  // Nickname ricordato dall'ultima volta
  try {
    const saved = localStorage.getItem('doomsday_nick');
    if (saved) byId('nickname-input').value = saved;
  } catch (e) { /* localStorage non disponibile: pazienza */ }

  refreshServerStatus();
  setInterval(() => { if (currentMenuState === 'MENU') refreshServerStatus(); }, 15000);
}

function createMainMenuHTML() {
  return `
    <div id="main-menu">
      <h1>DOOMSDAY</h1>
      <p class="tagline">Tutti contro tutti nell'arena. Non si rinasce: vince l'ultimo sopravvissuto.</p>
      <div id="nickname-container">
        <label for="nickname-input">Nickname <small>(massimo 16 caratteri)</small></label>
        <input type="text" id="nickname-input" class="nickname-input" maxlength="16" placeholder="Sopravvissuto" autocomplete="off">
      </div>
      <p class="server-status" id="server-status">Controllo il server…</p>
      <p class="menu-error" id="menu-error"></p>
      <button class="play-btn" id="play-btn">GIOCA</button>
      <button class="controls-btn" id="controls-btn">Controlli</button>
      <div class="controls-help" id="controls-help">
        <h3>Come si gioca</h3>
        <ul>
          <li><span class="key">W A S D</span>Muoviti</li>
          <li><span class="key">Spazio</span>Salta</li>
          <li><span class="key">Shift</span>Corri</li>
          <li><span class="key">Click</span>Spara</li>
          <li><span class="key">E</span>Raccogli</li>
          <li><span class="key">Esc</span>Pausa</li>
        </ul>
      </div>
    </div>
  `;
}

function createLobbyHTML() {
  return `
    <div id="lobby">
      <h2>Lobby</h2>
      <p class="lobby-count" id="lobby-count"></p>
      <ul class="lobby-names" id="lobby-names"></ul>
      <p class="lobby-hint" id="lobby-hint"></p>
      <button class="play-btn" id="start-btn">INIZIA PARTITA</button>
      <button class="controls-btn" id="lobby-leave-btn">Esci</button>
    </div>
  `;
}

function createHUDHTML() {
  return `
    <div class="crosshair"></div>
    <div class="health" id="hud-health"><span class="lbl">Salute</span><span id="health-value">100</span></div>
    <div class="shield" id="hud-shield"><span class="lbl">Scudo</span><span id="shield-value">0</span></div>
    <div class="ammo" id="hud-ammo"><span class="lbl" id="weapon-name">Pistola</span><span id="ammo-value">30</span></div>
    <div class="timer" id="hud-timer"><span class="lbl">Vivi</span><span id="timer-value">0</span></div>
    <div class="killfeed" id="killfeed"></div>
    <div class="prompt" id="prompt"></div>
    <div class="banner" id="banner"></div>
  `;
}

function setupMenuListeners() {
  byId('play-btn').addEventListener('click', () => {
    nickname = (byId('nickname-input').value.trim() || 'Sopravvissuto').substring(0, 16);
    try { localStorage.setItem('doomsday_nick', nickname); } catch (e) {}
    startGame();
  });

  // Mostra/nasconde i controlli (controlla lo stile reale, anche se deciso dal CSS)
  byId('controls-btn').addEventListener('click', () => {
    const help = byId('controls-help');
    help.style.display = getComputedStyle(help).display === 'none' ? 'block' : 'none';
  });

  byId('start-btn').addEventListener('click', () => Network.startGame());
  byId('lobby-leave-btn').addEventListener('click', () => leaveToMenu(''));
  byId('resume-btn').addEventListener('click', resumeGame);
  byId('quit-to-main-btn').addEventListener('click', () => leaveToMenu(''));
  byId('end-quit-btn').addEventListener('click', () => leaveToMenu(''));

  // ESC: il browser esce dal pointer lock (e di solito NON manda il keydown).
  // Quindi la pausa si attiva quando il blocco del mouse cade durante la partita.
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) { enteringMatch = false; return; }
    if (currentMenuState === 'PLAYING') togglePause();
  });
  document.addEventListener('pointerlockerror', () => {
    if (currentMenuState === 'PLAYING') togglePause();
  });
}

// ---------------------------------------------------------------
// Messaggi dal server (vedi network.js)
// ---------------------------------------------------------------
const ERROR_TEXT = {
  connect_error: 'Server non raggiungibile. Controlla che sia acceso e riprova.',
  disconnected: 'Connessione al server persa.',
  matchInProgress: 'C\'è una partita in corso: aspetta che finisca e riprova.',
  lobbyFull: 'La lobby è piena (massimo 8 giocatori).',
};

function setupNetworkHandlers() {
  Network.on('error', (code) => leaveToMenu(ERROR_TEXT[code] || 'Errore di rete.'));

  Network.on('lobby', (info) => {
    renderLobby(info);
    if (currentMenuState === 'CONNECTING' && Network.isJoined()) enterLobby();
  });

  Network.on('notEnough', () => {
    byId('lobby-hint').textContent = 'Servono almeno ' + Network.lobby().minPlayers + ' giocatori per iniziare.';
  });

  Network.on('started', (me) => {
    if (currentMenuState === 'LOBBY' || currentMenuState === 'CONNECTING') beginMatch(me);
  });

  Network.on('hurt', flashHurt);
  Network.on('kill', addKillFeed);
  Network.on('hit', showDamageNumber);

  Network.on('eliminated', (killerName) => {
    Player.setDead(true);
    byId('banner').textContent = killerName ? 'Eliminato da ' + killerName : 'Sei stato eliminato';
  });

  Network.on('shot', (d) => {
    if (!d || d.id === Network.myId()) return;
    if ([d.ox, d.oy, d.oz, d.x, d.y, d.z].every(Number.isFinite)) {
      Player.showShot({ x: d.ox, y: d.oy, z: d.oz }, { x: d.x, y: d.y, z: d.z });
    }
  });

  Network.on('gameover', showEnd);

  Network.on('backToLobby', () => {
    Player.setDead(false);
    byId('banner').textContent = '';
    showEl('end-menu', 'none');
    showEl('hud', 'none');
    enterLobby();
  });
}

// ---------------------------------------------------------------
// Stato del server nel menu (sveglia anche Render, se il server e' li')
// ---------------------------------------------------------------
function refreshServerStatus() {
  const el = byId('server-status');
  if (!el) return;
  Network.checkStatus((s) => {
    el.className = 'server-status ' + (s.online ? 'online' : 'offline');
    el.textContent = s.online
      ? 'Server online' + (s.players !== undefined ? ' · ' + s.players + ' in lobby' : '')
      : 'Server non raggiungibile';
  });
}

function setMenuError(text) {
  const el = byId('menu-error');
  if (el) el.textContent = text;
}

// ---------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------
function renderLobby(info) {
  const names = info.names || [];
  byId('lobby-count').textContent = info.playerCount + ' / ' + info.maxPlayers + ' giocatori';

  const list = byId('lobby-names');
  list.textContent = '';
  names.forEach((n) => {
    const li = document.createElement('li');
    li.textContent = n;
    list.appendChild(li);
  });

  const enough = info.playerCount >= info.minPlayers;
  byId('start-btn').disabled = !enough;
  byId('lobby-hint').textContent = enough
    ? 'Chiunque può avviare la partita. Una volta iniziata, nessuno può più entrare.'
    : 'Servono almeno ' + info.minPlayers + ' giocatori per iniziare.';
}

function enterLobby() {
  currentMenuState = 'LOBBY';
  showEl('menu-overlay', 'none');
  showEl('pause-menu', 'none');
  showEl('lobby-overlay', 'flex');
  renderLobby(Network.lobby());
}

// ---------------------------------------------------------------
// HUD: valori dal server (chiamata dal loop solo mentre si gioca)
// ---------------------------------------------------------------
function updateHUD() {
  const me = Network.me();
  if (!me) return;
  const weapon = CONFIG.WEAPONS[me.weapon] || CONFIG.WEAPONS.pistol;

  byId('health-value').textContent = Math.max(0, Math.round(me.hp));
  byId('shield-value').textContent = Math.round(me.shield || 0);
  byId('ammo-value').textContent = me.ammo;
  byId('weapon-name').textContent = weapon.name;
  byId('timer-value').textContent = Network.aliveCount();

  // Segnali per il CSS: barra della salute, salute bassa, scudo, munizioni quasi finite
  byId('hud-health').style.setProperty('--hp', Math.max(0, Math.min(100, me.hp)) + '%');
  byId('hud').classList.toggle('low-health', me.hp > 0 && me.hp <= 30);
  byId('hud-shield').classList.toggle('on', (me.shield || 0) > 0);
  byId('hud-shield').style.setProperty('--sh', Math.max(0, Math.min(100, me.shield || 0)) + '%');
  byId('hud-ammo').classList.toggle('low', me.ammo <= 5);
}

// Testo "premi E" quando si e' vicini a un oggetto (cambia il DOM solo se il testo cambia)
function setPrompt(text) {
  if (text === lastPrompt) return;
  lastPrompt = text;
  const el = byId('prompt');
  if (el) el.textContent = text;
}

function flashClass(cls, ms) {
  const hud = byId('hud');
  if (!hud) return;
  hud.classList.add(cls);
  setTimeout(() => hud.classList.remove(cls), ms);
}
function flashHurt() { flashClass('hurt', 250); }
function hitMarker() { flashClass('hit', 130); }

function addKillFeed(e) {
  const feed = byId('killfeed');
  if (!feed) return;
  const row = document.createElement('div');
  row.className = 'kf';
  row.textContent = e.killerName
    ? e.killerName + ' ha eliminato ' + e.victimName
    : e.victimName + ' è stato eliminato';
  feed.appendChild(row);
  while (feed.children.length > 5) feed.removeChild(feed.firstChild);
  setTimeout(() => { if (row.parentNode) row.parentNode.removeChild(row); }, 6000);
}



// Numero del danno che sale sopra il bersaglio
function showDamageNumber(d) {
  if (currentMenuState !== 'PLAYING' || !d) return;

  // Punto 3D sopra la testa del bersaglio (con un piccolo spostamento casuale)
  const v = new THREE.Vector3(d.x + (Math.random() - 0.5) * 0.4, d.y + 2.0, d.z);
  v.project(Render.camera());          // da coordinate 3D a coordinate schermo
  if (v.z > 1) return;                 // il bersaglio e' dietro la camera

  const el = document.createElement('div');
  el.className = 'dmg-number' + (d.killed ? ' kill' : '');
  el.textContent = Math.round(d.damage);
  el.style.left = ((v.x + 1) / 2 * window.innerWidth) + 'px';
  el.style.top = ((1 - v.y) / 2 * window.innerHeight) + 'px';
  document.body.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 900);
}




function lockPointer() {
  Render.renderer().domElement.requestPointerLock();
}

// ---------------------------------------------------------------
// Gestione degli stati
// ---------------------------------------------------------------

// GIOCA: ci si collega al server e si entra in lobby
function startGame() {
  if (currentMenuState !== 'MENU') return;
  setMenuError('');
  byId('play-btn').disabled = true;
  byId('play-btn').textContent = 'MI COLLEGO…';
  currentMenuState = 'CONNECTING';
  Network.connectAndJoin(nickname);
}

// La partita e' iniziata (lo dice il server): spawn, HUD, mouse
function beginMatch(me) {
  showEl('lobby-overlay', 'none');

  // Lo spawn del server e' casuale e puo' cadere dentro un container: lo si corregge
  const s = Player.safeSpawn(me.x, me.z);
  Player.spawn(s.x, s.z, s.y);
  Player.setDead(false);
  Input.resetLook();
  Render.yawPivot().rotation.y = s.rot;
  Render.pitchPivot().rotation.x = 0;
  Network.forceSend();                 // il server e gli altri vedono subito la posizione giusta

  byId('banner').textContent = '';
  byId('killfeed').textContent = '';
  setPrompt('');
  currentMenuState = 'PLAYING';
  enteringMatch = true;
  showEl('hud', '');
  lockPointer();                       // se il browser rifiuta (nessun clic recente) compare "Entra"
}

function togglePause() {
  if (currentMenuState !== 'PLAYING') return;
  currentMenuState = 'PAUSED';     // PRIMA di rilasciare il mouse, cosi' non scatta due volte
  byId('pause-title').textContent = enteringMatch ? 'Si parte' : 'Pausa';
  byId('pause-note').textContent = enteringMatch
    ? 'La partita è iniziata. Clicca per entrare.'
    : 'La partita continua: gli altri giocatori possono colpirti.';
  byId('resume-btn').textContent = enteringMatch ? 'Entra in partita' : 'Riprendi';
  showEl('pause-menu', 'block');
  if (document.pointerLockElement) document.exitPointerLock();
}

function resumeGame() {
  currentMenuState = 'PLAYING';
  showEl('pause-menu', 'none');
  lockPointer();
}

// Torna al menu principale (con un messaggio, se serve)
function leaveToMenu(message) {
  Network.leave();
  Player.setDead(false);
  currentMenuState = 'MENU';
  enteringMatch = false;
  showEl('pause-menu', 'none');
  showEl('end-menu', 'none');
  showEl('hud', 'none');
  showEl('lobby-overlay', 'none');
  showEl('menu-overlay', 'flex');
  byId('play-btn').disabled = false;
  byId('play-btn').textContent = 'GIOCA';
  setMenuError(message || '');
  if (document.pointerLockElement) document.exitPointerLock();
  refreshServerStatus();
}

// Fine partita (gameOver dal server): vincitore e classifica
function showEnd(data) {
  if (currentMenuState === 'MENU' || currentMenuState === 'CONNECTING') return;
  currentMenuState = 'ENDED';
  if (document.pointerLockElement) document.exitPointerLock();   // altrimenti non si puo' cliccare

  byId('end-winner').textContent = data.winnerName
    ? 'Ha vinto ' + data.winnerName
    : 'Nessun vincitore';

  const list = byId('end-scoreboard');
  list.textContent = '';
  (data.scoreboard || []).forEach((row) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = row.name;
    const kills = document.createElement('span');
    kills.textContent = row.kills;
    li.appendChild(name);
    li.appendChild(kills);
    if (row.id === Network.myId()) li.className = 'me';
    list.appendChild(li);
  });

  showEl('pause-menu', 'none');
  showEl('hud', 'none');
  showEl('end-menu', 'block');
}

// input.js chiama window.togglePause se arriva il keydown di ESC
if (typeof window !== 'undefined') {
  window.togglePause = togglePause;
  window.setPrompt = setPrompt;
  window.hitMarker = hitMarker;
}