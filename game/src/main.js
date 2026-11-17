// Solara City — boot and the one game loop. The world advances in fixed 1/60 s
// steps; the camera follows the player on foot or in a car; screens are title,
// play, paused, wasted and busted. ?shot=start|drive|chase|mission (with
// &seed=N) stages a screenshot scene instead of the loop and sets
// window.__shotReady when it is painted.
import * as THREE from '../vendor/three.module.min.js';
import { createRng, clamp, damp, angleDelta, lerp } from './util.js';
import { PLAYER, START_HOUR } from './config.js';
import { buildCity, updateCity, collideCircle } from './city.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createSave } from './save.js';
import {
  makeCar, spawnTrafficCars, spawnParkedCars, updateTrafficCar,
  updatePlayerCar, tryEnterExitCar, nearestCar,
} from './vehicles.js';
import { createPeople } from './people.js';
import { createWanted } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : (Math.floor(Math.random() * 4294967296) >>> 0);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5e0);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 12, -20);

const rng = createRng(seed);

// The game object every module shares.
const G = {
  scene,
  camera,
  rng,
  time: 0,
  screen: 'title',
  city: null,
  cityNight: false,
  audio: createAudio(),
  effects: null,
  input: null,
  hud: null,
  save: createSave(),
  people: null,
  wanted: null,
  combat: null,
  missions: null,
  vehicles: null,
  cars: [],
  player: {
    x: 0, z: 78, y: 0, vy: 0, heading: Math.PI,
    health: PLAYER.health, cash: 100, car: null, lastDamageAt: -99,
    mesh: null, bob: 0, moving: false,
  },
  camYaw: 0,
  camPitch: 0.34,
  camDist: 9,
  paused: false,
};

function buildPlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2a6ac2 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2a33 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.78, 0.34), jacket);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin);
  head.position.y = 1.64;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.09, 12),
    new THREE.MeshLambertMaterial({ color: 0xc22a2a }));
  cap.position.y = 1.82;
  g.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.22),
    new THREE.MeshLambertMaterial({ color: 0xc22a2a }));
  brim.position.set(0, 1.79, 0.28);
  g.add(brim);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.66, 0.22), pants);
  legL.position.set(-0.15, 0.33, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.15;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.62, 0.17), jacket);
  armL.position.set(-0.38, 1.05, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.38;
  g.add(armR);
  g.userData = { legL, legR, armL, armR, body };
  return g;
}

function initWorld() {
  G.city = buildCity(scene, rng);
  G.effects = createEffects(scene, rng);
  G.input = createInput(canvas);
  G.hud = createHud(G);
  G.people = createPeople(G);
  G.wanted = createWanted(G);
  G.combat = createCombat(G);
  G.missions = createMissions(G);
  G.vehicles = { nearestCar, makeCar, tryEnterExitCar };
  G.player.mesh = buildPlayerMesh();
  scene.add(G.player.mesh);
  // Spawn: on the avenue south of the Solara Tower, facing downtown.
  G.player.x = 0;
  G.player.z = 78;
  G.player.heading = Math.PI;
  spawnTrafficCars(G, 14);
  spawnParkedCars(G, 10);
  G.people.spawnInitial(24);
  G.missions.showNextStart();
  G.hud.setObjective('Find the green marker to start the next job.');
}

function resetPlayer(fresh) {
  const p = G.player;
  if (p.car) {
    p.car.kind = 'parked';
    p.car.speed = 0;
    p.car = null;
  }
  p.health = PLAYER.health;
  p.cash = fresh ? 100 : Math.max(0, Math.floor(p.cash * 0.9));
  p.x = 0;
  p.z = 78;
  p.y = 0;
  p.vy = 0;
  p.heading = Math.PI;
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.heading;
  p.mesh.visible = true;
  G.wanted.stars = 0;
  G.wanted.decayTimer = 0;
  G.wanted.bustedTimer = 0;
  G.camYaw = 0;
  G.camPitch = 0.34;
}

G.busted = function busted() {
  if (G.screen !== 'play') return;
  G.audio.busted();
  const fine = Math.floor(G.player.cash * 0.15);
  G.player.cash -= fine;
  resetPlayer(false);
  G.screen = 'busted';
  G.hud.showScreen('BUSTED', 'The Solara City Police Department caught you.',
    '<p>You paid a $' + fine + ' fine. Your heat is cleared, but the city remembers.</p>',
    [{ label: 'Walk free', primary: true, fn: () => { G.screen = 'play'; G.hud.hideScreen(); } }]);
  G.save.saveGame(G);
};

