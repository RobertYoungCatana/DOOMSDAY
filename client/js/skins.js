// DOOMSDAY - skins.js
// Personaggi (skin) dei giocatori: elenco in CONFIG.SKINS.
// Due tipi: modelli GLTF scaricati (assets/skins/) e personaggi low-poly fatti a codice
// (characters.js, quelli con "builder").
// - Carica ogni modello GLTF una sola volta e lo rende alto come un giocatore (piedi a terra).
// - I modelli arrivano a braccia aperte e senza scheletro: qui le braccia si piegano in avanti
//   (posa "arma in pugno") e nella mano destra si mette un punto di aggancio per l'arma
//   (weaponSocket). L'arma vera la aggiunge Models.equip().
// - createModel(id) restituisce SUBITO un gruppo vuoto: il modello ci viene aggiunto appena
//   e' pronto. Se il caricamento fallisce si usa il modello a scatole (fallback).
// - Ricorda la skin scelta nel browser (localStorage).
// Per aggiungere una skin: metti la cartella in assets/skins/ e aggiungi una riga in CONFIG.SKINS.
// Dipendenze: Three.js + GLTFLoader (CDN), CONFIG.

(function () {
  'use strict';

  const STORAGE_KEY = 'doomsday_skin';
  const PLAYER_HEIGHT = 1.8;            // stessa altezza del corpo usato per i colpi
  const templates = {};                 // id -> Promise<THREE.Object3D>
  let loader = null;

  function list() { return (CONFIG.SKINS || []).slice(); }

  function get(id) {
    const all = list();
    return all.find((s) => s.id === id) || all[0] || null;
  }

  function isValid(id) { return list().some((s) => s.id === id); }

  function selected() {
    let id = null;
    try { id = localStorage.getItem(STORAGE_KEY); } catch (e) { /* non disponibile */ }
    return isValid(id) ? id : (get() ? get().id : null);
  }

  function select(id) {
    if (!isValid(id)) return;
    try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* pazienza */ }
  }

  // Materiali piu' leggeri (Lambert, come il resto del gioco) che tengono colori e texture
  function toGameMaterial(mat) {
    const m = new THREE.MeshLambertMaterial({
      color: mat.color ? mat.color.clone() : 0xffffff,
      map: mat.map || null,
      emissive: mat.emissive ? mat.emissive.clone() : 0x000000,
      emissiveMap: mat.emissiveMap || null,
      transparent: !!mat.transparent,
      alphaTest: mat.alphaTest || 0,
      side: mat.side,
    });
    m.name = mat.name;
    return m;
  }

  // ---------------------------------------------------------------
  // Posa "arma in pugno"
  // ---------------------------------------------------------------
  function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  // Porta tutte le mesh nello spazio del personaggio (alto 1.8, piedi a y = 0, guarda verso -Z)
  function bakeMeshes(root) {
    root.updateMatrixWorld(true);
    const out = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      if (o.matrixWorld.determinant() < 0 && g.index) {      // specchiato: rigira i triangoli
        const idx = g.index.array;
        for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      }
      out.push({ geometry: g, material: o.material });
    });
    return out;
  }

  // Trova spalla e mano di un braccio (side = 1 destra, -1 sinistra) guardando i vertici.
  // La spalla e' dove, andando verso l'esterno, il corpo smette di arrivare fino a terra.
  function findArm(points, side) {
    const H = PLAYER_HEIGHT;
    let shoulder = null;
    for (let x = 0.05; x < 0.7 && !shoulder; x += 0.02) {
      let n = 0, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < points.length; i += 3) {
        const px = points[i] * side;
        if (px < x || px >= x + 0.02) continue;
        const y = points[i + 1], z = points[i + 2];
        n++;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        if (z < z0) z0 = z;
        if (z > z1) z1 = z;
      }
      if (n > 3 && y0 > H * 0.6) shoulder = new THREE.Vector3((x - 0.02) * side, (y0 + y1) / 2, (z0 + z1) / 2);
    }
    if (!shoulder) return null;

    // Punta della mano: il vertice piu' esterno sopra i fianchi
    const tip = new THREE.Vector3();
    let best = -Infinity;
    for (let i = 0; i < points.length; i += 3) {
      if (points[i] * side > best && points[i + 1] > H * 0.45) {
        best = points[i] * side;
        tip.set(points[i], points[i + 1], points[i + 2]);
      }
    }
    const axis = tip.clone().sub(shoulder).normalize();

    // Lunghezza del braccio e centro della mano (gli ultimi 10 cm lungo il braccio)
    const p = new THREE.Vector3();
    const arm = [];
    let len = 0;
    for (let i = 0; i < points.length; i += 3) {
      p.set(points[i], points[i + 1], points[i + 2]).sub(shoulder);
      const t = p.dot(axis);
      if (t <= 0 || p.lengthSq() - t * t > 0.04) continue;     // fuori dal braccio
      arm.push(t, i);
      if (t > len) len = t;
    }
    const hand = new THREE.Vector3();
    let count = 0;
    for (let k = 0; k < arm.length; k += 2) {
      if (arm[k] < len - 0.1) continue;
      const i = arm[k + 1];
      hand.x += points[i]; hand.y += points[i + 1]; hand.z += points[i + 2];
      count++;
    }
    if (!count) return null;
    hand.divideScalar(count);
    return { shoulder: shoulder, hand: hand, dir: hand.clone().sub(shoulder).normalize(), length: hand.distanceTo(shoulder) };
  }

  // Ruota i vertici del braccio attorno alla spalla; vicino alla spalla la rotazione sfuma
  function bendArm(meshes, arm, side, rotation) {
    const identity = new THREE.Quaternion();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    const rel = new THREE.Vector3();
    const sx = Math.abs(arm.shoulder.x);
    meshes.forEach((m) => {
      const pos = m.geometry.attributes.position;
      const nor = m.geometry.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (v.x * side <= 0) continue;
        rel.copy(v).sub(arm.shoulder);
        const t = rel.dot(arm.dir);
        const perp = Math.sqrt(Math.max(0, rel.lengthSq() - t * t));
        const w = smoothstep(-0.02, 0.08, t) *
          smoothstep(sx - 0.03, sx + 0.04, Math.abs(v.x)) *
          (1 - smoothstep(0.16, 0.24, perp)) *
          smoothstep(PLAYER_HEIGHT * 0.45, PLAYER_HEIGHT * 0.52, v.y);
        if (w <= 0) continue;
        q.copy(identity).slerp(rotation, w);
        rel.applyQuaternion(q);
        pos.setXYZ(i, arm.shoulder.x + rel.x, arm.shoulder.y + rel.y, arm.shoulder.z + rel.z);
        if (nor) {
          n.fromBufferAttribute(nor, i).applyQuaternion(q);
          nor.setXYZ(i, n.x, n.y, n.z);
        }
      }
      pos.needsUpdate = true;
      if (nor) nor.needsUpdate = true;
    });
  }

  // Modello finale: braccia in avanti, mano destra sull'impugnatura, sinistra a sostenere l'arma
  function buildArmed(normalized) {
    const meshes = bakeMeshes(normalized);
    const points = [];
    meshes.forEach((m) => {
      const a = m.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i++) points.push(a[i]);
    });

    const right = findArm(points, 1);
    const left = findArm(points, -1);
    const socket = new THREE.Object3D();
    socket.name = 'weaponSocket';
    socket.position.set(0.12, 1.15, -0.4);       // se le braccia non si trovano

    if (right) {
      const s = right.shoulder;
      const grip = new THREE.Vector3(s.x * 0.45, s.y - 0.24, s.z - 0.46);
      const rotR = new THREE.Quaternion().setFromUnitVectors(right.dir, grip.sub(s).normalize());
      bendArm(meshes, right, 1, rotR);
      const hand = right.hand.clone().sub(s).applyQuaternion(rotR).add(s);
      socket.position.copy(hand).add(new THREE.Vector3(0, 0.03, 0));
      if (left) {
        const support = hand.clone().add(new THREE.Vector3(-0.07, 0.03, -0.13));
        const rotL = new THREE.Quaternion().setFromUnitVectors(left.dir, support.sub(left.shoulder).normalize());
        bendArm(meshes, left, -1, rotL);
      }
    }

    const armed = new THREE.Group();
    meshes.forEach((m) => {
      m.geometry.computeBoundingSphere();
      m.geometry.computeBoundingBox();
      const mesh = new THREE.Mesh(m.geometry, m.material);
      mesh.castShadow = true;
      mesh.userData.shared = true;                // geometrie e materiali condivisi: non distruggerli
      armed.add(mesh);
    });
    armed.add(socket);
    return armed;
  }

  // ---------------------------------------------------------------
  // Caricamento
  // ---------------------------------------------------------------
  // Carica (una volta sola) e normalizza il modello: alto PLAYER_HEIGHT, centrato, piedi a y = 0
  function load(id) {
    const skin = get(id);
    if (!skin) return Promise.reject(new Error('Nessuna skin'));
    if (templates[skin.id]) return templates[skin.id];

    // Personaggio fatto a codice: e' gia' in posa con l'arma, si costruisce subito
    if (skin.builder) {
      templates[skin.id] = new Promise((resolve, reject) => {
        try {
          if (!window.Characters) throw new Error('characters.js non caricato');
          resolve(Characters.build(skin.builder));
        } catch (e) { reject(e); }
      });
      return templates[skin.id];
    }

    templates[skin.id] = new Promise((resolve, reject) => {
      if (!THREE.GLTFLoader) { reject(new Error('GLTFLoader non disponibile')); return; }
      if (!loader) loader = new THREE.GLTFLoader();
      loader.load(skin.file, (gltf) => {
        const model = gltf.scene;
        model.traverse((o) => {
          if (!o.isMesh) return;
          o.material = Array.isArray(o.material) ? o.material.map(toGameMaterial) : toGameMaterial(o.material);
        });

        // Prima la rotazione (cosi' la misura e' quella giusta), poi scala e posizione
        const turn = new THREE.Group();
        turn.rotation.y = skin.rotationY || 0;
        turn.add(model);
        turn.updateMatrixWorld(true);
        let box = new THREE.Box3().setFromObject(turn);
        const size = box.getSize(new THREE.Vector3());
        const scale = (skin.height || PLAYER_HEIGHT) / (size.y || 1);
        turn.scale.setScalar(scale);
        turn.updateMatrixWorld(true);
        box = new THREE.Box3().setFromObject(turn);
        const center = box.getCenter(new THREE.Vector3());
        turn.position.set(-center.x, -box.min.y, -center.z);

        const root = new THREE.Group();
        root.add(turn);
        resolve(buildArmed(root));
      }, undefined, reject);
    });
    return templates[skin.id];
  }

  // Gruppo pronto da mettere in scena. fallback() = modello da usare se il caricamento fallisce
  function createModel(id, fallback) {
    const group = new THREE.Group();
    load(id).then((tpl) => {
      group.add(tpl.clone());
    }).catch((err) => {
      console.warn('Skin non caricata (' + id + '):', err && err.message ? err.message : err);
      if (fallback) group.add(fallback());
    });
    return group;
  }

  // Precarica tutte le skin (cosi' in partita compaiono subito)
  function preloadAll() {
    list().forEach((s) => { load(s.id).catch(() => {}); });
  }

  const Skins = {
    list: list,
    get: get,
    isValid: isValid,
    selected: selected,
    select: select,
    load: load,
    createModel: createModel,
    preloadAll: preloadAll,
  };

  if (typeof window !== 'undefined') window.Skins = Skins;
})();
