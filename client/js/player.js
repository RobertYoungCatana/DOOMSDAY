// DOOMSDAY - player.js
// Movimento FPS e logica giocatore (armi, pickup, stato, combat).
// Dipendenze: Three.js, CONFIG, Render, Input, collision, MAP, Arena

const projectiles = [];
let lastShotTime = 0;

const player = {
  id: '',
  position: new THREE.Vector3(0, 0, 0),
  velocity: new THREE.Vector3(0, 0, 0),
  onGround: false,
  isRunning: false,
  ammo: CONFIG.GAME.STARTING_AMMO,
  magazine: 0,
  health: CONFIG.GAME.STARTING_LIVES,
  kills: 0,
  deaths: 0,
  currentWeapon: 'pistol',
};

// Sistema sparo
function fireWeapon() {
  const p = get();
  const weapon = CONFIG.WEAPONS[p.currentWeapon];

  if (p.magazine <= 0) return false;

  p.magazine--;
  lastShotTime = Date.now();
  return true;
}

function updateProjectiles(dt) {
  const p = get();

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];
    proj.position.add(proj.userData.velocity.clone().multiplyScalar(dt));

    proj.userData.life -= dt;
    if (proj.userData.life <= 0) {
      Render.removeFromScene(proj);
      projectiles.splice(i, 1);
      continue;
    }

    // Collisione proiettile vs scatole
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
  get().health -= amount;
  const p = get();
  if (p.health <= 0) {
    p.health = 0;
    p.deaths++;
    p.kills = Math.max(0, p.kills - 1);

    // Delay respawn
    const spawns = MAP.spawnPoints;
    const spawn = spawns[Math.floor(Math.random() * spawns.length)];

    setTimeout(() => {
      spawnPlayer(spawn.x, spawn.z, spawn.y || 0);
      get().health = CONFIG.GAME.STARTING_LIVES;
      get().ammo = CONFIG.GAME.STARTING_AMMO;
      const weapon = CONFIG.WEAPONS[p.currentWeapon];
      get().magazine = weapon.magazine;
    }, CONFIG.GAME.RESPAWN_TIME * 1000);

    return true; // died
  }
  return false;
}

// Movimento FPS
function spawnPlayer(x, z, y = 0) {
  get().position.set(x, y, z);
  get().velocity.set(0, 0, 0);
  get().onGround = false;
  get().health = CONFIG.GAME.STARTING_LIVES;
  get().ammo = CONFIG.GAME.STARTING_AMMO;
  const weapon = CONFIG.WEAPONS[get().currentWeapon];
  get().magazine = weapon.magazine;
  updatePlayerCamera();
}

function updatePlayerCamera() {
  const yaw = Render.yawPivot();
  if (yaw) {
    yaw.position.set(
      get().position.x,
      get().position.y + CONFIG.CAMERA.HEIGHT,
      get().position.z
    );
  }
}

function updatePlayerMovement(dt) {
  if (!Render.yawPivot()) return;

  get().isRunning = Input.isRunning();

  const move = Input.getMove();
  const speed = get().isRunning ? CONFIG.MOVEMENT.RUN_SPEED : CONFIG.MOVEMENT.WALK_SPEED;
  const vx = move.x * speed;
  const vz = move.z * speed;

  if (get().onGround) {
    get().velocity.x = vx;
    get().velocity.z = vz;
  } else {
    const k = CONFIG.MOVEMENT.AIR_CONTROL;
    get().velocity.x += (vx - get().velocity.x) * k;
    get().velocity.z += (vz - get().velocity.z) * k;
  }

  get().velocity.y -= CONFIG.MOVEMENT.GRAVITY * dt;

  if (Input.isJumping() && get().onGround) {
    get().velocity.y = CONFIG.MOVEMENT.JUMP_FORCE;
    get().onGround = false;
  }

  window.collision.move(get(), dt);

  const half = (MAP.SIZE || ARENA.SIZE) / 2 - 0.5;
  get().position.x = Math.max(-half, Math.min(half, get().position.x));
  get().position.z = Math.max(-half, Math.min(half, get().position.z));

  updatePlayerCamera();
  checkPickups();
}

function checkPickups() {
  const pickupMeshes = Arena.getPickups();

  pickupMeshes.forEach((mesh) => {
    if (mesh.userData.taken) return;

    const d = get().position.distanceTo(mesh.position);
    if (d < 1.5) {
      const type = mesh.userData.type;
      if (type === 'health') {
        if (get().health < 100) {
          get().health = Math.min(100, get().health + 25);
          mesh.userData.taken = true;
          mesh.visible = false;
        }
      } else if (type === 'ammo') {
        get().ammo += 30;
        mesh.userData.taken = true;
        mesh.visible = false;
      }
    }
  });
}

function reload() {
  const weapon = CONFIG.WEAPONS[get().currentWeapon];
  const needed = weapon.magazine - get().magazine;
  const taken = Math.min(needed, get().ammo);
  get().magazine += taken;
  get().ammo -= taken;
}

function selectWeapon(index) {
  const names = Object.keys(CONFIG.WEAPONS);
  if (index >= 0 && index < names.length) {
    get().currentWeapon = names[index];
    const weapon = CONFIG.WEAPONS[names[index]];
    get().magazine = Math.min(get().magazine, weapon.magazine);
  }
}

// Play single-frame weapon fire
function shootProjectile() {
  const p = get();
  const weapon = CONFIG.WEAPONS[p.currentWeapon];
  const shootRate = 1000 / weapon.fireRate;

  const now = Date.now();
  if (!lastShotTime || now - lastShotTime >= shootRate) {
    lastShotTime = now;

    const yaw = Render.yawPivot();
    const pitch = Render.pitchPivot();
    if (!yaw || !pitch) return;

    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(pitch.rotation);
    dir.applyEuler(yaw.rotation);

    const geo = new THREE.SphereGeometry(0.03, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const proj = new THREE.Mesh(geo, mat);

    proj.position.copy(p.position).add(new THREE.Vector3(0, 0.3, 0));

    proj.userData = {
      velocity: dir.multiplyScalar(80),
      damage: weapon.damage,
      life: 2.0,
    };

    Render.addToScene(proj);
    projectiles.push(proj);
  }
}

// Player object
const Player = {
  get: () => player,
  spawn: spawnPlayer,
  update: updatePlayerMovement,
  fireWeapon,
  updateProjectiles,
  takeDamage,
  reload,
  selectWeapon,
  resetKills: () => { player.kills = 0; player.deaths = 0; },
};

if (typeof window !== 'undefined') {
  window.Player = Player;
}