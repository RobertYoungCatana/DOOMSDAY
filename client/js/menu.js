// DOOMSDAY - menu.js
// Menu, lobby, HUD, pausa e fine partita.
// Stati: MENU, CONNECTING, LOBBY, PLAYING, PAUSED, ENDED
// Il flusso segue EVENTI.md: GIOCA -> lobby -> START -> partita -> classifica -> lobby.
// ATTENZIONE: non ridichiarare CONFIG qui, e' gia' globale (config.js).
// I nickname arrivano da altri giocatori: si scrivono SEMPRE con textContent, mai con innerHTML.
// I suggerimenti a schermo (tasti da premere) cambiano da soli tra tastiera e controller:
// gli elementi con data-key="azione" mostrano il tasto giusto (vedi fillKeyCap e Input.label).

let currentMenuState = 'MENU';
let nickname = '';
let enteringMatch = false;     // true finche' il mouse non e' stato bloccato la prima volta
let padPlay = false;           // si gioca col controller senza mouse bloccato (ripreso con Start)
let lastPrompt = '';
let promptArgs = ['', ''];     // ultimo suggerimento chiesto (azione, testo): si ridisegna se cambia dispositivo
let lobbyCountdown = null;     // conto alla rovescia della schermata di fine partita

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

  const boot = document.createElement('div');
  boot.id = 'boot-screen';
  boot.innerHTML = '<div class="boot-mark loading-mark"><img class="loading-logo" src="assets/doomsday-logo.png" alt="DOOMSDAY"></div><div class="boot-progress"><span></span></div>';
  document.body.appendChild(boot);
  window.setTimeout(() => { boot.classList.add('boot-screen-done'); }, 3000);

  const loading = document.createElement('div');
  loading.id = 'loading-screen';
  loading.innerHTML = '<div class="loading-mark"><img class="loading-logo" src="assets/doomsday-logo.png" alt="DOOMSDAY"></div><p>Developed by Patriche &amp; Venturini</p>';
  loading.style.display = 'none';
  document.body.appendChild(loading);

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
    <button class="pause-btn" id="resume-btn" data-nav-default>Riprendi</button>
    <button class="pause-btn" id="pause-settings-btn">⚙ Impostazioni</button>
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
    <p class="end-note" id="end-note">Tra pochi secondi si torna alla lobby.</p>
    <button class="pause-btn quit-btn" id="end-quit-btn" data-nav-default>Esci al menu</button>
  `;
  endMenu.style.display = 'none';
  document.body.appendChild(endMenu);

  const settings = document.createElement('div');
  settings.id = 'settings-overlay';
  settings.innerHTML = createSettingsHTML();
  settings.style.display = 'none';
  document.body.appendChild(settings);

  setupMenuListeners();
  setupNetworkHandlers();
  setupKeybinds();

  // Ultimo dispositivo usato cambiato (tastiera <-> controller): si aggiornano tutti i tasti mostrati
  Input.onDeviceChange(refreshDeviceHints);
  if (window.Spectate) Spectate.onChange(refreshSpectateHud);
  refreshDeviceHints();

  // Nickname ricordato dall'ultima volta
  try {
    const saved = localStorage.getItem('doomsday_nick');
    if (saved) byId('nickname-input').value = saved;
  } catch (e) { /* localStorage non disponibile: pazienza */ }

  loadSettings();
  initSkinPanel();
  refreshServerStatus();
  setInterval(() => { if (currentMenuState === 'MENU') refreshServerStatus(); }, 15000);
}

function createMainMenuHTML() {
  return `
    <div id="main-menu">
      <button class="gear-btn" id="settings-btn" title="Impostazioni">⚙</button>
      <button class="gear-btn music-btn" id="music-btn" title="Musica: accendi/spegni" aria-label="Musica">♪</button>
      <img class="brand-logo" src="assets/doomsday-logo.png" alt="DOOMSDAY">
      <p class="tagline">Tutti contro tutti nell'arena. Non si rinasce: vince l'ultimo sopravvissuto.</p>
      <div id="nickname-container">
        <label for="nickname-input">Nickname <small>(massimo 16 caratteri)</small></label>
        <input type="text" id="nickname-input" class="nickname-input" maxlength="16" placeholder="Sopravvissuto" autocomplete="off">
      </div>
      <p class="server-status" id="server-status">Controllo il server…</p>
      <p class="menu-error" id="menu-error"></p>
      <button class="play-btn" id="play-btn" data-nav-default>GIOCA</button>
    </div>
    ${createSkinPanelHTML()}
    <p class="menu-version">Versione Beta</p>
    <p class="menu-credits">Developed by Patriche &amp; Venturini</p>
  `;
}

// Sezione scelta personaggio (a destra del menu e, in attesa della partita, nella lobby).
// Le schede si creano da CONFIG.SKINS. Frecce e schede fanno solo VEDERE un personaggio:
// diventa quello con cui si gioca solo premendo SELEZIONA.
function createSkinPanelHTML() {
  return `
    <section id="skin-panel" aria-label="Scelta del personaggio">
      <h3 class="skin-title">Personaggio</h3>
      <div class="skin-stage">
        <button class="skin-arrow" id="skin-prev" title="Personaggio precedente" aria-label="Personaggio precedente">‹</button>
        <canvas id="skin-preview" width="260" height="340"></canvas>
        <button class="skin-arrow" id="skin-next" title="Personaggio successivo" aria-label="Personaggio successivo" data-nav-default>›</button>
        <p class="skin-loading" id="skin-loading">Carico il modello…</p>
      </div>
      <p class="skin-name" id="skin-name"></p>
      <button class="skin-select-btn" id="skin-select-btn" type="button">SELEZIONA</button>
      <p class="skin-chosen" id="skin-chosen"></p>
      <p class="skin-warning" id="skin-warning"></p>
      <div class="skin-list" id="skin-list" role="radiogroup" aria-label="Personaggi"></div>
      <p class="skin-credit" id="skin-credit"></p>
    </section>
  `;
}

// ---------------------------------------------------------------
// Scelta del personaggio: schede + anteprima 3D che gira + SELEZIONA
// ---------------------------------------------------------------
let selectedSkin = null;   // personaggio scelto: quello con cui si gioca
let browsedSkin = null;    // personaggio che si sta guardando nell'anteprima
const skinPreview = { renderer: null, scene: null, camera: null, holder: null, model: null, token: 0, running: false };

function initSkinPanel() {
  if (!window.Skins || !Skins.list().length) { showEl('skin-panel', 'none'); return; }
  selectedSkin = Skins.selected();
  browsedSkin = selectedSkin;

  const listEl = byId('skin-list');
  Skins.list().forEach((s) => {
    const b = document.createElement('button');
    b.className = 'skin-card';
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.skin = s.id;
    b.textContent = s.name;
    b.addEventListener('click', () => showSkin(s.id));
    b.addEventListener('dblclick', () => { showSkin(s.id); confirmSkin(); });   // doppio clic = scegli subito
    listEl.appendChild(b);
  });
  byId('skin-prev').addEventListener('click', () => stepSkin(-1));
  byId('skin-next').addEventListener('click', () => stepSkin(1));
  byId('skin-select-btn').addEventListener('click', confirmSkin);

  // Anteprima: un piccolo renderer separato, con luci simili a quelle dell'arena
  const canvas = byId('skin-preview');
  try {
    const r = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(canvas.width, canvas.height, false);
    r.outputEncoding = THREE.sRGBEncoding;
    const sc = new THREE.Scene();
    sc.add(new THREE.AmbientLight(0x9a9d7b, 0.9));
    sc.add(new THREE.HemisphereLight(0xaeb798, 0x292c25, 0.7));
    const sun = new THREE.DirectionalLight(0xd7ddcf, 0.9);
    sun.position.set(2, 4, 3);
    sc.add(sun);
    const rim = new THREE.DirectionalLight(0xa8e600, 0.35);   // riflesso verde del tema
    rim.position.set(-3, 2, -3);
    sc.add(rim);
    const cam = new THREE.PerspectiveCamera(30, canvas.width / canvas.height, 0.1, 50);
    cam.position.set(0, 1.05, 4.6);
    cam.lookAt(0, 0.9, 0);
    const holder = new THREE.Group();
    sc.add(holder);
    Object.assign(skinPreview, { renderer: r, scene: sc, camera: cam, holder: holder });
  } catch (e) {
    canvas.style.display = 'none';      // niente WebGL per l'anteprima: restano le schede
  }

  Skins.preloadAll();
  showSkin(browsedSkin);
  startSkinPreview();
}

function stepSkin(dir) {
  const all = Skins.list();
  const i = all.findIndex((s) => s.id === browsedSkin);
  showSkin(all[(i + dir + all.length) % all.length].id);
}

// Mostra un personaggio nell'anteprima (non lo sceglie ancora)
function showSkin(id) {
  const skin = Skins.get(id);
  if (!skin) return;
  browsedSkin = skin.id;

  byId('skin-name').textContent = skin.name;
  byId('skin-credit').textContent = skin.credit ? 'Modello: ' + skin.credit : '';
  const single = Skins.list().length < 2;
  byId('skin-prev').style.visibility = single ? 'hidden' : '';
  byId('skin-next').style.visibility = single ? 'hidden' : '';
  refreshSkinButtons();

  if (!skinPreview.renderer) return;
  const token = ++skinPreview.token;
  const loadingEl = byId('skin-loading');
  loadingEl.textContent = 'Carico il modello…';
  loadingEl.style.display = '';
  Skins.load(skin.id).then((tpl) => {
    if (token !== skinPreview.token) return;          // nel frattempo e' stata scelta un'altra skin
    if (skinPreview.model) skinPreview.holder.remove(skinPreview.model);
    skinPreview.model = tpl.clone();
    if (window.Models) Models.equip(skinPreview.model.getObjectByName('weaponSocket'), 'pistol');   // arma di partenza
    skinPreview.holder.add(skinPreview.model);
    loadingEl.style.display = 'none';
  }).catch(() => {
    if (token !== skinPreview.token) return;
    loadingEl.textContent = 'Anteprima non disponibile';
  });
}

// SELEZIONA: il personaggio che si sta guardando diventa quello con cui si gioca.
// Se si e' gia' in lobby lo si dice subito al server (vale per la prossima partita).
function confirmSkin() {
  if (!browsedSkin || browsedSkin === selectedSkin) return;
  selectedSkin = browsedSkin;
  Skins.select(selectedSkin);
  // in lobby (o mentre ci si collega) lo si dice subito al server
  if (currentMenuState === 'LOBBY' || currentMenuState === 'CONNECTING') Network.changeSkin(selectedSkin);
  refreshSkinButtons();
  const btn = byId('skin-select-btn');
  btn.classList.remove('flash');
  void btn.offsetWidth;                // fa ripartire l'animazione di conferma
  btn.classList.add('flash');
  if (window.GameAudio && GameAudio.playSelect) GameAudio.playSelect();
}

// Schede, pulsante e scritta "Giochi con" sempre allineati alla scelta
function refreshSkinButtons() {
  document.querySelectorAll('#skin-list .skin-card').forEach((b) => {
    const chosen = b.dataset.skin === selectedSkin;
    b.classList.toggle('selected', b.dataset.skin === browsedSkin);   // quello che si sta guardando
    b.classList.toggle('chosen', chosen);                             // quello scelto (con la spunta)
    b.setAttribute('aria-checked', chosen ? 'true' : 'false');
  });
  const same = browsedSkin === selectedSkin;
  const btn = byId('skin-select-btn');
  btn.disabled = same;
  btn.textContent = same ? '✓ SELEZIONATO' : 'SELEZIONA';
  const chosen = Skins.get(selectedSkin);
  byId('skin-chosen').textContent = 'Giochi con: ' + (chosen ? chosen.name : '—');
}

// Il pannello sta nel menu principale; mentre si aspetta la partita si sposta nella lobby
function placeSkinPanel(where) {
  const panel = byId('skin-panel');
  const target = byId(where === 'lobby' ? 'lobby-overlay' : 'menu-overlay');
  if (panel && target && panel.parentNode !== target) target.appendChild(panel);
}

function startSkinPreview() {
  if (skinPreview.running || !skinPreview.renderer) return;
  skinPreview.running = true;
  const tick = () => {
    // si vede solo nel menu e nella lobby: altrove l'anteprima si ferma
    if (currentMenuState !== 'MENU' && currentMenuState !== 'LOBBY' && currentMenuState !== 'CONNECTING') {
      skinPreview.running = false;
      return;
    }
    skinPreview.holder.rotation.y += 0.012;
    skinPreview.renderer.render(skinPreview.scene, skinPreview.camera);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function createLobbyHTML() {
  return `
    <button class="gear-btn music-btn" id="lobby-music-btn" title="Musica: accendi/spegni" aria-label="Musica">♪</button>
    <div id="lobby">
      <h2>Lobby</h2>
      <p class="lobby-count" id="lobby-count"></p>
      <ul class="lobby-names" id="lobby-names"></ul>
      <p class="lobby-hint" id="lobby-hint"></p>
      <button class="play-btn" id="start-btn" data-nav-default>INIZIA PARTITA</button>
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
    <div class="spectate" id="spectate" hidden>
      <span class="spec-label">Stai guardando</span>
      <span class="spec-name" id="spectate-name"></span>
      <span class="spec-hint"><span class="kc" data-key="shoot"></span> Giocatore successivo</span>
    </div>
  `;
}

// Impostazioni divise in schede: Tastiera e mouse · Controller · Generale.
// Ogni scheda ha la sua sensibilita' normale e quella mentre si mira.
function createSettingsHTML() {
  return `
    <div id="settings" role="dialog" aria-label="Impostazioni">
      <h2>Impostazioni</h2>

      <div class="settings-tabs" role="tablist">
        <button class="settings-tab" type="button" role="tab" data-tab="kbm">Tastiera e mouse</button>
        <button class="settings-tab" type="button" role="tab" data-tab="pad">Controller</button>
        <button class="settings-tab" type="button" role="tab" data-tab="general">Generale</button>
      </div>

      <section class="settings-panel" data-panel="kbm" role="tabpanel" aria-label="Tastiera e mouse">
        <h3>Mira col mouse</h3>
        <div class="settings-row">
          <label for="sens-mouse">Sensibilità</label>
          <input type="range" id="sens-mouse" min="0.0005" max="0.006" step="0.0001">
          <span class="sens-value" id="sens-mouse-value"></span>
        </div>
        <div class="settings-row">
          <label for="sens-mouse-aim">Sensibilità mentre miri</label>
          <input type="range" id="sens-mouse-aim" min="0.2" max="2" step="0.05">
          <span class="sens-value" id="sens-mouse-aim-value"></span>
        </div>
        <p class="settings-hint">Mentre miri (tasto destro) la visuale gira più piano. 100% = normale, meno = più preciso, più = più veloce.</p>

        <h3>Comandi</h3>
        <p class="settings-hint">Clicca un comando e premi il nuovo tasto (Esc annulla). Se il tasto è già usato, i due comandi si scambiano.</p>
        <div class="keybinds" id="keybinds"></div>
        <div class="settings-row">
          <label for="crouch-mode-key">Accovacciati</label>
          <button class="toggle-btn" id="crouch-mode-key" type="button" data-device="kbm"></button>
        </div>
        <ul class="settings-controls">
          <li><span class="key">Clic sinistro</span>Spara</li>
          <li><span class="key">Clic destro</span>Mira</li>
          <li><span class="key">Esc</span>Pausa</li>
          <li><span class="key">Frecce · Invio</span>Muoviti nei menu · Conferma</li>
        </ul>
        <button class="controls-btn keys-reset-btn" id="keys-reset-btn" type="button">Ripristina tasti predefiniti</button>
      </section>

      <section class="settings-panel" data-panel="pad" role="tabpanel" aria-label="Controller" hidden>
        <p class="pad-status" id="pad-status">Controller non collegato</p>
        <h3>Mira col controller</h3>
        <div class="settings-row">
          <label for="sens-pad">Sensibilità</label>
          <input type="range" id="sens-pad" min="0.01" max="0.12" step="0.005">
          <span class="sens-value" id="sens-pad-value"></span>
        </div>
        <div class="settings-row">
          <label for="sens-pad-aim">Sensibilità mentre miri</label>
          <input type="range" id="sens-pad-aim" min="0.2" max="2" step="0.05">
          <span class="sens-value" id="sens-pad-aim-value"></span>
        </div>
        <p class="settings-hint">Mentre miri (grilletto sinistro) la visuale gira più piano. 100% = normale, meno = più preciso, più = più veloce.</p>

        <h3>Comandi</h3>
        <ul class="settings-controls">
          <li><span class="key">Levetta sx</span>Muoviti</li>
          <li><span class="key">Levetta dx</span>Guarda</li>
          <li><span class="key">Grilletto dx</span>Spara</li>
          <li><span class="key">Grilletto sx</span>Mira</li>
          <li><span class="key">A / Croce</span>Salta</li>
          <li><span class="key">Premi levetta sx</span>Corri</li>
          <li><span class="key">Premi levetta dx</span>Accovacciati</li>
          <li><span class="key">Y / Triangolo</span>Raccogli</li>
          <li><span class="key">Start / Options</span>Pausa</li>
          <li><span class="key">RT / RB</span>Da eliminato: cambia giocatore</li>
        </ul>
        <div class="settings-row">
          <label for="crouch-mode-pad">Accovacciati (R3)</label>
          <button class="toggle-btn" id="crouch-mode-pad" type="button" data-device="pad"></button>
        </div>
        <h3>Nei menu</h3>
        <ul class="settings-controls">
          <li><span class="key">Croce direzionale</span>Muoviti (anche levetta sx)</li>
          <li><span class="key">Sinistra / Destra</span>Regola i cursori</li>
          <li><span class="key">A / Croce</span>Conferma</li>
          <li><span class="key">B / Cerchio</span>Indietro</li>
          <li><span class="key">LB / RB</span>Cambia scheda o personaggio</li>
        </ul>
      </section>

      <section class="settings-panel" data-panel="general" role="tabpanel" aria-label="Generale" hidden>
        <div class="settings-row">
          <label for="gfx-quality">Grafica</label>
          <input type="range" id="gfx-quality" min="0" max="2" step="1">
          <span class="sens-value" id="gfx-quality-value"></span>
        </div>
        <div class="settings-row">
          <label for="music-volume">Musica (menu e lobby)</label>
          <input type="range" id="music-volume" min="0" max="1" step="0.05">
          <span class="sens-value" id="music-volume-value"></span>
        </div>
      </section>

      <button class="controls-btn" id="settings-close-btn">Chiudi</button>
    </div>
  `;
}

function setupMenuListeners() {
  byId('play-btn').addEventListener('click', () => {
        if (window.GameAudio) window.GameAudio.initOnUserGesture();
    nickname = (byId('nickname-input').value.trim() || 'Sopravvissuto').substring(0, 16);
    try { localStorage.setItem('doomsday_nick', nickname); } catch (e) {}
    startGame();
  });

  byId('settings-btn').addEventListener('click', openSettings);
  byId('music-btn').addEventListener('click', toggleMusic);
  byId('lobby-music-btn').addEventListener('click', toggleMusic);
  byId('music-volume').addEventListener('input', onMusicVolumeInput);
  byId('gfx-quality').addEventListener('input', onQualityInput);
  byId('pause-settings-btn').addEventListener('click', openSettings);
  byId('settings-close-btn').addEventListener('click', closeSettings);
  byId('sens-mouse').addEventListener('input', onMouseSensInput);
  byId('sens-pad').addEventListener('input', onPadSensInput);
  byId('sens-mouse-aim').addEventListener('input', onMouseAimSensInput);
  byId('sens-pad-aim').addEventListener('input', onPadAimSensInput);
  document.querySelectorAll('#settings .settings-tab').forEach((b) => {
    b.addEventListener('click', () => setSettingsTab(b.dataset.tab));
  });

  byId('start-btn').addEventListener('click', () => Network.startGame());
  byId('lobby-leave-btn').addEventListener('click', () => leaveToMenu(''));
  byId('resume-btn').addEventListener('click', resumeGame);
  byId('quit-to-main-btn').addEventListener('click', () => leaveToMenu(''));
  byId('end-quit-btn').addEventListener('click', () => leaveToMenu(''));

  // ESC: il browser esce dal pointer lock (e di solito NON manda il keydown).
  // Quindi la pausa si attiva quando il blocco del mouse cade durante la partita.
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) { enteringMatch = false; padPlay = false; return; }
    if (currentMenuState === 'PLAYING') togglePause();
  });
  document.addEventListener('pointerlockerror', () => {
    if (currentMenuState === 'PLAYING' && !padPlay) togglePause();
  });

  // Giocando col controller il mouse non e' bloccato: un clic sul gioco lo blocca di nuovo
  Render.renderer().domElement.addEventListener('click', () => {
    if (currentMenuState === 'PLAYING' && !document.pointerLockElement) lockPointer();
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
  Network.on('otherEliminated', (d) => { if (window.Spectate) Spectate.onEliminated(d.id, d.killerId); });
  Network.on('left', (id) => { if (window.Spectate) Spectate.onLeft(id); });
  Network.on('kill', addKillFeed);
  Network.on('hit', showDamageNumber);

  // Eliminato: la telecamera passa da sola su chi ti ha eliminato (modalita' spettatore)
  Network.on('eliminated', (killerName, killerId) => {
    Player.setDead(true);
    setPrompt('');
    byId('banner').textContent = killerName ? 'Eliminato da ' + killerName : 'Sei stato eliminato';
    if (window.Spectate) Spectate.start(killerId);
  });

  Network.on('shot', (d) => {
    if (window.GameAudio && d) window.GameAudio.playShot(d.weapon);
    if (!d || d.id === Network.myId()) return;
    if ([d.ox, d.oy, d.oz, d.x, d.y, d.z].every(Number.isFinite)) {
      Player.showShot({ x: d.ox, y: d.oy, z: d.oz }, { x: d.x, y: d.y, z: d.z });
    }
  });

  Network.on('gameover', showEnd);

  Network.on('backToLobby', () => {
    stopLobbyCountdown();
    if (window.Spectate) Spectate.stop();
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
    // Server online ma vecchio: personaggi, armi e mappa nuovi non funzionano finche' non si aggiorna
    const want = (CONFIG.NETWORK && CONFIG.NETWORK.SERVER_VERSION) || 0;
    const outdated = s.online && !((s.version || 0) >= want);
    el.className = 'server-status ' + (s.online ? 'online' : 'offline') + (outdated ? ' outdated' : '');
    el.textContent = s.online
      ? 'Server online' + (s.players !== undefined ? ' · ' + s.players + ' in lobby' : '') +
        (outdated ? ' · versione vecchia: ripubblica il server' : '')
      : 'Server non raggiungibile';
    el.title = outdated
      ? 'Il server su Render non è aggiornato: ripubblica la cartella server per avere armi, mappa e colpi aggiornati.'
      : '';
    // Detto anche sotto la scelta del personaggio. Col server vecchio il personaggio scelto in lobby
    // arriva lo stesso agli altri (si rientra in lobby da soli, vedi Network.changeSkin).
    byId('skin-warning').textContent = outdated
      ? '⚠ Il server online è una versione vecchia: il personaggio funziona, ma conviene ripubblicarlo su Render.'
      : '';
  });
}

function setMenuError(text) {
  const el = byId('menu-error');
  if (el) el.textContent = text;
}

// ---------------------------------------------------------------
// Impostazioni: sensibilità mouse/controller (salvate nel browser) e stato controller
// ---------------------------------------------------------------
let padStatusTimer = null;

// Numero salvato nel browser, se valido; altrimenti il valore di base
function savedNumber(key, fallback) {
  try {
    const v = parseFloat(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch (e) { return fallback; }   // localStorage non disponibile: si usano i valori di base
}

function saveNumber(key, v) {
  try { localStorage.setItem(key, v); } catch (e) { /* pazienza */ }
}

function loadSettings() {
  const mouseSens = savedNumber('doomsday_sens_mouse', Input.getMouseSensitivity());
  const padSens = savedNumber('doomsday_sens_pad', Input.getControllerSensitivity());
  const mouseAim = savedNumber('doomsday_sens_mouse_aim', Input.getMouseAimSensitivity());
  const padAim = savedNumber('doomsday_sens_pad_aim', Input.getControllerAimSensitivity());

  Input.setMouseSensitivity(mouseSens);
  Input.setControllerSensitivity(padSens);
  Input.setMouseAimSensitivity(mouseAim);
  Input.setControllerAimSensitivity(padAim);
  if (window.GameMusic) byId('music-volume').value = GameMusic.getVolume();
  refreshMusicButtons();
  byId('gfx-quality').value = QUALITY_ORDER.indexOf(Render.getQuality());
  refreshQualityLabel();
  byId('sens-mouse').value = mouseSens;
  byId('sens-pad').value = padSens;
  byId('sens-mouse-aim').value = mouseAim;
  byId('sens-pad-aim').value = padAim;
  updateSensLabels();
  setSettingsTab(settingsTab);
}

// --- Schede delle impostazioni ---
const SETTINGS_TABS = ['kbm', 'pad', 'general'];
let settingsTab = 'kbm';

function setSettingsTab(tab) {
  if (SETTINGS_TABS.indexOf(tab) < 0) return;
  settingsTab = tab;
  document.querySelectorAll('#settings .settings-tab').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    // la scheda aperta e' il punto di partenza quando ci si muove col controller
    if (on) b.setAttribute('data-nav-default', ''); else b.removeAttribute('data-nav-default');
  });
  document.querySelectorAll('#settings .settings-panel').forEach((p) => {
    p.hidden = p.dataset.panel !== tab;
  });
}

// LB / RB del controller: scheda precedente / successiva
function stepSettingsTab(dir) {
  const i = SETTINGS_TABS.indexOf(settingsTab);
  setSettingsTab(SETTINGS_TABS[(i + dir + SETTINGS_TABS.length) % SETTINGS_TABS.length]);
}

function isSettingsOpen() {
  const el = byId('settings-overlay');
  return !!el && el.style.display !== 'none';
}

// Grafica: Bassa (piu' fluida) - Media - Alta (nitida, risoluzione piena). Salvata nel browser.
const QUALITY_ORDER = ['bassa', 'media', 'alta'];
const QUALITY_HINT = { bassa: 'Bassa (più fluida)', media: 'Media', alta: 'Alta (nitida)' };

function onQualityInput() {
  Render.setQuality(QUALITY_ORDER[parseInt(byId('gfx-quality').value, 10)] || 'alta');
  refreshQualityLabel();
}

function refreshQualityLabel() {
  byId('gfx-quality-value').textContent = QUALITY_HINT[Render.getQuality()] || '';
}

// Musica: pulsante ♪ (accesa/spenta) e volume nelle impostazioni (salvati nel browser)
function toggleMusic() {
  if (!window.GameMusic) return;
  GameMusic.setEnabled(!GameMusic.isEnabled());
  refreshMusicButtons();
}

function onMusicVolumeInput() {
  if (!window.GameMusic) return;
  GameMusic.setVolume(parseFloat(byId('music-volume').value));
  refreshMusicButtons();
}

function refreshMusicButtons() {
  const on = !!(window.GameMusic && GameMusic.isEnabled() && GameMusic.getVolume() > 0);
  ['music-btn', 'lobby-music-btn'].forEach((id) => {
    const b = byId(id);
    if (!b) return;
    b.classList.toggle('off', !on);
    b.title = on ? 'Musica accesa (clic per spegnerla)' : 'Musica spenta (clic per accenderla)';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const v = byId('music-volume-value');
  if (v && window.GameMusic) v.textContent = Math.round(GameMusic.getVolume() * 100) + '%';
}

// Numeri facili da leggere: mouse 2.0 e controller 4.0 sono i valori di partenza; la mira in %
function updateSensLabels() {
  byId('sens-mouse-value').textContent = (Number(byId('sens-mouse').value) * 1000).toFixed(1);
  byId('sens-pad-value').textContent = (Number(byId('sens-pad').value) * 100).toFixed(1);
  byId('sens-mouse-aim-value').textContent = Math.round(Number(byId('sens-mouse-aim').value) * 100) + '%';
  byId('sens-pad-aim-value').textContent = Math.round(Number(byId('sens-pad-aim').value) * 100) + '%';
}

function onMouseSensInput() {
  const v = parseFloat(byId('sens-mouse').value);
  Input.setMouseSensitivity(v);
  updateSensLabels();
  saveNumber('doomsday_sens_mouse', v);
}

function onPadSensInput() {
  const v = parseFloat(byId('sens-pad').value);
  Input.setControllerSensitivity(v);
  updateSensLabels();
  saveNumber('doomsday_sens_pad', v);
}

function onMouseAimSensInput() {
  const v = parseFloat(byId('sens-mouse-aim').value);
  Input.setMouseAimSensitivity(v);
  updateSensLabels();
  saveNumber('doomsday_sens_mouse_aim', v);
}

function onPadAimSensInput() {
  const v = parseFloat(byId('sens-pad-aim').value);
  Input.setControllerAimSensitivity(v);
  updateSensLabels();
  saveNumber('doomsday_sens_pad_aim', v);
}

function refreshPadStatus() {
  const el = byId('pad-status');
  if (!el) return;
  el.textContent = Input.isGamepadConnected()
    ? 'Controller collegato ✓'
    : 'Controller non collegato (premi un tasto del controller per farlo riconoscere)';
}

// Si può aprire dal menu principale o dalla pausa: il pannello si mette sopra a tutto.
// Aperte col controller, si parte dalla scheda Controller.
function openSettings() {
  if (window.MenuNav && MenuNav.fromPad()) setSettingsTab('pad');
  showEl('settings-overlay', 'flex');
  refreshPadStatus();
  padStatusTimer = setInterval(refreshPadStatus, 1000);
}

function closeSettings() {
  if (Input.isCapturing()) Input.cancelCapture();
  showEl('settings-overlay', 'none');
  if (padStatusTimer) { clearInterval(padStatusTimer); padStatusTimer = null; }
}

// ---------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------
function renderLobby(info) {
  const names = info.names || [];
  byId('lobby-count').textContent = info.playerCount + ' / ' + info.maxPlayers + ' giocatori';

  // Ogni giocatore con il suo personaggio (se il server e' aggiornato e lo manda)
  const entries = info.players || names.map((n) => ({ name: n }));
  const list = byId('lobby-names');
  list.textContent = '';
  entries.forEach((p) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'lobby-player';
    name.textContent = p.name;
    li.appendChild(name);
    if (p.skin && window.Skins && Skins.isValid(p.skin)) {
      const skin = document.createElement('span');
      skin.className = 'lobby-skin';
      skin.textContent = Skins.get(p.skin).name;
      li.appendChild(skin);
    }
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
  placeSkinPanel('lobby');             // in attesa si puo' ancora cambiare personaggio
  showEl('lobby-overlay', 'flex');
  renderLobby(Network.lobby());
  startSkinPreview();
}

// ---------------------------------------------------------------
// HUD: valori dal server (chiamata dal loop solo mentre si gioca)
// ---------------------------------------------------------------
// Il DOM si tocca solo quando un valore cambia davvero: riscrivere testi e stili a ogni frame
// costringe il browser a ricalcolare la pagina e rende il gioco meno fluido.
const hudCache = {};
function hudSet(key, value, apply) {
  if (hudCache[key] === value) return;
  hudCache[key] = value;
  apply(value);
}

function updateHUD() {
  const me = Network.me();
  if (!me) return;
  const weapon = CONFIG.WEAPONS[me.weapon] || CONFIG.WEAPONS.pistol;
  const hp = Math.max(0, Math.round(me.hp));
  const shield = Math.round(me.shield || 0);
  const ammo = Network.ammo();

  hudSet('hp', hp, (v) => {
    byId('health-value').textContent = v;
    byId('hud-health').style.setProperty('--hp', Math.min(100, v) + '%');
    byId('hud').classList.toggle('low-health', v > 0 && v <= 30);
  });
  hudSet('shield', shield, (v) => {
    byId('shield-value').textContent = v;
    byId('hud-shield').classList.toggle('on', v > 0);
    byId('hud-shield').style.setProperty('--sh', Math.min(100, v) + '%');
  });
  hudSet('ammo', ammo, (v) => {
    byId('ammo-value').textContent = v;
    byId('hud-ammo').classList.toggle('low', v <= 5);
  });
  hudSet('weapon', weapon.name, (v) => { byId('weapon-name').textContent = v; });
  hudSet('alive', Network.aliveCount(), (v) => { byId('timer-value').textContent = v; });
  updateCrosshair();
}

// Mirino: si apre con la dispersione dell'arma e si stringe mirando (cambia il DOM solo se serve)
let lastCrosshair = '';
function updateCrosshair() {
  const ch = Player.crosshair();
  const gap = Math.round(ch.gap * 2) / 2;
  const len = Math.round((11 - 4 * ch.aim) * 2) / 2;
  const key = gap + '|' + len;
  if (key === lastCrosshair) return;
  lastCrosshair = key;
  const el = document.querySelector('#hud .crosshair');
  if (!el) return;
  el.style.setProperty('--ch-gap', gap + 'px');
  el.style.setProperty('--ch-len', len + 'px');
  byId('hud').classList.toggle('aiming', ch.aim > 0.5);
}

// Tasto da premere per un'azione, come lo mostra il dispositivo in uso (E da tastiera, Y col controller...)
function fillKeyCap(el, action) {
  const l = Input.label(action || el.dataset.key);
  el.textContent = l.text;
  el.className = 'kc' + (l.device === 'pad' ? ' kc-pad ' + l.cls : '');
}

function makeKeyCap(action) {
  const span = document.createElement('span');
  span.dataset.key = action;
  fillKeyCap(span, action);
  return span;
}

// Suggerimento vicino a un oggetto: setPrompt('interact', 'Raccogli Medikit') -> [E] Raccogli Medikit.
// setPrompt('') lo toglie. Cambia il DOM solo se cambia qualcosa (anche il dispositivo usato).
function setPrompt(action, text) {
  promptArgs = [action || '', text || ''];
  const key = promptArgs.join('|') + '|' + Input.lastDevice() + '|' + Input.padType();
  if (key === lastPrompt) return;
  lastPrompt = key;
  const el = byId('prompt');
  if (!el) return;
  el.textContent = '';
  if (!action && !text) return;
  if (action) el.appendChild(makeKeyCap(action));
  if (text) el.appendChild(document.createTextNode(' ' + text));
}

// Tastiera <-> controller: aggiorna tutti i tasti mostrati a schermo
function refreshDeviceHints() {
  document.querySelectorAll('[data-key]').forEach((el) => fillKeyCap(el));
  setPrompt(promptArgs[0], promptArgs[1]);
  if (currentMenuState === 'PAUSED') refreshPauseNote();
}

// Pannello spettatore: nome del giocatore che si sta guardando
function refreshSpectateHud(targetId) {
  const box = byId('spectate');
  if (!box) return;
  const active = !!(window.Spectate && Spectate.isActive());
  box.hidden = !active;
  byId('hud').classList.toggle('spectating', active);
  byId('spectate-name').textContent = targetId ? (Network.nameOf(targetId) || 'Giocatore') : 'Nessuno da guardare';
}

function flashClass(cls, ms) {
  const hud = byId('hud');
  if (!hud) return;
  hud.classList.add(cls);
  setTimeout(() => hud.classList.remove(cls), ms);
}
// Colpito: lampo rosso, oppure blu se il colpo l'ha preso lo scudo
function flashHurt(info) { flashClass(info && info.shield ? 'hurt-shield' : 'hurt', 250); }
function hitMarker() { flashClass('hit', 130); }


function showDamageNumber(d) {
  if (currentMenuState !== 'PLAYING' || !d) return;

  const v = new THREE.Vector3(d.x + (Math.random() - 0.5) * 0.4, d.y + (d.crouch ? 1.6 : 2.0), d.z);
  v.project(Render.camera());
  if (v.z > 1) return;

  if (d.headshot && window.GameAudio) window.GameAudio.playHeadshot();

  // Bersaglio con lo scudo ancora attivo: numero BLU (stile Fortnite). Server vecchi: campo assente.
  const onShield = d.shield === true || d.shieldDamage > 0;
  const el = document.createElement('div');
  el.className = 'dmg-number' + (onShield ? ' dmg-shield' : '') + (d.shieldBroken ? ' dmg-shield-break' : '') +
    (d.headshot ? ' headshot' : '') + (d.killed ? ' kill' : '');
  el.textContent = Math.round(d.damage) + (d.headshot ? ' HS' : '');
  el.style.left = ((v.x + 1) / 2 * window.innerWidth) + 'px';
  el.style.top = ((1 - v.y) / 2 * window.innerHeight) + 'px';
  document.body.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 900);
}




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

function lockPointer() {
  // Nei browser nuovi restituisce una promise: se il blocco viene rifiutato ci pensa 'pointerlockerror'
  const p = Render.renderer().domElement.requestPointerLock();
  if (p && typeof p.catch === 'function') p.catch(() => {});
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
  Network.connectAndJoin(nickname, selectedSkin);
}

// La partita e' iniziata (lo dice il server): spawn, HUD, mouse
function beginMatch(me) {
  if (window.GameMusic) GameMusic.matchStarting();   // la musica sfuma durante il caricamento
  showEl('lobby-overlay', 'none');
  showEl('loading-screen', 'grid');
  setTimeout(() => startMatchPresentation(me), 5000);
}

function startMatchPresentation(me) {
  showEl('loading-screen', 'none');

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
  Object.keys(hudCache).forEach((k) => { delete hudCache[k]; });
  lastCrosshair = '';
  currentMenuState = 'PLAYING';
  enteringMatch = true;
  showEl('hud', '');
  lockPointer();                       // se il browser rifiuta (nessun clic recente) compare "Entra"
}

function togglePause() {
  if (currentMenuState !== 'PLAYING') return;
  currentMenuState = 'PAUSED';     // PRIMA di rilasciare il mouse, cosi' non scatta due volte
  byId('pause-title').textContent = enteringMatch ? 'Si parte' : 'Pausa';
  byId('resume-btn').textContent = enteringMatch ? 'Entra in partita' : 'Riprendi';
  refreshPauseNote();
  showEl('pause-menu', 'block');
  if (document.pointerLockElement) document.exitPointerLock();
}

// Testo della pausa: col controller mostra i suoi tasti (A conferma, Start riprende)
function refreshPauseNote() {
  const note = byId('pause-note');
  if (!note) return;
  note.textContent = enteringMatch
    ? 'La partita è iniziata. '
    : 'La partita continua: gli altri giocatori possono colpirti. ';
  if (Input.lastDevice() === 'pad') {
    note.appendChild(makeKeyCap('confirm'));
    note.appendChild(document.createTextNode(' conferma · '));
    note.appendChild(makeKeyCap('pause'));
    note.appendChild(document.createTextNode(enteringMatch ? ' entra in partita' : ' riprendi'));
  } else if (enteringMatch) {
    note.appendChild(document.createTextNode('Clicca per entrare.'));
  }
}

// fromPad = ripresa col controller (Start, B, oppure A su "Riprendi"): il browser non permette
// di bloccare il mouse da un tasto del controller, quindi si gioca senza (un clic sul gioco lo blocca di nuovo)
function resumeGame(fromPad) {
  currentMenuState = 'PLAYING';
  showEl('pause-menu', 'none');
  closeSettings();
  if (fromPad === true || (window.MenuNav && MenuNav.fromPad())) {
    padPlay = true;
    enteringMatch = false;
    return;
  }
  lockPointer();
}

// Start/Options del controller (letto in main.js): pausa e ripresa
function onPadPause() {
  if (currentMenuState === 'PLAYING') togglePause();
  else if (currentMenuState === 'PAUSED') resumeGame(true);
}

// Torna al menu principale (con un messaggio, se serve)
function leaveToMenu(message) {
  Network.leave();
  stopLobbyCountdown();
  if (window.Spectate) Spectate.stop();
  Player.setDead(false);
  currentMenuState = 'MENU';
  enteringMatch = false;
  padPlay = false;
  showEl('pause-menu', 'none');
  showEl('end-menu', 'none');
  showEl('hud', 'none');
  showEl('lobby-overlay', 'none');
  placeSkinPanel('menu');
  showEl('menu-overlay', 'flex');
  byId('play-btn').disabled = false;
  byId('play-btn').textContent = 'GIOCA';
  setMenuError(message || '');
  if (document.pointerLockElement) document.exitPointerLock();
  refreshServerStatus();
  startSkinPreview();
}

// Fine partita (gameOver dal server): vincitore e classifica
function showEnd(data) {
  if (currentMenuState === 'MENU' || currentMenuState === 'CONNECTING') return;
  currentMenuState = 'ENDED';
  if (window.Spectate) Spectate.stop();
  if (document.pointerLockElement) document.exitPointerLock();   // altrimenti non si puo' cliccare
  startLobbyCountdown(Number(data.returnIn) > 0 ? Number(data.returnIn) : 8);   // server vecchi: 8 secondi

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

// Conto alla rovescia "si torna alla lobby tra N secondi" (il server manda returnIn con gameOver)
function startLobbyCountdown(seconds) {
  stopLobbyCountdown();
  const end = Date.now() + seconds * 1000;
  const note = byId('end-note');
  let shown = -1;
  const tick = () => {
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    if (left === shown) return;
    shown = left;
    note.textContent = '';
    if (left > 0) {
      note.appendChild(document.createTextNode('Si torna alla lobby tra '));
      const n = document.createElement('strong');
      n.className = 'countdown';
      n.textContent = left;
      note.appendChild(n);
      note.appendChild(document.createTextNode(left === 1 ? ' secondo' : ' secondi'));
    } else {
      note.textContent = 'Ritorno alla lobby…';
      stopLobbyCountdown();
    }
  };
  tick();
  lobbyCountdown = setInterval(tick, 200);
}

function stopLobbyCountdown() {
  if (lobbyCountdown) { clearInterval(lobbyCountdown); lobbyCountdown = null; }
}

// ---------------------------------------------------------------
// Comandi rimappabili (Impostazioni > Tastiera e mouse) e modalita' di accovacciamento
// ---------------------------------------------------------------
const CROUCH_MODE_TEXT = { hold: 'Tieni premuto', toggle: 'Premi una volta' };
let capturingBtn = null;

function setupKeybinds() {
  const box = byId('keybinds');
  Input.actions().forEach((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'keybind';
    b.dataset.action = a.id;
    const name = document.createElement('span');
    name.className = 'kb-label';
    name.textContent = a.label;
    const key = document.createElement('span');
    key.className = 'key';
    b.appendChild(name);
    b.appendChild(key);
    b.addEventListener('click', () => startRebind(b));
    box.appendChild(b);
  });
  byId('keys-reset-btn').addEventListener('click', () => {
    Input.cancelCapture();
    Input.resetBindings();
    refreshKeybinds();
  });
  ['crouch-mode-key', 'crouch-mode-pad'].forEach((id) => {
    byId(id).addEventListener('click', () => {
      const dev = byId(id).dataset.device;
      Input.setCrouchMode(dev, Input.getCrouchMode(dev) === 'hold' ? 'toggle' : 'hold');
      refreshKeybinds();
    });
  });
  // Clic fuori dal comando che aspetta un tasto: si annulla
  document.addEventListener('mousedown', (e) => {
    if (capturingBtn && !capturingBtn.contains(e.target)) Input.cancelCapture();
  }, true);
  refreshKeybinds();
}

function refreshKeybinds() {
  document.querySelectorAll('#keybinds .keybind').forEach((b) => {
    if (b === capturingBtn) return;
    b.querySelector('.key').textContent = Input.keyName(Input.getBinding(b.dataset.action));
  });
  byId('crouch-mode-key').textContent = CROUCH_MODE_TEXT[Input.getCrouchMode('kbm')];
  byId('crouch-mode-pad').textContent = CROUCH_MODE_TEXT[Input.getCrouchMode('pad')];
  refreshDeviceHints();
}

function startRebind(btn) {
  // I tasti si cambiano dalla tastiera: col controller (A) non si puo' scrivere un tasto
  if (window.MenuNav && MenuNav.fromPad()) {
    btn.classList.remove('flash');
    void btn.offsetWidth;
    btn.classList.add('flash');
    return;
  }
  Input.cancelCapture();
  capturingBtn = btn;
  btn.classList.add('capturing');
  btn.querySelector('.key').textContent = 'Premi un tasto…';
  Input.captureKey((code) => {
    btn.classList.remove('capturing');
    capturingBtn = null;
    if (code && !Input.setBinding(btn.dataset.action, code)) {
      btn.querySelector('.key').textContent = 'Tasto non valido';
      setTimeout(refreshKeybinds, 900);
      return;
    }
    refreshKeybinds();
  });
}

// input.js chiama window.togglePause se arriva il keydown di ESC
if (typeof window !== 'undefined') {
  window.togglePause = togglePause;
  window.onPadPause = onPadPause;
  window.setPrompt = setPrompt;
  window.hitMarker = hitMarker;
}
