// DOOMSDAY - spectate.js
// Modalita' spettatore: quando vieni eliminato la telecamera passa da sola su chi ti ha eliminato
// e lo segue in terza persona (alle spalle, un po' sopra la spalla destra).
// Se anche lui viene eliminato si passa a chi l'ha eliminato; se esce si passa a un altro vivo.
// Clic sinistro / RT (o RB) = guarda il giocatore successivo.
// La telecamera non attraversa i muri: se dietro al giocatore c'e' un muro si avvicina.
// Dipendenze: Three.js, Render, Network, Input, collision (window.collision), MAP

(function () {
  'use strict';

  const BACK = 3.0;          // metri dietro al giocatore
  const SIDE = 0.55;         // metri a destra (sopra la spalla)
  const UP = 0.45;           // metri sopra la testa
  const HEAD = 1.62;         // altezza della testa del personaggio in piedi
  const PITCH = -0.2;        // telecamera inclinata un po' verso il basso
  const WALL_GAP = 0.25;     // distanza minima dai muri

  const st = {
    active: false,
    targetId: null,
    yaw: 0,
    pos: null,               // posizione attuale della telecamera (THREE.Vector3)
    snap: true,              // al primo frame su un nuovo giocatore niente scivolata
    prevNext: false,
    listeners: [],
  };

  function notify() {
    st.listeners.forEach((f) => { try { f(st.active ? st.targetId : null); } catch (e) { console.error(e); } });
  }

  function canWatch(id) {
    return !!id && !!Network.remotePose(id);
  }

  // Sceglie chi guardare: quello preferito se e' vivo, altrimenti il primo vivo
  function pick(preferId) {
    if (canWatch(preferId)) return preferId;
    const ids = Network.spectatableIds();
    return ids.length ? ids[0] : null;
  }

  function setTarget(id) {
    if (id === st.targetId) return;
    st.targetId = id;
    st.snap = true;
    notify();
  }

  // Sei stato eliminato: si guarda chi ti ha eliminato (se c'e' ancora)
  function start(killerId) {
    st.active = true;
    st.prevNext = true;           // il clic che stavi tenendo premuto non cambia subito giocatore
    st.targetId = null;
    setTarget(pick(killerId));
    if (!st.targetId) notify();
  }

  function stop() {
    if (!st.active) return;
    st.active = false;
    st.targetId = null;
    notify();
  }

  // Un altro giocatore e' stato eliminato: se era quello che guardavi, si passa al suo killer
  function onEliminated(victimId, killerId) {
    if (!st.active || victimId !== st.targetId) return;
    setTarget(pick(killerId));
  }

  // Un giocatore e' uscito dalla partita
  function onLeft(id) {
    if (!st.active || id !== st.targetId) return;
    setTarget(pick(null));
  }

  function cycle(dir) {
    const ids = Network.spectatableIds();
    if (!ids.length) { setTarget(null); return; }
    const i = ids.indexOf(st.targetId);
    setTarget(ids[(i + dir + ids.length) % ids.length]);
  }

  // A ogni frame (dopo che i giocatori remoti si sono mossi): mette la telecamera dietro al giocatore
  function update(dt) {
    if (!st.active) return;

    // Clic / RT / RB: giocatore successivo
    const next = Input.isShooting() || Input.isNextPressed();
    if (next && !st.prevNext) cycle(1);
    st.prevNext = next;

    if (!canWatch(st.targetId)) setTarget(pick(null));
    const pose = st.targetId ? Network.remotePose(st.targetId) : null;
    if (!pose) return;                          // nessuno da guardare: la telecamera resta dov'e'

    const yawPivot = Render.yawPivot();
    const pitchPivot = Render.pitchPivot();

    // Rotazione: segue quella del giocatore (strada piu' corta)
    if (st.snap) st.yaw = pose.rot;
    let diff = pose.rot - st.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    st.yaw += diff * Math.min(1, dt * 8);

    // Avanti = (-sin, -cos), destra = (cos, -sin): la telecamera va dietro e un po' a destra
    const fx = -Math.sin(st.yaw);
    const fz = -Math.cos(st.yaw);
    const rx = Math.cos(st.yaw);
    const rz = -Math.sin(st.yaw);
    const head = { x: pose.x, y: pose.y + HEAD - pose.crouchDrop, z: pose.z };
    const want = {
      x: head.x - fx * BACK + rx * SIDE,
      y: head.y + UP,
      z: head.z - fz * BACK + rz * SIDE,
    };

    // Niente telecamera dentro i muri: raggio dalla testa verso la posizione voluta
    const dx = want.x - head.x;
    const dy = want.y - head.y;
    const dz = want.z - head.z;
    const len = Math.hypot(dx, dy, dz);
    let dist = len;
    if (window.collision && len > 0.01) {
      const dir = { x: dx / len, y: dy / len, z: dz / len };
      const hit = window.collision.raycast(head, dir, len);
      if (hit) dist = Math.max(0.3, hit.distance - WALL_GAP);
    }
    const k = dist / Math.max(len, 1e-6);
    const target = new THREE.Vector3(head.x + dx * k, head.y + dy * k, head.z + dz * k);

    if (!st.pos || st.snap) st.pos = target.clone();
    else st.pos.lerp(target, Math.min(1, dt * 12));
    st.snap = false;

    yawPivot.position.copy(st.pos);
    yawPivot.rotation.y = st.yaw;
    pitchPivot.rotation.x = PITCH;
  }

  const Spectate = {
    start: start,
    stop: stop,
    update: update,
    cycle: cycle,
    onEliminated: onEliminated,
    onLeft: onLeft,
    isActive: () => st.active,
    targetId: () => st.targetId,
    onChange: (fn) => { st.listeners.push(fn); },
  };

  if (typeof window !== 'undefined') window.Spectate = Spectate;
})();