G.wasted = function wasted(reason) {
  if (G.screen !== 'play') return;
  const lost = Math.floor(G.player.cash * 0.1);
  G.player.cash -= lost;
  resetPlayer(false);
  G.screen = 'wasted';
  G.hud.showScreen('WASTED', 'You were ' + reason + ' in Solara City.',
    '<p>The hospital patched you up for $' + lost + '. Your heat is cleared.</p>',
    [{ label: 'Get back out there', primary: true, fn: () => { G.screen = 'play'; G.hud.hideScreen(); } }]);
  G.save.saveGame(G);
};

function newGame() {
  G.save.clearSave();
  resetPlayer(true);
  G.missions.index = 0;
  G.missions.active = null;
  G.missions.showNextStart();
  G.city.timeOfDay = START_HOUR;
  G.hud.setObjective('Find the green marker to start the next job.');
  G.hud.toast('Welcome to Solara City, Raka.');
  G.hud.phoneCall('MIRA', 'You are in Solara City now, Raka. Come to the green marker when you are ready to work.');
  G.screen = 'play';
  G.hud.hideScreen();
}

function continueGame() {
  const data = G.save.loadGame();
  if (!data) {
    newGame();
    return;
  }
  resetPlayer(false);
  G.player.cash = data.cash;
  G.player.health = data.health;
  G.player.x = data.playerX;
  G.player.z = data.playerZ;
  G.player.heading = data.heading;
  G.city.timeOfDay = data.timeOfDay;
  G.missions.loadProgress(data.missionsDone);
  G.hud.toast('Welcome back to Solara City.');
  G.screen = 'play';
  G.hud.hideScreen();
}

function showTitle() {
  G.screen = 'title';
  const hasSave = G.save.hasSave();
  const buttons = [];
  if (hasSave) buttons.push({ label: 'Continue', primary: true, fn: continueGame });
  buttons.push({ label: hasSave ? 'New game' : 'Start game', primary: !hasSave, fn: newGame });
  const save = G.save.loadGame();
  const body = '<p class="story">Raka arrives in <b>Solara City</b> with $100 and a phone full of jobs. '
    + 'Steal cars, outrun the police, run parcels across town — and pull the one big score that sets you free.</p>'
    + '<p class="controls"><b>WASD</b> move / drive &nbsp;·&nbsp; <b>Mouse drag</b> camera &nbsp;·&nbsp; <b>E</b> enter / steal car '
    + '&nbsp;·&nbsp; <b>F / Click</b> shoot &nbsp;·&nbsp; <b>Space</b> jump / handbrake &nbsp;·&nbsp; <b>Shift</b> run '
    + '&nbsp;·&nbsp; <b>M</b> big map &nbsp;·&nbsp; <b>P</b> pause &nbsp;·&nbsp; <b>U</b> mute</p>'
    + (save ? '<p class="saveinfo">Saved game: $' + save.cash + ' · ' + save.missionsDone + ' of 4 missions done</p>' : '')
    + '<p class="fineprint">An original game. No real city, person or brand — Solara City is fiction. '
    + 'Progress saves automatically after every mission.</p>';
  G.hud.showScreen('SOLARA CITY', 'An open-world crime game', body, buttons);
}

function showPause() {
  G.screen = 'paused';
  G.hud.showScreen('PAUSED', 'Solara City waits for no one. Except now.',
    '<p>Cash: $' + Math.floor(G.player.cash) + ' &nbsp;·&nbsp; Missions: ' + G.missions.index + ' of 4 started</p>',
    [
      { label: 'Resume', primary: true, fn: () => { G.screen = 'play'; G.hud.hideScreen(); } },
      {
        label: 'Save game', fn: () => {
          G.save.saveGame(G);
          G.hud.toast('Game saved.');
        },
      },
      { label: 'Quit to title', fn: () => { G.save.saveGame(G); G.hud.hideScreen(); showTitle(); } },
    ]);
}

