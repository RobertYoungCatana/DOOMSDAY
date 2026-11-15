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
  const ITEM_NAMES = { medkit: 'Medikit', ammo: 'Munizioni', shotgun: 'Fucile a pompa', armor: 'Giubbotto' };
  const HIT_R = 0.35;     // raggio del corpo di un giocatore per i colpi
  const HIT_H = 1.8;      // altezza del corpo
  const PICKUP_RANGE = 1.9;   // il server accetta fino a 2 metri

  const st = {
    socket: null,
    joined: false,
    leaving: false,
    myId: null,
    phase: 'offline',                 // offline | lobby | playing | ended
    lobby: { state: 'lobby', playerCount: 0, minPlayers: 2, maxPlayers: 8, names: [] },
    players: {},                      // tutti i giocatori (me compreso), come li manda il server
    items: {},                        // oggetti sulla mappa, come li manda il server
    remotes: {},                      // id -> { group, target }
    itemMeshes: {},                   // id -> { group, baseY }
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
      .then((j) => { clearTimeout(timer); cb({ online: true, players: j.players }); })
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

  function connectAndJoin(name) {
    leave();
    st.leaving = false;
    loadSocketLib(() => {
      if (st.leaving) return;
      const socket = io(serverUrl(), { reconnection: false });
      st.socket = socket;
      bindEvents(socket);
      socket.on('connect', () => {
        st.myId = socket.id;
        socket.emit('playerJoin', { name: name, x: 0, y: 0, z: 0, rotation: 0 });
      });
      socket.on('connect_error', () => { if (!st.leaving) ui('error', 'connect_error'); });
      socket.on('disconnect', () => { if (!st.leaving) ui('error', 'disconnected'); });
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
    });

    // --- Durante la partita ---
    socket.on('gameStarted', (data) => {
      st.players = data.players || {};
      st.items = data.items || {};
      st.phase = 'playing';
      st.lastSent = null;
      setWorldVisible(true);
      ui('started', me());
    });
    socket.on('playerMoved', (p) => {
      st.players[p.id] = p;
      if (!st.worldVisible || p.isDead) return;
      ensureRemote(p);
      st.remotes[p.id].target = { x: p.x, y: p.y, z: p.z, rot: p.rotation };
    });
    socket.on('ammoUpdated', (d) => { if (me()) me().ammo = d.ammo; });
    socket.on('outOfAmmo', () => ui('outOfAmmo'));
    socket.on('playerDamaged', (d) => {
      if (me()) { me().hp = d.newHp; me().shield = d.newShield; }
      ui('hurt');
    });
    socket.on('playerHealed', (d) => { if (me()) me().hp = d.newHp; });
    socket.on('shieldUpdated', (d) => { if (me()) me().shield = d.newShield; });
    socket.on('weaponChanged', (d) => {
      if (me()) { me().weapon = d.weapon; me().ammo = d.ammo; }
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
        ui('eliminated', nameOf(d.killerId));
      } else {
        removeRemote(d.id);
      }
    });
    socket.on('killFeed', (e) => ui('kill', e));

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

  function sendMovementData(cur) {
    if (!st.socket) return;
    st.socket.emit('playerMovement', cur);
    st.lastSent = cur;
    st.keepAlive = 0;
  }

  function currentPose() {
    const p = Player.get().position;
    return { x: p.x, y: p.y, z: p.z, rotation: Render.yawPivot().rotation.y };
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
    const changed = !l ||
      Math.abs(cur.x - l.x) > 0.005 || Math.abs(cur.y - l.y) > 0.005 ||
      Math.abs(cur.z - l.z) > 0.005 || Math.abs(cur.rotation - l.rotation) > 0.002;
    if (changed || st.keepAlive > 0.5) sendMovementData(cur);
  }

  // shot = { x, z } punto d'impatto (richiesto dal server) + dati extra per chi vuole disegnare il colpo
  function sendShoot(shot) {
    if (st.socket) st.socket.emit('playerShoot', shot);
  }

  function collect(itemId) {
    if (st.socket) st.socket.emit('collectItem', itemId);
  }

  // ---------------------------------------------------------------
  // Oggetti sulla mappa
  // ---------------------------------------------------------------
  function buildItemModel(type) {
    const g = new THREE.Group();
    const part = (w, h, d, color, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: color }));
      m.position.set(x, y, z);
      g.add(m);
    };
    if (type === 'medkit') {
      part(0.5, 0.35, 0.35, 0xe6dfca, 0, 0, 0);
      part(0.34, 0.37, 0.1, 0x8d9a52, 0, 0, 0);      // croce verde
      part(0.1, 0.37, 0.34, 0x8d9a52, 0, 0, 0);
    } else if (type === 'ammo') {
      part(0.5, 0.3, 0.32, 0xe2a823, 0, 0, 0);
      part(0.52, 0.08, 0.34, 0x3a3836, 0, 0.1, 0);
    } else if (type === 'shotgun') {
      part(0.95, 0.12, 0.16, 0x8c4a2b, 0, 0, 0);
      part(0.35, 0.16, 0.2, 0x3a3836, -0.3, -0.04, 0);
    } else {   // armor
      part(0.5, 0.55, 0.26, 0x5a8aa8, 0, 0, 0);
      part(0.3, 0.2, 0.28, 0x3a3836, 0, 0.12, 0);
    }
    return g;
  }

  function addItemMesh(item) {
    if (st.itemMeshes[item.id]) return;
    const group = buildItemModel(item.type);
    const baseY = (item.y || 0) + 0.55;
    group.position.set(item.x, baseY, item.z);
    Render.addToScene(group);
    st.itemMeshes[item.id] = { group: group, baseY: baseY };
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
        best = { id: id, type: it.type, name: ITEM_NAMES[it.type] || it.type, dist: d };
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
    part(0.1, 0.1, 0.5, dark, 0.3, 1.15, -0.3);       // arma, verso la direzione di sguardo
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
    const group = buildPlayerModel(colorFor(p.id));
    group.add(makeNamePlate(p.name || 'Giocatore'));
    group.position.set(p.x, p.y, p.z);
    group.rotation.y = p.rotation || 0;
    Render.addToScene(group);
    st.remotes[p.id] = { group: group, target: { x: p.x, y: p.y, z: p.z, rot: p.rotation || 0 } };
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
    const k = Math.min(1, dt * 12);
    Object.keys(st.remotes).forEach((id) => {
      const r = st.remotes[id];
      const g = r.group;
      const t = r.target;
      g.position.x += (t.x - g.position.x) * k;
      g.position.y += (t.y - g.position.y) * k;
      g.position.z += (t.z - g.position.z) * k;
      let diff = t.rot - g.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));   // strada piu' corta
      g.rotation.y += diff * k;
    });
    st.time += dt;
    let i = 0;
    Object.keys(st.itemMeshes).forEach((id) => {
      const m = st.itemMeshes[id];
      m.group.rotation.y += dt * 1.5;
      m.group.position.y = m.baseY + Math.sin(st.time * 2 + i) * 0.06;
      i++;
    });
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
      const g = st.remotes[id].group.position;
      const t = rayBox(origin, dir,
        [g.x - HIT_R, g.y, g.z - HIT_R], [g.x + HIT_R, g.y + HIT_H, g.z + HIT_R], maxDist);
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

  const Network = {
    serverUrl: serverUrl,
    checkStatus: checkStatus,
    connectAndJoin: connectAndJoin,
    startGame: startGame,
    leave: leave,
    isJoined: () => st.joined,
    myId: () => st.myId,
    phase: () => st.phase,
    lobby: () => st.lobby,
    me: me,
    players: () => st.players,
    items: () => st.items,
    aliveCount: aliveCount,
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