// DOOMSDAY - menunav.js
// Muoversi nei menu senza mouse.
//   Controller: croce direzionale (o levetta sinistra) per spostarsi, A = conferma,
//               B = indietro (chiude le impostazioni / riprende la partita),
//               LB / RB = scheda precedente/successiva nelle impostazioni, personaggio nel menu e in lobby.
//   Tastiera:   frecce per spostarsi, Invio = conferma, Esc = chiude le impostazioni.
//   Sui cursori (sensibilita', volume...) sinistra/destra cambiano il valore.
// Il menu "attivo" e' quello visibile piu' in alto: impostazioni > pausa > fine partita > lobby > menu.
// Ci si sposta verso il pulsante piu' vicino nella direzione premuta (come sulle console).
// Dipendenze: Input, e da menu.js: currentMenuState, closeSettings, resumeGame, stepSkin,
// stepSettingsTab, isSettingsOpen.

(function () {
  'use strict';

  const LAYERS = ['settings-overlay', 'pause-menu', 'end-menu', 'lobby-overlay', 'menu-overlay'];
  const FIRST_DELAY = 0.35;     // tenendo premuto: primo ripeti dopo...
  const REPEAT = 0.13;          // ...poi ogni...
  const SLIDER_REPEAT = 0.05;   // sui cursori si va piu' veloci
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  const nav = {
    layer: null,          // menu attivo (elemento)
    current: null,        // pulsante/cursore selezionato
    lastFocus: {},        // per ogni menu, l'ultimo selezionato (per tornarci chiudendo le impostazioni)
    prev: {},             // tasti del controller al frame prima (per i "premuto adesso")
    holdDir: null,
    holdTime: 0,
    lastInput: null,      // 'pad' | 'key' | 'mouse': il riquadro di selezione si vede solo senza mouse
    padAction: false,     // true mentre si esegue un'azione partita dal controller
  };

  function byId(id) { return document.getElementById(id); }

  // ---------------------------------------------------------------
  // Menu attivo e pulsanti selezionabili
  // ---------------------------------------------------------------
  function isDisplayed(el) {
    return !!el && el.style.display !== 'none' && el.getClientRects().length > 0;
  }

  function activeLayer() {
    if (currentMenuState === 'PLAYING') return null;
    const boot = byId('boot-screen');
    if (boot && !boot.classList.contains('boot-screen-done')) return null;
    if (isDisplayed(byId('loading-screen'))) return null;
    for (let i = 0; i < LAYERS.length; i++) {
      const el = byId(LAYERS[i]);
      if (isDisplayed(el)) return el;
    }
    return null;
  }

  function isShown(el) {
    if (el.disabled || el.closest('[hidden]')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    return getComputedStyle(el).visibility !== 'hidden';
  }

  // Pulsanti e cursori (il campo del nickname no: col controller non si puo' scrivere)
  function candidates(layer) {
    return Array.prototype.filter.call(layer.querySelectorAll('button, input[type="range"]'), isShown);
  }

  function isValid(el) {
    return !!el && !!nav.layer && nav.layer.contains(el) && isShown(el);
  }

  function isSlider(el) {
    return !!el && el.tagName === 'INPUT' && el.type === 'range';
  }

  // Da dove si parte in un menu: l'ultimo selezionato, poi quello indicato con data-nav-default
  // (GIOCA, Riprendi, la scheda aperta...), poi il primo
  function defaultTarget(layer) {
    const last = nav.lastFocus[layer.id];
    if (last && layer.contains(last) && isShown(last)) return last;
    const defs = layer.querySelectorAll('[data-nav-default]');
    for (let i = 0; i < defs.length; i++) if (isShown(defs[i])) return defs[i];
    return candidates(layer)[0] || null;
  }

  function showFocus() { return nav.lastInput === 'pad' || nav.lastInput === 'key'; }

  function setFocus(el) {
    if (nav.current && nav.current !== el) nav.current.classList.remove('nav-focus');
    nav.current = el;
    if (!el) return;
    if (showFocus()) el.classList.add('nav-focus');
    try { el.focus({ preventScroll: false }); } catch (e) { el.focus(); }
    if (nav.layer) nav.lastFocus[nav.layer.id] = el;
  }

  function onLayerChange(layer) {
    if (nav.current) nav.current.classList.remove('nav-focus');
    nav.current = null;
    nav.layer = layer;
    // i menu chiusi dimenticano l'ultima scelta (la prossima volta si riparte da quella di base)
    LAYERS.forEach((id) => { if (!isDisplayed(byId(id))) delete nav.lastFocus[id]; });
    if (!layer) {
      // in partita nessun pulsante deve restare attivo (Spazio o Invio lo premerebbero)
      const a = document.activeElement;
      if (a && a !== document.body && a.blur) a.blur();
      return;
    }
    if (showFocus() || (!nav.lastInput && Input.isGamepadConnected())) {
      if (!nav.lastInput) nav.lastInput = 'pad';
      setFocus(defaultTarget(layer));
    }
  }

  // ---------------------------------------------------------------
  // Spostamento: il pulsante piu' vicino nella direzione premuta
  // ---------------------------------------------------------------
  function gap(a0, a1, b0, b1) {
    if (b1 < a0) return a0 - b1;
    if (b0 > a1) return b0 - a1;
    return 0;                                  // si sovrappongono
  }

  function bestInDirection(a, dir, list, skip) {
    const d = DIRS[dir];
    const acx = (a.left + a.right) / 2;
    const acy = (a.top + a.bottom) / 2;
    let best = null;
    let bestScore = Infinity;
    list.forEach((el) => {
      if (el === skip) return;
      const b = el.getBoundingClientRect();
      const bcx = (b.left + b.right) / 2;
      const bcy = (b.top + b.bottom) / 2;
      let along;
      let across;
      let centerAcross;
      // deve stare davvero da quella parte: il suo centro oltre il bordo di quello selezionato
      if (d[0]) {
        if (d[0] > 0 ? bcx < a.right - 2 : bcx > a.left + 2) return;
        along = Math.max(0, d[0] > 0 ? b.left - a.right : a.left - b.right);
        across = gap(a.top, a.bottom, b.top, b.bottom);
        centerAcross = Math.abs(bcy - acy);
      } else {
        if (d[1] > 0 ? bcy < a.bottom - 2 : bcy > a.top + 2) return;
        along = Math.max(0, d[1] > 0 ? b.top - a.bottom : a.top - b.bottom);
        across = gap(a.left, a.right, b.left, b.right);
        centerAcross = Math.abs(bcx - acx);
      }
      const score = along + across * 3 + centerAcross * 0.05;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    return best;
  }

  function move(dir) {
    const layer = nav.layer;
    if (!layer) return;
    const cur = isValid(nav.current) ? nav.current : null;
    if (!cur) { setFocus(defaultTarget(layer)); return; }
    if (isSlider(cur) && (dir === 'left' || dir === 'right')) {
      nudge(cur, dir === 'left' ? -1 : 1);
      return;
    }
    const list = candidates(layer);
    const a = cur.getBoundingClientRect();
    let next = bestInDirection(a, dir, list, cur);
    // In fondo si ricomincia dall'alto (e viceversa), restando in colonna
    if (!next && (dir === 'up' || dir === 'down')) {
      const far = dir === 'down' ? -100000 : 100000;
      const virtual = { left: a.left, right: a.right, top: far, bottom: far };
      next = bestInDirection(virtual, dir, list, cur);
    }
    if (next) setFocus(next);
  }

  // Cursori: un passo alla volta, con lo stesso evento che manda il mouse
  function nudge(el, sign) {
    const step = parseFloat(el.step) || 1;
    const min = parseFloat(el.min);
    const max = parseFloat(el.max);
    let v = parseFloat(el.value) + sign * step;
    if (Number.isFinite(min)) v = Math.max(min, v);
    if (Number.isFinite(max)) v = Math.min(max, v);
    const decimals = (String(el.step).split('.')[1] || '').length;
    el.value = v.toFixed(decimals);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ---------------------------------------------------------------
  // Azioni
  // ---------------------------------------------------------------
  function padAction(fn) {
    nav.padAction = true;
    try { fn(); } finally { nav.padAction = false; }
    Input.suppressPadUntilRelease();          // il tasto tenuto giu' non deve far saltare o sparare
  }

  function confirm() {
    const el = isValid(nav.current) ? nav.current : null;
    if (!el) { setFocus(defaultTarget(nav.layer)); return; }
    if (el.tagName === 'BUTTON') padAction(() => el.click());
  }

  function back(fromPad) {
    if (isSettingsOpen()) {
      closeSettings();
      return true;
    }
    if (fromPad && currentMenuState === 'PAUSED') {
      padAction(() => resumeGame(true));
      return true;
    }
    return false;
  }

  function tab(dir) {
    if (isSettingsOpen()) {
      stepSettingsTab(dir);
      // se il selezionato era nella scheda appena nascosta, si torna sulla scheda
      if (!isValid(nav.current)) setFocus(document.querySelector('#settings .settings-tab.active'));
    } else if ((currentMenuState === 'MENU' || currentMenuState === 'LOBBY') && typeof stepSkin === 'function') {
      stepSkin(dir);
    }
  }

  // ---------------------------------------------------------------
  // Controller: chiamata a ogni frame da main.js
  // ---------------------------------------------------------------
  function update(dt) {
    const layer = activeLayer();
    const pad = Input.readMenuPad();
    if (pad && pad.active) nav.lastInput = 'pad';
    if (layer !== nav.layer) onLayerChange(layer);

    if (!layer || !pad) {
      nav.prev = pad || {};
      nav.holdDir = null;
      return;
    }

    const dir = pad.up ? 'up' : pad.down ? 'down' : pad.left ? 'left' : pad.right ? 'right' : null;
    if (!dir) {
      nav.holdDir = null;
    } else if (dir !== nav.holdDir) {
      nav.holdDir = dir;
      nav.holdTime = FIRST_DELAY;
      move(dir);
    } else {
      nav.holdTime -= dt;
      if (nav.holdTime <= 0) {
        const sliding = isSlider(nav.current) && (dir === 'left' || dir === 'right');
        nav.holdTime = sliding ? SLIDER_REPEAT : REPEAT;
        move(dir);
      }
    }

    // "premuto adesso" (non tenuto giu' da prima: per esempio A tenuto per saltare)
    if (pad.confirm && !nav.prev.confirm) confirm();
    if (pad.back && !nav.prev.back) back(true);
    if (pad.tabPrev && !nav.prev.tabPrev) tab(-1);
    if (pad.tabNext && !nav.prev.tabNext) tab(1);
    nav.prev = pad;
  }

  // ---------------------------------------------------------------
  // Tastiera e mouse
  // ---------------------------------------------------------------
  const KEY_DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

  window.addEventListener('keydown', (e) => {
    const layer = activeLayer();
    if (!layer) return;
    if (layer !== nav.layer) onLayerChange(layer);
    const t = e.target;
    const typing = !!t && ((t.tagName === 'INPUT' && t.type !== 'range') || t.tagName === 'TEXTAREA');

    if (e.code === 'Escape') {
      if (back(false)) e.preventDefault();
      return;
    }
    // Invio nel nickname = GIOCA
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && t && t.id === 'nickname-input') {
      e.preventDefault();
      const play = byId('play-btn');
      if (play && !play.disabled) play.click();
      return;
    }

    const dir = KEY_DIRS[e.code];
    if (!dir) return;
    // scrivendo il nickname sinistra/destra spostano il cursore del testo
    if (typing && (dir === 'left' || dir === 'right')) return;
    nav.lastInput = 'key';
    const cur = isValid(nav.current) ? nav.current : (layer.contains(document.activeElement) ? document.activeElement : null);
    if (cur && cur !== nav.current && (cur.tagName === 'BUTTON' || isSlider(cur))) setFocus(cur);
    // sui cursori sinistra/destra li regola il browser (stesso evento "input")
    if (isSlider(nav.current) && document.activeElement === nav.current && (dir === 'left' || dir === 'right')) {
      nav.current.classList.add('nav-focus');
      return;
    }
    e.preventDefault();                       // niente scorrimento della pagina
    move(dir);
  });

  // Appena si usa il mouse, il riquadro della selezione sparisce (resta l'effetto al passaggio)
  function onMouse() {
    nav.lastInput = 'mouse';
    if (nav.current) nav.current.classList.remove('nav-focus');
  }
  document.addEventListener('mousedown', onMouse);
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement) return;
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) onMouse();
  });

  const MenuNav = {
    update: update,
    fromPad: () => nav.padAction,      // l'azione in corso l'ha chiesta il controller?
  };

  if (typeof window !== 'undefined') window.MenuNav = MenuNav;
})();
