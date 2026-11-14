// DOOMSDAY - combat.js
// Sistema di sparo, danni, eliminazioni, respawn.
// Dipendenze: Three.js, CONFIG, Player, Render, MAP

const projectiles = [];

function fireWeapon() {
  const p = Player.get();
  const weapon = CONFIG.WEAPONS[p.currentWeapon];

  // Controllo caricatorio
  if (p.magazine <= 0) return false;

  p.magazine--;
  return true;
}

function updatePlayerMovement(dt) {
  if (!Render.yawPivot()) return;

  player.isRunning = Input.isRunning();

  const move = Input.getMove();
  const speed = player.isRunning ? CONFIG.MOVEMENT.RUN_SPEED : CONFIG.MOVEMENT.WALK_SPEED;
  const vx = move.x * speed;
  const vz = move.z * speed;

  if (player.onGround) {
    player.velocity.x = vx;
    player.velocity.z = vz;
  } else {
    const k = CONFIG.MOVEMENT.AIR_CONTROL;
    player.velocity.x += (vx - player.velocity.x) * k;
    player.velocity.z += (vz - player.velocity.z) * k;
  }

  player.velocity.y -= CONFIG.MOVEMENT.GRAVITY * dt;

  if (Input.isJumping() && player.onGround) {
    player.velocity.y = CONFIG.MOVEMENT.JUMP_FORCE;
    player.onGround = false;
  }

  window.collision.move(player, dt);

  const half = (MAP.SIZE || ARENA.SIZE) / 2 - 0.5;
  player.position.x = Math.max(-half, Math.min(half, player.position.x));
  player.position.z = Math.max(-half, Math.min(half, player.position.z));

  updatePlayerCamera();
  checkPickups();
}

function checkPickups() {
  const pickupMeshes = Arena.getPickups();
  const pickupMeshes = Arena.getPickups();

  pickupMeshes.forEach((mesh) => {
    if (mesh.userData.taken) return;

    const d = p.distanceTo(mesh.position);
    if (d < 1.5) {
      const type = mesh.userData.type;
      if (type === 'health') {
        if (player.health < 100) {
          player.health = Math.min(100, player.health + 25);
          mesh.userData.taken = true;
          mesh.visible = false;
        }
      } else if (type === 'ammo') {
        player.ammo += 30;
        mesh.userData.taken = true;
        mesh.visible = false;
      }
    }
  });
}

function reload() {
  const weapon = CONFIG.WEAPONS[player.currentWeapon];
  const needed = weapon.magazine - player.magazine;
  const taken = Math.min(needed, player.ammo);
  player.magazine += taken;
  player.ammo -= taken;
}

function selectWeapon(index) {
  const names = Object.keys(CONFIG.WEAPONS);
  if (index >= 0 && index < names.length) {
    player.currentWeapon = names[index];
    weapon.magazine = Math.min(weapon.magazine, CONFIG.WEAPONS[names[index]].magazine);
  }
}

shootProjectile() {
  const p = Player.get();
  const yaw = Render.yawPivot();
  const pitch = Render.pitchPivot();

  if (!yaw || !pitch) return;

  const weapon = CONFIG.WEAPONS[p.currentWeapon];
  const shootRate = 1000 / weapon.fireRate; // ms

  const now = Date.now();
  if (!lastShotTime || now - lastShotTime >= shootRate) {
    lastShotTime = now;

    // Calcola direzione sparo
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(pitch.rotation);
    dir.applyEuler(yaw.rotation);

    // Crea proiettile
    const geo = new THREE.SphereGeometry(0.03, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const proj = new THREE.Mesh(geo, mat);

    // Posiziona un punto più in alto rispetto agli occhi
    proj.position.copy(p.position).add(new THREE.Vector3(0, 0.3, 0));

    proj.userData = {
      velocity: dir.multiplyScalar(80), // velocità progetto
      damage: weapon.damage,
      life: 2.0, // 2 secondi vita
    };

    Render.addToScene(proj);
    projectiles.push(proj);
  }
}

updateProjectiles(dt) {
  const p = player.position;
  const pRadius = 0.3;

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];
    proj.position.add(proj.userData.velocity.clone().multiplyScalar(dt));

    // Decrementa vita
    proj.userData.life -= dt;
    if (proj.userData.life <= 0) {
      Render.removeFromScene(proj);
      projectiles.splice(i, 1);
      continue;
    }

    // Collisione con scatole
    for (const box of MAP.boxes) {
      if (box.solid === false) continue;

      const dx = Math.abs(proj.position.x - box.x);
      const dz = Math.abs(proj.position.z - box.z);
      if (dx > box.w / 2 + 0.03 || dz > box.d / 2 + 0.03) continue;

      const y0 = box.y || 0;
      if (proj.position.y + 0.03 < y0 || proj.position.y - 0.03 > y0 + box.h) continue;

      // Colpito scatola
      Render.removeFromScene(proj);
      projectiles.splice(i, 1);
      break;
    }
  }
}

function takeDamage(amount) {
  player.health -= amount;
  if (player.health <= 0) {
    player.health = 0;
    player.deaths++;
    player.kills = Math.max(0, player.kills - 1); // Decrementa uccisioni
    endGame();
    spawnPlayer(spawnPoints[Math.floor(Math.random() * spawnPoints.length)].x,
                spawnPoints[Math.floor(Math.random() * spawnPoints.length)].y, 0);
    return true;
  }
  return false;
}

// Spawn grid (dopo server multiplayer)
let spawnPoints = [
  [-25, -13], [25, -13], [-25, 13], [25, 13],
  [0, -14], [0, 25], [-12, 24], [13, -26],
].map((p) => ({ x: p[0], y: 0, z: p[1], rot: Math.atan2(p[0], p[1]) }));

let lastShotTime = 0;

const Combat = {
  fireWeapon,
  updateProjectiles,
  takeDamage,
};

if (typeof window !== 'undefined') {
  window.Combat = Combat;
}