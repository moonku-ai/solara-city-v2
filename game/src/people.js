// Pedestrians for Solara City: simple figures that stroll the sidewalks, chat
// in place, and flee from gunshots, speeding cars and police chases.
import * as THREE from '../vendor/three.module.min.js';
import { PITCH, GRID, CITY_HALF, ROAD_HALF } from './config.js';
import { clamp, pick, range, rangeInt, distance2D } from './util.js';
import { collideCircle } from './city.js';

const SHIRTS = [0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xd8c94a, 0x9a4ad8, 0xd88a4a, 0x4ad8c9, 0xe8e8e8, 0x333333, 0xd84a9a];
const PANTS = [0x2a3a4a, 0x4a3a2a, 0x333333, 0x5a5a6a];
const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0];

function buildPedMesh(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pick(rng, SHIRTS) });
  const pants = new THREE.MeshLambertMaterial({ color: pick(rng, PANTS) });
  const skin = new THREE.MeshLambertMaterial({ color: pick(rng, SKINS) });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), shirt);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.62;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshLambertMaterial({ color: pick(rng, [0x1a1a1a, 0x4a2a1a, 0x8a6a3a, 0x888888]) }));
  hair.position.y = 1.66;
  g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.22), pants);
  legL.position.set(-0.14, 0.33, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.16), shirt);
  armL.position.set(-0.36, 1.05, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.36;
  g.add(armR);
  g.userData = { legL, legR, armL, armR, body };
  return g;
}

export function createPeople(G) {
  const people = {
    list: [],
  };

  function randomSidewalkPoint() {
    const horizontal = G.rng() < 0.5;
    const line = rangeInt(G.rng, -GRID, GRID) * PITCH;
    const along = range(G.rng, -CITY_HALF + 20, CITY_HALF - 20);
    const side = G.rng() < 0.5 ? 1 : -1;
    const off = ROAD_HALF + 1.6 + G.rng() * 1.4;
    return {
      x: horizontal ? along : line + side * off,
      z: horizontal ? line + side * off : along,
    };
  }

  people.spawn = function spawn(x, z, fleeing) {
    const mesh = buildPedMesh(G.rng);
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    const ped = {
      mesh, x, z,
      heading: G.rng() * Math.PI * 2,
      speed: fleeing ? 5.5 : range(G.rng, 1, 1.8),
      state: fleeing ? 'flee' : 'walk',
      target: randomSidewalkPoint(),
      bob: G.rng() * 6,
      down: false,
      downTimer: 0,
    };
    people.list.push(ped);
    return ped;
  };

  people.spawnInitial = function spawnInitial(n) {
    for (let i = 0; i < n; i += 1) {
      const p = randomSidewalkPoint();
      people.spawn(p.x, p.z, false);
    }
  };

  /** A driver who just lost their car runs away on foot. */
  people.makeFleeingPed = function makeFleeingPed(x, z) {
    const ped = people.spawn(x, z, true);
    ped.target = { x: x + range(G.rng, -60, 60), z: z + range(G.rng, -60, 60) };
    return ped;
  };

  people.scareNear = function scareNear(x, z, radius) {
    for (const ped of people.list) {
      if (ped.down) continue;
      if (distance2D(ped.x, ped.z, x, z) < radius) {
        ped.state = 'flee';
        ped.speed = 5.5;
        const away = Math.atan2(ped.x - x, ped.z - z);
        ped.target = { x: ped.x + Math.sin(away) * 60, z: ped.z + Math.cos(away) * 60 };
      }
    }
  };

  people.update = function update(dt) {
    for (const ped of people.list) {
      if (ped.down) {
        ped.downTimer -= dt;
        ped.mesh.rotation.x = dampTo(ped.mesh.rotation.x, -Math.PI / 2, 8, dt);
        if (ped.downTimer <= 0) {
          ped.down = false;
          ped.mesh.rotation.x = 0;
          ped.state = 'flee';
          ped.speed = 5.5;
        }
        continue;
      }
      const dx = ped.target.x - ped.x;
      const dz = ped.target.z - ped.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2) {
        if (ped.state === 'flee') {
          ped.state = 'walk';
          ped.speed = range(G.rng, 1, 1.8);
        }
        ped.target = randomSidewalkPoint();
        continue;
      }
      const want = Math.atan2(dx, dz);
      let dh = want - ped.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      ped.heading += clamp(dh, -2.4 * dt, 2.4 * dt);
      ped.x += Math.sin(ped.heading) * ped.speed * dt;
      ped.z += Math.cos(ped.heading) * ped.speed * dt;
      const [nx, nz] = collideCircle(G.city, ped.x, ped.z, 0.4);
      ped.x = nx;
      ped.z = nz;
      // Walk cycle.
      ped.bob += dt * ped.speed * 4.5;
      const swing = Math.sin(ped.bob) * 0.45;
      const u = ped.mesh.userData;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.7;
      u.armR.rotation.x = swing * 0.7;
      u.body.position.y = 1.05 + Math.abs(Math.sin(ped.bob)) * 0.05;
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
      // Keep the crowd near the player: recycle far walkers.
      if (distance2D(ped.x, ped.z, G.player.x, G.player.z) > 260 && ped.state === 'walk') {
        const p = randomSidewalkPoint();
        const near = { x: G.player.x + range(G.rng, -120, 120), z: G.player.z + range(G.rng, -120, 120) };
        ped.x = clamp(near.x, -CITY_HALF, CITY_HALF);
        ped.z = clamp(near.z, -CITY_HALF, CITY_HALF);
        ped.target = p;
      }
    }
    // Player car hitting a pedestrian knocks them down and is a crime.
    const car = G.player.car;
    if (car && Math.abs(car.speed) > 3) {
      for (const ped of people.list) {
        if (ped.down) continue;
        if (distance2D(ped.x, ped.z, car.x, car.z) < 2.2) {
          ped.down = true;
          ped.downTimer = 6;
          ped.mesh.rotation.x = -Math.PI / 2;
          G.effects.dust(ped.x, 0.5, ped.z, 6);
          G.wanted.addWanted(1, 'You hit a pedestrian!');
          G.hud.toast('Pedestrian down! The police were called.');
          people.scareNear(ped.x, ped.z, 30);
        }
      }
    }
  };

  return people;
}

function dampTo(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}
