// DOOMSDAY - shared/map.js
// Mappa APOCALITTICA a scatole low-poly (stile arcade "Krunker", ma originale).
// Funziona nel browser (window.MAP) e in Node (module.exports): il server puo' usarla
// per spawn, collisioni e colpi. Tutto e' DETERMINISTICO (nessun Math.random).
//
// Formato scatola: { x, z (CENTRO), y (BASE), w (lungo X), d (lungo Z), h, color, solid, emissive? }
//   solid:false   = solo decorazione (nessuna collisione)
//   emissive:true = si disegna "acceso" (fuoco), senza ombre
// Assi: X est-ovest, Z nord(-)/sud(+), Y altezza. Arena 56 x 56 (da -28 a +28).
//
// Regole di gioco rispettate: salto massimo ~1.2 m, gradini <= 0.45 m, ogni piattaforma
// rialzata e' raggiungibile con scale (MAP.stairs).

(function () {
  const SIZE = 56;
  const boxes = [];
  const stairsList = [];

  // Palette: cemento, ruggine, arancione, fumo, verde militare spento
  const C = {
    concrete: 0x6e6b64,
    dark: 0x3a3836,
    smoke: 0x262524,
    rust: 0x8c4a2b,
    orange: 0xc4561c,
    olive: 0x4f5534,
    brown: 0x6b4a34,
    beige: 0x8a7e68,
    red: 0x7a2f26,
    steel: 0x5a5f61,
    road: 0x35332f,
    yellow: 0xb89a2e,
    fire: 0xff7a1a,
  };

  // Generatore pseudo-casuale con seme fisso (stesso risultato su client e server)
  let seed = 20261121;
  function rnd() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }

  // Cambia leggermente la luminosita' del colore, cosi' le scatole non sembrano tutte uguali
  function shade(color, amount) {
    const f = 1 + amount;
    const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 255) * f)));
    const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 255) * f)));
    const b = Math.max(0, Math.min(255, Math.round((color & 255) * f)));
    return (r << 16) | (g << 8) | b;
  }

  // Aggiunge una scatola dal CENTRO
  function add(x, z, w, d, h, color, opts) {
    opts = opts || {};
    const box = {
      x: x, y: opts.y || 0, z: z, w: w, h: h, d: d,
      color: opts.flat ? color : shade(color, (rnd() - 0.5) * 0.16),
      solid: opts.solid !== false,
    };
    if (opts.emissive) box.emissive = true;
    boxes.push(box);
    return box;
  }

  // Aggiunge una scatola dagli ESTREMI (x0..x1, z0..z1)
  function rect(x0, x1, z0, z1, h, color, opts) {
    return add((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, h, color, opts);
  }

  // Muro con "finestra": parte bassa (1 m) + parte alta (da 2.2 m), in mezzo si vede e si spara
  function windowWall(x0, x1, z0, z1, color) {
    rect(x0, x1, z0, z1, 1.0, color);
    rect(x0, x1, z0, z1, 0.55, color, { y: 2.2 });
  }

  // Scala: serie di gradini da 0.45 m. (x0,z0) = bordo di partenza al centro della larghezza.
  // dir: '+x' | '-x' | '+z' | '-z'. exit = direzione in cui si prosegue in cima (per i test).
  function stairs(x0, z0, dir, n, width, tread, color, exit) {
    const rise = 0.45;
    const dx = dir === '+x' ? 1 : dir === '-x' ? -1 : 0;
    const dz = dir === '+z' ? 1 : dir === '-z' ? -1 : 0;
    for (let i = 0; i < n; i++) {
      const c = tread * (i + 0.5);
      const alongX = dx !== 0;
      add(x0 + dx * c, z0 + dz * c, alongX ? tread : width, alongX ? width : tread, rise * (i + 1), color);
    }
    stairsList.push({ x: x0, z: z0, dir: dir, n: n, width: width, tread: tread, topY: rise * n, exit: exit || dir });
  }

  function container(cx, cz, axis, level, color) {
    const w = axis === 'x' ? 6 : 2.4;
    const d = axis === 'x' ? 2.4 : 6;
    add(cx, cz, w, d, 2.6, color, { y: level * 2.6 });
  }

  function car(cx, cz, axis, color) {
    const bw = axis === 'x' ? 4.2 : 1.8, bd = axis === 'x' ? 1.8 : 4.2;
    add(cx, cz, bw, bd, 0.8, color, { y: 0.2 });                       // carrozzeria (alta 1.0: saltabile)
    const cw = axis === 'x' ? 2.0 : 1.6, cd = axis === 'x' ? 1.6 : 2.0;
    add(cx, cz, cw, cd, 0.65, C.smoke, { y: 1.0 });                    // abitacolo
  }

  function barrier(cx, cz, axis) {
    add(cx, cz, axis === 'x' ? 3.0 : 0.6, axis === 'x' ? 0.6 : 3.0, 1.0, C.concrete);
  }

  function barrel(cx, cz, color) {
    add(cx, cz, 0.8, 0.8, 1.0, color);
  }

  function brokenWall(cx, cz, axis, len, h) {
    add(cx, cz, axis === 'x' ? len : 0.5, axis === 'x' ? 0.5 : len, h, C.beige);
  }

  function lampPost(cx, cz) {
    add(cx, cz, 0.2, 0.2, 5.0, C.steel, { solid: false });
    add(cx + 0.5, cz, 1.2, 0.2, 0.2, C.steel, { y: 4.9, solid: false });
  }

  // ---------------------------------------------------------------
  // 0) STRADA (solo decorazione) lungo X a z = 14, con strisce gialle
  // ---------------------------------------------------------------
  rect(-28, 28, 11.5, 16.5, 0.03, C.road, { solid: false, flat: true });
  for (let x = -24; x <= 24; x += 8) {
    rect(x - 1.5, x + 1.5, 13.9, 14.1, 0.03, C.yellow, { y: 0.03, solid: false, flat: true });
  }

  // ---------------------------------------------------------------
  // 1) EDIFICIO CENTRALE crollato a due piani (x -7..7, z -6..6)
  // ---------------------------------------------------------------
  windowWall(-7, -1.5, -6, -5.4, C.concrete);        // nord: finestre a ovest
  rect(1.5, 7, -6, -5.4, 1.4, C.concrete);           // nord: parte est crollata (porta tra -1.5 e 1.5)
  rect(-7, -6.4, -6, -1.5, 2.75, C.concrete);        // ovest: pieno a nord
  windowWall(-7, -6.4, 1.5, 6, C.concrete);          // ovest: finestre a sud (porta tra -1.5 e 1.5)
  rect(6.4, 7, -6, -2, 1.2, C.concrete);             // est: crollato (breccia tra -2 e 1)
  windowWall(6.4, 7, 1, 6, C.concrete);              // est: finestre a sud
  windowWall(-7, 3, 5.4, 6, C.concrete);             // sud: finestre (porta tra 3 e 6)
  rect(6, 7, 5.4, 6, 2.75, C.concrete);              // sud: angolo

  rect(-7, 2, -6, 6, 0.4, C.dark, { y: 2.75 });      // solaio primo piano
  rect(2, 7, -2, 6, 0.4, C.dark, { y: 2.75 });       // ... l'angolo nord-est e' crollato

  rect(-7, -6.6, -6, 6, 1.0, C.concrete, { y: 3.15 });      // parapetti sul tetto
  rect(-7, -2.5, -6, -5.6, 1.0, C.concrete, { y: 3.15 });
  rect(-7, -2.4, 5.6, 6, 1.0, C.concrete, { y: 3.15 });
  rect(0.4, 7, 5.6, 6, 1.0, C.concrete, { y: 3.15 });
  rect(6.6, 7, -2, 6, 1.0, C.concrete, { y: 3.15 });

  stairs(-6.4, 6.8, '+x', 7, 1.6, 0.8, C.concrete, '-z');  // scala esterna lato sud

  rect(-5, -4, -3.5, -2.5, 1.0, C.brown);            // casse e banco dentro l'edificio
  rect(-4, -3.2, -3.5, -2.7, 0.9, C.beige);
  rect(2.5, 3.5, -0.5, 0.5, 2.75, C.concrete);       // pilastro
  rect(-1, 1.5, 3, 4, 1.0, C.dark);

  rect(2.5, 3.7, -4.8, -3.6, 0.5, C.dark);           // macerie dell'angolo crollato
  rect(4.5, 5.9, -5.5, -4.2, 1.0, C.concrete);
  rect(3.8, 4.8, -3.4, -2.5, 1.5, C.dark);

  // ---------------------------------------------------------------
  // 2) TORRE DA CECCHINO a nord (piattaforma a 6.3 m, scala lunga sul lato est)
  // ---------------------------------------------------------------
  rect(-2.5, 2.5, -23.5, -18.5, 0.4, C.dark, { y: 5.9 });
  [[-2.2, -23.2], [2.2, -23.2], [-2.2, -18.8], [2.2, -18.8]].forEach(function (p) {
    rect(p[0] - 0.3, p[0] + 0.3, p[1] - 0.3, p[1] + 0.3, 5.9, C.steel);
  });
  rect(-2.5, 2.5, -23.5, -23.1, 1.0, C.steel, { y: 6.3 });
  rect(-2.5, 2.5, -18.9, -18.5, 1.0, C.steel, { y: 6.3 });
  rect(-2.5, -2.1, -23.5, -18.5, 1.0, C.steel, { y: 6.3 });
  rect(2.1, 2.5, -23.5, -22.2, 1.0, C.steel, { y: 6.3 });
  rect(2.1, 2.5, -19.8, -18.5, 1.0, C.steel, { y: 6.3 });
  stairs(10.9, -21, '-x', 14, 1.8, 0.6, C.concrete, '-x');

  // ---------------------------------------------------------------
  // 3) ANGOLO NORD-OVEST: OFFICINA (tetto a 2.7 m)
  // ---------------------------------------------------------------
  rect(-25, -17, -25, -24.4, 2.3, C.brown);
  rect(-25, -24.4, -24.4, -17.6, 2.3, C.brown);
  rect(-25, -21, -17.6, -17, 2.3, C.brown);
  rect(-25, -19.5, -25, -17, 0.4, C.rust, { y: 2.3 });
  rect(-24, -21, -23.8, -22.8, 1.0, C.steel);        // banco da lavoro
  stairs(-18.7, -17.0, '-z', 6, 1.6, 0.7, C.concrete, '-x');
  barrel(-23.5, -20.2, C.rust);
  barrel(-22.6, -20.0, C.olive);

  // ---------------------------------------------------------------
  // 4) ANGOLO NORD-EST: DISTRIBUTORE (tettoia a 3.15 m)
  // ---------------------------------------------------------------
  rect(17.5, 24.5, -24, -18, 0.4, C.orange, { y: 2.75 });
  [[18.0, -23.4], [18.0, -18.6], [24.0, -23.4], [24.0, -18.6]].forEach(function (p) {
    rect(p[0] - 0.3, p[0] + 0.3, p[1] - 0.3, p[1] + 0.3, 2.75, C.steel);
  });
  rect(20.4, 21.2, -22.6, -21.8, 1.6, C.red);        // pompe
  rect(20.4, 21.2, -20.2, -19.4, 1.6, C.red);
  rect(19.5, 23.5, -27.6, -25, 2.7, C.beige);        // chiosco
  stairs(11.9, -21, '+x', 7, 1.6, 0.8, C.concrete, '+x');

  // ---------------------------------------------------------------
  // 5) ANGOLO SUD-EST: BUNKER (tetto a 2.25 m)
  // ---------------------------------------------------------------
  rect(17, 25, 18, 18.7, 1.85, C.olive);
  rect(17, 25, 23.3, 24, 1.85, C.olive);
  rect(24.3, 25, 18.7, 23.3, 1.85, C.olive);
  rect(17, 17.7, 18.7, 20.1, 1.85, C.olive);         // ingresso largo 2 m tra z 20.1 e 22.1
  rect(17, 17.7, 22.1, 23.3, 1.85, C.olive);
  rect(17, 25, 18, 24, 0.4, C.concrete, { y: 1.85 });
  rect(24.6, 25, 18.4, 24, 0.8, C.beige, { y: 2.25 });  // sacchi di sabbia sul tetto
  rect(17.4, 25, 23.6, 24, 0.8, C.beige, { y: 2.25 });
  stairs(19, 14.4, '+z', 5, 1.6, 0.72, C.concrete, '+z');

  // ---------------------------------------------------------------
  // 6) ANGOLO SUD-OVEST: TORRE RADIO (piattaforma a 3.15 m, antenna decorativa)
  // ---------------------------------------------------------------
  rect(-23, -19, 19, 23, 0.4, C.dark, { y: 2.75 });
  [[-22.6, 19.4], [-19.4, 19.4], [-22.6, 22.6], [-19.4, 22.6]].forEach(function (p) {
    rect(p[0] - 0.25, p[0] + 0.25, p[1] - 0.25, p[1] + 0.25, 2.75, C.steel);
  });
  rect(-23, -19, 22.7, 23, 0.8, C.steel, { y: 3.15 });
  rect(-23, -22.7, 19, 23, 0.8, C.steel, { y: 3.15 });
  rect(-19.3, -19, 19, 23, 0.8, C.steel, { y: 3.15 });
  rect(-21.15, -20.85, 20.85, 21.15, 14, C.steel, { solid: false });
  stairs(-21, 13.4, '+z', 7, 1.6, 0.8, C.concrete, '+z');

  // ---------------------------------------------------------------
  // 7) CAVALCAVIA CROLLATO (impalcato a 4.05 m, estremita' sud spezzata)
  // ---------------------------------------------------------------
  rect(-14, -10, -15, 11, 0.4, C.concrete, { y: 3.65 });
  rect(-14, -10, -8.6, -7.4, 3.65, C.dark);
  rect(-14, -10, 3.4, 4.6, 3.65, C.dark);
  stairs(-12, -23.1, '+z', 9, 2.2, 0.9, C.concrete, '+z');
  rect(-14, -10, 11, 14.5, 0.4, C.concrete, { y: 1.2 });   // pezzo caduto
  rect(-13.5, -12.3, 14.5, 15.6, 1.0, C.dark);
  rect(-11.5, -10.3, 15.2, 16.2, 0.5, C.concrete);

  // ---------------------------------------------------------------
  // 8) CONTAINER (corsie, anche impilati a due livelli)
  // ---------------------------------------------------------------
  const cc = [C.orange, C.olive, C.rust, C.red, C.steel];
  // corsia est
  container(14, -10, 'z', 0, cc[0]);
  container(14, -10, 'z', 1, cc[1]);
  container(14, -1, 'z', 0, cc[2]);
  container(14, 8, 'z', 0, cc[3]);
  container(14, 8, 'z', 1, cc[4]);
  container(22, -8, 'z', 0, cc[1]);
  container(22, 2, 'z', 0, cc[0]);
  container(22, 10, 'z', 0, cc[2]);
  // corsia ovest
  container(-22, -9, 'x', 0, cc[2]);
  container(-22, 0, 'x', 0, cc[3]);
  container(-22, 0, 'x', 1, cc[0]);
  container(-23, 8, 'x', 0, cc[1]);
  // sud e nord
  container(-4, 19, 'x', 0, cc[4]);
  container(5, 22, 'x', 0, cc[0]);
  container(-6, -13, 'x', 0, cc[3]);
  container(7, -14, 'x', 0, cc[2]);

  // ---------------------------------------------------------------
  // 9) COPERTURE: barriere di cemento, auto, barili, muri spezzati, macerie
  // ---------------------------------------------------------------
  barrier(-8, 10, 'x');
  barrier(8, 9, 'x');
  barrier(0, -11, 'x');
  barrier(-16, -8, 'z');
  barrier(17, -12, 'x');
  barrier(12, 4, 'z');
  barrier(-17, 5, 'x');
  barrier(3, -9, 'x');

  car(-3, 14, 'x', C.rust);
  car(12, 15.2, 'x', C.steel);
  car(10, -4, 'z', C.olive);
  car(3, -17, 'x', C.red);
  car(-5, 24.5, 'x', C.orange);

  barrel(-9, -3, C.rust);
  barrel(-8.2, -2.4, C.olive);
  barrel(9, 4, C.rust);
  barrel(9.9, 4.5, C.smoke);
  barrel(6, -9, C.rust);
  barrel(-9, 5, C.smoke);
  barrel(0, 20, C.olive);
  barrel(-14, 18, C.rust);

  brokenWall(-17, -14, 'x', 4, 2.4);
  brokenWall(18, -5, 'z', 4, 1.8);
  brokenWall(0, 10, 'x', 5, 1.8);
  brokenWall(-8, 22, 'z', 4, 2.6);
  brokenWall(25, 0, 'z', 4, 2.0);
  brokenWall(-25, 16, 'x', 4, 1.6);

  [[-3, -9, 1.6, 1.4, 0.5], [-2, -9.9, 1.2, 1.2, 1.0], [9, -17, 1.8, 1.5, 1.0],
   [-9, 16, 1.5, 1.5, 0.5], [-7.8, 15.2, 1.1, 1.1, 1.0], [24.5, 17, 2.0, 1.6, 1.0],
   [-24, -12, 1.5, 1.5, 1.0], [6, 18, 1.4, 1.4, 0.5]].forEach(function (r) {
    add(r[0], r[1], r[2], r[3], r[4], C.dark);
  });

  // ---------------------------------------------------------------
  // 10) DECORAZIONI senza collisione: lampioni storti e fuochi (luci in MAP.lights)
  // ---------------------------------------------------------------
  lampPost(-7.5, 12);
  lampPost(8, -10);
  lampPost(-3, 26);
  rect(5.75, 6.25, -9.25, -8.75, 0.6, C.fire, { y: 1.0, solid: false, emissive: true, flat: true });   // fuoco barile
  rect(-9.25, -8.75, 4.75, 5.25, 0.6, C.fire, { y: 1.0, solid: false, emissive: true, flat: true });
  rect(-0.3, 0.3, 19.7, 20.3, 0.6, C.fire, { y: 1.0, solid: false, emissive: true, flat: true });

  const lights = [
    { x: 6, y: 2.8, z: -9, color: 0xff7a2a, intensity: 1.4, distance: 16 },
    { x: -9, y: 2.8, z: 5, color: 0xff7a2a, intensity: 1.4, distance: 16 },
    { x: 0, y: 2.8, z: 20, color: 0xff7a2a, intensity: 1.2, distance: 14 },
    { x: 21, y: 2.4, z: -21, color: 0xffb060, intensity: 1.0, distance: 14 },
  ];

  // ---------------------------------------------------------------
  // Spawn (a terra, rivolti verso il centro) e oggetti raccoglibili
  // ---------------------------------------------------------------
  const spawnPoints = [
    [-25, -13], [25, -13], [-25, 13], [25, 13],
    [0, -14], [0, 25], [-12, 24], [13, -26],
  ].map(function (p) {
    return { x: p[0], y: 0, z: p[1], rot: Math.atan2(p[0], p[1]) };   // guarda verso (0,0)
  });

  const pickups = [
    { type: 'health', x: 0, y: 6.3, z: -21 },      // torre cecchino
    { type: 'ammo', x: -3, y: 3.15, z: 0 },        // primo piano dell'edificio
    { type: 'health', x: 21, y: 3.15, z: -21 },    // tettoia distributore
    { type: 'ammo', x: 21, y: 2.25, z: 21 },       // tetto del bunker
    { type: 'health', x: -21, y: 3.15, z: 21 },    // torre radio
    { type: 'ammo', x: -12, y: 4.05, z: -10 },     // cavalcavia
    { type: 'health', x: 0, y: 0, z: 2 },          // dentro l'edificio
    { type: 'ammo', x: -22, y: 0, z: -21 },        // officina
    { type: 'health', x: 18, y: 0, z: 3 },         // corsia container est
    { type: 'ammo', x: -4, y: 0, z: 22 },          // sud
  ];

  const MAP = {
    SIZE: SIZE,
    boxes: boxes,
    spawnPoints: spawnPoints,
    pickups: pickups,
    lights: lights,
    stairs: stairsList,
  };

  if (typeof window !== 'undefined') window.MAP = MAP;
  if (typeof module !== 'undefined' && module.exports) module.exports = MAP;
})();