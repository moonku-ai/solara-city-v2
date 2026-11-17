// Vehicles for Solara City: box-built cars, traffic that follows the road grid,
// arcade driving physics for the player, and stealing cars with E.
import * as THREE from '../vendor/three.module.min.js';
import { CAR, PITCH, GRID, CITY_HALF } from './config.js';
import { clamp, damp, pick, range, rangeInt, angleDelta, distance2D } from './util.js';
import { collideCircle, randomRoadPoint, randomIntersection } from './city.js';

const CAR_COLORS = [0xc22a2a, 0x2a6ac2, 0xd8b62a, 0x3a9a4a, 0x8a5ac2, 0xd8d8d8, 0x222222, 0xc2702a, 0x2ac2b0, 0x9a2a6a];
const CAR_NAMES = ['Vento', 'Comet', 'Falcon', 'Dune', 'Sultan', 'Bison', 'Ocelot', 'Prairie', 'Wasp', 'Rhino'];

export function buildCarMesh(colorHex, police) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: police ? 0xe8e8e8 : colorHex });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x18242e });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.3), bodyMat);
  body.position.y = 0.62;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.55, 2.1), glassMat);
  cabin.position.set(0, 1.18, -0.25);
  group.add(cabin);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 0.9), bodyMat);
  hood.position.set(0, 0.98, 1.6);
  group.add(hood);
  // Bumpers.
  const bumperMat = new THREE.MeshLambertMaterial({ color: 0x303036 });
  for (const z of [2.18, -2.18]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.25), bumperMat);
    b.position.set(0, 0.42, z);
    group.add(b);
  }
  // Headlights and taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  for (const x of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), headMat);
    h.position.set(x, 0.72, 2.16);
    group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
    t.position.set(x, 0.72, -2.16);
    group.add(t);
  }
  if (police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.3, 1.2),
      new THREE.MeshLambertMaterial({ color: 0x1a1a22 }));
    stripe.position.set(0, 0.62, 0.1);
    group.add(stripe);
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.35;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.35;
    bar.add(red);
    bar.add(blue);
    bar.position.set(0, 1.55, -0.25);
    group.add(bar);
    group.userData.lightBar = { red: red.material, blue: blue.material };
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [x, z] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.36, z);
    group.add(w);
    wheels.push(w);
  }
  group.userData.wheels = wheels;
  group.userData.bodyMat = bodyMat;
  return group;
}

/** Make a car object and add it to the world. kind: 'traffic' | 'parked' | 'police' | 'player'. */
export function makeCar(G, x, z, heading, opts) {
  const o = opts || {};
  const color = o.color !== undefined ? o.color : pick(G.rng, CAR_COLORS);
  const mesh = buildCarMesh(color, o.police === true);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  G.scene.add(mesh);
  const car = {
    mesh,
    kind: o.kind || 'traffic',
    x, z, heading,
    speed: o.speed || 0,
    targetSpeed: o.targetSpeed || range(G.rng, 8, 12),
    color,
    name: o.name || pick(G.rng, CAR_NAMES),
    health: CAR.health,
    driver: o.driver !== undefined ? o.driver : true,
    target: null,
    steerVis: 0,
    wheelSpin: 0,
    brakeLight: false,
    police: o.police === true,
    sirenPhase: G.rng() * 2,
    stuck: 0,
  };
  if (car.kind === 'traffic') car.target = randomIntersection(G.rng);
  G.cars.push(car);
  return car;
}

export function spawnTrafficCars(G, n) {
  for (let i = 0; i < n; i += 1) {
    const p = randomRoadPoint(G.rng, G.player.x, G.player.z, 40);
    makeCar(G, p.x, p.z, p.heading, { kind: 'traffic' });
  }
}

export function spawnParkedCars(G, n) {
  for (let i = 0; i < n; i += 1) {
    const horizontal = G.rng() < 0.5;
    const line = rangeInt(G.rng, -GRID, GRID) * PITCH;
    const along = range(G.rng, -CITY_HALF + 30, CITY_HALF - 30);
    const side = G.rng() < 0.5 ? 1 : -1;
    const x = horizontal ? along : line + side * 5.2;
    const z = horizontal ? line + side * 5.2 : along;
    const heading = horizontal ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    makeCar(G, x, z, heading, { kind: 'parked', driver: false, speed: 0 });
  }
}

function carAhead(G, car, dist) {
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  let best = null;
  let bestD = dist;
  for (const other of G.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const along = dx * fx + dz * fz;
    if (along < 0 || along > dist) continue;
    const side = Math.abs(dx * fz - dz * fx);
    if (side > 2.4) continue;
    if (along < bestD) {
      bestD = along;
      best = other;
    }
  }
  return best;
}

/** Traffic AI: drive to the next intersection, pick a new one, mind the car ahead. */
export function updateTrafficCar(G, car, dt) {
  if (!car.target) car.target = randomIntersection(G.rng);
  const dx = car.target.x - car.x;
  const dz = car.target.z - car.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 6) {
    car.target = randomIntersection(G.rng);
    return;
  }
  const wantHeading = Math.atan2(dx, dz);
  const turn = clamp(angleDelta(car.heading, wantHeading), -1.6 * dt, 1.6 * dt);
  car.heading += turn;
  const blocked = carAhead(G, car, 11);
  const targetSpeed = blocked ? 0 : car.targetSpeed;
  car.speed = damp(car.speed, targetSpeed, blocked ? 6 : 1.2, dt);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  const [nx, nz] = collideCircle(G.city, car.x, car.z, 1.7);
  if (nx !== car.x || nz !== car.z) {
    car.speed *= 0.5;
    car.x = nx;
    car.z = nz;
    car.stuck += dt;
    if (car.stuck > 2.5) {
      car.target = randomIntersection(G.rng);
      car.stuck = 0;
    }
  } else {
    car.stuck = 0;
  }
  syncCarMesh(car, dt);
}

