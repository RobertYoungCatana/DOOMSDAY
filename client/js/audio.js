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

  function playShot(weapon) {
    const c = ensureContext();
    if (!c) return;
    const heavy = weapon === 'shotgun';
    const dur = heavy ? 0.22 : 0.12;

    const noise = c.createBufferSource();
    noise.buffer = noiseBuffer(c, dur);

    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = heavy ? 900 : 1600;
    filter.Q.value = 0.7;

    const gain = c.createGain();
    gain.gain.setValueAtTime(heavy ? 0.9 : 0.6, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    noise.start();
    noise.stop(c.currentTime + dur);

    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(heavy ? 110 : 160, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, c.currentTime + dur);
    const oscGain = c.createGain();
    oscGain.gain.setValueAtTime(heavy ? 0.5 : 0.3, c.currentTime);
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

  const GameAudio = { initOnUserGesture, playShot, playHeadshot };
  if (typeof window !== 'undefined') window.GameAudio = GameAudio;
})();