// The wanted system for Solara City: stars 0-5, police cars that chase and ram,
// foot officers who shoot at high heat, and getting BUSTED.
import * as THREE from '../vendor/three.module.min.js';
import { WANTED } from './config.js';
import { clamp, damp, angleDelta, distance2D, range } from './util.js';
import { makeCar, explodeCar } from './vehicles.js';
import { collideCircle, randomRoadPoint } from './city.js';

export function createWanted(G) {
  const wanted = {
    stars: 0,
    decayTimer: 0,
    bustedTimer: 0,
    policeCars: [],
    cops: [],
    crimeCooldown: 0,
  };

  wanted.addWanted = function addWanted(n, reason) {
    n = Number(n) || 0;
    if (n <= 0) return;
    const before = wanted.stars;
    wanted.stars = clamp(wanted.stars + n, 0, 5);
    wanted.decayTimer = WANTED.decaySeconds;
    wanted.crimeCooldown = 4;
    if (wanted.stars > before && reason) G.hud.toast(reason + ' Wanted level ' + wanted.stars + '!');
    G.hud.flashWanted();
  };

  function spawnPoliceCar() {
    const p = randomRoadPoint(G.rng, G.player.x, G.player.z, 90);
    const car = makeCar(G, p.x, p.z, p.heading, { kind: 'police', police: true, color: 0xe8e8e8 });
    car.targetSpeed = 30;
    wanted.policeCars.push(car);
    return car;
  }

  function spawnCop() {
    const a = G.rng() * Math.PI * 2;
    const x = G.player.x + Math.sin(a) * 25;
    const z = G.player.z + Math.cos(a) * 25;
    const mesh = buildCopMesh();
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    const cop = {
      mesh, x, z, heading: a,
      speed: 0, health: 60, shootTimer: range(G.rng, 0.5, 1.5),
      bob: G.rng() * 6, dead: false, deadTimer: 0,
    };
    wanted.cops.push(cop);
    return cop;
  }

  function buildCopMesh() {
    const g = new THREE.Group();
    const navy = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.34), navy);
    body.position.y = 1.05;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
    head.position.y = 1.62;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.1, 10), navy);
    cap.position.y = 1.78;
    g.add(cap);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.22), navy);
    legL.position.set(-0.14, 0.33, 0);
    g.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.14;
    g.add(legR);
    g.userData = { legL, legR };
    return g;
  }

  wanted.update = function update(dt) {
    wanted.crimeCooldown = Math.max(0, wanted.crimeCooldown - dt);
    // Decay: hide long enough and the heat drops a star at a time.
    if (wanted.stars > 0 && wanted.crimeCooldown <= 0) {
      wanted.decayTimer -= dt;
      if (wanted.decayTimer <= 0) {
        wanted.stars -= 1;
        wanted.decayTimer = WANTED.decaySeconds;
        if (wanted.stars === 0) G.hud.toast('You lost the cops. Heat is off.');
        else G.hud.toast('Wanted level dropped to ' + wanted.stars + '.');
      }
    }
    // Keep the right number of police cars on the road.
    const wantCars = WANTED.policeByStars[wanted.stars];
    while (wanted.policeCars.length < wantCars) spawnPoliceCar();
    // Extra cars beyond the wanted count drift away and leave.
    for (let i = wanted.policeCars.length - 1; i >= 0; i -= 1) {
      const car = wanted.policeCars[i];
      if (car.dead) {
        wanted.policeCars.splice(i, 1);
        const idx = G.cars.indexOf(car);
        if (idx >= 0) G.cars.splice(idx, 1);
        continue;
      }
      if (wanted.stars === 0 && distance2D(car.x, car.z, G.player.x, G.player.z) > 120) {
        G.scene.remove(car.mesh);
        wanted.policeCars.splice(i, 1);
        const idx = G.cars.indexOf(car);
        if (idx >= 0) G.cars.splice(idx, 1);
      }
    }
    // Foot officers at high heat.
    const wantCops = WANTED.copFootByStars[wanted.stars];
    while (wanted.cops.length < wantCops) spawnCop();
    for (let i = wanted.cops.length - 1; i >= 0; i -= 1) {
      const cop = wanted.cops[i];
      if (cop.dead) {
        cop.deadTimer -= dt;
        if (cop.deadTimer <= 0) {
          G.scene.remove(cop.mesh);
          wanted.cops.splice(i, 1);
        }
        continue;
      }
      if (wanted.stars === 0) {
        G.scene.remove(cop.mesh);
        wanted.cops.splice(i, 1);
      }
    }
    updatePoliceCars(dt);
    updateCops(dt);
    // Siren loudness from the nearest police car.
    let nearest = Infinity;
    for (const car of wanted.policeCars) {
      nearest = Math.min(nearest, distance2D(car.x, car.z, G.player.x, G.player.z));
    }
    const strength = wanted.policeCars.length === 0 ? 0 : clamp(1 - nearest / 140, 0, 1);
    G.audio.siren(strength, dt);
  };

  function updatePoliceCars(dt) {
    const px = G.player.x;
    const pz = G.player.z;
    const playerCar = G.player.car;
    for (const car of wanted.policeCars) {
      if (car.dead) continue;
      const dx = px - car.x;
      const dz = pz - car.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      const turn = clamp(angleDelta(car.heading, wantHeading), -2.6 * dt, 2.6 * dt);
      car.heading += turn;
      const top = 26 + wanted.stars * 2.6;
      const targetSpeed = dist > 200 ? top : top * clamp(dist / 40, 0.45, 1);
      car.speed = damp(car.speed, targetSpeed, 1.4, dt);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      const [nx, nz] = collideCircle(G.city, car.x, car.z, 1.7);
      if (nx !== car.x || nz !== car.z) {
        car.speed *= 0.5;
        car.x = nx;
        car.z = nz;
      }
      // Ram the player's car.
      if (playerCar && dist < 4.6) {
        const ux = dx / (dist || 1);
        const uz = dz / (dist || 1);
        playerCar.x += ux * 0.9 * dt * 10;
        playerCar.z += uz * 0.9 * dt * 10;
        const [rx, rz] = collideCircle(G.city, playerCar.x, playerCar.z, 1.7);
        playerCar.x = rx;
        playerCar.z = rz;
        playerCar.speed *= 0.96;
        playerCar.health -= 2 * dt;
        G.player.health -= 1.5 * dt;
        G.effects.sparks(playerCar.x, 0.8, playerCar.z, 3);
        G.effects.addShake(0.12);
        if (playerCar.health <= 0) explodeCar(G, playerCar);
      }
      // Corner a player on foot: stay close and slow, and the bust timer runs.
      if (!playerCar && dist < 4.5 && Math.abs(car.speed) < 4) {
        wanted.bustedTimer += dt;
        if (wanted.bustedTimer > 1.6) {
          wanted.bustedTimer = 0;
          G.busted();
        }
      } else if (!playerCar) {
        wanted.bustedTimer = Math.max(0, wanted.bustedTimer - dt);
      }
      // Police cars also shove traffic out of the way.
      for (const other of G.cars) {
        if (other === car || other.kind === 'police' || other.dead) continue;
        const d = distance2D(car.x, car.z, other.x, other.z);
        if (d < 3.4 && d > 0.01) {
          const ux = (other.x - car.x) / d;
          const uz = (other.z - car.z) / d;
          other.x += ux * 1.2 * dt * 8;
          other.z += uz * 1.2 * dt * 8;
          other.speed *= 0.98;
        }
      }
      // Sync mesh (reuse the vehicles helper).
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      car.wheelSpin += (car.speed * dt) / 0.36;
      for (const w of car.mesh.userData.wheels) w.rotation.x = car.wheelSpin;
      if (car.mesh.userData.lightBar) {
        const phase = Math.floor(performance.now() / 260) % 2;
        car.mesh.userData.lightBar.red.color.setHex(phase === 0 ? 0xff2222 : 0x551111);
        car.mesh.userData.lightBar.blue.color.setHex(phase === 1 ? 0x2266ff : 0x111155);
      }
    }
  }

  function updateCops(dt) {
    for (const cop of wanted.cops) {
      if (cop.dead) continue;
      const dx = G.player.x - cop.x;
      const dz = G.player.z - cop.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      let dh = want - cop.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      cop.heading += clamp(dh, -3 * dt, 3 * dt);
      if (dist > 2.2) {
        cop.speed = damp(cop.speed, 6.4, 2, dt);
        cop.x += Math.sin(cop.heading) * cop.speed * dt;
        cop.z += Math.cos(cop.heading) * cop.speed * dt;
        const [nx, nz] = collideCircle(G.city, cop.x, cop.z, 0.4);
        cop.x = nx;
        cop.z = nz;
      } else {
        cop.speed = 0;
        // Caught on foot: the bust timer runs.
        if (!G.player.car) {
          wanted.bustedTimer += dt;
          if (wanted.bustedTimer > 1.4) {
            wanted.bustedTimer = 0;
            G.busted();
            return;
          }
        }
      }
      cop.bob += dt * cop.speed * 4;
      const swing = Math.sin(cop.bob) * 0.4;
      cop.mesh.userData.legL.rotation.x = swing;
      cop.mesh.userData.legR.rotation.x = -swing;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
      // Shoot at the player from range.
      cop.shootTimer -= dt;
      if (cop.shootTimer <= 0 && dist < 34 && dist > 3) {
        cop.shootTimer = wanted.stars >= 5 ? 0.9 : 1.5;
        G.combat.copShoot(cop);
      }
    }
  }

  /** A foot officer was shot dead: fall over, add heat, drop cash. */
  wanted.copKilled = function copKilled(cop) {
    cop.dead = true;
    cop.deadTimer = 5;
    cop.mesh.rotation.x = -Math.PI / 2;
    cop.mesh.position.y = 0.2;
    wanted.addWanted(1, 'You killed an officer!');
    G.player.cash = Math.max(0, G.player.cash - 25);
  };

  return wanted;
}
