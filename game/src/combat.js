// Combat for Solara City: the player's pistol (hitscan from the crosshair),
// armed guards for the bank job, tracers, and damage to the player.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, distance2D, range } from './util.js';
import { explodeCar } from './vehicles.js';

export function createCombat(G) {
  const combat = {
    enemies: [], // mission guards
    fireTimer: 0,
    tracers: [],
  };

  // A small pool of tracer lines, reused for every shot.
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 });
  for (let i = 0; i < 6; i += 1) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    G.scene.add(line);
    combat.tracers.push({ line, life: 0 });
  }
  let tracerCursor = 0;

  function showTracer(from, to) {
    const t = combat.tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % combat.tracers.length;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.visible = true;
    t.line.material.opacity = 0.9;
    t.life = 0.09;
  }

  function raySphere(origin, dir, center, radius) {
    const ox = center.x - origin.x;
    const oy = center.y - origin.y;
    const oz = center.z - origin.z;
    const tca = ox * dir.x + oy * dir.y + oz * dir.z;
    if (tca < 0) return Infinity;
    const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
    const r2 = radius * radius;
    if (d2 > r2) return Infinity;
    return tca - Math.sqrt(r2 - d2);
  }

  function rayBuilding(origin, dir) {
    let best = Infinity;
    for (const c of G.city.colliders) {
      // Slab test against the building AABB (height 0..60 covers all).
      const minX = c.x - c.hx;
      const maxX = c.x + c.hx;
      const minZ = c.z - c.hz;
      const maxZ = c.z + c.hz;
      let tmin = 0;
      let tmax = 300;
      if (Math.abs(dir.x) < 1e-8) {
        if (origin.x < minX || origin.x > maxX) continue;
      } else {
        let t1 = (minX - origin.x) / dir.x;
        let t2 = (maxX - origin.x) / dir.x;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      if (Math.abs(dir.z) < 1e-8) {
        if (origin.z < minZ || origin.z > maxZ) continue;
      } else {
        let t1 = (minZ - origin.z) / dir.z;
        let t2 = (maxZ - origin.z) / dir.z;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      if (tmin < best && tmin > 0) best = tmin;
    }
    return best;
  }

  /** Fire the pistol from the camera through the crosshair. Returns what was hit. */
  combat.shoot = function shoot() {
    if (combat.fireTimer > 0) return null;
    combat.fireTimer = 0.22;
    const cam = G.camera;
    const origin = cam.position.clone();
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const muzzle = origin.clone().add(dir.clone().multiplyScalar(1.2));
    muzzle.y -= 0.25;
    G.audio.shot();
    G.effects.muzzle(muzzle.x, muzzle.y, muzzle.z);
    G.people.scareNear(G.player.x, G.player.z, 40);
    let best = 120;
    let hit = null;
    // Foot officers.
    for (const cop of G.wanted.cops) {
      if (cop.dead) continue;
      const t = raySphere(origin, dir, { x: cop.x, y: 1.1, z: cop.z }, 0.9);
      if (t < best) { best = t; hit = { type: 'cop', ref: cop }; }
    }
    // Mission guards.
    for (const e of combat.enemies) {
      if (e.dead) continue;
      const t = raySphere(origin, dir, { x: e.x, y: 1.1, z: e.z }, 0.9);
      if (t < best) { best = t; hit = { type: 'guard', ref: e }; }
    }
    // Pedestrians (a crime, and they go down).
    for (const ped of G.people.list) {
      if (ped.down) continue;
      const t = raySphere(origin, dir, { x: ped.x, y: 1.1, z: ped.z }, 0.8);
      if (t < best) { best = t; hit = { type: 'ped', ref: ped }; }
    }
    // Cars.
    for (const car of G.cars) {
      if (car.dead) continue;
      const t = raySphere(origin, dir, { x: car.x, y: 0.9, z: car.z }, 2.3);
      if (t < best) { best = t; hit = { type: 'car', ref: car }; }
    }
    const wall = rayBuilding(origin, dir);
    if (wall < best) {
      best = wall;
      hit = { type: 'wall', ref: null };
    }
    const end = origin.clone().add(dir.clone().multiplyScalar(Math.min(best, 120)));
    showTracer(muzzle, end);
    if (!hit) return null;
    if (hit.type === 'cop') {
      hit.ref.health -= 34;
      G.effects.sparks(hit.ref.x, 1.2, hit.ref.z, 5);
      if (hit.ref.health <= 0) G.wanted.copKilled(hit.ref);
    } else if (hit.type === 'guard') {
      hit.ref.health -= 34;
      G.effects.sparks(hit.ref.x, 1.2, hit.ref.z, 5);
      if (hit.ref.health <= 0) combat.killEnemy(hit.ref);
    } else if (hit.type === 'ped') {
      hit.ref.down = true;
      hit.ref.downTimer = 8;
      hit.ref.mesh.rotation.x = -Math.PI / 2;
      G.wanted.addWanted(2, 'You shot a pedestrian!');
    } else if (hit.type === 'car') {
      const car = hit.ref;
      car.health -= 20;
      G.effects.sparks(end.x, end.y, end.z, 6);
      if (car.health <= 0) explodeCar(G, car);
    } else if (hit.type === 'wall') {
      G.effects.sparks(end.x, end.y, end.z, 4);
    }
    return hit;
  };

  /** A guard for the bank job. */
  combat.spawnGuard = function spawnGuard(x, z) {
    const mesh = buildGuardMesh();
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    const e = {
      mesh, x, z, heading: 0, health: 100,
      shootTimer: range(G.rng, 0.8, 2), bob: G.rng() * 6,
      dead: false, deadTimer: 0, strafeDir: 1, strafeTimer: 0,
    };
    combat.enemies.push(e);
    return e;
  };

  function buildGuardMesh() {
    const g = new THREE.Group();
    const vest = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.36), vest);
    body.position.y = 1.05;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
    head.position.y = 1.62;
    g.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), vest);
    helmet.position.y = 1.66;
    g.add(helmet);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.22), vest);
    legL.position.set(-0.14, 0.33, 0);
    g.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.14;
    g.add(legR);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.7), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.3, 1.15, 0.3);
    g.add(gun);
    g.userData = { legL, legR };
    return g;
  }

  combat.killEnemy = function killEnemy(e) {
    e.dead = true;
    e.deadTimer = 6;
    e.mesh.rotation.x = -Math.PI / 2;
    e.mesh.position.y = 0.2;
    G.effects.sparks(e.x, 1, e.z, 10);
    G.player.cash += 50;
    G.hud.toast('Guard down! +$50');
    G.missions.onGuardKilled(G, e);
  };

  combat.copShoot = function copShoot(cop) {
    const from = { x: cop.x, y: 1.4, z: cop.z };
    const to = { x: G.player.x, y: G.player.car ? 1 : 1.2, z: G.player.z };
    showTracer(from, to);
    G.audio.shot();
    G.effects.muzzle(from.x, from.y, from.z);
    // Cops are bad shots at range; closer is deadlier.
    const dist = distance2D(cop.x, cop.z, G.player.x, G.player.z);
    const hitChance = clamp(0.55 - dist / 60, 0.12, 0.55);
    if (G.rng() < hitChance) {
      combat.damagePlayer(6 + Math.floor(G.rng() * 5), 'shot by police');
    }
  };

  combat.damagePlayer = function damagePlayer(amount, source) {
    if (G.player.health <= 0) return;
    G.player.health -= amount;
    G.player.lastDamageAt = G.time;
    G.hud.flashDamage();
    G.effects.addShake(0.2);
    if (G.player.health <= 0) {
      G.player.health = 0;
      G.wasted(source || 'taken down');
    }
  };

  combat.update = function update(dt) {
    combat.fireTimer = Math.max(0, combat.fireTimer - dt);
    for (const t of combat.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    for (let i = combat.enemies.length - 1; i >= 0; i -= 1) {
      const e = combat.enemies[i];
      if (e.dead) {
        e.deadTimer -= dt;
        if (e.deadTimer <= 0) {
          G.scene.remove(e.mesh);
          combat.enemies.splice(i, 1);
        }
        continue;
      }
      const dx = G.player.x - e.x;
      const dz = G.player.z - e.z;
      const dist = Math.hypot(dx, dz);
      e.heading = Math.atan2(dx, dz);
      e.mesh.rotation.y = e.heading;
      // Strafe slowly while the player is near; shoot when in range.
      e.strafeTimer -= dt;
      if (e.strafeTimer <= 0) {
        e.strafeTimer = range(G.rng, 1.5, 3);
        e.strafeDir = G.rng() < 0.5 ? -1 : 1;
      }
      if (dist < 34 && dist > 6) {
        e.x += Math.cos(e.heading) * e.strafeDir * 1.2 * dt;
        e.z -= Math.sin(e.heading) * e.strafeDir * 1.2 * dt;
        e.mesh.position.set(e.x, 0, e.z);
      }
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && dist < 38) {
        e.shootTimer = range(G.rng, 1.1, 1.9);
        const from = { x: e.x, y: 1.4, z: e.z };
        const to = { x: G.player.x, y: G.player.car ? 1 : 1.2, z: G.player.z };
        showTracer(from, to);
        G.audio.shot();
        G.effects.muzzle(from.x, from.y, from.z);
        if (G.rng() < clamp(0.5 - dist / 70, 0.1, 0.5)) {
          combat.damagePlayer(5 + Math.floor(G.rng() * 5), 'shot by a guard');
        }
      }
    }
  };

  return combat;
}