function updatePlayerOnFoot(dt, held) {
  const p = G.player;
  // Camera-relative movement.
  const yaw = G.camYaw;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  let mx = fx * ((held.up ? 1 : 0) - (held.down ? 1 : 0)) + rx * ((held.right ? 1 : 0) - (held.left ? 1 : 0));
  let mz = fz * ((held.up ? 1 : 0) - (held.down ? 1 : 0)) + rz * ((held.right ? 1 : 0) - (held.left ? 1 : 0));
  const len = Math.hypot(mx, mz);
  p.moving = len > 0.01;
  if (p.moving) {
    mx /= len;
    mz /= len;
    const speed = held.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    p.x += mx * speed * dt;
    p.z += mz * speed * dt;
    const wantHeading = Math.atan2(mx, mz);
    let dh = wantHeading - p.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    p.heading += clamp(dh, -10 * dt, 10 * dt);
    p.bob += dt * speed * 1.6;
    if (Math.random() < dt * speed * 0.12) G.effects.dust(p.x, 0.1, p.z, 1);
  }
  // Jump and gravity.
  if (held.jump && p.y <= 0.01) p.vy = PLAYER.jumpSpeed;
  p.vy -= PLAYER.gravity * dt;
  p.y += p.vy * dt;
  if (p.y < 0) {
    p.y = 0;
    p.vy = 0;
  }
  const [nx, nz] = collideCircle(G.city, p.x, p.z, PLAYER.radius);
  p.x = nx;
  p.z = nz;
  // Animate the figure.
  const u = p.mesh.userData;
  const swing = p.moving ? Math.sin(p.bob) * 0.55 : 0;
  u.legL.rotation.x = swing;
  u.legR.rotation.x = -swing;
  u.armL.rotation.x = -swing * 0.7;
  u.armR.rotation.x = swing * 0.7;
  u.body.position.y = 1.05 + (p.moving ? Math.abs(Math.sin(p.bob)) * 0.05 : 0);
  p.mesh.position.set(p.x, p.y, p.z);
  p.mesh.rotation.y = p.heading;
  // Slow health regen out of combat.
  if (G.time - p.lastDamageAt > 6 && p.health > 0 && p.health < PLAYER.health) {
    p.health = Math.min(PLAYER.health, p.health + 2.5 * dt);
  }
}

function updateCamera(dt, held) {
  const drag = G.input.consumeDrag();
  G.camYaw -= drag.dx * 0.005;
  G.camPitch = clamp(G.camPitch + drag.dy * 0.004, -0.1, 1.0);
  if (held.left) G.camYaw += 1.9 * dt;
  if (held.right) G.camYaw -= 1.9 * dt;
  const p = G.player;
  // In a car the camera eases behind the car.
  if (p.car) {
    const targetYaw = p.car.heading + Math.PI;
    G.camYaw += angleDelta(G.camYaw, targetYaw) * (1 - Math.exp(-1.6 * dt));
    G.camDist = damp(G.camDist, 12.5, 3, dt);
    G.camPitch = damp(G.camPitch, 0.38, 2, dt);
  } else {
    G.camDist = damp(G.camDist, 8.5, 3, dt);
  }
  const tx = p.car ? p.car.x : p.x;
  const tz = p.car ? p.car.z : p.z;
  const ty = (p.car ? 1.4 : 1.7) + p.y;
  const cp = Math.cos(G.camPitch);
  const sp = Math.sin(G.camPitch);
  // Never put the camera inside a building: shorten the boom until it is clear.
  let dist = G.camDist;
  for (let tries = 0; tries < 12; tries += 1) {
    const cx0 = tx + Math.sin(G.camYaw) * cp * dist;
    const cz0 = tz + Math.cos(G.camYaw) * cp * dist;
    const cy0 = ty + sp * dist;
    let inside = false;
    for (const c of G.city.colliders) {
      if (cy0 < (c.h || 20) + 0.5 && Math.abs(cx0 - c.x) < c.hx + 0.9 && Math.abs(cz0 - c.z) < c.hz + 0.9) {
        inside = true;
        break;
      }
    }
    if (!inside || dist <= 3.5) break;
    dist -= 1;
  }
  const cx = tx + Math.sin(G.camYaw) * cp * dist;
  const cz = tz + Math.cos(G.camYaw) * cp * dist;
  const cy = ty + sp * dist;
  const shake = G.effects.shakeOffset();
  camera.position.set(cx + shake.x, cy + shake.y, cz);
  camera.lookAt(tx, ty + 0.4, tz);
}

