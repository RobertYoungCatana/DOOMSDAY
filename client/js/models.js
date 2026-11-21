// DOOMSDAY - models.js
// Modelli 3D low-poly fatti a codice (niente file da scaricare, niente licenze):
// le armi e gli oggetti raccoglibili, nello stile squadrato della mappa.
//
// Ogni modello si costruisce UNA volta, si "cuoce" in poche mesh (una per colore,
// cosi' la scheda video fa meno lavoro) e poi si clona. Geometrie e materiali dei cloni
// sono condivisi: userData.shared = true dice a network.js di non distruggerli.
//
// Armi: canna verso -Z, alto = +Y, origine = impugnatura (dove sta la mano destra).
// Per ogni arma info(tipo) dice dove sono le tacche di mira e la bocca della canna,
// e dove tenerla in prima persona (fianco e mirando).
// Dipendenze: Three.js

(function () {
  'use strict';

  const C = {
    steel: 0x3d4440, steelDark: 0x2a2f2c, black: 0x1c1f1d, polymer: 0x30352f,
    olive: 0x5a6541, oliveDark: 0x454e31, tan: 0x9c8660,
    wood: 0x7b4b2a, woodDark: 0x5a361e, brass: 0xc9a23a, copper: 0xa8643a,
    accent: 0xa8e600, bone: 0xd9d4c3, boneDark: 0xb0aa98, health: 0x82a84c,
    plate: 0x5a8aa8, ammo: 0x59613a, stencil: 0xe2a823, strap: 0x3a412a,
  };

  // Dove si tiene ogni arma in prima persona (coordinate della camera dell'arma, in metri):
  //   hip  = arma al fianco · adsZ = distanza dall'occhio mirando · kick = rinculo
  //   sight = altezza della linea di mira sopra l'impugnatura · muzzle = bocca della canna
  //   adsDrop = quanto l'arma scende sotto il mirino mirando (non copre il mirino; di base 0.026)
  const INFO = {
    pistol:  { sight: 0.064, muzzle: [0, 0.037, -0.19], hip: [0.17, -0.18, -0.50], adsZ: -0.42, kick: 0.6,  adsDrop: 0.030 },
    smg:     { sight: 0.098, muzzle: [0, 0.048, -0.37], hip: [0.19, -0.22, -0.52], adsZ: -0.34, kick: 0.35, adsDrop: 0.026 },
    rifle:   { sight: 0.123, muzzle: [0, 0.045, -0.73], hip: [0.19, -0.23, -0.50], adsZ: -0.30, kick: 0.5,  adsDrop: 0.024 },
    shotgun: { sight: 0.077, muzzle: [0, 0.055, -0.67], hip: [0.19, -0.22, -0.50], adsZ: -0.34, kick: 1.0,  adsDrop: 0.026 },
  };

  // Gli oggetti a terra sono un po' piu' grandi del vero, cosi' si vedono da lontano
  const ITEM_SCALE = { smg: 1.5, rifle: 1.15, shotgun: 1.1 };

  // ---------------------------------------------------------------
  // Mattoncini
  // ---------------------------------------------------------------
  const materials = {};
  function mat(color, glow) {
    const key = color + (glow ? '+' : '');
    if (!materials[key]) {
      const m = new THREE.MeshStandardMaterial({
        color: color, roughness: 0.82, metalness: 0, flatShading: true,
        emissive: glow ? color : 0x000000, emissiveIntensity: glow ? 0.55 : 0,
      });
      // I colori sopra sono quelli "veri" (sRGB): senza conversione il renderer li schiarisce
      m.color.convertSRGBToLinear();
      m.emissive.convertSRGBToLinear();
      materials[key] = m;
    }
    return materials[key];
  }

  // Scatola: dimensioni, colore, posizione, rotazione (radianti)
  function box(g, w, h, d, color, x, y, z, rx, ry, rz, glow) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, glow));
    m.position.set(x, y, z);
    m.rotation.set(rx || 0, ry || 0, rz || 0);
    g.add(m);
    return m;
  }

  // Cilindro sdraiato lungo Z (canne, tubi)
  function tubeZ(g, r, len, color, x, y, z, seg) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg || 8), mat(color));
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }

  // Cilindro in piedi (proiettili, maniglie)
  function cylY(g, rTop, rBottom, h, color, x, y, z, seg) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg || 8), mat(color));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }

  // Unisce tutte le parti dello stesso colore in un'unica mesh (molte meno chiamate di disegno)
  function bake(group) {
    group.updateMatrixWorld(true);
    const byMat = new Map();
    group.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(g);
    });
    const out = new THREE.Group();
    byMat.forEach((geoms, material) => {
      let total = 0;
      geoms.forEach((g) => { total += g.attributes.position.count; });
      const pos = new Float32Array(total * 3);
      const nor = new Float32Array(total * 3);
      let off = 0;
      geoms.forEach((g) => {
        pos.set(g.attributes.position.array, off * 3);
        nor.set(g.attributes.normal.array, off * 3);
        off += g.attributes.position.count;
        g.dispose();
      });
      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      mesh.userData.shared = true;
      out.add(mesh);
    });
    return out;
  }

  // ---------------------------------------------------------------
  // Armi
  // ---------------------------------------------------------------
  function pistol(g) {
    box(g, 0.034, 0.036, 0.20, C.steel, 0, 0.037, -0.07);                 // carrello
    box(g, 0.036, 0.010, 0.05, C.steelDark, 0, 0.037, 0.005);             // zigrinatura dietro
    box(g, 0.031, 0.024, 0.15, C.polymer, 0, 0.008, -0.06);               // fusto
    box(g, 0.032, 0.106, 0.046, C.polymer, 0, -0.046, 0.014, 0.22, 0, 0); // impugnatura
    box(g, 0.034, 0.012, 0.05, C.black, 0, -0.097, 0.026, 0.22, 0, 0);    // fondello caricatore
    box(g, 0.008, 0.006, 0.052, C.polymer, 0, -0.027, -0.038);            // ponticello
    box(g, 0.008, 0.024, 0.006, C.polymer, 0, -0.015, -0.062);
    box(g, 0.005, 0.022, 0.005, C.black, 0, -0.012, -0.03);               // grilletto
    tubeZ(g, 0.008, 0.014, C.black, 0, 0.037, -0.176, 6);                 // canna
    box(g, 0.006, 0.010, 0.008, C.accent, 0, 0.059, -0.158, 0, 0, 0, true); // mirino
    box(g, 0.008, 0.010, 0.008, C.black, 0.009, 0.059, 0.022);            // tacca di mira
    box(g, 0.008, 0.010, 0.008, C.black, -0.009, 0.059, 0.022);
  }

  function smg(g) {
    box(g, 0.046, 0.062, 0.30, C.steel, 0, 0.040, -0.085);                // castello
    box(g, 0.050, 0.040, 0.11, C.polymer, 0, 0.020, -0.20);               // astina
    tubeZ(g, 0.012, 0.09, C.black, 0, 0.048, -0.28, 6);                   // canna
    tubeZ(g, 0.017, 0.04, C.steelDark, 0, 0.048, -0.345, 6);              // compensatore
    box(g, 0.026, 0.17, 0.036, C.black, 0, -0.072, -0.08, -0.12, 0, 0);   // caricatore lungo
    box(g, 0.034, 0.095, 0.042, C.polymer, 0, -0.040, 0.032, 0.25, 0, 0); // impugnatura
    box(g, 0.008, 0.006, 0.05, C.polymer, 0, -0.024, -0.012);             // ponticello
    box(g, 0.005, 0.02, 0.005, C.black, 0, -0.012, -0.004);               // grilletto
    box(g, 0.010, 0.010, 0.20, C.steelDark, 0.016, 0.052, 0.16);          // calcio pieghevole
    box(g, 0.010, 0.010, 0.20, C.steelDark, -0.016, 0.030, 0.16);
    box(g, 0.042, 0.075, 0.014, C.black, 0, 0.034, 0.262);
    box(g, 0.022, 0.010, 0.17, C.black, 0, 0.076, -0.07);                 // slitta
    box(g, 0.008, 0.024, 0.016, C.black, 0.009, 0.088, 0.03);             // diottra
    box(g, 0.008, 0.024, 0.016, C.black, -0.009, 0.088, 0.03);
    box(g, 0.006, 0.022, 0.008, C.accent, 0, 0.088, -0.17, 0, 0, 0, true); // mirino
    box(g, 0.03, 0.010, 0.012, C.steelDark, 0.03, 0.056, -0.12);          // leva d'armamento
  }

  function rifle(g) {
    box(g, 0.052, 0.074, 0.36, C.steel, 0, 0.040, -0.07);                 // castello
    box(g, 0.046, 0.016, 0.30, C.steelDark, 0, 0.084, -0.09);             // coperchio
    box(g, 0.058, 0.064, 0.24, C.olive, 0, 0.034, -0.37);                 // astina
    box(g, 0.060, 0.010, 0.20, C.oliveDark, 0, 0.012, -0.37);             // scanalature
    box(g, 0.060, 0.010, 0.20, C.oliveDark, 0, 0.044, -0.37);
    tubeZ(g, 0.011, 0.20, C.black, 0, 0.045, -0.59, 6);                   // canna
    tubeZ(g, 0.017, 0.05, C.steelDark, 0, 0.045, -0.70, 6);               // spegnifiamma
    box(g, 0.026, 0.030, 0.03, C.steelDark, 0, 0.068, -0.54);             // blocco mirino
    box(g, 0.006, 0.040, 0.010, C.accent, 0, 0.100, -0.54, 0, 0, 0, true); // mirino
    box(g, 0.030, 0.100, 0.056, C.tan, 0, -0.040, -0.11, -0.10, 0, 0);    // caricatore curvo
    box(g, 0.030, 0.090, 0.054, C.tan, 0, -0.123, -0.083, -0.38, 0, 0);
    box(g, 0.036, 0.100, 0.044, C.polymer, 0, -0.042, 0.042, 0.32, 0, 0); // impugnatura
    box(g, 0.008, 0.006, 0.06, C.polymer, 0, -0.024, -0.02);              // ponticello
    box(g, 0.005, 0.022, 0.005, C.black, 0, -0.012, -0.006);              // grilletto
    box(g, 0.044, 0.070, 0.25, C.olive, 0, 0.024, 0.235, 0.06, 0, 0);     // calcio
    box(g, 0.050, 0.115, 0.030, C.black, 0, 0.004, 0.37, 0.06, 0, 0);     // calciolo
    box(g, 0.030, 0.012, 0.024, C.black, 0, 0.093, 0.07);                 // tacca di mira: base
    box(g, 0.007, 0.022, 0.020, C.black, 0.011, 0.108, 0.07);             // ... e due alette
    box(g, 0.007, 0.022, 0.020, C.black, -0.011, 0.108, 0.07);
    box(g, 0.003, 0.020, 0.06, C.black, 0.027, 0.050, -0.03);             // finestra d'espulsione
  }

  function shotgun(g) {
    box(g, 0.050, 0.068, 0.22, C.steel, 0, 0.036, -0.03);                 // castello
    tubeZ(g, 0.015, 0.52, C.steelDark, 0, 0.055, -0.40, 8);               // canna
    tubeZ(g, 0.012, 0.40, C.black, 0, 0.020, -0.34, 8);                   // serbatoio
    box(g, 0.054, 0.050, 0.17, C.wood, 0, 0.022, -0.38);                  // pompa
    box(g, 0.057, 0.053, 0.012, C.woodDark, 0, 0.022, -0.33);
    box(g, 0.057, 0.053, 0.012, C.woodDark, 0, 0.022, -0.43);
    box(g, 0.008, 0.008, 0.008, C.accent, 0, 0.073, -0.64, 0, 0, 0, true); // mirino a perla
    box(g, 0.042, 0.085, 0.060, C.wood, 0, -0.026, 0.085, 0.35, 0, 0);    // impugnatura
    box(g, 0.046, 0.075, 0.26, C.wood, 0, -0.008, 0.24, 0.10, 0, 0);      // calcio
    box(g, 0.050, 0.110, 0.025, C.black, 0, -0.030, 0.375, 0.10, 0, 0);   // calciolo
    box(g, 0.008, 0.006, 0.06, C.steelDark, 0, -0.012, 0.0);              // ponticello
    box(g, 0.005, 0.022, 0.005, C.black, 0, -0.002, 0.01);                // grilletto
  }

  // ---------------------------------------------------------------
  // Oggetti raccoglibili
  // ---------------------------------------------------------------
  function medkit(g) {
    box(g, 0.50, 0.30, 0.30, C.bone, 0, 0, 0);                            // valigetta
    box(g, 0.52, 0.05, 0.32, C.boneDark, 0, 0.09, 0);                     // bordo del coperchio
    [0.152, -0.152].forEach((z) => {                                      // croce davanti e dietro
      box(g, 0.20, 0.06, 0.012, C.health, 0, -0.025, z, 0, 0, 0, true);
      box(g, 0.06, 0.20, 0.012, C.health, 0, -0.025, z, 0, 0, 0, true);
    });
    box(g, 0.20, 0.012, 0.06, C.health, 0, 0.152, 0, 0, 0, 0, true);      // croce sopra
    box(g, 0.06, 0.012, 0.20, C.health, 0, 0.152, 0, 0, 0, 0, true);
    box(g, 0.18, 0.025, 0.035, C.black, 0, 0.205, 0);                     // maniglia
    box(g, 0.025, 0.05, 0.035, C.black, 0.0775, 0.175, 0);
    box(g, 0.025, 0.05, 0.035, C.black, -0.0775, 0.175, 0);
    box(g, 0.04, 0.05, 0.02, C.steelDark, 0.17, 0.07, 0.16);              // chiusure
    box(g, 0.04, 0.05, 0.02, C.steelDark, -0.17, 0.07, 0.16);
  }

  function armor(g) {
    box(g, 0.40, 0.46, 0.07, C.olive, 0, 0, -0.08);                       // pannello davanti
    box(g, 0.40, 0.48, 0.06, C.oliveDark, 0, 0.01, 0.10);                 // pannello dietro
    box(g, 0.08, 0.04, 0.24, C.strap, 0.12, 0.25, 0.01);                  // spallacci
    box(g, 0.08, 0.04, 0.24, C.strap, -0.12, 0.25, 0.01);
    box(g, 0.04, 0.22, 0.20, C.strap, 0.21, -0.10, 0.01);                 // fasce laterali
    box(g, 0.04, 0.22, 0.20, C.strap, -0.21, -0.10, 0.01);
    box(g, 0.26, 0.19, 0.014, C.plate, 0, 0.10, -0.12, 0, 0, 0, true);    // piastra balistica
    box(g, 0.14, 0.03, 0.016, C.steelDark, 0, 0.21, -0.12);               // colletto
    [-0.12, 0, 0.12].forEach((x) => {                                     // tasche portacaricatori
      box(g, 0.10, 0.13, 0.05, C.oliveDark, x, -0.12, -0.14);
      box(g, 0.104, 0.03, 0.054, C.strap, x, -0.06, -0.14);
    });
    box(g, 0.40, 0.012, 0.075, C.strap, 0, -0.205, -0.08);                // fasce MOLLE
    box(g, 0.40, 0.012, 0.075, C.strap, 0, 0.02, -0.08);
  }

  function ammo(g) {
    box(g, 0.42, 0.24, 0.20, C.ammo, 0, 0, 0);                            // cassetta
    box(g, 0.44, 0.04, 0.22, C.oliveDark, 0, 0.13, 0);                    // coperchio
    box(g, 0.30, 0.035, 0.008, C.stencil, 0, 0.0, 0.102, 0, 0, 0, true);  // striscia gialla
    box(g, 0.30, 0.035, 0.008, C.stencil, 0, 0.0, -0.102, 0, 0, 0, true);
    box(g, 0.16, 0.02, 0.03, C.black, 0, 0.175, 0);                       // maniglia
    box(g, 0.02, 0.03, 0.03, C.black, 0.07, 0.16, 0);
    box(g, 0.02, 0.03, 0.03, C.black, -0.07, 0.16, 0);
    box(g, 0.03, 0.10, 0.06, C.steelDark, 0.225, 0.06, 0);                // leva di chiusura
    [-0.15, -0.11, -0.07].forEach((x) => {                                // proiettili sul coperchio
      cylY(g, 0.012, 0.012, 0.06, C.brass, x, 0.18, 0.05, 6);
      cylY(g, 0.002, 0.012, 0.03, C.copper, x, 0.225, 0.05, 6);
    });
  }

  const BUILDERS = { pistol, smg, rifle, shotgun, medkit, armor, ammo };
  const templates = {};

  function template(type) {
    if (!templates[type]) {
      const raw = new THREE.Group();
      (BUILDERS[type] || BUILDERS.ammo)(raw);
      templates[type] = bake(raw);
    }
    return templates[type];
  }

  // Arma pronta da mettere in mano (o in prima persona)
  function weapon(type) {
    return template(BUILDERS[type] && INFO[type] ? type : 'pistol').clone();
  }

  // Oggetto raccoglibile: centrato sull'origine, cosi' gira su se stesso
  function item(type) {
    const model = template(type).clone();
    if (INFO[type]) model.rotation.z = 0.12;     // armi leggermente inclinate
    model.scale.setScalar(ITEM_SCALE[type] || 1);
    const holder = new THREE.Group();
    holder.add(model);
    holder.updateMatrixWorld(true);
    const box3 = new THREE.Box3().setFromObject(holder);
    const center = box3.getCenter(new THREE.Vector3());
    model.position.sub(center);
    return holder;
  }

  // Mette l'arma nel punto di aggancio (weaponSocket) di un personaggio
  function equip(socket, type) {
    if (!socket) return false;
    if (socket.userData.weapon === type) return true;
    const old = socket.getObjectByName('equipped');
    if (old) socket.remove(old);
    const w = weapon(type);
    w.name = 'equipped';
    socket.add(w);
    socket.userData.weapon = type;
    return true;
  }

  function info(type) { return INFO[type] || INFO.pistol; }

  const Models = { weapon, item, equip, info, isWeapon: (t) => !!INFO[t] };
  if (typeof window !== 'undefined') window.Models = Models;
})();
