// DOOMSDAY - music.js
// Musica di sottofondo del menu e della lobby, generata al momento con il Web Audio API:
// niente file da scaricare. Atmosfera post-apocalittica in re minore:
//   bordone grave che respira, accordi lenti (Rem - Sib - Solm - La), un battito profondo
//   come un cuore, un arpeggio lontano con l'eco, il ticchettio di un contatore Geiger,
//   il vento e ogni tanto un colpo metallico lontano in una citta' vuota.
// Parte al primo clic o tasto (i browser non lasciano partire l'audio da soli),
// sfuma quando inizia la partita e ritorna in lobby e nella classifica.
// Volume e accesa/spenta si salvano nel browser. Dipendenze: GameAudio (audio.js), facoltativo.

(function () {
  'use strict';

  const STORAGE_ON = 'doomsday_music_on';
  const STORAGE_VOL = 'doomsday_music_vol';
  const MUSIC_STATES = { MENU: true, CONNECTING: true, LOBBY: true, ENDED: true };
  const BPM = 74;
  const SIXTEENTH = 60 / BPM / 4;     // durata di un sedicesimo (secondi)
  const LOOKAHEAD = 0.35;             // quanto in anticipo si preparano le note

  // Re minore: ogni accordo dura 2 battute, poi si ricomincia (8 battute ~ 26 secondi)
  const CHORDS = [
    { root: 38, notes: [50, 53, 57] },   // Re minore
    { root: 34, notes: [46, 50, 53] },   // Si bemolle
    { root: 31, notes: [43, 46, 50] },   // Sol minore
    { root: 33, notes: [45, 49, 52] },   // La (con il Do diesis: tensione prima di ricominciare)
  ];
  // Arpeggio: sedicesimo della battuta -> nota dell'accordo (due ottave sopra)
  const ARP_A = { 0: 0, 3: 2, 6: 1, 8: 2, 11: 0, 14: 1 };
  const ARP_B = { 0: 2, 2: 1, 6: 0, 10: 2, 12: 1 };

  let enabled = true;
  let volume = 0.6;
  try {
    const on = localStorage.getItem(STORAGE_ON);
    const vol = localStorage.getItem(STORAGE_VOL);
    if (on !== null) enabled = on === '1';
    if (vol !== null && !isNaN(parseFloat(vol))) volume = Math.max(0, Math.min(1, parseFloat(vol)));
  } catch (e) { /* localStorage non disponibile: valori di base */ }

  let ctx = null;
  let unlocked = false;     // diventa true al primo clic/tasto
  let playing = false;
  let hold = false;         // partita in arrivo: niente musica finche' non si torna al menu o in lobby
  let bus = null;           // nodi fissi: volume generale, riverbero, eco
  let voices = [];          // suoni continui (bordone, vento) da fermare alla fine
  let timer = null;
  let stopTimer = null;
  let nextTime = 0;
  let step = 0;
  let noise = null;

  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function save() {
    try {
      localStorage.setItem(STORAGE_ON, enabled ? '1' : '0');
      localStorage.setItem(STORAGE_VOL, String(volume));
    } catch (e) { /* pazienza */ }
  }

  function getCtx() {
    if (ctx) return ctx;
    if (window.GameAudio && GameAudio.getContext) ctx = GameAudio.getContext();
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = AC ? new AC() : null;
    }
    return ctx;
  }

  function noiseBuffer(c) {
    if (noise) return noise;
    const len = c.sampleRate * 2;
    noise = c.createBuffer(1, len, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }

  // Riverbero: "risposta" di una stanza enorme, fatta di rumore che si spegne piano
  function impulse(c, seconds) {
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  function buildBus(c) {
    if (bus) return bus;
    const master = c.createGain();
    master.gain.value = 0;
    master.connect(c.destination);

    const reverb = c.createConvolver();
    reverb.buffer = impulse(c, 3.2);
    const reverbGain = c.createGain();
    reverbGain.gain.value = 0.5;
    reverb.connect(reverbGain);
    reverbGain.connect(master);

    // Eco a tre sedicesimi, ogni ripetizione un po' piu' scura
    const delay = c.createDelay(2);
    delay.delayTime.value = SIXTEENTH * 3;
    const feedback = c.createGain();
    feedback.gain.value = 0.38;
    const tone = c.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200;
    delay.connect(tone);
    tone.connect(feedback);
    feedback.connect(delay);
    tone.connect(master);
    tone.connect(reverb);

    const dry = c.createGain();
    dry.gain.value = 1;
    dry.connect(master);
    bus = { master: master, reverb: reverb, delay: delay, dry: dry };
    return bus;
  }

  // Manda un suono al volume diretto, al riverbero e all'eco nelle quantita' indicate
  function send(c, node, dry, rev, echo) {
    [[dry, bus.dry], [rev, bus.reverb], [echo, bus.delay]].forEach((p) => {
      if (!p[0]) return;
      const g = c.createGain();
      g.gain.value = p[0];
      node.connect(g);
      g.connect(p[1]);
    });
  }

  // ---------------------------------------------------------------
  // Strumenti
  // ---------------------------------------------------------------
  // Accordo lento: onde a dente di sega leggermente stonate tra loro, filtro che si apre piano
  function pad(c, notes, t, dur) {
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 1.4);
    env.gain.setValueAtTime(1, t + dur - 0.2);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.6);
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 0.7;
    filt.frequency.setValueAtTime(500, t);
    filt.frequency.linearRampToValueAtTime(1100, t + dur * 0.6);
    filt.frequency.linearRampToValueAtTime(600, t + dur + 1.5);
    filt.connect(env);
    notes.forEach((m) => {
      [-7, 7].forEach((cents) => {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(m);
        o.detune.value = cents;
        const g = c.createGain();
        g.gain.value = 0.024;
        o.connect(g);
        g.connect(filt);
        o.start(t);
        o.stop(t + dur + 1.7);
      });
    });
    send(c, env, 0.8, 0.6, 0);
  }

  // Battito: colpo basso che scende di tono, come un cuore lontano
  function thump(c, m, t, vel) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(midi(m) * 2.2, t);
    o.frequency.exponentialRampToValueAtTime(midi(m), t + 0.09);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.5);
    send(c, g, 1, 0.15, 0);
  }

  // Campanella lontana dell'arpeggio, con eco e riverbero
  function bell(c, m, t, vel) {
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = midi(m);
    const o2 = c.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = midi(m) * 2.01;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    const g2 = c.createGain();
    g2.gain.value = 0.25;
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    o.start(t);
    o2.start(t);
    o.stop(t + 1.7);
    o2.stop(t + 1.7);
    send(c, g, 0.35, 0.5, 0.45);
  }

  // Ticchettio secco, come un contatore Geiger
  function tick(c, t, vel) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6500;
    const g = c.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(hp);
    hp.connect(g);
    src.start(t, Math.random() * 1.5, 0.06);
    send(c, g, 0.6, 0.2, 0);
  }

  // Colpo metallico lontano (un tubo che cade in una citta' vuota)
  function clang(c, t) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(2.4, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    [[1450, 22], [2310, 26], [3170, 30]].forEach((f) => {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f[0];
      bp.Q.value = f[1];
      src.connect(bp);
      bp.connect(g);
    });
    src.start(t, Math.random(), 0.25);
    send(c, g, 0.12, 0.7, 0.2);
  }

  // Bordone: Re grave (due ottave) con un filtro che si apre e chiude lentamente
  function startDrone(c, t) {
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 240;
    filt.Q.value = 2;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 110;
    lfo.connect(lfoGain);
    lfoGain.connect(filt.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 4);
    filt.connect(g);
    const oscs = [midi(26), midi(38), midi(38) * 1.003].map((f) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const og = c.createGain();
      og.gain.value = 0.33;
      o.connect(og);
      og.connect(filt);
      o.start(t);
      return o;
    });
    lfo.start(t);
    send(c, g, 0.9, 0.4, 0);
    return [lfo].concat(oscs);
  }

  // Vento: rumore filtrato che cambia colore e volume piano piano
  function startWind(c, t) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 650;
    bp.Q.value = 0.9;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 320;
    lfo.connect(lfoGain);
    lfoGain.connect(bp.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 5);
    const lfo2 = c.createOscillator();
    lfo2.frequency.value = 0.11;
    const lfo2Gain = c.createGain();
    lfo2Gain.gain.value = 0.025;
    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(g.gain);
    src.connect(bp);
    bp.connect(g);
    src.start(t);
    lfo.start(t);
    lfo2.start(t);
    send(c, g, 0.6, 0.5, 0);
    return [src, lfo, lfo2];
  }

  // ---------------------------------------------------------------
  // Partitura: cosa suona in ogni sedicesimo
  // ---------------------------------------------------------------
  function scheduleStep(c, n, t) {
    const bar = Math.floor(n / 16);
    const pos = n % 16;
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    if (pos === 0 && bar % 2 === 0) pad(c, chord.notes, t, SIXTEENTH * 32);
    if (pos === 0 || pos === 8) thump(c, chord.root, t, 0.38);               // tum...
    if (pos === 1 || pos === 9) thump(c, chord.root, t + 0.02, 0.19);        // ...tum
    const arp = (bar % 2 === 0 ? ARP_A : ARP_B)[pos];
    if (arp !== undefined && bar >= 2) bell(c, chord.notes[arp] + 24, t, pos === 0 ? 0.14 : 0.09);
    if (pos % 4 === 2) tick(c, t, 0.035);
    if (pos === 0 && bar % 4 === 3) clang(c, t + SIXTEENTH * 6);
  }

  function schedule() {
    if (!playing || !ctx) return;
    const ahead = document.hidden ? 1.5 : LOOKAHEAD;     // scheda nascosta: il browser rallenta i timer
    while (nextTime < ctx.currentTime + ahead) {
      scheduleStep(ctx, step, nextTime);
      nextTime += SIXTEENTH;
      step++;
    }
  }

  function targetGain() { return 1.6 * volume; }

  function start() {
    const c = getCtx();
    if (!c || playing) return;
    if (c.state === 'suspended') c.resume();
    buildBus(c);
    if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
    playing = true;
    const t = c.currentTime + 0.05;
    if (!voices.length) voices = startDrone(c, t).concat(startWind(c, t));
    const gain = bus.master.gain;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(gain.value, t);
    gain.linearRampToValueAtTime(targetGain(), t + 2.5);
    nextTime = t + 0.1;
    step = 0;
    if (!timer) timer = setInterval(schedule, 60);
    schedule();
  }

  function stop(fade) {
    if (!playing || !ctx) return;
    playing = false;
    const f = fade || 1.2;
    const t = ctx.currentTime;
    const gain = bus.master.gain;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(gain.value, t);
    gain.linearRampToValueAtTime(0, t + f);
    if (timer) { clearInterval(timer); timer = null; }
    stopTimer = setTimeout(() => {
      stopTimer = null;
      if (playing) return;                 // e' ripartita nel frattempo
      voices.forEach((v) => { try { v.stop(); } catch (e) { /* gia' fermo */ } });
      voices = [];
    }, (f + 0.3) * 1000);
  }

  // Chiamata a ogni frame da main.js con lo stato del gioco: accende o spegne la musica
  function update(state) {
    if (state === 'MENU' || state === 'PLAYING') hold = false;
    const want = unlocked && enabled && volume > 0 && !hold && MUSIC_STATES[state] === true;
    if (want && !playing) start();
    else if (!want && playing) stop(hold ? 2.5 : 1.2);
  }

  // Primo clic o tasto: da qui in poi il browser lascia suonare
  function unlock() {
    if (unlocked) return;
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    unlocked = true;
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, unlock, { passive: true }));

  const GameMusic = {
    update: update,
    matchStarting: () => { hold = true; },          // la partita sta per iniziare: sfuma
    isEnabled: () => enabled,
    setEnabled: (v) => {
      enabled = !!v;
      save();
      if (!enabled) stop();
    },
    getVolume: () => volume,
    setVolume: (v) => {
      volume = Math.max(0, Math.min(1, Number(v) || 0));
      save();
      if (bus && playing && ctx) bus.master.gain.setTargetAtTime(targetGain(), ctx.currentTime, 0.15);
    },
    isPlaying: () => playing,
  };

  if (typeof window !== 'undefined') window.GameMusic = GameMusic;
})();