function step(dt, heldOverride) {
  G.time += dt;
  const held = heldOverride || G.input.read();
  const p = G.player;

  // One-shot keys.
  if (G.input.wasPressedAny(['KeyE'])) {
    const r = tryEnterExitCar(G);
    if (r === null) G.hud.toast('No car close enough.');
  }
  if (G.input.wasPressedAny(['KeyM'])) G.hud.showBigMap(!G.hud.bigMapOpen());
  if (G.input.wasPressedAny(['KeyP', 'Escape'])) {
    if (G.screen === 'play' && !G.hud.bigMapOpen()) showPause();
    else if (G.hud.bigMapOpen()) G.hud.showBigMap(false);
  }
  if (G.input.wasPressedAny(['KeyU'])) {
    const muted = G.audio.toggleMute();
    G.hud.toast(muted ? 'Sound muted.' : 'Sound on.');
  }
  if (G.input.wasPressedAny(['KeyH']) && p.car) G.audio.horn();
  if (G.input.consumeClick() || held.shootKey) G.combat.shoot();

  // Player and world.
  if (p.car) {
    const car = p.car;
    updatePlayerCar(G, car, dt, held);
    if (p.car) {
      p.x = p.car.x;
      p.z = p.car.z;
      p.heading = p.car.heading;
      G.audio.engine(Math.abs(p.car.speed) / 34, true);
      if (Math.abs(p.car.speed) > 12 && Math.random() < dt * 2) {
        G.effects.dust(p.car.x - Math.sin(p.car.heading) * 2, 0.2, p.car.z - Math.cos(p.car.heading) * 2, 1);
      }
    }
    if (!p.car) {
      // The car exploded mid-step: the player is on foot again.
      p.mesh.visible = true;
      G.audio.engine(0, false);
    } else {
      p.mesh.visible = false;
    }
  } else {
    p.mesh.visible = true;
    updatePlayerOnFoot(dt, held);
    G.audio.engine(0, false);
  }
  updateCamera(dt, held);

  // Traffic: keep 14 on the road, recycle the far ones.
  let trafficCount = 0;
  for (let i = G.cars.length - 1; i >= 0; i -= 1) {
    const car = G.cars[i];
    if (car.dead) {
      car.deadTimer = (car.deadTimer || 0) + dt;
      if (car.deadTimer > 4) {
        scene.remove(car.mesh);
        G.cars.splice(i, 1);
      }
      continue;
    }
    if (car.kind === 'traffic') {
      trafficCount += 1;
      updateTrafficCar(G, car, dt);
      if (Math.hypot(car.x - p.x, car.z - p.z) > 280) {
        const rp = { x: p.x + (Math.random() - 0.5) * 200, z: p.z + (Math.random() - 0.5) * 200 };
        const np = { x: Math.round(rp.x / 78) * 78, z: Math.round(rp.z / 78) * 78 };
        car.x = clamp(np.x, -340, 340);
        car.z = clamp(np.z, -340, 340);
        car.target = null;
      }
    }
  }
  while (trafficCount < 14) {
    const rp = { x: p.x + (Math.random() - 0.5) * 160, z: p.z + (Math.random() - 0.5) * 160 };
    makeCar(G, clamp(rp.x, -340, 340), clamp(rp.z, -340, 340), Math.random() * Math.PI * 2, { kind: 'traffic' });
    trafficCount += 1;
  }

  G.people.update(dt);
  if (G.people.list.length < 20) {
    const a = Math.random() * Math.PI * 2;
    G.people.spawn(p.x + Math.sin(a) * 60, p.z + Math.cos(a) * 60, false);
  }
  G.wanted.update(dt);
  G.missions.update(dt);
  G.combat.update(dt);
  const day = updateCity(G.city, dt);
  G.cityNight = day.night;
  G.effects.update(dt);
  G.audio.music(dt);
  G.hud.update(dt);
  G.input.endFrame();
}

function runShot(name) {
  stageShot(name, G, (dt, held) => step(dt, held));
  let painted = 0;
  function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  G.hud.update(0.12);
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > MAX_FRAME) dt = MAX_FRAME;
    if (G.screen === 'play') {
      accumulator += dt;
      while (accumulator >= STEP) {
        step(STEP);
        accumulator -= STEP;
      }
      renderer.render(scene, camera);
    } else if (G.screen === 'title') {
      // Slow orbit over the city behind the title screen.
      G.time += dt;
      updateCity(G.city, dt);
      const a = G.time * 0.02;
      camera.position.set(Math.sin(a) * 260, 90, Math.cos(a) * 260);
      camera.lookAt(0, 20, 0);
      G.effects.update(dt);
      renderer.render(scene, camera);
    } else {
      // Paused / wasted / busted: hold the frame.
      renderer.render(scene, camera);
    }
  }
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

initWorld();
G.hud.update(0.12);
// Debug handle for playtests (read-only inspection of the live game state).
window.__solara = G;
if (shot) {
  runShot(shot);
} else {
  showTitle();
  runGame();
}
