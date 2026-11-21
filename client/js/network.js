// DOOMSDAY - network.js
// Collegamento al server multiplayer (Socket.IO) secondo EVENTI.md.
// Qui vive TUTTO cio' che arriva dal server: giocatori, oggetti, lobby, vita, scudo, munizioni.
// Il resto del gioco legge lo stato da qui (Network.me(), Network.players()...) e
// questo file disegna i giocatori remoti (con il nickname sopra la testa) e gli oggetti.
//
// Indirizzo del server (in ordine di priorita'):
//   1) ?server=http://indirizzo:3000 nell'URL della pagina
//   2) window.DOOMSDAY_SERVER_URL (da impostare in index.html quando il server e' online)
//   3) lo stesso computer della pagina, porta 3000
//
// Dipendenze: Three.js, CONFIG, Render, Player (a runtime). Il client Socket.IO viene
// caricato dal server stesso (/socket.io/socket.io.js): niente CDN, versione sempre giusta.

(function () {
  'use strict';

  const SEND_INTERVAL = 1 / ((CONFIG.NETWORK && CONFIG.NETWORK.UPDATE_RATE) || 20);
  const PLAYER_COLORS = [0xc4561c, 0x8d9a52, 0x5a8aa8, 0xb89a2e, 0x8c4a2b, 0x7a2f26, 0x6e6b64, 0x9a6fb0];
  const ITEM_NAMES = { medkit: 'Medikit', ammo: 'Munizioni', armor: 'Giubbotto' };   // le armi prendono il nome da CONFIG.WEAPONS
  // Colore dell'alone a terra sotto gli oggetti: cure, munizioni, scudo, armi
  const ITEM_GLOW = { medkit: 0x82a84c, ammo: 0xe2a823, armor: 0x5a8aa8 };
  const WEAPON_GLOW = 0xa8e600;
  const HIT_R = 0.35;     // raggio del corpo di un giocatore per i colpi
  const HIT_H = 1.8;      // altezza del corpo
  const CROUCH_HIT_H = 1.35;  // altezza del corpo da accovacciato
  // Posa accovacciata dei personaggi: gambe aperte (una avanti, una indietro) e corpo piu' in basso.
  // Le gambe sono lunghe 0.93 m: ruotandole di CROUCH_LEG il bacino scende di 0.93 * (1 - cos)
  const CROUCH_LEG = 1.0;
  const CROUCH_DROP = 0.93 * (1 - Math.cos(CROUCH_LEG));
  const PICKUP_RANGE = 1.9;   // il server accetta fino a 2 metri

  const st = {
    socket: null,
    joined: false,
    leaving: false,
    myId: null,
    name: '',                         // nickname e personaggio con cui si e' entrati (per rientrare)
    skin: null,
    serverVersion: null,              // versione del server online (null = non ancora controllata)
    phase: 'offline',                 // offline | lobby | playing | ended
    lobby: { state: 'lobby', playerCount: 0, minPlayers: 2, maxPlayers: 8, names: [] },
    players: {},                      // tutti i giocatori (me compreso), come li manda il server
    items: {},                        // oggetti sulla mappa, come li manda il server
    remotes: {},                      // id -> { group, target, socket, weapon }
    itemMeshes: {},                   // id -> { group, spin }
    pendingShots: 0,                  // colpi mandati a cui il server non ha ancora risposto
    lastShotAt: 0,
    worldVisible: false,
    sendTimer: 0,
    keepAlive: 0,
    lastSent: null,
    time: 0,
    handlers: {},
  };

  function ui(name, a, b) {
    const f = st.handlers[name];
    if (f) f(a, b);
  }

  // ---------------------------------------------------------------
  // Indirizzo del server, stato e connessione
  // ---------------------------------------------------------------
  function serverUrl() {
    const q = new URLSearchParams(location.search).get('server');
    if (q) return q.replace(/\/$/, '');
    if (window.DOOMSDAY_SERVER_URL) return String(window.DOOMSDAY_SERVER_URL).replace(/\/$/, '');
    return location.protocol + '//' + (location.hostname || 'localhost') + ':3000';
  }

  // Chiede lo stato al server (la pagina "/" risponde con un JSON). Serve anche a "svegliare" Render.
  function checkStatus(cb) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, 15000);
    fetch(serverUrl() + '/', ctrl ? { signal: ctrl.signal } : undefined)
      .then((r) => r.json())
      .then((j) => {
        clearTimeout(timer);
        st.serverVersion = Number(j.version) || 0;     // i server vecchi non la mandano: 0
        cb({ online: true, players: j.players, version: j.version });
      })
      .catch(() => { clearTimeout(timer); cb({ online: false }); });
  }

  function loadSocketLib(done, fail) {
    if (typeof io !== 'undefined') { done(); return; }
    const s = document.createElement('script');
    s.src = serverUrl() + '/socket.io/socket.io.js';
    s.onload = done;
    s.onerror = fail;
    document.head.appendChild(s);
  }

  function connectAndJoin(name, skin) {
    leave();
    st.leaving = false;
    st.name = name;
    st.skin = skin;
    loadSocketLib(() => {
      if (st.leaving) return;
      const socket = io(serverUrl(), { reconnection: false });
      st.socket = socket;
      bindEvents(socket);
      socket.on('connect', () => {
        st.myId = socket.id;
        // st.skin: se nel frattempo e' stato scelto un altro personaggio, si entra gia' con quello
        socket.emit('playerJoin', { name: name, skin: st.skin, x: 0, y: 0, z: 0, rotation: 0 });
      });
      // Solo la connessione attuale puo' dare errore (non quella chiusa apposta per rientrare)
      socket.on('connect_error', () => { if (!st.leaving && st.socket === socket) ui('error', 'connect_error'); });
      socket.on('disconnect', () => { if (!st.leaving && st.socket === socket) ui('error', 'disconnected'); });
    }, () => ui('error', 'connect_error'));
  }

  function leave() {
    st.leaving = true;
    if (st.socket) {
      try { st.socket.disconnect(); } catch (e) { /* gia' chiuso */ }
    }
    st.socket = null;
    st.joined = false;
    st.myId = null;
    st.phase = 'offline';
    st.players = {};
    st.items = {};
    st.lastSent = null;
    st.pendingShots = 0;
    setWorldVisible(false);
  }

  // ---------------------------------------------------------------
  // Eventi dal server (nomi esatti di EVENTI.md)
  // ---------------------------------------------------------------
  function me() { return st.players[st.myId] || null; }

  function nameOf(id) {
    return st.players[id] ? st.players[id].name : null;
  }

  function bindEvents(socket) {
    // --- Lobby e connessione ---
    socket.on('currentPlayers', (players) => {
      st.players = players || {};
      st.joined = !!st.players[st.myId];
      if (st.joined) st.phase = 'lobby';
      // Personaggio cambiato mentre ci si collegava: lo si comunica adesso.
      // (Solo se il server salva la skin: con server che non la conoscono si ripeterebbe all'infinito.)
      const mine = st.players[st.myId];
      if (mine && typeof mine.skin === 'string' && st.skin && mine.skin !== st.skin) changeSkin(st.skin);
    });
    socket.on('currentItems', (items) => { st.items = items || {}; });
    socket.on('newPlayer', (p) => {
      st.players[p.id] = p;
      syncRemotes();
    });
    socket.on('lobbyUpdate', (info) => {
      st.lobby = info;
      ui('lobby', info);
    });
    socket.on('matchInProgress', () => ui('error', 'matchInProgress'));
    socket.on('lobbyFull', () => ui('error', 'lobbyFull'));
    socket.on('notEnoughPlayers', () => ui('notEnough'));
    socket.on('disconnectPlayer', (id) => {
      delete st.players[id];
      removeRemote(id);
      ui('left', id);
    });

    // --- Durante la partita ---
    socket.on('gameStarted', (data) => {
      st.players = data.players || {};
      st.items = data.items || {};
      st.phase = 'playing';
      st.lastSent = null;
      st.pendingShots = 0;
      setWorldVisible(true);
      ui('started', me());
    });
    socket.on('playerMoved', (p) => {
      st.players[p.id] = p;
      if (!st.worldVisible || p.isDead) return;
      ensureRemote(p);
      st.remotes[p.id].target = { x: p.x, y: p.y, z: p.z, rot: p.rotation };
    });
    socket.on('ammoUpdated', (d) => {
      if (me()) me().ammo = d.ammo;
      if (d.shot !== false) st.pendingShots = Math.max(0, st.pendingShots - 1);   // risposta a un colpo
    });
    socket.on('outOfAmmo', () => {
      st.pendingShots = Math.max(0, st.pendingShots - 1);
      ui('outOfAmmo');
    });
    socket.on('playerDamaged', (d) => {
      const m = me();
      // lo scudo e' sceso: il colpo l'ha preso lo scudo (effetto blu invece che rosso)
      const shieldHit = !!(m && (m.shield || 0) > 0 && d.newShield < m.shield);
      if (m) { m.hp = d.newHp; m.shield = d.newShield; }
      ui('hurt', { shield: shieldHit, broken: shieldHit && d.newShield <= 0 });
    });
    socket.on('playerHealed', (d) => { if (me()) me().hp = d.newHp; });
    socket.on('shieldUpdated', (d) => { if (me()) me().shield = d.newShield; });
    socket.on('weaponChanged', (d) => {
      if (me()) { me().weapon = d.weapon; me().ammo = d.ammo; }
    });
    // Un altro giocatore ha raccolto un'arma: cambia quella che ha in mano
    socket.on('playerWeapon', (d) => {
      if (d && st.players[d.id]) st.players[d.id].weapon = d.weapon;
    });
    socket.on('itemSpawned', (item) => {
      st.items[item.id] = item;
      if (st.worldVisible) addItemMesh(item);
    });
    socket.on('itemCollected', (id) => {
      delete st.items[id];
      removeItemMesh(id);
    });
    socket.on('playerEliminated', (d) => {
      if (st.players[d.id]) st.players[d.id].isDead = true;
      if (d.id === st.myId) {
        if (me()) me().hp = 0;
        ui('eliminated', nameOf(d.killerId), d.killerId);
      } else {
        removeRemote(d.id);
        ui('otherEliminated', d);
      }
    });
    socket.on('killFeed', (e) => ui('kill', e));
    socket.on('hitConfirmed', (d) => ui('hit', d));

    // Facoltativo: se il server inoltra gli spari degli altri, li disegniamo
    socket.on('playerShot', (d) => ui('shot', d));

    // --- Fine partita ---
    socket.on('gameOver', (d) => {
      st.phase = 'ended';
      ui('gameover', d);
    });
    socket.on('backToLobby', () => {
      st.phase = 'lobby';
      Object.keys(st.players).forEach((id) => { st.players[id].isDead = false; st.players[id].hp = 100; });
      setWorldVisible(false);
      ui('backToLobby');
    });
  }

  // ---------------------------------------------------------------
  // Messaggi verso il server
  // ---------------------------------------------------------------
  function startGame() {
    if (st.socket) st.socket.emit('startGame');
  }

  // Personaggio scelto dalla lobby (SELEZIONA): il server lo salva e lo mostra a tutti.
  // Il server vecchio (quello online senza "version", prima della 5) non conosce "changeSkin"
  // e per tutti si restava col personaggio di base (il Militare). Con lui si esce e si rientra
  // subito in lobby col nuovo personaggio: "playerJoin" porta la skin anche ai server vecchi.
  function changeSkin(skin) {
    const m = me();
    if (m) m.skin = skin;
    st.skin = skin;
    if (!st.socket || !st.joined) return;
    if (st.serverVersion !== null && st.serverVersion < 5 && st.phase === 'lobby') {
      connectAndJoin(st.name, skin);
      return;
    }
    st.socket.emit('changeSkin', skin);
  }

  function sendMovementData(cur) {
    if (!st.socket) return;
    st.socket.emit('playerMovement', cur);
    st.lastSent = cur;
    st.keepAlive = 0;
  }

  function currentPose() {
    const p = Player.get().position;
    return { x: p.x, y: p.y, z: p.z, rotation: Render.yawPivot().rotation.y, crouch: !!Player.isCrouching() };
  }

  // Pubblica subito la posizione (per esempio dopo lo spawn corretto)
  function forceSend() {
    if (st.socket && st.joined) sendMovementData(currentPose());
  }

  // Chiamata a passo fisso mentre si gioca: manda la posizione 20 volte al secondo
  function tick(dt) {
    if (!st.socket || !st.joined || !st.worldVisible) return;
    const m = me();
    if (!m || m.isDead) return;

    st.sendTimer += dt;
    st.keepAlive += dt;
    if (st.sendTimer + 1e-9 < SEND_INTERVAL) return;
    st.sendTimer = 0;

    const cur = currentPose();
    const l = st.lastSent;
    const changed = !l || cur.crouch !== l.crouch ||
      Math.abs(cur.x - l.x) > 0.005 || Math.abs(cur.y - l.y) > 0.005 ||
      Math.abs(cur.z - l.z) > 0.005 || Math.abs(cur.rotation - l.rotation) > 0.002;
    if (changed || st.keepAlive > 0.5) sendMovementData(cur);
  }

  // shot = { x, z } punto d'impatto (richiesto dal server) + dati extra per chi vuole disegnare il colpo
  function sendShoot(shot) {
    if (!st.socket) return;
    st.socket.emit('playerShoot', shot);
    st.pendingShots++;
    st.lastShotAt = performance.now();
  }

  // Munizioni da mostrare e da usare per decidere se si puo' sparare: quelle del server
  // meno i colpi ancora in viaggio (con le armi a raffica il server risponde in ritardo).
  function ammo() {
    const m = me();
    if (!m) return 0;
    if (st.pendingShots && performance.now() - st.lastShotAt > 1500) st.pendingShots = 0;   // risposta persa
    return Math.max(0, m.ammo - st.pendingShots);
  }

  function collect(itemId) {
    if (st.socket) st.socket.emit('collectItem', itemId);
  }

  // ---------------------------------------------------------------
  // Oggetti sulla mappa
  // ---------------------------------------------------------------
  function itemName(type) {
    if (ITEM_NAMES[type]) return ITEM_NAMES[type];
    return CONFIG.WEAPONS[type] ? CONFIG.WEAPONS[type].name : type;
  }

  // Alone colorato a terra: dice da lontano che tipo di oggetto e'
  const glowGeometry = new THREE.CircleGeometry(0.5, 20);
  const glowMaterials = {};
  function glowMaterial(color) {
    if (!glowMaterials[color]) {
      glowMaterials[color] = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.28, depthWrite: false });
    }
    return glowMaterials[color];
  }

  function addItemMesh(item) {
    if (st.itemMeshes[item.id]) return;
    const group = new THREE.Group();
    group.position.set(item.x, item.y || 0, item.z);

    const glow = new THREE.Mesh(glowGeometry, glowMaterial(ITEM_GLOW[item.type] || WEAPON_GLOW));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.03;
    glow.userData.shared = true;
    group.add(glow);

    const spin = Models.item(item.type);     // modello low-poly (models.js): gira e galleggia
    spin.position.y = 0.55;
    group.add(spin);

    Render.addToScene(group);
    st.itemMeshes[item.id] = { group: group, spin: spin };
  }

  function removeItemMesh(id) {
    const m = st.itemMeshes[id];
    if (!m) return;
    Render.removeFromScene(m.group);
    disposeObject(m.group);
    delete st.itemMeshes[id];
  }

  // L'oggetto raccoglibile piu' vicino (stessa regola del server: distanza in orizzontale)
  function nearestItem(pos) {
    let best = null;
    Object.keys(st.items).forEach((id) => {
      const it = st.items[id];
      if (Math.abs((it.y || 0) - pos.y) > 3) return;   // un altro piano: non lo si raggiunge
      const d = Math.hypot(it.x - pos.x, it.z - pos.z);
      if (d < PICKUP_RANGE && (!best || d < best.dist)) {
        best = { id: id, type: it.type, name: itemName(it.type), dist: d };
      }
    });
    return best;
  }

  // ---------------------------------------------------------------
  // Giocatori remoti: modello a scatole + nickname sopra la testa
  // ---------------------------------------------------------------
  function colorFor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return PLAYER_COLORS[h % PLAYER_COLORS.length];
  }

  function buildPlayerModel(color) {
    const g = new THREE.Group();
    const body = new THREE.MeshLambertMaterial({ color: color });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b2724 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc9a27a });
    const part = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      g.add(m);
    };
    part(0.55, 0.75, 0.32, body, 0, 1.0, 0);          // busto
    part(0.28, 0.28, 0.28, skin, 0, 1.55, 0);         // testa
    part(0.22, 0.65, 0.26, dark, -0.15, 0.325, 0);    // gambe
    part(0.22, 0.65, 0.26, dark, 0.15, 0.325, 0);
    const socket = new THREE.Object3D();              // qui si aggancia l'arma (verso lo sguardo)
    socket.name = 'weaponSocket';
    socket.position.set(0.3, 1.1, -0.15);
    g.add(socket);
    return g;
  }

  function makeNamePlate(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const c = canvas.getContext('2d');
    c.font = 'bold 34px Arial, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 6;
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    c.strokeText(name, 128, 32);
    c.fillStyle = '#e6dfca';
    c.fillText(name, 128, 32);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas), transparent: true, fog: false,
    }));
    sprite.scale.set(2.0, 0.5, 1);
    sprite.position.set(0, 2.15, 0);
    return sprite;
  }

  function ensureRemote(p) {
    if (st.remotes[p.id] || p.id === st.myId) return;
    // Skin scelta dal giocatore; se manca o non si carica, il vecchio modello a scatole.
    // group = posizione e rotazione · body = il personaggio (si abbassa da accovacciato) · plate = nickname
    const color = colorFor(p.id);
    const group = new THREE.Group();
    const body = window.Skins && Skins.list().length
      ? Skins.createModel(p.skin, () => buildPlayerModel(color))
      : buildPlayerModel(color);
    const plate = makeNamePlate(p.name || 'Giocatore');
    group.add(body);
    group.add(plate);
    group.position.set(p.x, p.y, p.z);
    group.rotation.y = p.rotation || 0;
    Render.addToScene(group);
    st.remotes[p.id] = {
      group: group, body: body, plate: plate, crouch: p.crouch ? 1 : 0,
      target: { x: p.x, y: p.y, z: p.z, rot: p.rotation || 0 }, socket: null, weapon: null,
    };
  }

  function removeRemote(id) {
    const r = st.remotes[id];
    if (!r) return;
    Render.removeFromScene(r.group);
    disposeObject(r.group);
    delete st.remotes[id];
  }

  function disposeObject(obj) {
    if (!obj || !obj.traverse) return;
    obj.traverse((o) => {
      if (o.userData && o.userData.shared) return;   // modelli condivisi (skin, armi, oggetti): restano in memoria
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }

  function syncRemotes() {
    if (!st.worldVisible) return;
    Object.keys(st.players).forEach((id) => {
      const p = st.players[id];
      if (id === st.myId) return;
      if (p.isDead) removeRemote(id); else ensureRemote(p);
    });
    Object.keys(st.remotes).forEach((id) => { if (!st.players[id]) removeRemote(id); });
  }

  // Mostra o nasconde tutto il mondo "di rete" (giocatori remoti e oggetti)
  function setWorldVisible(v) {
    st.worldVisible = v;
    if (v) {
      syncRemotes();
      Object.keys(st.items).forEach((id) => addItemMesh(st.items[id]));
    } else {
      Object.keys(st.remotes).forEach(removeRemote);
      Object.keys(st.itemMeshes).forEach(removeItemMesh);
    }
  }

  // Animazione a ogni frame: i giocatori remoti scivolano verso la posizione ricevuta
  function update(dt) {
    if (!st.worldVisible) return;
    const k = 1 - Math.exp(-dt * 12);      // inseguimento morbido, uguale a ogni frame rate
    Object.keys(st.remotes).forEach((id) => {
      const r = st.remotes[id];
      const g = r.group;
      const t = r.target;
      const ox = g.position.x;
      const oz = g.position.z;
      g.position.x += (t.x - g.position.x) * k;
      g.position.y += (t.y - g.position.y) * k;
      g.position.z += (t.z - g.position.z) * k;
      // Accovacciato: il personaggio si abbassa e il nickname sparisce (gli altri non lo vedono)
      const p = st.players[id];
      const crouched = !!(p && p.crouch);
      r.crouch += ((crouched ? 1 : 0) - r.crouch) * Math.min(1, dt * 14);
      if (r.body) r.body.position.y = -CROUCH_DROP * r.crouch;
      if (r.plate) r.plate.visible = !crouched;
      animateLegs(r, Math.hypot(g.position.x - ox, g.position.z - oz) / Math.max(dt, 1e-4), dt);
      let diff = t.rot - g.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));   // strada piu' corta
      g.rotation.y += diff * k;

      // Arma in mano: quella che il server dice che ha (il modello della skin puo' arrivare dopo)
      if (!r.socket) {
        r.socket = g.getObjectByName('weaponSocket');
        if (r.socket) {                    // modello arrivato: ha le gambe mobili? (personaggi a codice)
          const l = g.getObjectByName('legL');
          const rr = g.getObjectByName('legR');
          r.legs = l && rr ? [l, rr] : null;
        }
      }
      const want = (st.players[id] && st.players[id].weapon) || 'pistol';
      if (r.socket && r.weapon !== want && Models.equip(r.socket, want)) r.weapon = want;
    });
    st.time += dt;
    let i = 0;
    Object.keys(st.itemMeshes).forEach((id) => {
      const m = st.itemMeshes[id];
      m.spin.rotation.y += dt * 1.5;
      m.spin.position.y = 0.55 + Math.sin(st.time * 2 + i) * 0.06;
      i++;
    });
  }

  // Passo: le gambe dei personaggi fatti a codice oscillano in base alla velocita'
  function animateLegs(r, speed, dt) {
    if (!r.legs) return;
    r.speed = (r.speed || 0) + (Math.min(speed, 12) - (r.speed || 0)) * Math.min(1, dt * 8);
    r.step = (r.step || 0) + dt * r.speed * 2.3;
    const c = r.crouch || 0;
    const swing = Math.sin(r.step) * Math.min(1, r.speed / 4) * 0.55 * (1 - 0.6 * c);
    r.legs[0].rotation.x = swing + CROUCH_LEG * c;      // da accovacciato: gamba sinistra avanti...
    r.legs[1].rotation.x = -swing - CROUCH_LEG * c;     // ...e destra indietro
  }

  // ---------------------------------------------------------------
  // Colpi contro i giocatori remoti (il server vuole il punto d'impatto x, z)
  // ---------------------------------------------------------------
  function rayBox(o, d, min, max, maxDist) {
    const oo = [o.x, o.y, o.z];
    const dd = [d.x, d.y, d.z];
    let tmin = 0;
    let tmax = maxDist;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(dd[i]) < 1e-9) {
        if (oo[i] < min[i] || oo[i] > max[i]) return null;
      } else {
        let t1 = (min[i] - oo[i]) / dd[i];
        let t2 = (max[i] - oo[i]) / dd[i];
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return null;
      }
    }
    return tmin;
  }

  // Primo giocatore vivo colpito dal raggio entro maxDist: { id, distance, point } oppure null
  function raycastPlayers(origin, dir, maxDist) {
    let best = null;
    Object.keys(st.remotes).forEach((id) => {
      const p = st.players[id];
      if (!p || p.isDead) return;
      const r = st.remotes[id];
      const g = r.group.position;
      const h = HIT_H - (HIT_H - CROUCH_HIT_H) * (r.crouch || 0);   // accovacciato: bersaglio piu' basso
      const t = rayBox(origin, dir,
        [g.x - HIT_R, g.y, g.z - HIT_R], [g.x + HIT_R, g.y + h, g.z + HIT_R], maxDist);
      if (t !== null && (!best || t < best.distance)) {
        best = {
          id: id,
          distance: t,
          point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t },
        };
      }
    });
    return best;
  }

  function aliveCount() {
    return Object.keys(st.players).filter((id) => !st.players[id].isDead).length;
  }

  // --- Per la modalita' spettatore (spectate.js) ---
  // Posizione disegnata di un giocatore remoto (quella che si vede, gia' interpolata)
  function remotePose(id) {
    const r = st.remotes[id];
    const p = st.players[id];
    if (!r || !p || p.isDead) return null;
    const g = r.group;
    return { x: g.position.x, y: g.position.y, z: g.position.z, rot: g.rotation.y, crouchDrop: CROUCH_DROP * (r.crouch || 0), name: p.name };
  }

  // Giocatori vivi (non io) che si possono guardare, in ordine stabile
  function spectatableIds() {
    return Object.keys(st.remotes).filter((id) => st.players[id] && !st.players[id].isDead).sort();
  }

  const Network = {
    serverUrl: serverUrl,
    checkStatus: checkStatus,
    connectAndJoin: connectAndJoin,
    startGame: startGame,
    changeSkin: changeSkin,
    leave: leave,
    isJoined: () => st.joined,
    myId: () => st.myId,
    phase: () => st.phase,
    lobby: () => st.lobby,
    me: me,
    players: () => st.players,
    items: () => st.items,
    aliveCount: aliveCount,
    nameOf: nameOf,
    remotePose: remotePose,
    spectatableIds: spectatableIds,
    ammo: ammo,
    tick: tick,
    update: update,
    forceSend: forceSend,
    nearestItem: nearestItem,
    collect: collect,
    sendShoot: sendShoot,
    raycastPlayers: raycastPlayers,
    setWorldVisible: setWorldVisible,
    on: (name, fn) => { st.handlers[name] = fn; },
  };

  if (typeof window !== 'undefined') window.Network = Network;
})();