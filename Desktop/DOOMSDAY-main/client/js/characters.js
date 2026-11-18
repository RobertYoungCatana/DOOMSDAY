// DOOMSDAY - characters.js
// Personaggi low-poly fatti a codice (niente file da scaricare, niente licenze):
// militare, infermiera, zombie, ninja, poliziotto, astronauta, Bobby l'esploratore,
// Jackson, Superman, Batman, Spider-Man, pirata, scheletro, vampiro, fantasma.
//
// Stesse misure delle skin scaricate: alti 1,8 m, piedi a y = 0, guardano verso -Z.
// Le braccia sono gia' in posa con l'arma: nella mano destra c'e' il punto di aggancio
// "weaponSocket" (l'arma la mette Models.equip). Le gambe sono due gruppi a parte,
// "legL" e "legR", che network.js fa oscillare quando il giocatore cammina.
//
// Ogni personaggio e' fatto di poche mesh con i colori nei vertici (corpo, gambe, parti
// luminose): pochissimo lavoro per la scheda video.
// Per aggiungerne uno: una funzione in OUTFITS + una riga in CONFIG.SKINS con builder: 'nome'.
// Dipendenze: Three.js

(function () {
  'use strict';

  // --- Scheletro comune (metri) ---
  const HIP = { x: 0.1, y: 0.93 };
  const SHOULDER = { x: 0.2, y: 1.44 };
  const HEAD = { y: 1.635, r: 0.115 };
  const UPPER_ARM = 0.28;
  const FOREARM = 0.3;                               // fino al centro della mano
  const GRIP = new THREE.Vector3(0.1, 1.17, -0.4);   // mano destra: impugnatura dell'arma
  const SUPPORT = new THREE.Vector3(-0.02, 1.2, -0.5); // mano sinistra: sostiene l'arma

  // ---------------------------------------------------------------
  // Costruttore: accumula forme colorate in "parti" (corpo, gambe, luci)
  // ---------------------------------------------------------------
  function Builder() {
    this.parts = {};
  }

  Builder.prototype.put = function (part, geo, color, matrix) {
    if (matrix) geo.applyMatrix4(matrix);
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeVertexNormals();                        // facce piatte: aspetto low-poly
    const c = new THREE.Color(color).convertSRGBToLinear();
    const p = this.parts[part] || (this.parts[part] = { pos: [], nor: [], col: [] });
    const pos = g.attributes.position.array;
    const nor = g.attributes.normal.array;
    for (let i = 0; i < pos.length; i += 3) {
      p.pos.push(pos[i], pos[i + 1], pos[i + 2]);
      p.nor.push(nor[i], nor[i + 1], nor[i + 2]);
      p.col.push(c.r, c.g, c.b);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  };

  // Scatola: dimensioni, colore, centro, rotazione (radianti)
  Builder.prototype.box = function (part, w, h, d, color, x, y, z, rx, ry, rz) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)),
      new THREE.Vector3(1, 1, 1));
    this.put(part, new THREE.BoxGeometry(w, h, d), color, m);
  };

  // Palla low-poly (testa, spalle, chignon), con scala per schiacciarla
  Builder.prototype.ball = function (part, r, color, x, y, z, sx, sy, sz, detail) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx || 1, sy || 1, sz || 1));
    this.put(part, new THREE.IcosahedronGeometry(r, detail === undefined ? 1 : detail), color, m);
  };

  // Cilindro da un punto a un altro (braccia, gambe, cinghie, spada)
  Builder.prototype.limb = function (part, a, b, ra, rb, color, seg) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(rb, ra, len, seg || 6);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    this.put(part, geo, color, m);
  };

  // Cilindro verticale (cappelli, elmetti, tasche tonde)
  Builder.prototype.cyl = function (part, rTop, rBottom, h, color, x, y, z, seg, rx, rz) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, 0, rz || 0)),
      new THREE.Vector3(1, 1, 1));
    this.put(part, new THREE.CylinderGeometry(rTop, rBottom, h, seg || 8), color, m);
  };

  // Calotta (elmetto): mezza sfera low-poly
  Builder.prototype.dome = function (part, r, color, x, y, z, sx, sy, sz) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx || 1, sy || 1, sz || 1));
    this.put(part, new THREE.SphereGeometry(r, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), color, m);
  };

  // Telo a trapezio (mantelli): largo wTop in alto e wBottom in basso, alto h, spesso t.
  // rx inclina il fondo all'indietro (valori negativi), cosi' le gambe non lo attraversano.
  Builder.prototype.sheet = function (part, wTop, wBottom, h, t, color, x, y, z, rx) {
    const geo = new THREE.CylinderGeometry(wTop / Math.SQRT2, wBottom / Math.SQRT2, h, 4, 1);
    geo.rotateY(Math.PI / 4);                        // sezione quadrata con i lati dritti
    geo.scale(1, 1, t / wBottom);                    // schiacciata: un telo
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, 0, 0)),
      new THREE.Vector3(1, 1, 1));
    this.put(part, geo, color, m);
  };

  // Forma qualsiasi con rotazione completa (cappelli a tricorno, anelli inclinati...)
  Builder.prototype.shape = function (part, geo, color, x, y, z, rx, ry, rz) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)),
      new THREE.Vector3(1, 1, 1));
    this.put(part, geo, color, m);
  };

  // ---------------------------------------------------------------
  // Corpo base
  // ---------------------------------------------------------------
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // Gomito con "IK a due ossa": spalla e mano note, il gomito piega verso "pole"
  function armJoints(shoulder, handTarget, pole) {
    const d = new THREE.Vector3().subVectors(handTarget, shoulder);
    const dir = d.clone().normalize();
    const reach = Math.min(d.length(), UPPER_ARM + FOREARM - 0.002);
    const hand = shoulder.clone().addScaledVector(dir, reach);
    const x = (UPPER_ARM * UPPER_ARM - FOREARM * FOREARM + reach * reach) / (2 * reach);
    const h = Math.sqrt(Math.max(0, UPPER_ARM * UPPER_ARM - x * x));
    const p = pole.clone().normalize();
    p.sub(dir.clone().multiplyScalar(p.dot(dir))).normalize();
    const elbow = shoulder.clone().addScaledVector(dir, x).addScaledVector(p, h);
    return { elbow: elbow, hand: hand };
  }

  // Superficie del busto (tronco di piramide): davanti, dietro e mezza larghezza all'altezza y.
  // Servono per appoggiare dettagli (costole, stemmi, cuciture) proprio sul petto o sulla schiena.
  const FRONT = (y) => 0.005 - (0.088 + 0.0705 * (y - 1.06));
  const BACK = (y) => 0.005 + 0.088 + 0.0705 * (y - 1.06);
  const HALF_W = (y) => 0.152 + 0.1205 * (y - 1.06);

  // Spalla, gomito, polso e mano dei due bracci in posa con l'arma (destro, sinistro)
  function armPoints() {
    return [
      { side: 1, s: V(SHOULDER.x, SHOULDER.y, 0), target: GRIP, pole: V(0.7, -1, 0.5) },
      { side: -1, s: V(-SHOULDER.x, SHOULDER.y, 0), target: SUPPORT, pole: V(-0.7, -1, 0.3) },
    ].map((a) => {
      const j = armJoints(a.s, a.target, a.pole);
      const fdir = new THREE.Vector3().subVectors(j.hand, j.elbow).normalize();
      return { side: a.side, shoulder: a.s, elbow: j.elbow, hand: j.hand, wrist: j.hand.clone().addScaledVector(fdir, -0.06) };
    });
  }

  // o: colori e varianti del vestito
  //   skin, shirt, sleeve, forearm, glove, pants, legLower, boot, belt, head (testa coperta)
  //   shoulder (colore delle spalle), pelvis (colore del bacino), limbR (braccia e gambe piu' sottili, 0-1),
  //   pegL / pegR (gamba di legno al posto di stinco e scarpa: colore del legno)
  function body(b, o) {
    const lr = o.limbR || 1;                 // spessore di braccia e gambe
    const jr = (1 + lr) / 2;                 // ginocchia e gomiti si assottigliano meno: sembrano ossa

    // --- Gambe (ognuna nel suo gruppo, cosi' si possono muovere) ---
    [-1, 1].forEach((side) => {
      const part = side < 0 ? 'legL' : 'legR';
      const hip = V(side * HIP.x, HIP.y, 0);
      const knee = V(side * 0.11, 0.5, -0.03);
      const ankle = V(side * 0.11, 0.1, 0);
      b.limb(part, hip, knee, 0.085 * lr, 0.066 * lr, o.pants, 7);
      b.ball(part, 0.066 * jr, o.pants, knee.x, knee.y, knee.z, 1, 1, 1, 0);
      const peg = side < 0 ? o.pegL : o.pegR;
      if (peg) {
        // gamba di legno: un piolo che si stringe fino a terra, con un anello al ginocchio
        b.cyl(part, 0.072, 0.072, 0.06, 0x3b2a1c, knee.x, knee.y - 0.03, knee.z, 8);
        b.limb(part, V(knee.x, knee.y - 0.05, knee.z), V(ankle.x, 0.0, ankle.z + 0.02), 0.042, 0.026, peg, 7);
        b.cyl(part, 0.032, 0.032, 0.02, 0x2a1d12, ankle.x, 0.01, ankle.z + 0.02, 8);
        return;
      }
      const lower = (side < 0 ? o.legLowerL : o.legLowerR) || o.legLower || o.pants;
      b.limb(part, knee, ankle, 0.064 * lr, 0.05 * lr, lower, 7);
      const boot = (side < 0 ? o.bootL : o.bootR) || o.boot;
      b.box(part, 0.12, 0.1, 0.25, boot, ankle.x, 0.05, -0.045);
      b.box(part, 0.105 * jr, 0.07, 0.11 * jr, boot, ankle.x, 0.13, 0.01);
    });

    // --- Bacino e busto ---
    b.box('body', 0.34, 0.17, 0.21, o.pelvis || o.pants, 0, 0.955, 0);
    b.box('body', 0.36, 0.055, 0.225, o.belt, 0, 1.035, 0);
    // busto a tronco di piramide: spalle larghe, vita stretta
    const torso = new THREE.CylinderGeometry(0.29, 0.215, 0.44, 4, 1);
    torso.rotateY(Math.PI / 4);
    torso.scale(1, 1, 0.58);
    b.put('body', torso, o.shirt, new THREE.Matrix4().makeTranslation(0, 1.28, 0.005));

    // --- Collo e testa ---
    b.cyl('body', 0.052, 0.058, 0.09, o.neck || o.skin, 0, 1.515, 0, 7);
    b.ball('body', HEAD.r, o.head || o.skin, 0, HEAD.y, o.headZ || 0, 0.94, 1.08, 1.0);
    if (!o.noFace) {
      b.box('body', 0.03, 0.017, 0.012, 0x221a14, -0.04, HEAD.y + 0.015, -0.108 + (o.headZ || 0));   // occhi
      b.box('body', 0.03, 0.017, 0.012, 0x221a14, 0.04, HEAD.y + 0.015, -0.108 + (o.headZ || 0));
      b.box('body', 0.024, 0.04, 0.03, o.skin, 0, HEAD.y - 0.01, -0.118 + (o.headZ || 0));             // naso
      b.box('body', 0.012, 0.035, 0.025, o.skin, -0.112, HEAD.y, (o.headZ || 0));                       // orecchie
      b.box('body', 0.012, 0.035, 0.025, o.skin, 0.112, HEAD.y, (o.headZ || 0));
    }

    // --- Braccia in posa con l'arma ---
    const arms = [
      { s: V(SHOULDER.x, SHOULDER.y, 0), target: GRIP, pole: V(0.7, -1, 0.5) },
      { s: V(-SHOULDER.x, SHOULDER.y, 0), target: SUPPORT, pole: V(-0.7, -1, 0.3) },
    ];
    arms.forEach((a) => {
      const j = armJoints(a.s, a.target, a.pole);
      const fdir = new THREE.Vector3().subVectors(j.hand, j.elbow).normalize();
      const wrist = j.hand.clone().addScaledVector(fdir, -0.06);
      b.ball('body', 0.078 * jr, o.shoulder || o.sleeve || o.shirt, a.s.x, a.s.y, a.s.z, 1, 0.95, 1, 0);   // spalla
      b.limb('body', a.s, j.elbow, 0.062 * lr, 0.052 * lr, o.sleeve || o.shirt, 7);
      b.ball('body', 0.05 * jr, o.forearm || o.sleeve || o.shirt, j.elbow.x, j.elbow.y, j.elbow.z, 1, 1, 1, 0);
      b.limb('body', j.elbow, wrist, 0.05 * lr, 0.042 * lr, o.forearm || o.skin, 7);
      // mano: scatoletta orientata lungo l'avambraccio
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, -1), fdir);
      const m = new THREE.Matrix4().compose(j.hand, q, V(1, 1, 1));
      b.put('body', new THREE.BoxGeometry(0.075, 0.085, 0.1), o.glove || o.skin, m);
    });
  }

  // ---------------------------------------------------------------
  // Vestiti
  // ---------------------------------------------------------------
  const OUTFITS = {
    // Militare: mimetica oliva, giubbotto con tasche, elmetto con occhiali, zaino
    military(b) {
      const o = {
        skin: 0xc49a74, shirt: 0x5d6a40, sleeve: 0x56623a, forearm: 0x56623a, glove: 0x25281f,
        pants: 0x4d5636, boot: 0x2b241e, belt: 0x2f3523,
      };
      body(b, o);
      // macchie mimetiche
      [[-0.12, 1.36, -0.13, 0x3e4729], [0.1, 1.22, -0.125, 0x707a4c], [0.15, 1.38, 0.12, 0x3e4729],
        [-0.1, 1.16, 0.12, 0x707a4c], [0, 0.97, -0.11, 0x3e4729]].forEach((p) => b.box('body', 0.1, 0.07, 0.01, p[3], p[0], p[1], p[2]));
      [-1, 1].forEach((s) => {
        b.box(s < 0 ? 'legL' : 'legR', 0.13, 0.12, 0.05, 0x2f3523, s * 0.11, 0.5, -0.085);      // ginocchiere
        b.box(s < 0 ? 'legL' : 'legR', 0.03, 0.12, 0.12, 0x3e4729, s * 0.19, 0.72, 0);          // tasche laterali
      });
      // giubbotto tattico
      b.box('body', 0.42, 0.33, 0.31, 0x3f472c, 0, 1.3, 0);
      [-0.1, 0, 0.1].forEach((x) => b.box('body', 0.085, 0.1, 0.05, 0x343b24, x, 1.19, -0.17));
      b.box('body', 0.07, 0.11, 0.05, 0x343b24, -0.13, 1.36, -0.165);
      b.box('body', 0.04, 0.06, 0.005, 0x5a2f1f, 0.12, 1.4, -0.158);   // toppa
      // zaino con sacco a pelo
      b.box('body', 0.3, 0.36, 0.14, 0x4d5635, 0, 1.27, 0.22);
      b.cyl('body', 0.06, 0.06, 0.32, 0x5b4a33, 0, 1.49, 0.22, 7, 0, Math.PI / 2);
      // elmetto + occhiali
      b.dome('body', 0.138, 0x4b5535, 0, HEAD.y + 0.02, 0, 1, 0.95, 1.08);
      b.cyl('body', 0.15, 0.15, 0.02, 0x434c2f, 0, HEAD.y + 0.02, 0, 10);
      b.box('body', 0.22, 0.035, 0.05, 0x1d1f1c, 0, HEAD.y + 0.08, -0.12);
      b.box('body', 0.07, 0.03, 0.02, 0x6b8a8f, -0.045, HEAD.y + 0.08, -0.148);
      b.box('body', 0.07, 0.03, 0.02, 0x6b8a8f, 0.045, HEAD.y + 0.08, -0.148);
      b.box('body', 0.012, 0.09, 0.012, 0x25281f, -0.11, HEAD.y - 0.06, -0.02);   // sottogola
      b.box('body', 0.012, 0.09, 0.012, 0x25281f, 0.11, HEAD.y - 0.06, -0.02);
    },

    // Infermiera: divisa verde acqua (con macchie), cuffia con croce, mascherina, chignon
    nurse(b) {
      const o = {
        skin: 0xe8c4a0, shirt: 0x6db1b6, sleeve: 0x6db1b6, forearm: 0xe8c4a0, glove: 0xd9e6ea,
        pants: 0x5a9ea4, boot: 0xe6e6e6, belt: 0x4f8f95,
      };
      body(b, o);
      // capelli e chignon
      b.box('body', 0.215, 0.07, 0.2, 0x5a3a24, 0, HEAD.y + 0.085, 0.01);
      b.box('body', 0.22, 0.12, 0.09, 0x5a3a24, 0, HEAD.y + 0.02, 0.07);
      b.ball('body', 0.06, 0x4e3220, 0, HEAD.y + 0.05, 0.13, 1, 1, 1, 0);
      // cuffia con croce rossa
      b.box('body', 0.17, 0.05, 0.1, 0xf2f2ee, 0, HEAD.y + 0.13, -0.02);
      b.box('body', 0.06, 0.016, 0.012, 0xc7231d, 0, HEAD.y + 0.13, -0.074);
      b.box('body', 0.016, 0.04, 0.012, 0xc7231d, 0, HEAD.y + 0.13, -0.074);
      // mascherina
      b.box('body', 0.17, 0.07, 0.05, 0xb3d9e6, 0, HEAD.y - 0.045, -0.1);
      b.box('body', 0.01, 0.012, 0.1, 0xdfeef3, -0.09, HEAD.y - 0.03, -0.05);
      b.box('body', 0.01, 0.012, 0.1, 0xdfeef3, 0.09, HEAD.y - 0.03, -0.05);
      // scollo a V, taschino, stetoscopio
      b.box('body', 0.1, 0.07, 0.01, 0xe0b994, 0, 1.45, -0.125, 0, 0, Math.PI / 4);
      b.box('body', 0.08, 0.06, 0.012, 0x5a9ea4, -0.11, 1.33, -0.128);
      b.box('body', 0.012, 0.18, 0.012, 0x2a2d30, -0.05, 1.38, -0.13, 0, 0, 0.25);
      b.box('body', 0.012, 0.18, 0.012, 0x2a2d30, 0.05, 1.38, -0.13, 0, 0, -0.25);
      b.cyl('body', 0.02, 0.02, 0.015, 0xb8bcc2, 0, 1.28, -0.135, 8, Math.PI / 2, 0);
      // macchie di sangue e fascia con croce sul braccio
      b.box('body', 0.07, 0.05, 0.01, 0x7a1d17, 0.08, 1.15, -0.112);
      b.box('body', 0.05, 0.04, 0.01, 0x7a1d17, -0.06, 0.98, -0.108);
      b.box('body', 0.09, 0.05, 0.09, 0xf2f2ee, -0.2, 1.33, -0.06);
      b.box('body', 0.03, 0.03, 0.005, 0xc7231d, -0.2, 1.33, -0.107);
      // borsa medica alla cintura
      b.box('body', 0.1, 0.09, 0.06, 0xf2f2ee, 0.19, 0.98, 0.02);
      b.box('body', 0.03, 0.03, 0.005, 0xc7231d, 0.19, 0.98, -0.012);
    },

    // Zombie: pelle verdastra, vestiti strappati e sporchi, occhi che brillano, una scarpa sola
    zombie(b) {
      const o = {
        skin: 0x8ea57a, shirt: 0x8f8467, sleeve: 0x8f8467, forearm: 0x8ea57a, glove: 0x8ea57a,
        pants: 0x3d4655, legLowerR: 0x8ea57a, boot: 0x3a2e24, bootR: 0x7d9468, belt: 0x2a2620,
        headZ: -0.03, noFace: true,
      };
      body(b, o);
      const hz = -0.03;
      // faccia: occhi incavati che brillano, bocca aperta
      b.box('body', 0.045, 0.03, 0.012, 0x1e1a12, -0.04, HEAD.y + 0.015, -0.106 + hz);
      b.box('body', 0.045, 0.03, 0.012, 0x1e1a12, 0.04, HEAD.y + 0.015, -0.106 + hz);
      b.box('glow', 0.016, 0.014, 0.01, 0xd6ff4a, -0.04, HEAD.y + 0.015, -0.112 + hz);
      b.box('glow', 0.016, 0.014, 0.01, 0xd6ff4a, 0.04, HEAD.y + 0.015, -0.112 + hz);
      b.box('body', 0.06, 0.035, 0.014, 0x3a1410, 0, HEAD.y - 0.05, -0.1 + hz);
      b.box('body', 0.05, 0.008, 0.016, 0xd8cfb4, 0, HEAD.y - 0.036, -0.103 + hz);
      b.box('body', 0.022, 0.035, 0.03, 0x7d9468, 0, HEAD.y - 0.005, -0.118 + hz);
      // ciuffi di capelli e una ferita in testa
      [[-0.06, 0.1, 0.02], [0.05, 0.11, -0.01], [0.0, 0.1, 0.06], [-0.04, 0.07, 0.09]].forEach((p) =>
        b.box('body', 0.07, 0.03, 0.06, 0x2b2a22, p[0], HEAD.y + p[1], p[2] + hz));
      b.box('body', 0.05, 0.03, 0.01, 0x6e1c16, 0.06, HEAD.y + 0.06, -0.09 + hz);
      // camicia strappata: buchi, costole, sangue
      b.box('body', 0.12, 0.1, 0.012, 0x4f4636, 0.1, 1.2, -0.115);
      [1.24, 1.21, 1.18].forEach((y) => b.box('body', 0.07, 0.012, 0.014, 0xd8cfb4, 0.1, y, -0.122));
      b.box('body', 0.1, 0.07, 0.012, 0x6e1c16, -0.08, 1.35, -0.122);
      b.box('body', 0.06, 0.12, 0.012, 0x6e1c16, -0.12, 1.05, -0.112);
      b.box('body', 0.09, 0.08, 0.012, 0x4f4636, -0.1, 1.3, 0.125);
      b.box('legL', 0.08, 0.1, 0.012, 0x6e1c16, -0.11, 0.65, -0.08);
      // pantalone destro strappato al ginocchio
      b.box('legR', 0.14, 0.04, 0.14, 0x3d4655, 0.11, 0.48, -0.02, 0, 0, 0.2);
    },

    // Ninja: tutto scuro, fascia e cintura rosse, maschera con fessura per gli occhi, katana sulla schiena
    ninja(b) {
      const o = {
        skin: 0xd8b08c, shirt: 0x24272d, sleeve: 0x24272d, forearm: 0x1b1d22, glove: 0x16181c,
        pants: 0x22252b, legLower: 0x1b1d22, boot: 0x141518, belt: 0x9b2320, head: 0x1f2227, neck: 0x1f2227,
        noFace: true,
      };
      body(b, o);
      // fessura per gli occhi
      b.box('body', 0.2, 0.04, 0.03, 0xd8b08c, 0, HEAD.y + 0.02, -0.1);
      b.box('body', 0.03, 0.016, 0.012, 0x16120e, -0.04, HEAD.y + 0.02, -0.117);
      b.box('body', 0.03, 0.016, 0.012, 0x16120e, 0.04, HEAD.y + 0.02, -0.117);
      // fascia rossa con le code
      b.box('body', 0.235, 0.03, 0.235, 0x9b2320, 0, HEAD.y + 0.065, 0);
      b.box('body', 0.03, 0.14, 0.012, 0x9b2320, -0.03, HEAD.y - 0.02, 0.125, 0.3, 0, 0.2);
      b.box('body', 0.03, 0.12, 0.012, 0x9b2320, 0.03, HEAD.y - 0.03, 0.125, 0.3, 0, -0.2);
      // incrocio della giacca e code della cintura
      b.box('body', 0.03, 0.34, 0.012, 0x16181c, -0.04, 1.3, -0.13, 0, 0, 0.45);
      b.box('body', 0.03, 0.34, 0.012, 0x16181c, 0.04, 1.3, -0.13, 0, 0, -0.45);
      b.box('body', 0.04, 0.16, 0.012, 0x9b2320, -0.13, 0.96, -0.118, 0, 0, 0.12);
      b.box('body', 0.04, 0.13, 0.012, 0x9b2320, -0.09, 0.97, -0.118, 0, 0, -0.1);
      // fasce su braccia e gambe
      [-1, 1].forEach((s) => {
        const leg = s < 0 ? 'legL' : 'legR';
        [0.32, 0.24, 0.16].forEach((y) => b.box(leg, 0.13, 0.018, 0.13, 0x3a3f47, s * 0.11, y, -0.005));
      });
      // katana sulla schiena (fodero, guardia, impugnatura)
      const top = V(-0.2, 1.62, 0.17);
      const bottom = V(0.22, 0.86, 0.17);
      b.limb('body', bottom, top.clone().lerp(bottom, 0.22), 0.025, 0.025, 0x2a0e0e, 6);
      b.limb('body', top.clone().lerp(bottom, 0.22), top.clone().lerp(bottom, 0.18), 0.045, 0.045, 0xc9a23a, 8);
      b.limb('body', top.clone().lerp(bottom, 0.18), top, 0.018, 0.018, 0x111111, 6);
      // stella da lancio sulla cintura
      b.box('body', 0.07, 0.012, 0.012, 0xb8bcc2, 0.17, 1.04, -0.1, 0, 0, Math.PI / 4);
      b.box('body', 0.07, 0.012, 0.012, 0xb8bcc2, 0.17, 1.04, -0.1, 0, 0, -Math.PI / 4);
    },

    // Poliziotto: divisa blu, cappello con visiera e stemma, distintivo, radio, cinturone
    police(b) {
      const o = {
        skin: 0xd9ab84, shirt: 0x23344f, sleeve: 0x23344f, forearm: 0x23344f, glove: 0x15171a,
        pants: 0x1a2235, boot: 0x121314, belt: 0x111111,
      };
      body(b, o);
      // capelli corti
      b.box('body', 0.215, 0.05, 0.19, 0x2e2219, 0, HEAD.y + 0.06, 0.02);
      // cappello: corona, fascia, visiera, stemma
      b.cyl('body', 0.135, 0.12, 0.09, 0x1c2a42, 0, HEAD.y + 0.115, 0.0, 10);
      b.cyl('body', 0.122, 0.122, 0.035, 0x0f0f10, 0, HEAD.y + 0.08, 0, 10);
      b.box('body', 0.17, 0.014, 0.08, 0x0f0f10, 0, HEAD.y + 0.068, -0.12, -0.2, 0, 0);
      b.box('body', 0.035, 0.035, 0.01, 0xd4af37, 0, HEAD.y + 0.115, -0.13);
      // giubbotto con banda riflettente, distintivo, radio, spalline
      b.box('body', 0.41, 0.3, 0.29, 0x1c2638, 0, 1.31, 0);
      b.box('body', 0.42, 0.04, 0.3, 0xa9bccc, 0, 1.24, 0);
      b.box('body', 0.045, 0.055, 0.01, 0xd4af37, -0.1, 1.38, -0.148);
      b.box('body', 0.05, 0.08, 0.035, 0x0f0f10, 0.11, 1.4, -0.16);
      b.box('body', 0.008, 0.06, 0.008, 0x0f0f10, 0.125, 1.47, -0.16);
      b.box('body', 0.1, 0.02, 0.08, 0x5b7db3, 0.2, 1.505, 0);
      b.box('body', 0.1, 0.02, 0.08, 0x5b7db3, -0.2, 1.505, 0);
      // cinturone: fibbia, fondina, manette
      b.box('body', 0.05, 0.04, 0.01, 0xc0c4c8, 0, 1.035, -0.117);
      b.box('body', 0.07, 0.13, 0.08, 0x0f0f10, 0.2, 0.95, 0.0);
      b.cyl('body', 0.03, 0.03, 0.012, 0xc0c4c8, -0.17, 1.0, -0.06, 10, 0, Math.PI / 2);
      // occhiali scuri
      b.box('body', 0.18, 0.025, 0.02, 0x0b0c0e, 0, HEAD.y + 0.015, -0.115);
    },

    // Astronauta: tuta bianca, casco con visiera dorata e lampada, zaino di sopravvivenza,
    // pannello di comandi sul petto, bandiera italiana sulla spalla
    astronaut(b) {
      const o = {
        skin: 0xe9e8e2, shirt: 0xe9e8e2, sleeve: 0xe3e2dc, forearm: 0xe3e2dc, glove: 0xb9bcc2,
        pants: 0xe3e2dc, legLower: 0xdcdbd4, boot: 0xd2d3cf, belt: 0x9a9ea6, head: 0xe9e8e2, neck: 0xb9bcc2,
        noFace: true,
      };
      body(b, o);
      // casco: sfera grande, visiera scura e dorata che sporge davanti, riflesso, lampada
      b.ball('body', 0.175, 0xf0efe9, 0, HEAD.y + 0.01, 0, 1, 1.02, 1.02, 1);
      b.ball('body', 0.155, 0x5a4718, 0, HEAD.y + 0.0, -0.075, 0.95, 0.75, 0.78, 1);
      b.box('glow', 0.05, 0.02, 0.01, 0xe8d79a, -0.05, HEAD.y + 0.06, -0.192, 0, 0, 0.35);
      b.box('glow', 0.035, 0.035, 0.035, 0x9fe8ff, 0.165, HEAD.y + 0.05, -0.03);
      b.box('body', 0.05, 0.05, 0.06, 0xb9bcc2, 0.165, HEAD.y + 0.05, 0.01);
      b.cyl('body', 0.125, 0.135, 0.05, 0xb9bcc2, 0, 1.5, 0, 12);                      // anello del collo
      // zaino di sopravvivenza con pannelli e antenna
      b.box('body', 0.38, 0.5, 0.2, 0xf0efe9, 0, 1.24, 0.21);
      b.box('body', 0.3, 0.12, 0.02, 0xb9bcc2, 0, 1.36, 0.315);
      b.box('body', 0.3, 0.12, 0.02, 0xb9bcc2, 0, 1.18, 0.315);
      b.box('body', 0.012, 0.22, 0.012, 0x7e8592, 0.15, 1.58, 0.25);
      // tubi dallo zaino al petto
      b.limb('body', V(0.15, 1.2, 0.12), V(0.09, 1.16, -0.15), 0.018, 0.018, 0x7e8592, 6);
      b.limb('body', V(-0.15, 1.2, 0.12), V(-0.09, 1.16, -0.15), 0.018, 0.018, 0x3a6fd6, 6);
      // pannello di comandi sul petto con tre lucine
      b.box('body', 0.2, 0.11, 0.07, 0xc9cbcf, 0, 1.22, -0.16);
      b.box('glow', 0.03, 0.025, 0.012, 0xe23a2a, -0.05, 1.235, -0.198);
      b.box('glow', 0.03, 0.025, 0.012, 0x5fdc4a, 0.0, 1.235, -0.198);
      b.box('glow', 0.03, 0.025, 0.012, 0x3a9fe2, 0.05, 1.235, -0.198);
      // anelli alle ginocchia e suole spesse
      [-1, 1].forEach((side) => {
        const leg = side < 0 ? 'legL' : 'legR';
        b.cyl(leg, 0.076, 0.076, 0.045, 0x9a9ea6, side * 0.11, 0.52, -0.03, 10);
        b.box(leg, 0.14, 0.05, 0.27, 0x8a8e96, side * 0.11, 0.025, -0.045);
      });
      // bandiera italiana sulla spalla sinistra e toppa della missione
      b.box('body', 0.012, 0.05, 0.026, 0x2f8f46, -0.282, 1.42, -0.045);
      b.box('body', 0.012, 0.05, 0.026, 0xf2f2ee, -0.282, 1.42, -0.019);
      b.box('body', 0.012, 0.05, 0.026, 0xc7231d, -0.282, 1.42, 0.007);
      b.cyl('body', 0.035, 0.035, 0.012, 0xe28a2a, 0.11, 1.38, -0.125, 10, Math.PI / 2, 0);
      b.cyl('body', 0.02, 0.02, 0.014, 0x2f566b, 0.11, 1.38, -0.127, 10, Math.PI / 2, 0);
    },

    // Bobby l'esploratore: cappello a tesa larga, barba, camicia cachi, fazzoletto rosso,
    // binocolo, borsa a tracolla, zaino con sacco a pelo e gavetta
    explorer(b) {
      const o = {
        skin: 0xd9a77e, shirt: 0xb59f6b, sleeve: 0xb59f6b, forearm: 0xd9a77e, glove: 0xd9a77e,
        pants: 0x5f563a, legLower: 0x5f563a, boot: 0x4a3322, belt: 0x5a3a22,
      };
      body(b, o);
      // capelli, barba e baffi
      b.box('body', 0.215, 0.06, 0.2, 0x5b3a22, 0, HEAD.y + 0.07, 0.03);
      b.box('body', 0.17, 0.07, 0.06, 0x5b3a22, 0, HEAD.y - 0.065, -0.085);
      b.box('body', 0.08, 0.018, 0.02, 0x5b3a22, 0, HEAD.y - 0.03, -0.118);
      // cappello da esploratore: tesa larga, cupola con la piega, nastro scuro
      b.cyl('body', 0.25, 0.25, 0.018, 0x7a5a36, 0, HEAD.y + 0.095, 0, 14);
      b.cyl('body', 0.125, 0.14, 0.11, 0x7a5a36, 0, HEAD.y + 0.155, 0, 10);
      b.cyl('body', 0.142, 0.142, 0.03, 0x3b2a1a, 0, HEAD.y + 0.115, 0, 10);
      b.box('body', 0.03, 0.02, 0.24, 0x6b4e2e, 0, HEAD.y + 0.21, 0);
      // fazzoletto rosso al collo con il nodo davanti
      b.cyl('body', 0.075, 0.085, 0.05, 0x9b2b22, 0, 1.49, -0.005, 10);
      b.box('body', 0.07, 0.07, 0.012, 0x9b2b22, 0, 1.43, -0.125, 0, 0, Math.PI / 4);
      // taschini, tracolla in diagonale e borsa sul fianco
      b.box('body', 0.085, 0.08, 0.012, 0x9e8a5a, -0.1, 1.34, -0.112);
      b.box('body', 0.085, 0.08, 0.012, 0x9e8a5a, 0.1, 1.34, -0.112);
      b.box('body', 0.035, 0.56, 0.012, 0x5a3a22, 0.0, 1.25, -0.118, 0, 0, 0.75);
      b.box('body', 0.18, 0.15, 0.07, 0x6b4a2e, -0.2, 0.98, -0.03);
      // binocolo appeso al collo
      b.cyl('body', 0.025, 0.025, 0.07, 0x1d1f1c, -0.03, 1.2, -0.16, 8, Math.PI / 2, 0);
      b.cyl('body', 0.025, 0.025, 0.07, 0x1d1f1c, 0.03, 1.2, -0.16, 8, Math.PI / 2, 0);
      b.box('body', 0.012, 0.25, 0.01, 0x1d1f1c, -0.045, 1.33, -0.13, 0, 0, 0.2);
      // zaino con sacco a pelo e gavetta
      b.box('body', 0.32, 0.4, 0.16, 0x6b4a2e, 0, 1.26, 0.2);
      b.box('body', 0.26, 0.12, 0.02, 0x5a3a22, 0, 1.18, 0.29);
      b.cyl('body', 0.07, 0.07, 0.36, 0x3d5a3a, 0, 1.5, 0.2, 8, 0, Math.PI / 2);
      b.cyl('body', 0.035, 0.03, 0.06, 0x9a9ea6, 0.17, 1.1, 0.24, 8);
      // bussola alla cintura, toppe sulle ginocchia, lacci degli scarponi
      b.cyl('body', 0.03, 0.03, 0.012, 0xc9a23a, 0.1, 1.035, -0.12, 10, Math.PI / 2, 0);
      [-1, 1].forEach((side) => {
        const leg = side < 0 ? 'legL' : 'legR';
        b.box(leg, 0.12, 0.1, 0.03, 0x4a432c, side * 0.11, 0.52, -0.09);
        b.box(leg, 0.06, 0.06, 0.012, 0xb8a27a, side * 0.11, 0.14, -0.06);
      });
    },

    // Jackson: carnagione scura, barba corta, cappellino girato all'indietro, felpa bordeaux
    // col cappuccio, catenina d'oro, cuffie al collo, jeans strappati e scarpe da ginnastica bianche
    jackson(b) {
      const SKIN = 0x5c3a26;
      const HOOD = 0x8e2a2a;
      const HAIR = 0x120c09;
      const o = {
        skin: SKIN, shirt: HOOD, sleeve: HOOD, forearm: HOOD, glove: SKIN,
        pants: 0x34506e, legLower: 0x34506e, boot: 0xeeeae2, belt: 0x1d1d1d, noFace: true,
      };
      body(b, o);
      const hy = HEAD.y;
      // faccia: occhi col bianco (si vedono bene sulla pelle scura), sopracciglia, orecchie
      [-1, 1].forEach((s) => {
        b.box('body', 0.036, 0.02, 0.01, 0xf1ede4, s * 0.042, hy + 0.015, -0.106);
        b.box('body', 0.016, 0.018, 0.01, 0x140d09, s * 0.042, hy + 0.015, -0.111);
        b.box('body', 0.042, 0.011, 0.012, HAIR, s * 0.042, hy + 0.04, -0.106);
        b.box('body', 0.012, 0.035, 0.025, SKIN, s * 0.112, hy, 0);
      });
      b.box('body', 0.034, 0.04, 0.032, SKIN, 0, hy - 0.012, -0.116);          // naso
      b.box('body', 0.046, 0.012, 0.01, 0x3a1f17, 0, hy - 0.058, -0.102);      // bocca
      b.box('body', 0.07, 0.014, 0.014, HAIR, 0, hy - 0.044, -0.107);          // baffi
      b.box('body', 0.18, 0.045, 0.1, HAIR, 0, hy - 0.092, -0.05);             // barba corta
      // capelli rasati ai lati e cappellino girato all'indietro
      b.box('body', 0.222, 0.06, 0.13, HAIR, 0, hy + 0.045, 0.045);
      b.dome('body', 0.121, 0x1d1f26, 0, hy + 0.045, 0.004, 1, 0.78, 1.04);
      b.box('body', 0.15, 0.014, 0.1, 0x1d1f26, 0, hy + 0.052, 0.155, -0.12, 0, 0);
      b.box('body', 0.05, 0.022, 0.012, 0xc7231d, 0, hy + 0.06, -0.118);      // chiusura del cappellino
      // felpa: riga bianca, tasca a marsupio, lacci, cappuccio sulla schiena
      b.box('body', 0.4, 0.33, 0.27, HOOD, 0, 1.3, 0);
      b.box('body', 0.401, 0.035, 0.271, 0xe8e2d6, 0, 1.28, 0);
      b.box('body', 0.22, 0.09, 0.012, 0x7a2222, 0, 1.19, -0.138);
      [-1, 1].forEach((s) => b.box('body', 0.008, 0.09, 0.008, 0xeeeeee, s * 0.035, 1.42, -0.14));
      b.box('body', 0.26, 0.13, 0.11, 0x7a2222, 0, 1.49, 0.12);
      // catenina d'oro con il ciondolo
      [-1, 1].forEach((s) => b.box('body', 0.01, 0.11, 0.01, 0xd4af37, s * 0.038, 1.42, -0.141, 0, 0, -s * 0.5));
      b.box('body', 0.03, 0.035, 0.012, 0xd4af37, 0, 1.36, -0.143);
      // cuffie appoggiate al collo
      [-1, 1].forEach((s) => {
        b.box('body', 0.04, 0.07, 0.07, 0x18181b, s * 0.085, 1.5, -0.035);
        b.box('body', 0.012, 0.045, 0.045, 0xc7231d, s * 0.107, 1.5, -0.035);
      });
      // jeans strappati sulle ginocchia, scarpe bianche con suola e striscia
      [-1, 1].forEach((s) => {
        const leg = s < 0 ? 'legL' : 'legR';
        b.box(leg, 0.07, 0.05, 0.012, 0x9fb3c8, s * 0.11, 0.56, -0.1);
        b.box(leg, 0.126, 0.025, 0.256, 0xc7231d, s * 0.11, 0.0125, -0.045);
        b.box(leg, 0.127, 0.03, 0.12, HOOD, s * 0.11, 0.065, -0.07);
      });
    },

    // Superman: tuta blu, mantello e stivali rossi, pantaloncini rossi con cintura gialla,
    // stemma a rombo con la S sul petto, capelli neri col ricciolo
    superman(b) {
      const BLUE = 0x2350c4;
      const RED = 0xc8202a;
      const YEL = 0xf2c230;
      const SKIN = 0xe2b48f;
      const o = {
        skin: SKIN, shirt: BLUE, sleeve: BLUE, forearm: BLUE, glove: SKIN,
        pants: BLUE, legLower: BLUE, boot: RED, belt: YEL,
      };
      body(b, o);
      const hy = HEAD.y;
      // capelli
      b.box('body', 0.215, 0.06, 0.2, 0x15171c, 0, hy + 0.1, 0.015);
      b.box('body', 0.222, 0.1, 0.09, 0x15171c, 0, hy + 0.03, 0.075);
      b.box('body', 0.02, 0.045, 0.012, 0x15171c, 0.02, hy + 0.06, -0.104, 0, 0, 0.5);
      // stemma: rombo rosso, fondo giallo, S rossa (il personaggio guarda verso -Z:
      // la sua destra, x positiva, per chi lo guarda e' a sinistra)
      const ey = 1.36;
      const ez = FRONT(1.43) - 0.012;
      b.box('body', 0.105, 0.105, 0.01, RED, 0, ey, ez, 0, 0, Math.PI / 4);
      b.box('body', 0.082, 0.082, 0.01, YEL, 0, ey, ez - 0.004, 0, 0, Math.PI / 4);
      [[0, 0.025, 0.05, 0.012], [0, 0, 0.05, 0.012], [0, -0.025, 0.05, 0.012],
        [0.019, 0.0125, 0.012, 0.03], [-0.019, -0.0125, 0.012, 0.03]]
        .forEach((p) => b.box('body', p[2], p[3], 0.008, RED, p[0], ey + p[1], ez - 0.008));
      // pantaloncini rossi e fibbia
      b.box('body', 0.352, 0.12, 0.222, RED, 0, 0.94, 0);
      b.box('body', 0.05, 0.04, 0.012, 0xd9a520, 0, 1.035, -0.118);
      [-1, 1].forEach((s) => {
        const leg = s < 0 ? 'legL' : 'legR';
        b.limb(leg, V(s * 0.1, 0.93, 0), V(s * 0.102, 0.85, -0.006), 0.09, 0.088, RED, 7);   // orlo sulla coscia
        b.limb(leg, V(s * 0.11, 0.1, 0), V(s * 0.11, 0.36, -0.019), 0.058, 0.07, RED, 7);    // stivali alti
      });
      // mantello rosso attaccato alle spalle
      b.sheet('body', 0.4, 0.56, 0.86, 0.025, RED, 0, 1.07, 0.175, -0.12);
      [-1, 1].forEach((s) => b.box('body', 0.12, 0.035, 0.16, RED, s * 0.14, 1.5, 0.05));
    },

    // Batman: tuta grigia, maschera nera con le orecchie a punta e il mento scoperto,
    // pipistrello nero nell'ovale giallo, cintura gialla con le tasche, guanti con le pinne,
    // stivali e mantello neri
    batman(b) {
      const GREY = 0x4d5157;
      const BLACK = 0x15161a;
      const YEL = 0xd9b23a;
      const SKIN = 0xd9ab84;
      const o = {
        skin: SKIN, shirt: GREY, sleeve: GREY, forearm: BLACK, glove: BLACK,
        pants: GREY, legLower: BLACK, boot: BLACK, belt: YEL, head: BLACK, neck: BLACK, noFace: true,
      };
      body(b, o);
      const hy = HEAD.y;
      // mento scoperto, bocca, occhi bianchi a fessura, orecchie a punta
      b.box('body', 0.15, 0.06, 0.07, SKIN, 0, hy - 0.072, -0.07);
      b.box('body', 0.04, 0.008, 0.01, 0x6b3b2a, 0, hy - 0.075, -0.106);
      [-1, 1].forEach((s) => {
        b.box('glow', 0.036, 0.012, 0.01, 0xeef4ff, s * 0.042, hy + 0.02, -0.109, 0, 0, s * 0.18);
        b.cyl('body', 0.002, 0.024, 0.1, BLACK, s * 0.062, hy + 0.15, 0, 4, 0, -s * 0.12);
      });
      // stemma: ovale giallo con il pipistrello
      const ey = 1.37;
      const ez = FRONT(ey);
      b.ball('body', 0.07, YEL, 0, ey, ez - 0.002, 1.35, 0.72, 0.16, 1);
      b.box('body', 0.022, 0.045, 0.012, BLACK, 0, ey - 0.002, ez - 0.014);
      [-1, 1].forEach((s) => {
        b.box('body', 0.008, 0.014, 0.012, BLACK, s * 0.007, ey + 0.026, ez - 0.014);
        b.box('body', 0.075, 0.022, 0.012, BLACK, s * 0.045, ey + 0.008, ez - 0.014, 0, 0, s * 0.18);
        b.box('body', 0.04, 0.016, 0.012, BLACK, s * 0.05, ey - 0.012, ez - 0.014, 0, 0, -s * 0.35);
      });
      // cintura con le tasche
      [-0.15, -0.09, 0.09, 0.15].forEach((x) => b.box('body', 0.045, 0.05, 0.03, 0xb8932c, x, 1.03, -0.112));
      b.box('body', 0.055, 0.045, 0.014, 0xe6c24a, 0, 1.035, -0.118);
      // guanti lunghi con tre pinne sul lato esterno
      armPoints().forEach((a) => {
        const fdir = new THREE.Vector3().subVectors(a.wrist, a.elbow).normalize();
        const out = V(a.side, 0, 0);
        out.sub(fdir.clone().multiplyScalar(out.dot(fdir))).normalize();
        b.limb('body', a.elbow.clone().lerp(a.wrist, 0.3), a.wrist, 0.056, 0.05, BLACK, 7);
        [0.45, 0.6, 0.75].forEach((t) => {
          const base = a.elbow.clone().lerp(a.wrist, t).addScaledVector(out, 0.045);
          const tip = base.clone().addScaledVector(out, 0.035).addScaledVector(fdir, -0.02);
          b.limb('body', base, tip, 0.014, 0.002, BLACK, 4);
        });
      });
      // mantello nero con le punte in fondo e mantellina sulle spalle
      b.sheet('body', 0.46, 0.72, 1.0, 0.025, BLACK, 0, 1.0, 0.2, -0.16);
      [-0.27, -0.09, 0.09, 0.27].forEach((x) => {
        const g = new THREE.ConeGeometry(0.075, 0.09, 4);
        g.rotateY(Math.PI / 4);
        g.scale(1, 1, 0.16);
        b.shape('body', g, BLACK, x, 0.462, 0.285, Math.PI - 0.16, 0, 0);
      });
      [-1, 1].forEach((s) => b.box('body', 0.13, 0.04, 0.22, BLACK, s * 0.14, 1.505, 0.03));
    },

    // Spider-Man: tuta rossa e blu, ragnatela nera sul petto e sulla maschera,
    // grandi occhi bianchi, ragno nero davanti e ragno rosso sulla schiena
    spiderman(b) {
      const RED = 0xc4202a;
      const BLUE = 0x1f3f9a;
      const BLK = 0x101114;
      const o = {
        skin: RED, shirt: BLUE, sleeve: BLUE, shoulder: RED, forearm: RED, glove: RED,
        pants: BLUE, legLower: RED, boot: RED, belt: RED, head: RED, neck: RED, noFace: true,
      };
      body(b, o);
      const hy = HEAD.y;

      // un ragno: corpo, testa e otto zampe (k = grandezza)
      function spider(color, y, z, k) {
        b.ball('body', 0.018 * k, color, 0, y, z, 1, 1.5, 0.45, 0);
        b.ball('body', 0.011 * k, color, 0, y + 0.03 * k, z, 1, 1, 0.45, 0);
        [-1, 1].forEach((s) => {
          [0.75, 0.25, -0.25, -0.75].forEach((ang) => {
            const L = 0.05 * k;
            b.box('body', L, 0.006 * k, 0.006, color,
              s * (0.008 * k + Math.cos(ang) * L / 2), y + Math.sin(ang) * L / 2 + 0.004 * k, z, 0, 0, s * ang);
          });
        });
      }

      // petto rosso (largo sulle spalle, stretto in vita: i fianchi restano blu)
      const panelZ = FRONT(1.285) - 0.006;
      b.sheet('body', 0.36, 0.2, 0.42, 0.01, RED, 0, 1.285, panelZ, -0.07);
      // ragnatela sul petto: riga centrale e righe orizzontali
      b.box('body', 0.005, 0.4, 0.005, BLK, 0, 1.285, panelZ - 0.006, -0.07, 0, 0);
      [1.44, 1.36, 1.28, 1.2, 1.12].forEach((y) => {
        const w = (0.2 + 0.16 * (y - 1.075) / 0.42) / 2;
        [-1, 1].forEach((s) => b.box('body', w, 0.005, 0.005, BLK, s * w / 2, y, FRONT(y) - 0.012, 0, 0, s * 0.15));
      });
      spider(BLK, 1.38, FRONT(1.38) - 0.014, 1);
      spider(RED, 1.3, BACK(1.3) + 0.008, 2.2);
      // maschera: occhi bianchi bordati di nero, ragnatela con anelli e una riga dalla fronte al mento
      [-1, 1].forEach((s) => {
        b.box('body', 0.064, 0.046, 0.012, BLK, s * 0.046, hy + 0.012, -0.106, 0, -s * 0.35, s * 0.4);
        b.box('body', 0.052, 0.034, 0.01, 0xf4f4f0, s * 0.046, hy + 0.012, -0.111, 0, -s * 0.35, s * 0.4);
      });
      const ring = (r, y, rx, rz) =>
        b.shape('body', new THREE.CylinderGeometry(r, r, 0.006, 16, 1, true), BLK, 0, y, 0, rx, 0, rz);
      ring(0.072, hy + 0.1, 0, 0);
      ring(0.098, hy + 0.07, 0, 0);
      ring(0.112, hy - 0.04, 0, 0);
      ring(0.126, hy, 0, Math.PI / 2);
    },

    // Pirata: tricorno con teschio, bandana rossa, benda sull'occhio, barba nera con la treccia,
    // orecchino d'oro, giacca rossa coi bottoni d'oro, fascia rossa, gamba di legno, pappagallo
    pirate(b) {
      const SKIN = 0xd2a27c;
      const COAT = 0x6b1f1a;
      const GOLD = 0xd4af37;
      const BLACK = 0x17140f;
      const HAIR = 0x1c1612;
      const BOOT = 0x3b2516;
      const o = {
        skin: SKIN, shirt: 0xe9e2cf, sleeve: COAT, forearm: COAT, glove: SKIN,
        pants: 0x2b2722, legLower: 0x2b2722, boot: BOOT, belt: 0x9b2320, pegR: 0x8a6038,
      };
      body(b, o);
      const hy = HEAD.y;
      // benda sull'occhio sinistro con il laccio
      b.box('body', 0.045, 0.04, 0.012, BLACK, -0.04, hy + 0.015, -0.113);
      b.shape('body', new THREE.CylinderGeometry(0.119, 0.119, 0.01, 14, 1, true), BLACK, 0, hy + 0.03, 0, 0, 0, 0.4);
      // capelli lunghi, barba con la treccia, baffi, orecchino
      b.box('body', 0.2, 0.16, 0.06, HAIR, 0, hy - 0.03, 0.09);
      b.box('body', 0.16, 0.11, 0.06, HAIR, 0, hy - 0.1, -0.085);
      b.box('body', 0.03, 0.06, 0.03, HAIR, 0, hy - 0.18, -0.1);
      b.box('body', 0.036, 0.015, 0.036, 0x9b2320, 0, hy - 0.155, -0.1);
      b.box('body', 0.1, 0.022, 0.025, HAIR, 0, hy - 0.04, -0.112);
      b.shape('body', new THREE.TorusGeometry(0.016, 0.004, 4, 8), GOLD, 0.118, hy - 0.035, 0, 0, Math.PI / 2, 0);
      // bandana rossa sotto il cappello, con i lembi del nodo dietro
      b.dome('body', 0.123, 0x9b2320, 0, hy + 0.03, 0.005, 1, 0.85, 1.04);
      [-1, 1].forEach((s) => b.box('body', 0.03, 0.08, 0.012, 0x9b2320, s * 0.03, hy - 0.01, 0.13, 0.2, 0, s * 0.25));
      // tricorno: tesa a triangolo con la punta davanti, bordo d'oro, cupola, teschio e ossa
      b.shape('body', new THREE.CylinderGeometry(0.235, 0.215, 0.07, 3), BLACK, 0, hy + 0.115, 0.01, 0, Math.PI, 0);
      b.shape('body', new THREE.CylinderGeometry(0.24, 0.24, 0.012, 3), GOLD, 0, hy + 0.152, 0.01, 0, Math.PI, 0);
      b.cyl('body', 0.11, 0.125, 0.1, BLACK, 0, hy + 0.17, 0.01, 10);
      b.box('body', 0.04, 0.035, 0.01, 0xefeadb, 0, hy + 0.178, -0.122);
      b.box('body', 0.024, 0.014, 0.01, 0xefeadb, 0, hy + 0.155, -0.12);
      [-1, 1].forEach((s) => {
        b.box('body', 0.009, 0.009, 0.006, BLACK, s * 0.009, hy + 0.181, -0.128);
        b.box('body', 0.07, 0.01, 0.006, 0xefeadb, 0, hy + 0.168, -0.118, 0, 0, s * 0.6);
      });
      // giacca aperta: camicia bianca, bordi e bottoni d'oro, jabot, falde dietro
      b.box('body', 0.41, 0.35, 0.27, COAT, 0, 1.3, 0);
      b.box('body', 0.13, 0.35, 0.012, 0xe9e2cf, 0, 1.3, -0.137);
      b.box('body', 0.06, 0.08, 0.03, 0xf2eee2, 0, 1.43, -0.15);
      [-1, 1].forEach((s) => {
        b.box('body', 0.014, 0.35, 0.014, GOLD, s * 0.072, 1.3, -0.138);
        [1.4, 1.3, 1.2].forEach((y) => b.box('body', 0.02, 0.02, 0.012, GOLD, s * 0.11, y, -0.139));
      });
      b.box('body', 0.39, 0.4, 0.03, COAT, 0, 0.92, 0.14, -0.2, 0, 0);
      b.box('body', 0.392, 0.025, 0.032, GOLD, 0, 0.735, 0.178, -0.2, 0, 0);
      // fascia rossa (la cintura) con il nodo e la fibbia d'oro
      b.box('body', 0.06, 0.16, 0.02, 0x9b2320, -0.15, 0.95, -0.112, 0, 0, 0.15);
      b.box('body', 0.05, 0.045, 0.012, GOLD, 0, 1.035, -0.12);
      // stivale sinistro col risvolto (la destra e' di legno)
      b.limb('legL', V(-0.11, 0.1, 0), V(-0.11, 0.3, -0.015), 0.058, 0.066, BOOT, 7);
      b.cyl('legL', 0.075, 0.07, 0.08, BOOT, -0.11, 0.33, -0.017, 8);
      // pappagallo sulla spalla sinistra
      const px = -0.21;
      const py = 1.53;
      b.ball('body', 0.042, 0x2f9e3a, px, py, 0.02, 0.9, 1.3, 1, 0);
      b.ball('body', 0.03, 0x36b043, px, py + 0.07, 0.0, 1, 1, 1, 0);
      b.box('body', 0.02, 0.022, 0.03, 0xf2c230, px, py + 0.065, -0.035);
      b.box('body', 0.008, 0.008, 0.006, 0x111111, px - 0.026, py + 0.078, -0.01);
      b.box('body', 0.008, 0.008, 0.006, 0x111111, px + 0.026, py + 0.078, -0.01);
      b.box('body', 0.014, 0.06, 0.05, 0xc8202a, px - 0.038, py, 0.025);
      b.box('body', 0.03, 0.09, 0.016, 0x2a5fc4, px, py - 0.06, 0.07, 0.5, 0, 0);
    },

    // Scheletro: braccia e gambe sottili come ossa, gabbia toracica e bacino sul corpo scuro,
    // teschio con le orbite vuote e una lucina rossa negli occhi
    skeleton(b) {
      const BONE = 0xe6dfc8;
      const DARK = 0x1b1c1f;
      const o = {
        skin: BONE, shirt: DARK, sleeve: BONE, shoulder: BONE, forearm: BONE, glove: BONE,
        pants: BONE, legLower: BONE, boot: BONE, belt: DARK, pelvis: DARK, head: BONE, neck: BONE,
        noFace: true, limbR: 0.5,
      };
      body(b, o);
      const hy = HEAD.y;
      // teschio
      [-1, 1].forEach((s) => {
        b.box('body', 0.046, 0.042, 0.016, 0x0d0d0f, s * 0.042, hy + 0.012, -0.106);
        b.box('glow', 0.012, 0.012, 0.006, 0xff5a2a, s * 0.042, hy + 0.01, -0.116);
      });
      b.box('body', 0.022, 0.022, 0.014, 0x0d0d0f, 0, hy - 0.03, -0.108, 0, 0, Math.PI / 4);   // naso
      b.box('body', 0.085, 0.034, 0.03, BONE, 0, hy - 0.085, -0.075);                           // mandibola
      b.box('body', 0.08, 0.006, 0.012, 0x2a2622, 0, hy - 0.066, -0.1);                         // denti
      [-0.03, -0.01, 0.01, 0.03].forEach((x) => b.box('body', 0.004, 0.026, 0.012, 0x2a2622, x, hy - 0.066, -0.099));
      // costole: davanti, sui fianchi e dietro
      [1.44, 1.38, 1.32, 1.26, 1.2].forEach((y) => {
        const w = HALF_W(y) - 0.02;
        [-1, 1].forEach((s) => {
          b.box('body', w, 0.022, 0.014, BONE, s * (0.016 + w / 2), y, FRONT(y) - 0.007, 0, 0, -s * 0.12);
          b.box('body', 0.014, 0.022, 0.15, BONE, s * (HALF_W(y - 0.016) + 0.004), y - 0.016, 0.005);
          b.box('body', w * 0.85, 0.02, 0.014, BONE, s * (0.016 + w * 0.43), y - 0.01, BACK(y) + 0.007, 0, 0, -s * 0.1);
        });
      });
      b.box('body', 0.036, 0.3, 0.016, BONE, 0, 1.32, FRONT(1.32) - 0.008, -0.07, 0, 0);   // sterno
      for (let y = 1.1; y <= 1.49; y += 0.054) b.box('body', 0.044, 0.03, 0.02, BONE, 0, y, BACK(y) + 0.008);   // colonna
      [-1, 1].forEach((s) => b.box('body', 0.17, 0.022, 0.024, BONE, s * 0.1, 1.505, -0.06, 0, -s * 0.3, s * 0.08));  // clavicole
      // bacino
      [-1, 1].forEach((s) => b.box('body', 0.11, 0.075, 0.016, BONE, s * 0.085, 0.985, -0.111, 0, 0, -s * 0.4));
      b.box('body', 0.07, 0.03, 0.016, BONE, 0, 0.905, -0.111);
      b.box('body', 0.09, 0.11, 0.016, BONE, 0, 0.96, 0.111);
    },

    // Vampiro: pelle pallida, capelli neri all'indietro con la punta sulla fronte, occhi rossi,
    // canini, orecchie a punta, abito nero col panciotto rosso, medaglione, mantello col colletto alto
    vampire(b) {
      const PALE = 0xd9d6d0;
      const BLACK = 0x141418;
      const RED = 0x8e1219;
      const GOLD = 0xd4af37;
      const HAIR = 0x0e0e10;
      const o = {
        skin: PALE, shirt: BLACK, sleeve: BLACK, forearm: BLACK, glove: PALE,
        pants: BLACK, legLower: BLACK, boot: 0x0b0b0d, belt: BLACK, noFace: true,
      };
      body(b, o);
      const hy = HEAD.y;
      [-1, 1].forEach((s) => {
        b.box('body', 0.036, 0.02, 0.01, 0x2a0a0c, s * 0.042, hy + 0.015, -0.106);            // occhi
        b.box('glow', 0.015, 0.014, 0.008, 0xff2a2a, s * 0.042, hy + 0.015, -0.112);
        b.box('body', 0.046, 0.012, 0.012, HAIR, s * 0.042, hy + 0.042, -0.107, 0, 0, s * 0.25); // sopracciglia
        b.box('body', 0.008, 0.02, 0.008, 0xf6f4ee, s * 0.014, hy - 0.068, -0.101);           // canini
        b.cyl('body', 0.003, 0.022, 0.07, PALE, s * 0.113, hy + 0.02, 0.012, 4, 0, -s * 0.55);  // orecchie
      });
      b.box('body', 0.024, 0.042, 0.03, PALE, 0, hy - 0.01, -0.117);          // naso
      b.box('body', 0.05, 0.01, 0.01, 0x5a0a10, 0, hy - 0.057, -0.103);       // bocca
      b.box('body', 0.218, 0.06, 0.2, HAIR, 0, hy + 0.1, 0.02);
      b.box('body', 0.224, 0.14, 0.08, HAIR, 0, hy + 0.02, 0.075);
      b.box('body', 0.045, 0.045, 0.014, HAIR, 0, hy + 0.072, -0.1, 0, 0, Math.PI / 4);
      // abito: giacca, camicia bianca, panciotto rosso, medaglione con la pietra rossa
      b.box('body', 0.41, 0.34, 0.27, BLACK, 0, 1.3, 0);
      b.box('body', 0.12, 0.2, 0.012, 0xeceae4, 0, 1.39, -0.137);
      [-1, 1].forEach((s) => {
        b.box('body', 0.05, 0.2, 0.012, RED, s * 0.065, 1.27, -0.138);
        b.box('body', 0.01, 0.12, 0.01, GOLD, s * 0.042, 1.38, -0.142, 0, 0, -s * 0.55);
      });
      b.cyl('body', 0.036, 0.036, 0.012, GOLD, 0, 1.31, -0.146, 12, Math.PI / 2, 0);
      b.box('glow', 0.026, 0.026, 0.01, 0xff2030, 0, 1.31, -0.152, 0, 0, Math.PI / 4);
      // mantello nero con la fodera rossa e il colletto alto
      b.sheet('body', 0.5, 0.76, 1.0, 0.025, BLACK, 0, 1.0, 0.215, -0.18);
      b.sheet('body', 0.46, 0.7, 0.96, 0.012, RED, 0, 1.0, 0.195, -0.18);
      [-1, 1].forEach((s) => {
        b.box('body', 0.15, 0.2, 0.016, BLACK, s * 0.105, 1.6, 0.075, 0, s * 0.55, -s * 0.28);
        b.box('body', 0.13, 0.18, 0.01, RED, s * 0.099, 1.6, 0.065, 0, s * 0.55, -s * 0.28);
      });
    },

    // Fantasma: un lenzuolo bianco con gli occhi neri e la bocca a "O"; il lenzuolo scende
    // fino a terra e il pezzo sotto si muove con le gambe; lembi che pendono dalle braccia
    ghost(b) {
      const SHEET = 0xe6ecf4;
      const SHADE = 0xccd6e4;
      const DARK = 0x14161c;
      const o = {
        skin: SHEET, shirt: SHEET, sleeve: SHEET, forearm: SHEET, glove: SHADE,
        pants: SHEET, legLower: SHEET, boot: SHADE, belt: SHEET, head: SHEET, neck: SHEET, noFace: true,
      };
      body(b, o);
      const hy = HEAD.y;
      // testa e lenzuolo fino alle ginocchia, con l'orlo a onde
      b.ball('body', 0.152, SHEET, 0, hy + 0.01, 0, 1, 1.12, 1, 1);
      b.cyl('body', 0.19, 0.34, 1.0, SHEET, 0, 1.0, 0, 12);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const long = i % 2 === 0;
        b.box('body', 0.09, long ? 0.08 : 0.05, 0.02, SHEET,
          Math.sin(a) * 0.335, 0.5 - (long ? 0.035 : 0.02), Math.cos(a) * 0.335, 0, a, 0);
      }
      // faccia
      [-1, 1].forEach((s) => b.ball('body', 0.03, DARK, s * 0.052, hy + 0.035, -0.142, 0.85, 1.4, 0.4, 1));
      b.ball('body', 0.028, DARK, 0, hy - 0.05, -0.139, 1, 1.25, 0.4, 1);
      // parte bassa del lenzuolo: segue le gambe, cosi' sembra che svolazzi camminando
      [-1, 1].forEach((s) => {
        const leg = s < 0 ? 'legL' : 'legR';
        b.cyl(leg, 0.22, 0.25, 0.46, SHEET, s * 0.1, 0.3, -0.01, 10);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.3;
          const long = i % 2 === 0;
          b.box(leg, 0.08, long ? 0.065 : 0.04, 0.018, SHEET,
            s * 0.1 + Math.sin(a) * 0.245, 0.07 - (long ? 0.028 : 0.015), -0.01 + Math.cos(a) * 0.245, 0, a, 0);
        }
      });
      // lembi del lenzuolo che pendono sotto gli avambracci
      armPoints().forEach((a) => {
        const f = new THREE.Vector3().subVectors(a.wrist, a.elbow);
        const mid = a.elbow.clone().lerp(a.wrist, 0.5);
        b.box('body', 0.025, 0.13, f.length() * 0.85, SHEET, mid.x, mid.y - 0.075, mid.z, 0, Math.atan2(f.x, f.z), 0);
      });
    },
  };

  // ---------------------------------------------------------------
  // Mesh finali
  // ---------------------------------------------------------------
  let litMaterial = null;
  let glowMaterial = null;

  function makeMesh(data, material, offset) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(data.pos);
    if (offset) {
      for (let i = 0; i < pos.length; i += 3) {
        pos[i] -= offset.x; pos[i + 1] -= offset.y; pos[i + 2] -= offset.z;
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(data.nor), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(data.col), 3));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.userData.shared = true;          // condivisa tra i cloni: non va distrutta
    return mesh;
  }

  function build(name) {
    const outfit = OUTFITS[name];
    if (!outfit) throw new Error('Personaggio sconosciuto: ' + name);
    if (!litMaterial) {
      litMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
      glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    }

    const b = new Builder();
    outfit(b);

    const root = new THREE.Group();
    root.add(makeMesh(b.parts.body, litMaterial));
    if (b.parts.glow) root.add(makeMesh(b.parts.glow, glowMaterial));

    // Gambe: il gruppo sta nell'anca, cosi' ruotandolo la gamba oscilla
    [['legL', -1], ['legR', 1]].forEach(([part, side]) => {
      const pivot = V(side * HIP.x, HIP.y, 0);
      const leg = new THREE.Group();
      leg.name = part;
      leg.position.copy(pivot);
      leg.add(makeMesh(b.parts[part], litMaterial, pivot));
      root.add(leg);
    });

    const socket = new THREE.Object3D();
    socket.name = 'weaponSocket';
    socket.position.set(GRIP.x, GRIP.y + 0.035, GRIP.z + 0.01);
    root.add(socket);
    return root;
  }

  const Characters = { build: build, list: () => Object.keys(OUTFITS) };
  if (typeof window !== 'undefined') window.Characters = Characters;
})();