export function syncCarMesh(car, dt) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  car.wheelSpin += (car.speed * dt) / 0.36;
  const wheels = car.mesh.userData.wheels;
  for (const w of wheels) w.rotation.x = car.wheelSpin;
  if (car.mesh.userData.lightBar) {
    const phase = Math.floor(performance.now() / 280) % 2;
    car.mesh.userData.lightBar.red.color.setHex(phase === 0 ? 0xff2222 : 0x551111);
    car.mesh.userData.lightBar.blue.color.setHex(phase === 1 ? 0x2266ff : 0x111155);
  }
}

/** Arcade driving for the player's car. input: {up, down, left, right, handbrake}. */
export function updatePlayerCar(G, car, dt, input) {
  const prevSpeed = car.speed;
  if (input.up) car.speed += CAR.accel * dt;
  else if (input.down) {
    if (car.speed > 0.5) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.accel * 0.6 * dt;
  } else {
    car.speed = damp(car.speed, 0, 0.7, dt);
  }
  if (input.handbrake) car.speed = damp(car.speed, 0, 4, dt);
  car.speed = clamp(car.speed, -CAR.reverseTop, CAR.topSpeed);
  const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const speedFactor = clamp(Math.abs(car.speed) / 10, 0, 1);
  const dir = car.speed >= 0 ? 1 : -1;
  const steerAmount = steerInput * CAR.steer * speedFactor * dir * (input.handbrake ? 1.5 : 1);
  car.heading += steerAmount * dt * (input.handbrake ? 0.7 : 1);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  const [nx, nz] = collideCircle(G.city, car.x, car.z, 1.7);
  if (nx !== car.x || nz !== car.z) {
    const impact = Math.abs(car.speed - prevSpeed) + Math.abs(car.speed) * 0.4;
    car.x = nx;
    car.z = nz;
    if (Math.abs(car.speed) > 6) {
      car.health -= Math.min(18, Math.abs(car.speed) * 0.8);
      G.effects.sparks(car.x, 0.8, car.z, 8);
      G.effects.addShake(0.25);
      if (car.health <= 0) explodeCar(G, car);
    }
    car.speed *= 0.35;
  }
  // Car-to-car bumps.
  for (const other of G.cars) {
    if (other === car || other.health <= 0) continue;
    const d = distance2D(car.x, car.z, other.x, other.z);
    if (d < 3.4 && d > 0.01) {
      const push = (3.4 - d) / 2;
      const ux = (car.x - other.x) / d;
      const uz = (car.z - other.z) / d;
      car.x += ux * push;
      car.z += uz * push;
      if (other.kind !== 'parked') {
        other.x -= ux * push;
        other.z -= uz * push;
      }
      const rel = Math.abs(car.speed - other.speed);
      if (rel > 4) {
        car.health -= 9 * dt;
        other.health -= 9 * dt;
        if (G.rng() < dt * 6) G.effects.sparks((car.x + other.x) / 2, 0.8, (car.z + other.z) / 2, 4);
        if (other.health <= 0) explodeCar(G, other);
        if (car.health <= 0) explodeCar(G, car);
      }
      car.speed *= 0.92;
    }
  }
  syncCarMesh(car, dt);
  car.steerVis = damp(car.steerVis, steerInput, 8, dt);
  const wheels = car.mesh.userData.wheels;
  wheels[0].rotation.y = car.steerVis * 0.4;
  wheels[1].rotation.y = car.steerVis * 0.4;
}

export function explodeCar(G, car) {
  if (car.health > 0) return;
  car.health = 0;
  G.effects.explosion(car.x, 1, car.z);
  G.audio.explosion();
  car.mesh.visible = false;
  car.dead = true;
  if (G.player.car === car) {
    G.player.car = null;
    G.player.health -= 25;
    G.hud.toast('Your car exploded!');
    G.player.x = car.x + 2;
    G.player.z = car.z + 2;
  }
}

/** The nearest car the player could enter, within reach. */
export function nearestCar(G, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of G.cars) {
    if (car.dead || car.kind === 'player') continue;
    const d = distance2D(G.player.x, G.player.z, car.x, car.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** E pressed: get in the nearest car (stealing it if it has a driver), or get out. */
export function tryEnterExitCar(G) {
  if (G.player.car) {
    const car = G.player.car;
    G.player.car = null;
    car.kind = 'parked';
    car.speed = 0;
    const side = 2.6;
    const px = car.x + Math.cos(car.heading) * side;
    const pz = car.z - Math.sin(car.heading) * side;
    const [nx, nz] = collideCircle(G.city, px, pz, 0.6);
    G.player.x = nx;
    G.player.z = nz;
    G.player.heading = car.heading;
    G.audio.click();
    return 'got out';
  }
  const car = nearestCar(G, 4.2);
  if (!car) return null;
  if (car.driver) {
    // Steal it: the driver flees on foot, and it is a crime.
    car.driver = false;
    G.people.makeFleeingPed(G, car.x + 1.5, car.z + 1.5);
    G.wanted.addWanted(1, 'You stole a car!');
    G.hud.toast('You stole the ' + car.name + '!');
  } else {
    G.hud.toast('You got into the ' + car.name + '.');
  }
  car.kind = 'player';
  car.health = Math.max(car.health, 40);
  G.player.car = car;
  G.player.x = car.x;
  G.player.z = car.z;
  G.audio.engine(0, true);
  return 'got in';
}
