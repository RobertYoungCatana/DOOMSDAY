// DOOMSDAY - audio.js
// Suoni sintetizzati con il Web Audio API: niente file da scaricare o installare.

(function () {
  let ctx = null;

  function ensureContext() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  function initOnUserGesture() {
    const c = ensureContext();
    if (c && c.state === 'suspended') c.resume();
  }

  function noiseBuffer(c, duration) {
    const n = Math.floor(c.sampleRate * duration);
    const buffer = c.createBuffer(1, n, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // Suono di ogni arma: durata, rumore (frequenza e volume) e colpo basso (tono e volume)
  const SHOTS = {
    pistol:  { dur: 0.12, freq: 1600, gain: 0.6,  low: 160, lowGain: 0.3 },
    smg:     { dur: 0.07, freq: 2100, gain: 0.42, low: 190, lowGain: 0.2 },    // corto e secco: spara tanto
    rifle:   { dur: 0.14, freq: 1250, gain: 0.62, low: 130, lowGain: 0.38 },
    shotgun: { dur: 0.22, freq: 900,  gain: 0.9,  low: 110, lowGain: 0.5 },
  };

  function playShot(weapon) {
    const c = ensureContext();
    if (!c) return;
    const p = SHOTS[weapon] || SHOTS.pistol;
    const dur = p.dur;

    const noise = c.createBufferSource();
    noise.buffer = noiseBuffer(c, dur);

    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = p.freq;
    filter.Q.value = 0.7;

    const gain = c.createGain();
    gain.gain.setValueAtTime(p.gain, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    noise.start();
    noise.stop(c.currentTime + dur);

    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(p.low, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, c.currentTime + dur);
    const oscGain = c.createGain();
    oscGain.gain.setValueAtTime(p.lowGain, c.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.connect(oscGain);
    oscGain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur);
  }

  function playHeadshot() {
    const c = ensureContext();
    if (!c) return;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1500, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2200, c.currentTime + 0.08);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.35, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.15);
  }

  // Conferma (pulsante SELEZIONA): due note brevi che salgono
  function playSelect() {
    const c = ensureContext();
    if (!c) return;
    [[660, 0], [990, 0.07]].forEach((n) => {
      const t = c.currentTime + n[1];
      const osc = c.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(n[0], t);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.13);
    });
  }

  // La musica (music.js) usa lo stesso contesto audio
  function getContext() { return ensureContext(); }

  const GameAudio = { initOnUserGesture, playShot, playHeadshot, playSelect, getContext };
  if (typeof window !== 'undefined') window.GameAudio = GameAudio;
})();