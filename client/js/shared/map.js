// DOOMSDAY — Settore 07: l'incrocio di una citta' evacuata.
// Dati condivisi tra client e server (anche Node): qui dentro niente Three.js.
//
//   boxes        scatole: collisioni + disegno { x, z (CENTRO), y (BASE), w, h, d, color, solid,
//                emissive (luce propria), fire (fiamma), hidden (solo collisione, non si disegna),
//                cast (getta ombra anche se decorativa) }
//   shapes       forme SOLO grafiche disegnate da arena.js (cilindri, scatole ruotate, coni...):
//                { t: 'box'|'cyl'|'cone'|'ball', x, y, z (CENTRO), misure, c: colore, rx, ry, rz,
//                  glow, fire, cast }
//   roads        rettangoli di asfalto (con texture) · smoke: colonne di fumo
//   spawnPoints  punti di partenza · pickups: dove compaiono gli oggetti (y = piano su cui stanno)
//   lights       luci dei fuochi e delle insegne
//
// Mappa: 60 x 60 m. Viale est-ovest e strada nord-sud che si incrociano al centro.
//   NO = condominio in rovina (tetto con scala antincendio)   NE = distributore (tettoia e negozio)
//   SO = posto di blocco militare (torretta, sacchi di sabbia)  SE = cantiere (palazzo a 2 piani, container)
//   Centro: cavalcavia crollato (si sale dalle macerie o dalla scala), autobus ribaltato, auto bruciate.
// Si sale camminando su gradini alti al massimo 0,45 m; con un salto si arriva a circa 1,2 m.
(function () {
  const SIZE = 60;
  const boxes = [];
  const shapes = [];
  const stairsList = [];
  const lights = [];
  const smoke = [];
  const roads = [];

  const C = {
    marking: 0xb7a768, markingWhite: 0xb3b1a6,
    sidewalk: 0x6b685e, curb: 0x8a877d,
    concrete: 0x6c6b62, concreteDark: 0x4b4c45, concreteLight: 0x8a887e,
    plaster: 0x766e61, plasterDark: 0x5c564b, brick: 0x6f4334, brickDark: 0x53322a,
    steel: 0x515955, steelDark: 0x3a403c, rust: 0x6e4a33, rustDark: 0x4d3323,
    olive: 0x4c5838, oliveDark: 0x3a432b, sand: 0x8c7f60, sandDark: 0x6f644b,
    wood: 0x6b4a2e, woodDark: 0x4e3521, black: 0x222523, glass: 0x1b2124,
    burnt: 0x2b2725, burntDark: 0x1a1817, rubble: 0x777367, dirt: 0x5e5240,
    toxic: 0x65ef18, flame: 0xff6a18, flameHot: 0xffc040, lampLit: 0xffe2a0, windowLit: 0xffbf66,
    red: 0x8a3428, blue: 0x2f566b, green: 0x56653a, orange: 0xa86d2c, yellow: 0xb89a2e, white: 0xa29f94,
    leaf: 0x3d4a2a, trunk: 0x3b2f25, accent: 0x8fd61a,
  };

  let seed = 7042026;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  function shade(color, amount) {
    const f = 1 + amount;
    const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 255) * f)));
    const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 255) * f)));
    const b = Math.max(0, Math.min(255, Math.round((color & 255) * f)));
    return (r << 16) | (g << 8) | b;
  }
  function vary(color, amount) { return shade(color, (rnd() - 0.5) * (amount || 0.12)); }

  // ---------------------------------------------------------------
  // Mattoncini
  // ---------------------------------------------------------------
  // Scatola dal centro (x, z) con base a o.y. o.solid = false: decorazione (non blocca)
  function add(x, z, w, d, h, color, o) {
    o = o || {};
    const box = { x, z, y: o.y || 0, w, h, d, color: o.flat ? color : vary(color, 0.1), solid: o.solid !== false };
    if (o.emissive) box.emissive = true;
    if (o.fire) { box.emissive = true; box.fire = true; }
    if (o.hidden) box.hidden = true;
    if (o.cast) box.cast = true;
    boxes.push(box);
    return box;
  }
  function rect(x0, x1, z0, z1, h, color, o) { return add((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, h, color, o); }
  function deco(x0, x1, z0, z1, y, h, color, o) {
    return rect(x0, x1, z0, z1, h, color, Object.assign({ y: y, solid: false }, o || {}));
  }
  function shape(s) { shapes.push(s); return s; }

  // Scala dal bordo (x, z) verso dir ('+x', '-x', '+z', '-z'), sale di "rise" metri con gradini <= 0,45 m.
  // o.base = quota di partenza; o.floating = gradini sospesi (scale di metallo), altrimenti pieni fino alla base.
  function stairs(x, z, dir, rise, width, tread, color, o) {
    o = o || {};
    const base = o.base || 0;
    const n = Math.ceil(rise / 0.45 - 1e-6);
    const r = rise / n;
    const dx = dir === '+x' ? 1 : dir === '-x' ? -1 : 0;
    const dz = dir === '+z' ? 1 : dir === '-z' ? -1 : 0;
    const along = dx !== 0;
    const col = vary(color, 0.06);
    for (let i = 0; i < n; i++) {
      const c = tread * (i + 0.5);
      const top = base + r * (i + 1);
      const y0 = o.floating ? top - 0.2 : base;
      add(x + dx * c, z + dz * c, along ? tread : width, along ? width : tread, top - y0, col, { y: y0, flat: true });
    }
    // corrimano (decorazione) sul lato esterno
    if (o.rail) {
      const side = o.rail;
      const len = n * tread;
      const cx = x + dx * len / 2 + (along ? 0 : side * (width / 2 + 0.03));
      const cz = z + dz * len / 2 + (along ? side * (width / 2 + 0.03) : 0);
      const ang = Math.atan2(rise, len);
      shape({ t: 'box', x: cx, y: base + rise / 2 + 0.9, z: cz, w: along ? Math.hypot(len, rise) : 0.05, h: 0.05,
        d: along ? 0.05 : Math.hypot(len, rise), c: C.steelDark,
        rz: along ? dx * ang : 0, rx: along ? 0 : -dz * ang });
    }
    stairsList.push({ x, z, dir, n, width, tread, topY: base + rise });
  }

  // Muro lungo X (da x0 a x1, centrato su z, spessore t) tra y0 e y1, con aperture [a, b, giu', su]
  function wallX(x0, x1, z, t, y0, y1, color, holes) {
    const col = vary(color, 0.08);
    let cur = x0;
    (holes || []).slice().sort((p, q) => p[0] - q[0]).forEach((hh) => {
      const a = hh[0], b = hh[1], lo = hh[2], hi = hh[3];
      if (a > cur) rect(cur, a, z - t / 2, z + t / 2, y1 - y0, col, { y: y0, flat: true });
      if (lo > y0) rect(a, b, z - t / 2, z + t / 2, lo - y0, col, { y: y0, flat: true });
      if (hi < y1) rect(a, b, z - t / 2, z + t / 2, y1 - hi, col, { y: hi, flat: true });
      if (lo > y0 + 0.3) deco(a - 0.08, b + 0.08, z - t / 2 - 0.06, z + t / 2 + 0.06, lo - 0.06, 0.06, C.concreteLight);  // davanzale
      cur = b;
    });
    if (x1 > cur) rect(cur, x1, z - t / 2, z + t / 2, y1 - y0, col, { y: y0, flat: true });
  }
  // Muro lungo Z (da z0 a z1, centrato su x)
  function wallZ(z0, z1, x, t, y0, y1, color, holes) {
    const col = vary(color, 0.08);
    let cur = z0;
    (holes || []).slice().sort((p, q) => p[0] - q[0]).forEach((hh) => {
      const a = hh[0], b = hh[1], lo = hh[2], hi = hh[3];
      if (a > cur) rect(x - t / 2, x + t / 2, cur, a, y1 - y0, col, { y: y0, flat: true });
      if (lo > y0) rect(x - t / 2, x + t / 2, a, b, lo - y0, col, { y: y0, flat: true });
      if (hi < y1) rect(x - t / 2, x + t / 2, a, b, y1 - hi, col, { y: hi, flat: true });
      if (lo > y0 + 0.3) deco(x - t / 2 - 0.06, x + t / 2 + 0.06, a - 0.08, b + 0.08, lo - 0.06, 0.06, C.concreteLight);
      cur = b;
    });
    if (z1 > cur) rect(x - t / 2, x + t / 2, cur, z1, y1 - y0, col, { y: y0, flat: true });
  }

  // Finestre finte su una facciata (vetro scuro, rotte o accese). axis 'x' = facciata lungo X
  function windowRow(axis, a0, a1, face, out, y, h, step, litChance) {
    for (let a = a0 + step / 2; a < a1 - 0.6; a += step) {
      const r = rnd();
      const color = r < litChance ? C.windowLit : r < litChance + 0.25 ? C.black : C.glass;
      const o = { y: y, solid: false, flat: true, emissive: r < litChance };
      if (axis === 'x') add(a, face + out * 0.03, 1.1, 0.06, h, color, o);
      else add(face + out * 0.03, a, 0.06, 1.1, h, color, o);
    }
  }

  // Ferri d'armatura che spuntano dal cemento rotto
  function rebar(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      shape({ t: 'box', x: x + (rnd() - 0.5) * 0.8, y: y + 0.35, z: z + (rnd() - 0.5) * 0.8, w: 0.03, h: 0.8, d: 0.03,
        c: C.rustDark, rx: (rnd() - 0.5) * 0.9, rz: (rnd() - 0.5) * 0.9 });
    }
  }

  // ---------------------------------------------------------------
  // Oggetti della citta'
  // ---------------------------------------------------------------
  // Auto 4,2 x 1,8: carrozzeria (fino a 0,9) + abitacolo (fino a 1,45). Si sale con un salto.
  function car(x, z, axis, color, o) {
    o = o || {};
    const along = axis === 'x';
    const body = o.burnt ? C.burnt : color;
    const L = 4.2, W = 1.8;
    add(x, z, along ? L : W, along ? W : L, 0.62, body, { y: 0.28 });
    const ox = along ? -0.25 : 0, oz = along ? 0 : -0.25;
    add(x + ox, z + oz, along ? 2.2 : 1.55, along ? 1.55 : 2.2, 0.55, o.burnt ? C.burntDark : vary(body, 0.05), { y: 0.9 });
    // vetri (scuri) sui lati e davanti/dietro
    if (along) {
      deco(x + ox - 1.0, x + ox + 1.0, z - 0.8, z + 0.8, 1.0, 0.36, o.burnt ? C.black : C.glass);
    } else {
      deco(x - 0.8, x + 0.8, z + oz - 1.0, z + oz + 1.0, 1.0, 0.36, o.burnt ? C.black : C.glass);
    }
    // ruote
    for (const e of [-1.3, 1.3]) {
      for (const s of [-0.92, 0.92]) {
        shape({ t: 'cyl', x: x + (along ? e : s), y: 0.33, z: z + (along ? s : e), rt: 0.33, h: 0.24, seg: 8,
          c: o.burnt ? C.burntDark : C.black, rx: along ? Math.PI / 2 : 0, rz: along ? 0 : Math.PI / 2 });
      }
    }
    // fari e paraurti
    const fx = along ? L / 2 : 0, fz = along ? 0 : L / 2;
    for (const k of [-1, 1]) {
      shape({ t: 'box', x: x + fx * k, y: 0.42, z: z + fz * k, w: along ? 0.12 : W + 0.06, h: 0.16, d: along ? W + 0.06 : 0.12, c: C.steelDark });
      for (const s of [-0.6, 0.6]) {
        shape({ t: 'box', x: x + fx * k * 1.01 + (along ? 0 : s), y: 0.7, z: z + fz * k * 1.01 + (along ? s : 0),
          w: along ? 0.05 : 0.3, h: 0.14, d: along ? 0.3 : 0.05, c: o.burnt ? C.black : (k > 0 ? 0xd9d2b0 : 0x8a2a20) });
      }
    }
    if (o.police) {      // barra luminosa sul tetto
      shape({ t: 'box', x: x + ox - (along ? 0 : 0) , y: 1.5, z: z + oz, w: along ? 0.3 : 1.2, h: 0.1, d: along ? 1.2 : 0.3, c: 0x1c2a42 });
      shape({ t: 'box', x: x + ox + (along ? 0 : -0.3), y: 1.57, z: z + oz + (along ? -0.3 : 0), w: 0.25, h: 0.08, d: 0.25, c: 0x3a6fd6, glow: true });
      shape({ t: 'box', x: x + ox + (along ? 0 : 0.3), y: 1.57, z: z + oz + (along ? 0.3 : 0), w: 0.25, h: 0.08, d: 0.25, c: 0xd63a3a, glow: true });
    }
    if (o.fire) {
      fire(x + ox, 1.5, z + oz, 1.2);
      lights.push({ x: x + ox, y: 2.4, z: z + oz, color: 0xff7a26, intensity: 1.6, distance: 15, flicker: true });
      smoke.push({ x: x + ox, y: 5.5, z: z + oz });
    }
  }

  // Fiamme: coni luminosi che tremolano (arena.js le fa pulsare)
  function fire(x, y, z, size) {
    shape({ t: 'cone', x: x, y: y + 0.35 * size, z: z, r: 0.45 * size, h: 0.9 * size, seg: 6, c: C.flame, fire: true });
    shape({ t: 'cone', x: x + 0.2 * size, y: y + 0.25 * size, z: z - 0.15 * size, r: 0.28 * size, h: 0.6 * size, seg: 5, c: C.flameHot, fire: true, ry: 0.4 });
    shape({ t: 'cone', x: x - 0.22 * size, y: y + 0.2 * size, z: z + 0.12 * size, r: 0.25 * size, h: 0.5 * size, seg: 5, c: C.flameHot, fire: true, ry: 1.1 });
  }

  // Bidone (con o senza fuoco dentro): collisione quadrata, disegno tondo
  function barrel(x, z, color, o) {
    o = o || {};
    add(x, z, 0.62, 0.62, 0.92, color, { hidden: true });
    shape({ t: 'cyl', x, y: 0.46, z, rt: 0.31, h: 0.92, seg: 10, c: vary(color, 0.1), cast: true });
    shape({ t: 'cyl', x, y: 0.3, z, rt: 0.325, h: 0.05, seg: 10, c: C.steelDark });
    shape({ t: 'cyl', x, y: 0.65, z, rt: 0.325, h: 0.05, seg: 10, c: C.steelDark });
    if (o.fire) {
      fire(x, 0.95, z, 0.75);
      lights.push({ x, y: 1.7, z, color: 0xff7a26, intensity: 1.1, distance: 10, flicker: true });
      smoke.push({ x, y: 4.2, z });
    }
  }

  // Container 6,06 x 2,44 x 2,6 con nervature e porte
  function container(x0, z0, axis, color, base) {
    const along = axis === 'x';
    const L = 6.06, W = 2.44, H = 2.6;
    const x1 = x0 + (along ? L : W), z1 = z0 + (along ? W : L);
    const col = vary(color, 0.08);
    rect(x0, x1, z0, z1, H, col, { y: base || 0, flat: true });
    const rib = shade(col, -0.18);
    for (let i = 1; i < 10; i++) {
      const a = (along ? x0 : z0) + (L * i) / 10;
      for (const side of [-1, 1]) {
        if (along) shape({ t: 'box', x: a, y: (base || 0) + H / 2, z: (side < 0 ? z0 : z1) + side * 0.03, w: 0.1, h: H - 0.2, d: 0.06, c: rib });
        else shape({ t: 'box', x: (side < 0 ? x0 : x1) + side * 0.03, y: (base || 0) + H / 2, z: a, w: 0.06, h: H - 0.2, d: 0.1, c: rib });
      }
    }
    // spranghe delle porte su un lato corto
    for (const s of [-0.5, -0.2, 0.2, 0.5]) {
      if (along) shape({ t: 'cyl', x: x1 + 0.05, y: (base || 0) + H / 2, z: (z0 + z1) / 2 + s * 2, rt: 0.025, h: H - 0.3, seg: 5, c: C.steelDark });
      else shape({ t: 'cyl', x: (x0 + x1) / 2 + s * 2, y: (base || 0) + H / 2, z: z1 + 0.05, rt: 0.025, h: H - 0.3, seg: 5, c: C.steelDark });
    }
  }

  // Barriera di cemento "new jersey": base larga + parte alta stretta (alta 0,85)
  function jersey(x, z, axis, len, base) {
    const along = axis === 'x';
    const y = base || 0;
    const col = vary(C.concreteLight, 0.08);
    add(x, z, along ? len : 0.62, along ? 0.62 : len, 0.32, col, { y: y, flat: true });
    add(x, z, along ? len : 0.34, along ? 0.34 : len, 0.53, col, { y: y + 0.32, flat: true });
    // strisce rosse e bianche consumate
    for (let a = -len / 2 + 0.5; a < len / 2 - 0.3; a += 1.2) {
      if (along) shape({ t: 'box', x: x + a, y: y + 0.62, z, w: 0.5, h: 0.12, d: 0.36, c: 0x8a3428 });
      else shape({ t: 'box', x, y: y + 0.62, z: z + a, w: 0.36, h: 0.12, d: 0.5, c: 0x8a3428 });
    }
  }

  // Muro di sacchi di sabbia da (x0, z0) a (x1, z1) (dritto lungo un asse), alto h
  function sandbags(x0, z0, x1, z1, h) {
    const along = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const len = along ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const t = 0.7;
    rect(Math.min(x0, x1) - (along ? 0 : t / 2), Math.max(x0, x1) + (along ? 0 : t / 2),
      Math.min(z0, z1) - (along ? t / 2 : 0), Math.max(z0, z1) + (along ? t / 2 : 0), h, C.sand, { hidden: true });
    const rows = Math.round(h / 0.22);
    for (let r = 0; r < rows; r++) {
      const shift = (r % 2) * 0.28;
      for (let a = shift; a < len - 0.1; a += 0.56) {
        const l = Math.min(0.54, len - a);
        const cx = along ? Math.min(x0, x1) + a + l / 2 : x0;
        const cz = along ? z0 : Math.min(z0, z1) + a + l / 2;
        shape({ t: 'box', x: cx, y: 0.11 + r * 0.22, z: cz, w: along ? l : t - (r % 2) * 0.06, h: 0.21,
          d: along ? t - (r % 2) * 0.06 : l, c: vary(rnd() < 0.5 ? C.sand : C.sandDark, 0.12), ry: (rnd() - 0.5) * 0.06, cast: true });
      }
    }
  }

  // Cassa di legno (si puo' salire sopra)
  function crate(x, z, s, base, color) {
    const col = vary(color || C.wood, 0.12);
    add(x, z, s, s, s, col, { y: base || 0, flat: true });
    shape({ t: 'box', x, y: (base || 0) + s / 2, z, w: s + 0.02, h: 0.06, d: s + 0.02, c: shade(col, -0.25) });
    shape({ t: 'box', x, y: (base || 0) + s / 2, z, w: 0.06, h: s + 0.02, d: s + 0.02, c: shade(col, -0.25) });
  }

  // Lampione: palo, braccio verso la strada (ax, az), lampada accesa o rotta. tilt = palo piegato
  function lamp(x, z, ax, az, o) {
    o = o || {};
    const tilt = o.tilt || 0;
    const b = o.base || 0;
    add(x, z, 0.24, 0.24, 1.2, C.steelDark, { hidden: true, y: b });
    shape({ t: 'cyl', x: x + ax * tilt * 2.4, y: b + 2.6, z: z + az * tilt * 2.4, rt: 0.07, rb: 0.11, h: 5.2, seg: 6, c: C.steelDark,
      rx: az * tilt, rz: -ax * tilt, cast: true });
    const topX = x + ax * tilt * 5.0, topZ = z + az * tilt * 5.0, topY = b + 5.15 - Math.abs(tilt) * 0.6;
    shape({ t: 'box', x: topX + ax * 0.6, y: topY, z: topZ + az * 0.6, w: ax ? 1.3 : 0.1, h: 0.08, d: az ? 1.3 : 0.1, c: C.steelDark });
    shape({ t: 'box', x: topX + ax * 1.2, y: topY - 0.1, z: topZ + az * 1.2, w: 0.45, h: 0.12, d: 0.45, c: C.steel });
    shape({ t: 'box', x: topX + ax * 1.2, y: topY - 0.18, z: topZ + az * 1.2, w: 0.32, h: 0.05, d: 0.32,
      c: o.broken ? C.black : C.lampLit, glow: !o.broken });
  }

  // Semaforo all'angolo: palo + braccio sulla strada + lanterna (una luce accesa)
  function trafficLight(x, z, ax, az, lit) {
    add(x, z, 0.22, 0.22, 1.2, C.steelDark, { hidden: true });
    shape({ t: 'cyl', x, y: 2.4, z, rt: 0.08, h: 4.8, seg: 6, c: C.steelDark, cast: true });
    shape({ t: 'box', x: x + ax * 1.6, y: 4.7, z: z + az * 1.6, w: ax ? 3.2 : 0.1, h: 0.1, d: az ? 3.2 : 0.1, c: C.steelDark });
    const lx = x + ax * 2.9, lz = z + az * 2.9;
    shape({ t: 'box', x: lx, y: 4.25, z: lz, w: 0.32, h: 0.95, d: 0.32, c: C.black });
    [[4.55, 0xd63a2a], [4.25, 0xe2a823], [3.95, 0x5fbf3a]].forEach((l, i) => {
      shape({ t: 'box', x: lx, y: l[0], z: lz, w: 0.34, h: 0.2, d: 0.34, c: i === lit ? l[1] : shade(l[1], -0.75), glow: i === lit });
    });
  }

  // Albero secco: tronco, rami storti e qualche ciuffo di foglie morte
  function tree(x, z, h) {
    add(x, z, 0.36, 0.36, 2.2, C.trunk, { hidden: true });
    shape({ t: 'cyl', x, y: h / 2, z, rt: 0.1, rb: 0.2, h: h, seg: 6, c: C.trunk, cast: true });
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI * 2;
      const len = 1.2 + rnd() * 1.2;
      const y = h * (0.55 + rnd() * 0.35);
      shape({ t: 'cyl', x: x + Math.cos(a) * len * 0.35, y: y + len * 0.3, z: z + Math.sin(a) * len * 0.35, rt: 0.03, rb: 0.07,
        h: len, seg: 5, c: C.trunk, rx: Math.sin(a) * 0.9, rz: -Math.cos(a) * 0.9, cast: true });
      if (rnd() < 0.6) {
        shape({ t: 'ball', x: x + Math.cos(a) * len * 0.75, y: y + len * 0.6, z: z + Math.sin(a) * len * 0.75, r: 0.45 + rnd() * 0.3,
          c: vary(C.leaf, 0.2), sy: 0.7, cast: true });
      }
    }
  }

  // Ostacolo anticarro ("riccio"): tre travi incrociate
  function hedgehog(x, z) {
    add(x, z, 0.9, 0.9, 0.8, C.steelDark, { hidden: true });
    [[0.75, 0, 0], [0, 0, 0.75], [-0.75, 0.6, 0]].forEach((r) => {
      shape({ t: 'box', x, y: 0.55, z, w: 0.12, h: 1.5, d: 0.12, c: C.rustDark, rx: r[0], ry: r[1], rz: r[2], cast: true });
    });
  }

  // Cassonetto della spazzatura (si sale con un salto)
  function dumpster(x, z, axis, color) {
    const along = axis === 'x';
    add(x, z, along ? 1.9 : 1.1, along ? 1.1 : 1.9, 1.15, color);
    shape({ t: 'box', x, y: 1.22, z: z + (along ? 0.05 : 0), w: along ? 1.95 : 1.15, h: 0.08, d: along ? 1.15 : 1.95, c: shade(color, -0.3), rx: along ? 0.1 : 0, rz: along ? 0 : -0.1 });
  }

  // Panchina, idrante, cestino: solo dettagli
  function bench(x, z, axis) {
    const along = axis === 'x';
    shape({ t: 'box', x, y: 0.45, z, w: along ? 1.8 : 0.45, h: 0.06, d: along ? 0.45 : 1.8, c: C.woodDark });
    shape({ t: 'box', x: x + (along ? 0 : 0.22), y: 0.75, z: z + (along ? 0.22 : 0), w: along ? 1.8 : 0.05, h: 0.4, d: along ? 0.05 : 1.8, c: C.woodDark });
    for (const s of [-0.75, 0.75]) shape({ t: 'box', x: x + (along ? s : 0), y: 0.22, z: z + (along ? 0 : s), w: 0.06, h: 0.45, d: 0.4, c: C.steelDark });
  }
  function hydrant(x, z) {
    shape({ t: 'cyl', x, y: 0.35, z, rt: 0.12, rb: 0.14, h: 0.7, seg: 7, c: 0x8a2a20 });
    shape({ t: 'ball', x, y: 0.72, z, r: 0.13, c: 0x8a2a20 });
    shape({ t: 'cyl', x, y: 0.45, z, rt: 0.05, h: 0.36, seg: 5, c: 0x8a2a20, rz: Math.PI / 2 });
  }
  function bin(x, z, fallen) {
    if (fallen) shape({ t: 'cyl', x, y: 0.28, z, rt: 0.27, rb: 0.24, h: 0.85, seg: 8, c: C.steel, rz: Math.PI / 2, ry: rnd() * 3 });
    else shape({ t: 'cyl', x, y: 0.43, z, rt: 0.27, rb: 0.24, h: 0.85, seg: 8, c: C.steel });
  }

  // Macerie sparse (decorazione + qualche pezzo basso che fa da riparo)
  function rubble(x, z, n, spread) {
    for (let i = 0; i < n; i++) {
      const s = 0.25 + rnd() * 0.75;
      shape({ t: 'box', x: x + (rnd() - 0.5) * spread, y: s * 0.3, z: z + (rnd() - 0.5) * spread, w: s, h: s * 0.6, d: s * (0.6 + rnd() * 0.6),
        c: vary([C.rubble, C.concreteDark, C.concrete, C.brickDark][Math.floor(rnd() * 4)], 0.15), rx: (rnd() - 0.5) * 0.5, ry: rnd() * 3, rz: (rnd() - 0.5) * 0.5 });
    }
  }

  // Pozza tossica (luminosa) o d'acqua sporca
  function puddle(x0, x1, z0, z1, toxic) {
    deco(x0, x1, z0, z1, 0.025, 0.03, toxic ? C.toxic : 0x23292a, { emissive: !!toxic, flat: true });
  }

  // ---------------------------------------------------------------
  // 1) Bordo della mappa: facciate di palazzi alte (con finestre) tutto intorno
  // ---------------------------------------------------------------
  const BORDER = 30.5;
  function borderSide(axis, sign) {
    let a = -BORDER - 1;
    while (a < BORDER + 1) {
      const w = Math.min(BORDER + 1 - a, 6 + rnd() * 6);
      const h = 11 + rnd() * 9;
      const col = [C.concreteDark, C.plasterDark, C.brickDark, C.concrete][Math.floor(rnd() * 4)];
      const face = sign * BORDER;
      if (axis === 'x') {
        rect(a, a + w, sign < 0 ? -BORDER - 1.2 : BORDER, sign < 0 ? -BORDER : BORDER + 1.2, h, col, { cast: true });
        for (let y = 1.5; y < h - 1.4; y += 3.2) windowRow('x', a + 0.4, a + w - 0.4, face, -sign, y, 1.4, 2.2, 0.07);
      } else {
        rect(sign < 0 ? -BORDER - 1.2 : BORDER, sign < 0 ? -BORDER : BORDER + 1.2, a, a + w, h, col, { cast: true });
        for (let y = 1.5; y < h - 1.4; y += 3.2) windowRow('z', a + 0.4, a + w - 0.4, face, -sign, y, 1.4, 2.2, 0.07);
      }
      a += w;
    }
  }
  borderSide('x', -1); borderSide('x', 1); borderSide('z', -1); borderSide('z', 1);

  // ---------------------------------------------------------------
  // 2) Strade, marciapiedi, segnaletica
  // ---------------------------------------------------------------
  roads.push({ x0: -30, x1: 30, z0: -5, z1: 5 }, { x0: -5, x1: 5, z0: -30, z1: -5 }, { x0: -5, x1: 5, z0: 5, z1: 30 });
  // marciapiedi (bassi, non fanno inciampare) con il cordolo
  [[-30, -5], [5, 30]].forEach((xr) => {
    [[-7, -5], [5, 7]].forEach((zr) => {
      deco(xr[0], xr[1], zr[0], zr[1], 0, 0.12, C.sidewalk, { flat: true });
      deco(xr[0], xr[1], zr[0] < 0 ? -5.15 : 5, zr[0] < 0 ? -5 : 5.15, 0, 0.14, C.curb, { flat: true });
    });
  });
  [[-30, -7], [7, 30]].forEach((zr) => {
    [[-7, -5], [5, 7]].forEach((xr) => {
      deco(xr[0], xr[1], zr[0], zr[1], 0, 0.12, C.sidewalk, { flat: true });
      deco(xr[0] < 0 ? -5.15 : 5, xr[0] < 0 ? -5 : 5.15, zr[0], zr[1], 0, 0.14, C.curb, { flat: true });
    });
  });
  // linee: tratteggio centrale giallo e bordi bianchi
  for (let p = -28; p <= 26; p += 4) {
    if (Math.abs(p + 1) > 6.5) {
      deco(p, p + 2, -0.08, 0.08, 0.02, 0.012, C.marking, { flat: true });
      deco(-0.08, 0.08, p, p + 2, 0.02, 0.012, C.marking, { flat: true });
    }
  }
  [[-30, -7.5], [7.5, 30]].forEach((r) => {
    deco(r[0], r[1], -4.6, -4.48, 0.02, 0.012, C.markingWhite, { flat: true });
    deco(r[0], r[1], 4.48, 4.6, 0.02, 0.012, C.markingWhite, { flat: true });
    deco(-4.6, -4.48, r[0], r[1], 0.02, 0.012, C.markingWhite, { flat: true });
    deco(4.48, 4.6, r[0], r[1], 0.02, 0.012, C.markingWhite, { flat: true });
  });
  // strisce pedonali ai quattro lati dell'incrocio
  for (let a = -4.2; a <= 3.8; a += 1.0) {
    deco(-7.4, -5.4, a, a + 0.5, 0.02, 0.012, C.markingWhite, { flat: true });
    deco(5.4, 7.4, a, a + 0.5, 0.02, 0.012, C.markingWhite, { flat: true });
    deco(a, a + 0.5, -7.4, -5.4, 0.02, 0.012, C.markingWhite, { flat: true });
    deco(a, a + 0.5, 5.4, 7.4, 0.02, 0.012, C.markingWhite, { flat: true });
  }
  // buche, toppe, pozze, colate tossiche
  [[-19, -3.4, 1.4], [9, 3.2, 1.0], [2.5, 18, 1.2], [-1.5, -21, 1.0], [21, -1.5, 0.9]].forEach((p) => {
    deco(p[0] - p[2], p[0] + p[2], p[1] - p[2] * 0.6, p[1] + p[2] * 0.6, 0.016, 0.01, 0x262826, { flat: true });
  });
  puddle(-16, -9, -4.6, -3.2, true); puddle(10, 17, 3.0, 4.4, true); puddle(-2.8, -1.8, -25, -16, true);
  puddle(1.8, 2.8, 16, 25, true); puddle(-24, -21, 3.2, 4.3, false); puddle(14, 16.5, -4.3, -3.6, false);

  // ---------------------------------------------------------------
  // 3) NO: condominio in rovina (2 piani + tetto con parapetto, scala interna e scala antincendio)
  //    pianta x -26..-12, z -26..-15 · primo piano a 3,5 m · tetto a 7 m
  // ---------------------------------------------------------------
  const T = 0.4;
  // piano terra (0 - 3,2)
  wallX(-26, -12, -15.2, T, 0, 3.2, C.plaster, [[-20.5, -18.5, 0, 2.4], [-24.6, -23.0, 1.0, 2.3], [-16.0, -14.4, 1.0, 2.3]]);
  wallX(-26, -12, -25.8, T, 0, 3.2, C.plasterDark, [[-22, -20.6, 1.0, 2.3], [-16, -14.6, 1.0, 2.3]]);
  wallZ(-25.6, -15.4, -25.8, T, 0, 3.2, C.plaster, [[-22, -20.5, 1.0, 2.3]]);
  wallZ(-25.6, -15.4, -12.2, T, 0, 3.2, C.plaster, [[-25.2, -23.8, 0, 2.4], [-18, -16.6, 1.0, 2.3]]);
  // solaio del primo piano (3,2 - 3,5) con il vano scala e un buco crollato al centro
  rect(-26, -12, -26, -21.6, 0.3, C.concreteDark, { y: 3.2 });
  rect(-24.2, -19.5, -21.6, -15, 0.3, C.concreteDark, { y: 3.2 });
  rect(-15.5, -12, -21.6, -15, 0.3, C.concreteDark, { y: 3.2 });
  rect(-19.5, -15.5, -17.5, -15, 0.3, C.concreteDark, { y: 3.2 });
  rebar(-17.5, 3.2, -21.6, 4); rebar(-19.5, 3.2, -19.5, 3);
  rubble(-17.5, -19.4, 10, 3.2);
  // scala interna (lungo il muro ovest) fino al primo piano
  stairs(-24.9, -16.0, '-z', 3.5, 1.2, 0.7, C.concrete, { rail: 1 });
  // primo piano (3,5 - 6,7): l'angolo sud-ovest e' crollato (muri piu' bassi)
  wallX(-26, -21, -15.2, T, 3.5, 5.0, C.plaster, [[-24.6, -23.0, 4.5, 5.8]]);
  wallX(-21, -12, -15.2, T, 3.5, 6.7, C.plaster, [[-21, -19.4, 4.5, 5.8], [-16, -14.4, 4.5, 5.8]]);
  wallX(-26, -12, -25.8, T, 3.5, 6.7, C.plasterDark, [[-22, -20.6, 4.5, 5.8], [-16, -14.6, 4.5, 5.8]]);
  wallZ(-25.6, -20, -25.8, T, 3.5, 6.7, C.plaster, [[-23.5, -22, 4.5, 5.8]]);
  wallZ(-20, -15.4, -25.8, T, 3.5, 4.8, C.plaster);
  wallZ(-25.6, -15.4, -12.2, T, 3.5, 6.7, C.plaster, [[-24.0, -22.6, 3.5, 5.9], [-18, -16.6, 4.5, 5.8]]);
  // tetto (6,7 - 7) senza l'angolo crollato, con parapetto
  rect(-26, -12, -26, -20, 0.3, C.concreteDark, { y: 6.7 });
  rect(-21, -12, -20, -15, 0.3, C.concreteDark, { y: 6.7 });
  rect(-26, -12, -26, -25.7, 0.9, C.plasterDark, { y: 7.0 });
  rect(-12.3, -12, -26, -19.6, 0.9, C.plaster, { y: 7.0 });
  rect(-12.3, -12, -18.2, -15, 0.9, C.plaster, { y: 7.0 });
  rect(-21, -12, -15.3, -15, 0.9, C.plaster, { y: 7.0 });
  rect(-26, -25.7, -26, -20, 0.9, C.plaster, { y: 7.0 });
  rebar(-23.5, 6.7, -20, 5); rebar(-21, 6.7, -17.5, 3);
  rubble(-23.5, -17.5, 14, 3.6);
  // sul tetto: serbatoio dell'acqua e condizionatori (ripari)
  add(-23.6, -23.6, 1.6, 1.6, 1.4, C.steel, { y: 7.0 });
  shape({ t: 'cyl', x: -23.6, y: 9.2, z: -23.6, rt: 0.95, h: 1.6, seg: 10, c: C.rust, cast: true });
  shape({ t: 'cone', x: -23.6, y: 10.3, z: -23.6, r: 1.0, h: 0.6, seg: 10, c: C.rustDark });
  add(-14.2, -24.8, 1.3, 0.9, 1.0, C.steel, { y: 7.0 });
  add(-18.8, -25.0, 1.1, 0.8, 0.9, C.steel, { y: 7.0 });
  // scala antincendio esterna (lato est): rampa 1 fino al pianerottolo (3,5), rampa 2 fino al tetto (7)
  stairs(-11.25, -15.0, '-z', 3.5, 1.3, 0.7, C.steel, { floating: true, rail: 1 });
  rect(-11.9, -9.2, -24.6, -20.6, 0.2, C.steelDark, { y: 3.3 });
  stairs(-9.85, -24.6, '+z', 3.5, 1.3, 0.7, C.steel, { floating: true, base: 3.5, rail: 1 });
  rect(-12.0, -9.2, -19.7, -18.2, 0.2, C.steelDark, { y: 6.8 });
  shape({ t: 'box', x: -9.2, y: 4.0, z: -22.6, w: 0.05, h: 1.0, d: 4.0, c: C.steelDark });
  shape({ t: 'box', x: -9.2, y: 7.5, z: -18.95, w: 0.05, h: 1.0, d: 1.5, c: C.steelDark });
  // finestre finte sulle facciate esterne, cornicioni, insegna
  deco(-26.1, -11.9, -15.05, -14.95, 3.25, 0.18, C.concreteLight);
  deco(-26.1, -11.9, -15.05, -14.95, 6.75, 0.18, C.concreteLight);
  shape({ t: 'box', x: -16.5, y: 2.75, z: -14.9, w: 2.6, h: 0.5, d: 0.08, c: 0x3a6f6a });
  // cortile: auto bruciata, cassonetto, muretti, albero, fuoco in un bidone
  car(-22.5, -10.5, 'x', C.red, { burnt: true });
  dumpster(-15.5, -12.3, 'x', 0x3d5a3a);
  wallX(-27, -21.5, -8.4, 0.4, 0, 1.15, C.brick);
  wallX(-17.5, -13, -8.4, 0.4, 0, 1.15, C.brick);
  tree(-9.4, -12.5, 4.6);
  barrel(-13.6, -9.6, C.rust, { fire: true });
  crate(-10.3, -14.2, 1.0, 0);
  rubble(-19.5, -13, 8, 2.5);

  // ---------------------------------------------------------------
  // 4) NE: distributore (tettoia alta 4,5 m con scala, pompe, negozio, autocisterna)
  // ---------------------------------------------------------------
  rect(10, 22, -19.5, -10.5, 0.4, C.white, { y: 4.1 });
  [[11, -18.5], [21, -18.5], [11, -11.5], [21, -11.5]].forEach((p) => add(p[0], p[1], 0.6, 0.6, 4.1, C.white));
  // fascia luminosa dell'insegna lungo i bordi della tettoia
  deco(9.94, 22.06, -19.56, -19.5, 4.14, 0.26, C.accent, { emissive: true, flat: true });
  deco(9.94, 22.06, -10.5, -10.44, 4.14, 0.26, C.accent, { emissive: true, flat: true });
  deco(9.94, 10, -19.5, -10.5, 4.14, 0.26, C.accent, { emissive: true, flat: true });
  deco(22, 22.06, -19.5, -10.5, 4.14, 0.26, C.accent, { emissive: true, flat: true });
  // sopra la tettoia: insegna (riparo) e un condizionatore
  add(16, -15, 3.2, 0.35, 1.2, C.white, { y: 4.5 });
  deco(14.6, 17.4, -15.2, -15.17, 4.65, 0.9, 0xe2a823, { emissive: true, flat: true });
  deco(14.6, 17.4, -14.83, -14.8, 4.65, 0.9, 0xe2a823, { emissive: true, flat: true });
  add(12.2, -18, 1.2, 1.0, 0.9, C.steel, { y: 4.5 });
  // scala di servizio per la tettoia
  stairs(22.8, -10.8, '-z', 4.5, 1.2, 0.62, C.steel, { floating: true, rail: 1 });
  // isole delle pompe (le pompe sono ripari)
  deco(12.5, 19.5, -15.6, -14.4, 0, 0.18, C.concreteLight);
  [14, 18].forEach((x) => {
    add(x, -15, 0.8, 0.55, 1.7, C.red);
    shape({ t: 'box', x, y: 1.75, z: -15, w: 0.85, h: 0.12, d: 0.6, c: C.white });
    shape({ t: 'box', x: x + 0.3, y: 1.2, z: -14.7, w: 0.2, h: 0.4, d: 0.05, c: C.glass });
  });
  [12.7, 19.3].forEach((x) => shape({ t: 'cyl', x, y: 0.45, z: -15, rt: 0.1, h: 0.9, seg: 6, c: C.yellow }));
  // negozio (si entra dalla vetrina rotta o dalla porta), tetto a 3,9 m
  wallX(16, 26.5, -21.675, 0.35, 0, 3.6, 0x7d7466, [[17, 21.5, 0.8, 2.7], [22.6, 24, 0, 2.5]]);
  wallX(16, 26.5, -26.825, 0.35, 0, 3.6, 0x6e675a, [[19, 20.4, 1.2, 2.2]]);
  wallZ(-26.65, -21.85, 16.175, 0.35, 0, 3.6, 0x7d7466, [[-25, -23.6, 1.1, 2.3]]);
  wallZ(-26.65, -21.85, 26.325, 0.35, 0, 3.6, 0x6e675a);
  rect(16, 26.5, -27, -21.5, 0.3, C.concreteDark, { y: 3.6 });
  rect(16, 26.5, -27, -26.7, 0.4, C.concreteDark, { y: 3.9 });
  rect(26.2, 26.5, -26.7, -21.5, 0.4, C.concreteDark, { y: 3.9 });
  deco(16.6, 25.9, -21.5, -21.4, 2.85, 0.6, 0x2f566b, { flat: true });
  deco(17.2, 21.3, -21.42, -21.38, 2.95, 0.4, 0xe2a823, { emissive: true, flat: true });
  rect(18, 22, -25.2, -24.6, 1.7, C.steel);        // scaffali
  rect(18, 22, -23.4, -22.9, 1.2, C.steel);
  rect(23.5, 25.8, -23.4, -22.8, 1.1, C.wood);     // bancone
  rect(25.5, 26.1, -26.5, -24.8, 2.0, C.white);    // frigorifero
  // autocisterna in fiamme spenta lungo il marciapiede (riparo)
  rect(19.2, 21.6, -9.5, -7.3, 2.35, C.blue, { y: 0.35 });
  deco(19.35, 21.3, -9.56, -7.24, 1.65, 0.6, C.glass, { flat: true });
  rect(9.2, 18.9, -9.4, -7.4, 2.4, C.steel, { y: 0.5, hidden: true });
  shape({ t: 'cyl', x: 14.05, y: 1.65, z: -8.4, rt: 1.05, h: 9.6, seg: 10, c: C.steel, rz: Math.PI / 2, cast: true });
  [10.5, 14.05, 17.6].forEach((x) => shape({ t: 'cyl', x, y: 1.65, z: -8.4, rt: 1.09, h: 0.12, seg: 10, c: C.rust, rz: Math.PI / 2 }));
  deco(9.0, 21.6, -9.2, -7.6, 0.35, 0.25, C.black);
  [10, 11.2, 17.4, 20.6].forEach((x) => {
    [-9.35, -7.45].forEach((z) => shape({ t: 'cyl', x, y: 0.42, z, rt: 0.42, h: 0.3, seg: 8, c: C.black, rx: Math.PI / 2 }));
  });
  car(12.3, -23.6, 'z', C.blue);
  shape({ t: 'cyl', x: 14.5, y: 0.13, z: -25.8, rt: 0.38, h: 0.25, seg: 8, c: C.black });
  shape({ t: 'cyl', x: 14.5, y: 0.39, z: -25.8, rt: 0.38, h: 0.25, seg: 8, c: C.black });
  shape({ t: 'cyl', x: 14.5, y: 0.65, z: -25.8, rt: 0.38, h: 0.25, seg: 8, c: C.black });
  add(14.5, -25.8, 0.8, 0.8, 0.78, C.black, { hidden: true });
  barrel(9.5, -12.2, C.blue); barrel(9.6, -13.3, C.red);

  // ---------------------------------------------------------------
  // 5) SO: posto di blocco militare (torretta a 4,2 m, sacchi di sabbia, tenda, blindato)
  // ---------------------------------------------------------------
  rect(-23, -19, 19, 23, 0.3, C.wood, { y: 3.9 });
  [[-22.8, 19.2], [-19.2, 19.2], [-22.8, 22.8], [-19.2, 22.8]].forEach((p) => add(p[0], p[1], 0.35, 0.35, 3.9, C.woodDark));
  shape({ t: 'box', x: -21, y: 1.9, z: 19.2, w: 0.12, h: 4.4, d: 0.12, c: C.woodDark, rz: 0.78 });
  shape({ t: 'box', x: -21, y: 1.9, z: 22.8, w: 0.12, h: 4.4, d: 0.12, c: C.woodDark, rz: -0.78 });
  shape({ t: 'box', x: -22.8, y: 1.9, z: 21, w: 0.12, h: 4.4, d: 0.12, c: C.woodDark, rx: 0.78 });
  rect(-23, -19, 19, 19.15, 1.0, C.woodDark, { y: 4.2 });
  rect(-23, -19, 22.85, 23, 1.0, C.woodDark, { y: 4.2 });
  rect(-23, -22.85, 19, 23, 1.0, C.woodDark, { y: 4.2 });
  rect(-19.15, -19, 19, 21.3, 1.0, C.woodDark, { y: 4.2 });
  [[-22.9, 19.1], [-19.1, 19.1], [-22.9, 22.9], [-19.1, 22.9]].forEach((p) =>
    shape({ t: 'box', x: p[0], y: 5.9, z: p[1], w: 0.1, h: 1.4, d: 0.1, c: C.woodDark }));
  shape({ t: 'box', x: -21, y: 6.65, z: 21, w: 4.6, h: 0.12, d: 4.6, c: C.oliveDark, cast: true });
  shape({ t: 'cyl', x: -19.6, y: 5.4, z: 19.6, rt: 0.2, rb: 0.25, h: 0.35, seg: 8, c: C.steelDark, rx: 0.6 });
  stairs(-14.7, 22.0, '-x', 4.2, 1.2, 0.45, C.wood, { rail: -1 });
  // postazione a U di sacchi di sabbia (dentro si sta al riparo)
  sandbags(-16, 9.5, -10, 9.5, 1.2);
  sandbags(-16, 9.5, -16, 14.5, 1.2);
  sandbags(-10, 9.5, -10, 12.5, 1.2);
  crate(-13.6, 13.6, 0.8, 0, C.olive);
  sandbags(-26.5, 17, -21.2, 17, 1.1);
  sandbags(-8.6, 16.6, -8.6, 19.6, 1.1);
  // tenda militare (solo esterno)
  rect(-25.75, -21.25, 9.75, 13.25, 2.3, C.olive, { hidden: true });
  shape({ t: 'box', x: -23.5, y: 1.55, z: 10.75, w: 4.6, h: 0.08, d: 2.3, c: C.olive, rx: -0.85, cast: true });
  shape({ t: 'box', x: -23.5, y: 1.55, z: 12.25, w: 4.6, h: 0.08, d: 2.3, c: C.oliveDark, rx: 0.85, cast: true });
  shape({ t: 'box', x: -23.5, y: 0.9, z: 11.5, w: 4.5, h: 1.8, d: 2.9, c: C.oliveDark });
  // blindato abbandonato: si sale dalle casse a gradini sul lato nord
  rect(-12.8, -7.6, 21.6, 24.4, 1.7, C.olive, { y: 0.3 });
  add(-10.3, 23.0, 1.3, 1.3, 0.7, C.oliveDark, { y: 2.0 });
  shape({ t: 'cyl', x: -8.4, y: 2.35, z: 23.0, rt: 0.07, h: 2.2, seg: 6, c: C.steelDark, rz: Math.PI / 2 });
  [-12.2, -10.9, -9.6, -8.3].forEach((x) => {
    [21.5, 24.5].forEach((z) => shape({ t: 'cyl', x, y: 0.45, z, rt: 0.45, h: 0.35, seg: 8, c: C.black, rx: Math.PI / 2 }));
  });
  rect(-11.5, -10.5, 20.4, 21.6, 0.5, C.olive, { flat: true });
  rect(-10.5, -9.5, 20.4, 21.6, 1.0, C.oliveDark, { flat: true });
  rect(-9.5, -8.5, 20.4, 21.6, 1.5, C.olive, { flat: true });
  // parco: alberi secchi, panchine, fuoco
  tree(-25, 15.6, 4.8); tree(-19.4, 15.2, 4.2); tree(-26, 25.8, 5.2); tree(-16.5, 26.6, 4.4);
  bench(-22.5, 15.0, 'x'); bench(-17.8, 18.2, 'z');
  barrel(-11.6, 15.6, C.rust, { fire: true });
  hedgehog(-2.6, 24.6); hedgehog(2.4, 24.9); hedgehog(-0.2, 23.0);

  // ---------------------------------------------------------------
  // 6) SE: cantiere (palazzo in costruzione a 2 piani, pila di container, tubi, gru)
  // ---------------------------------------------------------------
  [15.25, 18.9, 22.5, 25.75].forEach((x) => [15.25, 18.9, 22.5, 25.75].forEach((z) => add(x, z, 0.5, 0.5, 3.2, C.concrete)));
  rect(16.8, 26, 15, 26, 0.3, C.concreteDark, { y: 3.2 });
  rect(15, 16.8, 21.3, 26, 0.3, C.concreteDark, { y: 3.2 });
  stairs(16.15, 15.6, '+z', 3.5, 1.2, 0.7, C.concrete, { rail: 1 });
  [18.9, 22.5, 25.75].forEach((x) => [18.9, 22.5, 25.75].forEach((z) => add(x, z, 0.5, 0.5, 3.2, C.concrete, { y: 3.5 })));
  rect(18.6, 26, 18.6, 26, 0.3, C.concreteDark, { y: 6.7 });
  stairs(17.8, 16.0, '+z', 3.5, 1.2, 0.45, C.concrete, { base: 3.5, rail: -1 });
  // muretti in mattoni a meta' (ripari ai piani)
  wallX(17.0, 21.0, 15.15, 0.3, 3.5, 4.5, C.brick);
  wallX(22.5, 25.5, 15.15, 0.3, 3.5, 4.5, C.brick);
  wallZ(16.0, 19.5, 25.85, 0.3, 3.5, 4.5, C.brick);
  wallX(19.0, 25.8, 25.85, 0.3, 7.0, 7.8, C.concrete);
  wallZ(19.0, 25.8, 25.85, 0.3, 7.0, 7.8, C.concrete);
  rebar(25.75, 6.7, 15.25, 3); rebar(18.9, 7.0, 18.9, 3); rebar(25.75, 7.0, 25.75, 3); rebar(15.25, 3.5, 25.75, 3);
  // ponteggio sul lato ovest (decorazione)
  [15.6, 19.0, 22.4, 25.6].forEach((z) => {
    shape({ t: 'box', x: 14.0, y: 3.6, z, w: 0.08, h: 7.2, d: 0.08, c: C.orange });
    shape({ t: 'box', x: 14.8, y: 3.6, z: z + 0.01, w: 0.08, h: 7.2, d: 0.08, c: C.orange });
  });
  [1.8, 3.5, 5.3].forEach((y) => shape({ t: 'box', x: 14.4, y, z: 20.6, w: 0.9, h: 0.06, d: 10.2, c: C.wood }));
  // container: A + B a terra, C sopra A. Scala per B (2,6 m) e da B a C (5,2 m)
  container(8.4, 8.5, 'x', C.red, 0);
  container(8.4, 10.94, 'x', C.blue, 0);
  container(8.4, 8.5, 'x', C.green, 2.6);
  stairs(18.6, 12.75, '-x', 2.6, 1.2, 0.65, C.steel, { floating: true, rail: 1 });
  stairs(9.6, 13.2, '-z', 2.6, 1.2, 0.37, C.steel, { floating: true, base: 2.6 });
  container(19.5, 8.6, 'x', C.orange, 0);
  container(8.4, 16.5, 'z', C.white, 0);
  // tubi di cemento (ripari) e cumulo di terra a gradoni (punto rialzato)
  rect(11.65, 13.35, 17, 21, 1.7, C.concrete, { hidden: true });
  shape({ t: 'cyl', x: 12.5, y: 0.85, z: 18.0, rt: 0.85, h: 1.95, seg: 10, c: C.concreteLight, rx: Math.PI / 2, cast: true });
  shape({ t: 'cyl', x: 12.5, y: 0.85, z: 20.0, rt: 0.85, h: 1.95, seg: 10, c: C.concrete, rx: Math.PI / 2, cast: true });
  shape({ t: 'cyl', x: 12.5, y: 0.85, z: 16.99, rt: 0.6, h: 0.02, seg: 10, c: C.black, rx: Math.PI / 2 });
  rect(9.5, 13.5, 22.9, 26.9, 0.45, C.dirt);
  rect(10, 13, 23.4, 26.4, 0.9, shade(C.dirt, 0.08));
  rect(10.5, 12.5, 23.9, 25.9, 1.35, shade(C.dirt, 0.15));
  // gru (punto di riferimento alto, solo la base blocca)
  add(26.4, 13.4, 1.6, 1.6, 1.2, C.concreteDark);
  [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].forEach((p) =>
    shape({ t: 'box', x: 26.4 + p[0], y: 11.2, z: 13.4 + p[1], w: 0.1, h: 20, d: 0.1, c: C.yellow, cast: true }));
  for (let y = 2.5; y < 21; y += 2.5) shape({ t: 'box', x: 26.4, y, z: 13.4, w: 1.1, h: 0.08, d: 1.1, c: C.yellow });
  shape({ t: 'box', x: 20.4, y: 21.4, z: 13.4, w: 14, h: 0.5, d: 0.6, c: C.yellow, cast: true });
  shape({ t: 'box', x: 29.2, y: 21.0, z: 13.4, w: 2.4, h: 1.2, d: 1.2, c: C.concreteDark });
  shape({ t: 'box', x: 16, y: 18.4, z: 13.4, w: 0.04, h: 6, d: 0.04, c: C.black });
  barrel(19.6, 13.9, C.orange, { fire: true });
  [[17.5, 9.2], [18.3, 9.2], [24.0, 14.3]].forEach((p) => crate(p[0], p[1], 0.9, 0));

  // ---------------------------------------------------------------
  // 7) Centro: cavalcavia crollato, autobus ribaltato, auto, barriere
  // ---------------------------------------------------------------
  // impalcato a 4,5 m da x -30 a -6, pilastri, barriere di cemento in cima
  rect(-30.5, -6, -2.6, 2.6, 0.6, C.concrete, { y: 3.9 });
  deco(-30.5, -6, -2.75, -2.6, 3.7, 0.9, C.concreteDark, { cast: true });
  deco(-30.5, -6, 2.6, 2.75, 3.7, 0.9, C.concreteDark, { cast: true });
  rect(-21.6, -20.4, -1.6, 1.6, 3.9, C.concreteDark);
  rect(-14.6, -13.4, -1.6, 1.6, 3.9, C.concreteDark);
  jersey(-16.3, -2.29, 'x', 20.4, 4.5);
  jersey(-24.05, 2.29, 'x', 6.9, 4.5);
  jersey(-13.0, 2.29, 'x', 13.0, 4.5);
  lamp(-24, -1.75, 0, 1, { base: 4.5, broken: true });
  // estremita' est crollata: macerie a gradoni che scendono nell'incrocio
  stairs(-0.5, 0, '-x', 4.5, 4.6, 0.55, C.rubble);
  shape({ t: 'box', x: -3.4, y: 2.2, z: 1.4, w: 4.2, h: 0.5, d: 2.2, c: C.concrete, rz: 0.65, rx: 0.12, cast: true });
  shape({ t: 'box', x: -2.6, y: 1.5, z: -1.6, w: 3.0, h: 0.45, d: 1.6, c: C.concreteDark, rz: 0.85, ry: 0.2, cast: true });
  rebar(-6, 4.5, 0, 8); rubble(-2, 3.6, 12, 3); rubble(-1.5, -3.4, 10, 3);
  // scala di emergenza per salire sul cavalcavia (lato sud)
  stairs(-14.9, 3.3, '-x', 4.5, 1.2, 0.55, C.steel, { floating: true, rail: 1 });
  // autobus ribaltato nella strada nord (riparo; ci si sale dall'auto accanto)
  rect(2.0, 4.6, -15.5, -5.5, 2.5, C.yellow);
  for (let z = -14.8; z < -6; z += 1.5) deco(2.3, 4.3, z, z + 1.1, 2.5, 0.03, C.glass, { flat: true });
  shape({ t: 'box', x: 1.97, y: 1.25, z: -10.5, w: 0.06, h: 2.0, d: 9.4, c: C.white });
  [-13.4, -12.2, -8.2].forEach((z) => shape({ t: 'cyl', x: 4.85, y: 1.25, z, rt: 0.5, h: 0.4, seg: 8, c: C.black, rz: Math.PI / 2 }));
  car(0.7, -10.4, 'z', 0x6b6a62, {});
  // auto e barriere nell'incrocio e lungo il viale
  car(2.8, 1.6, 'x', C.red, { burnt: true, fire: true });
  car(-10.5, 3.7, 'x', C.blue);
  car(-24.5, -0.5, 'x', C.green, { burnt: true });
  car(16, -3.2, 'x', C.red);
  car(23.5, 2.5, 'x', C.white, { burnt: true });
  car(12, 3.4, 'x', 0xd9d6cc, { police: true });
  jersey(3.5, 6.6, 'x', 3.0); jersey(-2.5, 8.6, 'x', 3.0); jersey(6.8, -1.5, 'z', 3.0); jersey(8.6, -3.2, 'z', 2.4);
  jersey(-3.2, -6.8, 'x', 2.4); jersey(20, 0.3, 'z', 2.4);
  // cratere nella strada sud
  deco(-2.2, 2.2, 12.2, 15.8, 0.015, 0.012, 0x1d1f1c, { flat: true });
  rubble(0, 14, 14, 5);
  rect(-2.6, -1.6, 13.0, 15.0, 0.45, C.rubble); rect(1.7, 2.5, 12.6, 14.4, 0.4, C.rubble);
  // fine delle strade: barricate
  container(27.6, -6.06, 'z', C.green, 0); container(27.6, 0.0, 'z', C.red, 0);
  sandbags(26.6, -4.5, 26.6, 4.5, 1.1);
  rect(-30.5, -27.5, -7, -2.6, 3.9, C.rubble); rect(-30.5, -27.5, 2.6, 7, 3.9, C.rubble);
  rect(-7, 7, -30.5, -28, 1.2, C.rubble); rect(-6, 6, -30.5, -28.8, 2.4, C.concreteDark);
  rubble(0, -27.5, 18, 7);
  rect(-7, 7, 28, 29.2, 2.2, C.concreteLight);
  sandbags(-6.5, 27.5, 6.5, 27.5, 1.0);
  for (let x = -6; x <= 6; x += 1.5) shape({ t: 'cyl', x, y: 2.45, z: 28.6, rt: 0.28, h: 1.4, seg: 6, c: C.steelDark, rz: Math.PI / 2 });

  // ---------------------------------------------------------------
  // 8) Arredo urbano: lampioni, semafori, idranti, cestini, pali con i fili
  // ---------------------------------------------------------------
  [-25, -17, -10, 10, 17, 24].forEach((x, i) => {
    lamp(x, -6.4, 0, 1, { broken: i % 3 === 1, tilt: i === 4 ? 0.18 : 0 });
    lamp(x + 2, 6.4, 0, -1, { broken: i % 3 === 2, tilt: i === 1 ? -0.15 : 0 });
  });
  [-24, -16, -9.5, 9.5, 16, 23].forEach((z, i) => {
    lamp(-6.4, z, 1, 0, { broken: i % 3 === 0 });
    lamp(6.4, z + 2, -1, 0, { broken: i % 3 === 2, tilt: i === 3 ? 0.2 : 0 });
  });
  trafficLight(-6.2, -6.2, 1, 0, 0); trafficLight(6.2, 6.2, -1, 0, 1);
  trafficLight(6.2, -6.2, 0, 1, 2); trafficLight(-6.2, 6.2, 0, -1, 0);
  hydrant(-8.5, 5.6); hydrant(8.3, -5.7); hydrant(5.7, 15); hydrant(-5.7, -17);
  bin(-12, -5.6); bin(13.5, 5.7, true); bin(-5.6, 21); bin(5.6, -21, true); bin(24, -5.6); bin(-22, 5.7, true);
  bench(-14, 6.4, 'x'); bench(20, -6.4, 'x');
  // pensilina dell'autobus (pannello posteriore = riparo)
  rect(14.2, 17.8, 6.65, 6.8, 1.9, C.glass);
  shape({ t: 'box', x: 16, y: 2.35, z: 6.3, w: 4.0, h: 0.1, d: 1.4, c: C.steelDark, cast: true });
  [14.25, 17.75].forEach((x) => shape({ t: 'box', x, y: 1.15, z: 6.7, w: 0.08, h: 2.3, d: 0.08, c: C.steelDark }));
  // pali della luce con i fili
  [-25, -15, 15, 25].forEach((x) => {
    shape({ t: 'cyl', x, y: 4.5, z: 7.6, rt: 0.11, rb: 0.14, h: 9, seg: 6, c: C.woodDark, cast: true });
    shape({ t: 'box', x, y: 8.6, z: 7.6, w: 0.1, h: 0.1, d: 1.6, c: C.woodDark });
    add(x, 7.6, 0.3, 0.3, 1.2, C.woodDark, { hidden: true });
  });
  [[-25, -15], [15, 25]].forEach((p) => {
    [-0.7, 0.7].forEach((dz) => {
      shape({ t: 'box', x: (p[0] + p[1]) / 2 - 2.5, y: 8.25, z: 7.6 + dz, w: 5.1, h: 0.025, d: 0.025, c: C.black, rz: 0.12 });
      shape({ t: 'box', x: (p[0] + p[1]) / 2 + 2.5, y: 8.25, z: 7.6 + dz, w: 5.1, h: 0.025, d: 0.025, c: C.black, rz: -0.12 });
    });
  });
  rubble(-8.5, -18, 6, 2); rubble(8.8, 21, 6, 2); rubble(22, -6.2, 5, 2); rubble(-20, 6.3, 5, 2);

  // ---------------------------------------------------------------
  // Punti di partenza, oggetti, luci
  // ---------------------------------------------------------------
  const spawnPoints = [[-18, -10], [24.5, -14], [-24, 15.2], [10.6, 15], [0, -22], [-3, 19.5], [-26, 4.2], [21, -1]]
    .map((p) => ({ x: p[0], y: 0, z: p[1], rot: Math.atan2(p[0], p[1]) }));

  // y = altezza del piano: gli oggetti compaiono anche sui tetti e sulle piattaforme
  const pickups = [
    { type: 'item', x: -17, y: 7.0, z: -22.5 },   // tetto del condominio
    { type: 'item', x: -22, y: 3.5, z: -24 },     // primo piano del condominio
    { type: 'item', x: -12.5, y: 0, z: -10.5 },   // cortile
    { type: 'item', x: 13, y: 4.5, z: -12.5 },    // sopra la tettoia
    { type: 'item', x: 24.5, y: 0, z: -25.5 },    // dentro il negozio
    { type: 'item', x: -21, y: 4.2, z: 21 },      // torretta
    { type: 'item', x: -13, y: 0, z: 12 },        // postazione di sacchi di sabbia
    { type: 'item', x: -12.0, y: 2.0, z: 23.0 },  // sopra il blindato
    { type: 'item', x: 22, y: 7.0, z: 21 },       // ultimo piano del cantiere
    { type: 'item', x: 11.4, y: 5.2, z: 9.7 },    // sopra i container
    { type: 'item', x: -11, y: 4.5, z: 0 },       // sul cavalcavia
    { type: 'item', x: -3.5, y: 0, z: 11 },       // strada sud
    { type: 'item', x: -17.5, y: 0, z: -1 },      // sotto il cavalcavia
    { type: 'item', x: 20.5, y: 0, z: 17 },       // piano terra del cantiere
  ];

  lights.push({ x: 16, y: 3.7, z: -15, color: 0xd8f0c0, intensity: 0.9, distance: 13 });   // luce della tettoia

  const MAP = { SIZE, boxes, shapes, roads, smoke, spawnPoints, pickups, lights, stairs: stairsList, noDefaultWalls: true };
  if (typeof window !== 'undefined') window.MAP = MAP;
  if (typeof module !== 'undefined' && module.exports) module.exports = MAP;
})();
